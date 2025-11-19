import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PickController, PickState, WordPair, WordClassification } from './pickController';
import { generateRegexFromDescription } from './regexService';
import { logger } from './logger';
import { createRegexAnalyzer, RegexRelationship } from './regexAnalyzer';

export class PickViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'pick.pickView';
  private view?: vscode.WebviewView;
  private controller: PickController;
  private analyzer = createRegexAnalyzer();
  private cancellationTokenSource?: vscode.CancellationTokenSource;
  private analysisCache = new Map<string, Promise<any> | any>();

  constructor(private readonly extensionUri: vscode.Uri) {
    this.controller = new PickController();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'generateCandidates':
          await this.handleGenerateCandidates(data.prompt);
          break;
        case 'refineCandidates':
          await this.handleRefineCandidates(data.prompt);
          break;
        case 'classifyWord':
          this.handleClassifyWord(data.word, data.classification);
          break;
        case 'updateClassification':
          this.handleUpdateClassification(data.index, data.classification);
          break;
        case 'vote':
          this.handleVote(data.acceptedWord);
          break;
        case 'reset':
          this.handleReset(data.preserveClassifications);
          break;
        case 'requestNextPair':
          this.handleRequestNextPair();
          break;
        case 'copy':
          try {
            await this.copyToClipboard(data.regex || '');
            this.sendMessage({ type: 'copied', regex: data.regex });
          } catch (error) {
            logger.error(error, 'Failed to copy to clipboard');
            this.sendMessage({ type: 'error', message: 'Failed to copy to clipboard' });
          }
          break;
        case 'cancel':
          this.handleCancel();
          break;
      }
    });
  }

  private async handleGenerateCandidates(prompt: string) {
    try {
      this.sendMessage({ type: 'status', message: 'Generating candidate regexes...' });

      // Generate candidate regexes using LLM
      // Dispose any existing cancellation token
      if (this.cancellationTokenSource) {
        this.cancellationTokenSource.dispose();
      }
      this.cancellationTokenSource = new vscode.CancellationTokenSource();
      
      let candidates: string[] = [];
      try {
        const result = await generateRegexFromDescription(prompt, this.cancellationTokenSource.token);
        candidates = result.candidates.map(c => c.regex);
        logger.info(`Generated ${candidates.length} candidates from LLM`);
        
        // Log each candidate with explanation
        result.candidates.forEach((c, i) => {
          logger.info(`Candidate ${i + 1}: ${c.regex} (confidence: ${c.confidence ?? 'N/A'}) - ${c.explanation}`);
        });
      } catch (error) {
        // Check if it was cancelled
        if (this.cancellationTokenSource.token.isCancellationRequested) {
          logger.info('Candidate generation was cancelled by user');
          this.sendMessage({ 
            type: 'cancelled', 
            message: 'Operation cancelled by user.' 
          });
          return;
        }
        logger.error(error, 'Failed to generate candidate regexes');
        this.sendMessage({ 
          type: 'error', 
          message: 'Could not generate any candidate regexes. Please try again.' 
        });
        return;
      }

      if (candidates.length === 0) {
        this.sendMessage({ 
          type: 'error', 
          message: 'Could not generate any candidate regexes. Please try again.' 
        });
        return;
      }

      // Check cancellation before filtering
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled before filtering duplicates');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      // Filter out equivalent/duplicate regexes
      this.sendMessage({ type: 'status', message: 'Filtering duplicate regexes...' });
      const uniqueCandidates = await this.filterEquivalentRegexes(candidates);
      
      // Check cancellation after filtering
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled after filtering duplicates');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      // Inform user if duplicates were removed
      if (uniqueCandidates.length < candidates.length) {
        this.sendMessage({ 
          type: 'status', 
          message: `Removed ${candidates.length - uniqueCandidates.length} duplicate regex(es). Proceeding with ${uniqueCandidates.length} unique candidate(s).` 
        });
      }

      if (uniqueCandidates.length === 0) {
        this.sendMessage({ 
          type: 'error', 
          message: 'All generated regexes were duplicates. Please try again with a different prompt.' 
        });
        return;
      }

      // Check cancellation before initializing candidates
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled before initializing candidates');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      // Initialize controller with unique candidates
      await this.controller.generateCandidates(prompt, uniqueCandidates);
      
      // Check cancellation before sending results
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled before sending candidates to UI');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      this.sendMessage({
        type: 'candidatesGenerated',
        candidates: this.controller.getStatus().candidateDetails
      });

      // Check cancellation before generating first pair
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled before generating first word pair');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      // Generate first word pair (or proceed to final result if only 1 candidate)
      this.handleRequestNextPair();
      
    } catch (error) {
      logger.error(error, 'Error generating candidates');
      this.sendMessage({
        type: 'error',
        message: `Error: ${error}`
      });
    }
  }

  private async handleRequestNextPair() {
    try {
      // Check cancellation at the start
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled in handleRequestNextPair');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      const activeCount = this.controller.getActiveCandidateCount();
      
      if (activeCount === 0) {
        // No candidates left - show error
        this.sendMessage({ 
          type: 'error', 
          message: 'No active candidates remaining' 
        });
        return;
      }

      const pair = await this.controller.generateNextPair();
      const status = this.controller.getStatus();
      
      // Check cancellation before sending pair to UI
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled after generating pair, before sending to UI');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      this.sendMessage({
        type: 'newPair',
        pair,
        status
      });
    } catch (error) {
      logger.error(error, 'Error generating next pair');
      this.sendMessage({
        type: 'error',
        message: `Error generating pair: ${error}`
      });
      // Check if the error is about running out of words
      const errorMessage = String(error);
      if (errorMessage.includes('Could not generate unique word') || 
          errorMessage.includes('Failed to generate')) {
        // We ran out of words - show best candidates so far
        const status = this.controller.getStatus();
        const activeCandidates = status.candidateDetails.filter(c => !c.eliminated);
        
        this.sendMessage({ 
          type: 'warning', 
          message: `Unable to generate more distinguishing words. ${activeCandidates.length} candidate(s) remain. These may be your best options:` 
        });
        
        // Show current best candidates
        this.sendMessage({
          type: 'insufficientWords',
          candidates: activeCandidates,
          status
        });
      } else {
        this.sendMessage({ 
          type: 'error', 
          message: `Error generating pair: ${error}` 
        });
      }
    }
  }

  private async handleClassifyWord(word: string, classification: string) {
    try {
      const classificationEnum = classification as WordClassification;
      this.controller.classifyWord(word, classificationEnum);
      
      const state = this.controller.getState();
      const status = this.controller.getStatus();
      
      if (state === PickState.FINAL_RESULT) {
        await this.handleFinalResult();
      } else {
        // Check if both words are classified
        if (this.controller.areBothWordsClassified()) {
          this.controller.clearCurrentPair();
          
          // Send updated status
          this.sendMessage({
            type: 'wordClassified',
            status,
            bothClassified: true
          });
          
          // Generate next pair
          this.handleRequestNextPair();
        } else {
          // Send updated status but don't generate next pair yet
          this.sendMessage({
            type: 'wordClassified',
            status,
            bothClassified: false
          });
        }
      }
    } catch (error) {
      logger.error(error, 'Error classifying word');
      this.sendMessage({
        type: 'error',
        message: `Error classifying word: ${error}`
      });
    }
  }

  private handleUpdateClassification(index: number, classification: string) {
    try {
      const classificationEnum = classification as WordClassification;
      this.controller.updateClassification(index, classificationEnum);
      
      const status = this.controller.getStatus();
      
      this.sendMessage({
        type: 'classificationUpdated',
        status
      });
    } catch (error) {
      logger.error(error, 'Error updating classification');
      this.sendMessage({
        type: 'error',
        message: `Error updating classification: ${error}`
      });
    }
  }

  private async handleVote(acceptedWord: string) {
    try {
      this.controller.processVote(acceptedWord);
      
      const state = this.controller.getState();
      const status = this.controller.getStatus();
      
      if (state === PickState.FINAL_RESULT) {
        await this.handleFinalResult();
      } else {
        // Send updated status
        this.sendMessage({
          type: 'voteProcessed',
          status
        });
        
        // Generate next pair
        this.handleRequestNextPair();
      }
    } catch (error) {
      logger.error(error, 'Error processing vote');
      this.sendMessage({
        type: 'error',
        message: `Error processing vote: ${error}`
      });
    }
  }

  private async handleFinalResult() {
    try {
      const finalRegex = this.controller.getFinalRegex();
      
      // Get the actual words the user classified
      const wordHistory = this.controller.getWordHistory();
      const wordsIn = wordHistory
        .filter(record => record.classification === 'accept')
        .map(record => record.word);
      const wordsOut = wordHistory
        .filter(record => record.classification === 'reject')
        .map(record => record.word);
      
      if (finalRegex === null) {
        // All candidates were eliminated - none are correct
        this.sendMessage({
          type: 'noRegexFound',
          message: 'All candidate regexes were eliminated. None of them match your requirements.',
          candidateDetails: this.controller.getStatus().candidateDetails,
          wordsIn,
          wordsOut
        });
        return;
      }
      
      // Get status to send along with the final result
      const status = this.controller.getStatus();
      
      this.sendMessage({
        type: 'finalResult',
        regex: finalRegex,
        wordsIn,
        wordsOut,
        status
      });
    } catch (error) {
      logger.error(error, 'Error showing final results');
      this.sendMessage({
        type: 'error',
        message: `Error showing results: ${error}`
      });
    }
  }

  private async handleRefineCandidates(prompt: string) {
    try {
      this.sendMessage({ type: 'status', message: 'Refining with new candidates...' });

      // Get session data before refinement
      const sessionData = this.controller.getSessionData();
      
      // Generate new candidate regexes using LLM
      // Dispose any existing cancellation token
      if (this.cancellationTokenSource) {
        this.cancellationTokenSource.dispose();
      }
      this.cancellationTokenSource = new vscode.CancellationTokenSource();
      
      let candidates: string[] = [];
      try {
        const result = await generateRegexFromDescription(prompt, this.cancellationTokenSource.token);
        candidates = result.candidates.map(c => c.regex);
        logger.info(`Generated ${candidates.length} candidates from LLM for refinement`);
        
        // Log each candidate with explanation
        result.candidates.forEach((c, i) => {
          logger.info(`Candidate ${i + 1}: ${c.regex} (confidence: ${c.confidence ?? 'N/A'}) - ${c.explanation}`);
        });
      } catch (error) {
        // Check if it was cancelled
        if (this.cancellationTokenSource.token.isCancellationRequested) {
          logger.info('Candidate refinement was cancelled by user');
          this.sendMessage({ 
            type: 'cancelled', 
            message: 'Operation cancelled by user.' 
          });
          return;
        }
        logger.error(error, 'Failed to generate candidate regexes during refinement');
        this.sendMessage({ 
          type: 'error', 
          message: 'Could not generate any candidate regexes. Please try again.' 
        });
        return;
      }

      if (candidates.length === 0) {
        this.sendMessage({ 
          type: 'error', 
          message: 'Could not generate any candidate regexes. Please try again.' 
        });
        return;
      }

      // Check cancellation before filtering
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled before filtering duplicates (refinement)');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      // Filter out equivalent/duplicate regexes
      this.sendMessage({ type: 'status', message: 'Filtering duplicate regexes...' });
      const uniqueCandidates = await this.filterEquivalentRegexes(candidates);
      
      // Check cancellation after filtering
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled after filtering duplicates (refinement)');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      // Inform user if duplicates were removed
      if (uniqueCandidates.length < candidates.length) {
        this.sendMessage({ 
          type: 'status', 
          message: `Removed ${candidates.length - uniqueCandidates.length} duplicate regex(es). Proceeding with ${uniqueCandidates.length} unique candidate(s). Preserving ${sessionData.wordHistory.length} existing classifications.` 
        });
      }

      if (uniqueCandidates.length === 0) {
        this.sendMessage({ 
          type: 'error', 
          message: 'All generated regexes were duplicates. Please try again with a different prompt.' 
        });
        return;
      }

      // Check cancellation before refining candidates
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled before refining candidates');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      // Refine candidates with preserved classifications
      await this.controller.refineCandidates(prompt, uniqueCandidates);
      
      // Check cancellation before sending results
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled before sending refined candidates to UI');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      this.sendMessage({
        type: 'candidatesRefined',
        candidates: this.controller.getStatus().candidateDetails,
        preservedClassifications: sessionData.wordHistory.length
      });

      // Check cancellation before generating first pair
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled before generating first word pair (refinement)');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      // Generate first word pair (or proceed to final result if only 1 candidate)
      this.handleRequestNextPair();
      
    } catch (error) {
      logger.error(error, 'Error refining candidates');
      this.sendMessage({
        type: 'error',
        message: `Error: ${error}`
      });
    }
  }

  private handleReset(preserveClassifications = false) {
    this.controller.reset(preserveClassifications);
    logger.info(`Reset requested from webview (preserveClassifications: ${preserveClassifications}).`);
    this.sendMessage({ type: 'reset', preserveClassifications });
  }

  private handleCancel() {
    logger.info('Cancel requested from webview');
    
    // Cancel any ongoing LLM request
    if (this.cancellationTokenSource) {
      this.cancellationTokenSource.cancel();
      // Don't dispose or set to undefined yet - ongoing operations still need to check isCancellationRequested
      // The token will be disposed and replaced when a new operation starts
    }
    
    // Reset controller state
    this.controller.reset(false);
    
    // Notify webview
    this.sendMessage({ 
      type: 'cancelled', 
      message: 'Operation cancelled by user.' 
    });
  }

  /**
   * Lightweight heuristic check: sample strings and compare
   * Returns true if regexes MIGHT be equivalent (need full analysis)
   * Returns false if definitely different (skip expensive analysis)
   */
  private quickSampleCheck(regexA: string, regexB: string, sampleCount = 20): boolean {
    try {
      const reA = new RegExp(`^${regexA}$`);
      const reB = new RegExp(`^${regexB}$`);
      
      // Generate samples from A and check if B accepts them all
      const samplesA = this.analyzer.generateMultipleWords(regexA, sampleCount);
      for (const word of samplesA) {
        if (!reB.test(word)) {
          return false; // Found a word in A but not B - definitely not equivalent
        }
      }
      
      // Generate samples from B and check if A accepts them all
      const samplesB = this.analyzer.generateMultipleWords(regexB, sampleCount);
      for (const word of samplesB) {
        if (!reA.test(word)) {
          return false; // Found a word in B but not A - definitely not equivalent
        }
      }
      
      // All samples matched both ways - might be equivalent (need full check)
      return true;
    } catch (error) {
      // On error, assume might be equivalent (do full analysis)
      return true;
    }
  }

  /**
   * Timeout wrapper with cancellation and caching
   */
  private async analyzeWithTimeout(a: string, b: string, timeoutMs = 5000): Promise<any> {
    // Symmetric cache key
    const key = a < b ? `${a}::${b}` : `${b}::${a}`;
    
    if (this.analysisCache.has(key)) {
      const cached = this.analysisCache.get(key);
      return cached instanceof Promise ? await cached : cached;
    }

    const analysisPromise = (async () => {
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        throw new Error('Analysis cancelled by user');
      }
      return await this.analyzer.analyzeRelationship(a, b);
    })();

    // Store promise immediately for concurrent requests
    this.analysisCache.set(key, analysisPromise);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Analysis timeout - regex too complex')), timeoutMs)
    );

    try {
      const result = await Promise.race([analysisPromise, timeoutPromise]);
      // Cache the resolved value
      this.analysisCache.set(key, result);
      return result;
    } catch (err) {
      // Remove from cache on error so future attempts can retry
      this.analysisCache.delete(key);
      throw err;
    }
  }

  /**
   * Filter out equivalent/duplicate regexes
   */
  private async filterEquivalentRegexes(regexes: string[]): Promise<string[]> {
    // PASS 1: Fast exact string deduplication (preserving order)
    const seen = new Set<string>();
    const exactUnique: string[] = [];
    for (const regex of regexes) {
      if (!seen.has(regex)) {
        seen.add(regex);
        exactUnique.push(regex);
      }
    }
    
    logger.info(`After exact deduplication: ${exactUnique.length}/${regexes.length} unique regexes`);
    
    if (exactUnique.length <= 1) {
      return exactUnique;
    }

    // PASS 2: Semantic equivalence using sampling + automata analysis
    const unique: string[] = [];
    
    for (let i = 0; i < exactUnique.length; i++) {
      const regex = exactUnique[i];
      
      // Check cancellation
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        throw new Error('Filtering cancelled by user');
      }
      
      let isEquivalent = false;
      
      for (const uniqueRegex of unique) {
        // Check cancellation before each heavy operation
        if (this.cancellationTokenSource?.token.isCancellationRequested) {
          throw new Error('Filtering cancelled by user');
        }
        
        // Quick sample-based check first (cheap)
        const mightBeEquivalent = this.quickSampleCheck(regex, uniqueRegex, 15);
        if (!mightBeEquivalent) {
          // Samples proved they're different - skip expensive analysis
          logger.info(`Quick check: "${regex}" and "${uniqueRegex}" are different`);
          continue;
        }
        
        // Samples suggest equivalence - do full automata analysis
        try {
          logger.info(`Full analysis: comparing "${regex}" vs "${uniqueRegex}"...`);
          const result = await this.analyzeWithTimeout(regex, uniqueRegex, 8000);
          
          if (result && result.relationship === RegexRelationship.EQUIVALENT) {
            logger.info(`Found equivalent: "${regex}" === "${uniqueRegex}"`);
            isEquivalent = true;
            break;
          }
        } catch (error) {
          const errMsg = String(error);
          if (errMsg.includes('cancelled')) {
            throw error; // Re-throw cancellation
          }
          // Timeout or analysis failure - log and conservatively keep both
          logger.warn(`Analysis failed for "${regex}" vs "${uniqueRegex}": ${error}`);
        }
      }
      
      if (!isEquivalent) {
        unique.push(regex);
        logger.info(`Keeping unique regex: "${regex}" (${unique.length} total)`);
      }
    }
    
    logger.info(`Final: ${unique.length}/${regexes.length} semantically unique regexes`);
    return unique;
  }

  private sendMessage(message: any) {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'pickView.html');
    try {
      return fs.readFileSync(htmlPath, 'utf8');
    } catch (err) {
      // In test environments the media file may not be available. Return a minimal
      // HTML fallback so unit tests that instantiate the view provider don't fail
      // with ENOENT. This keeps production behavior unchanged when the file exists.
      logger.warn(`Could not read webview HTML at ${htmlPath}: ${err}`);
      return `<!doctype html><html><body><div id="pick-root"></div><script>const vscode = acquireVsCodeApi();</script></body></html>`;
    }
  }

  // Separated clipboard access for easier stubbing in tests
  private async copyToClipboard(text: string) {
    return vscode.env.clipboard.writeText(text);
  }
}
