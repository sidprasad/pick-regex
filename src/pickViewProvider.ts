import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PickController, PickState, WordPair, WordClassification } from './pickController';
import { generateRegexFromDescription } from './regexService';
import { logger } from './logger';
import { createRegexAnalyzer } from './regexAnalyzer';
import { openIssueReport } from './issueReporter';

export class PickViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'pick.pickView';
  private view?: vscode.WebviewView;
  private controller: PickController;
  private analyzer = createRegexAnalyzer();
  private cancellationTokenSource?: vscode.CancellationTokenSource;

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
        case 'reportIssue':
          try {
            await openIssueReport();
            this.sendMessage({ type: 'info', message: 'Issue template copied to clipboard. Paste it into GitHub.' });
          } catch (error) {
            logger.error(error, 'Failed to open issue report');
            this.sendMessage({ type: 'error', message: 'Failed to open issue report' });
          }
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

      // Filter out invalid regexes and regexes with unsupported syntax
      const validCandidates: string[] = [];
      for (const regex of candidates) {
        const isValid = this.analyzer.isValidRegex(regex);
        if (!isValid) {
          logger.warn(`Filtered out invalid regex: "${regex}"`);
          continue;
        }
        
        const hasSupported = await this.analyzer.hasSupportedSyntax(regex);
        if (!hasSupported) {
          logger.warn(`Filtered out regex with unsupported syntax: "${regex}"`);
          continue;
        }
        
        validCandidates.push(regex);
      }

      if (validCandidates.length === 0) {
        this.sendMessage({ 
          type: 'error', 
          message: 'All generated regexes contain invalid or unsupported syntax (e.g., word boundaries \\b, lookbehinds). Please try again.' 
        });
        return;
      }

      if (validCandidates.length < candidates.length) {
        logger.info(`Filtered out ${candidates.length - validCandidates.length} invalid or unsupported regex(es)`);
      }

      // Filter out equivalent/duplicate regexes
      this.sendMessage({ type: 'status', message: 'Filtering duplicate regexes...' });
      let uniqueCandidates: string[] = [];
      let equivalenceMap: Map<string, string[]> = new Map();
      try {
        const deduped = await this.filterEquivalentRegexes(validCandidates);
        uniqueCandidates = deduped.uniqueRegexes;
        equivalenceMap = deduped.equivalenceMap;
      } catch (error) {
        const errMsg = String(error);
        if (this.cancellationTokenSource?.token.isCancellationRequested || errMsg.includes('cancelled')) {
          logger.info('Duplicate filtering cancelled by user.');
          this.sendMessage({
            type: 'cancelled', 
            message: 'Operation cancelled by user.' 
          });
          return;
        }
        throw error;
      }
      
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
      await this.controller.generateCandidates(prompt, uniqueCandidates, equivalenceMap);
      
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
      
      // Check if the error is about running out of words
      const errorMessage = String(error);
      if (errorMessage.includes('Could not generate unique word') || 
          errorMessage.includes('Failed to generate') ||
          errorMessage.includes('Exhausted word space')) {
        // We ran out of words - show best candidates so far
        const status = this.controller.getStatus();
        const activeCandidates = status.candidateDetails.filter(c => !c.eliminated);
        
        // Send a single consolidated message about word exhaustion
        this.sendMessage({
          type: 'insufficientWords',
          candidates: activeCandidates,
          status,
          message: `Unable to generate more distinguishing words. ${activeCandidates.length} candidate(s) remain.`
        });
      } else {
        // For other errors, send a clean error message
        const cleanErrorMessage = error instanceof Error ? error.message : String(error);
        this.sendMessage({ 
          type: 'error', 
          message: `Error generating pair: ${cleanErrorMessage}` 
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
          message: 'No candidate regexes match your requirements.',
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

      // Filter out invalid regexes and regexes with unsupported syntax
      const validCandidates: string[] = [];
      for (const regex of candidates) {
        const isValid = this.analyzer.isValidRegex(regex);
        if (!isValid) {
          logger.warn(`Filtered out invalid regex: "${regex}"`);
          continue;
        }
        
        const hasSupported = await this.analyzer.hasSupportedSyntax(regex);
        if (!hasSupported) {
          logger.warn(`Filtered out regex with unsupported syntax: "${regex}"`);
          continue;
        }
        
        validCandidates.push(regex);
      }

      if (validCandidates.length === 0) {
        this.sendMessage({ 
          type: 'error', 
          message: 'All generated regexes contain invalid or unsupported syntax (e.g., word boundaries \\b, lookbehinds). Please try again.' 
        });
        return;
      }

      if (validCandidates.length < candidates.length) {
        logger.info(`Filtered out ${candidates.length - validCandidates.length} invalid or unsupported regex(es)`);
      }

      // Filter out equivalent/duplicate regexes
      this.sendMessage({ type: 'status', message: 'Filtering duplicate regexes...' });
      let uniqueCandidates: string[] = [];
      let equivalenceMap: Map<string, string[]> = new Map();
      try {
        const deduped = await this.filterEquivalentRegexes(validCandidates);
        uniqueCandidates = deduped.uniqueRegexes;
        equivalenceMap = deduped.equivalenceMap;
      } catch (error) {
        const errMsg = String(error);
        if (this.cancellationTokenSource?.token.isCancellationRequested || errMsg.includes('cancelled')) {
          logger.info('Duplicate filtering cancelled by user (refinement).');
          this.sendMessage({
            type: 'cancelled', 
            message: 'Operation cancelled by user.' 
          });
          return;
        }
        throw error;
      }
      
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
      await this.controller.refineCandidates(prompt, uniqueCandidates, equivalenceMap);
      
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
   * Equivalence check with cancellation and timeout, using RB.isEquivalent.
   */
  private async checkEquivalenceWithTimeout(
    a: string,
    b: string,
    timeoutMs = 5000,
    token?: vscode.CancellationToken
  ): Promise<boolean> {
    const cancellationToken = token ?? this.cancellationTokenSource?.token;

    const equivalencePromise = (async () => {
      if (cancellationToken?.isCancellationRequested) {
        throw new Error('Equivalence check cancelled by user');
      }
      return await this.analyzer.areEquivalent(a, b);
    })();

    const cancellationPromise = cancellationToken
      ? new Promise<never>((_, reject) => cancellationToken.onCancellationRequested(() => reject(new Error('Equivalence check cancelled by user'))))
      : undefined;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Equivalence check timeout - regex too complex')), timeoutMs)
    );

    const racers: Promise<boolean>[] = [equivalencePromise, timeoutPromise];
    if (cancellationPromise) {
      racers.push(cancellationPromise);
    }
    
    return await Promise.race(racers);
  }

  /**
   * Filter out equivalent/duplicate regexes
   */
  private async filterEquivalentRegexes(regexes: string[]): Promise<{ uniqueRegexes: string[]; equivalenceMap: Map<string, string[]>; }> {
    // PASS 1: Fast exact string deduplication (preserving order)
    const seen = new Set<string>();
    const exactUnique: string[] = [];
    const duplicateBuckets = new Map<string, Set<string>>();

    for (const regex of regexes) {
      const bucket = duplicateBuckets.get(regex) ?? new Set<string>();
      bucket.add(regex);
      duplicateBuckets.set(regex, bucket);

      if (!seen.has(regex)) {
        seen.add(regex);
        exactUnique.push(regex);
      }
    }
    
    logger.info(`After exact deduplication: ${exactUnique.length}/${regexes.length} unique regexes`);
    
    if (exactUnique.length <= 1) {
      if (exactUnique.length === 1) {
        const duplicates = duplicateBuckets.get(exactUnique[0]) ?? new Set<string>();
        duplicates.delete(exactUnique[0]);
        return {
          uniqueRegexes: exactUnique,
          equivalenceMap: new Map<string, string[]>([[exactUnique[0], Array.from(duplicates)]])
        };
      }
      return {
        uniqueRegexes: exactUnique,
        equivalenceMap: new Map<string, string[]>()
      };
    }

    // PASS 2: Semantic equivalence using direct automata analysis (RB)
    // Skip sampling-based approaches and go straight to RB.isEquivalent for faster, more reliable deduplication
    const unique: string[] = [];
    const equivalenceMap = new Map<string, Set<string>>();
    let automataAnalysisFailures = 0;

    for (let i = 0; i < exactUnique.length; i++) {
      const regex = exactUnique[i];
      const duplicates = duplicateBuckets.get(regex) ?? new Set<string>();
      duplicates.delete(regex);

      // Check cancellation
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        throw new Error('Filtering cancelled by user');
      }

      let isEquivalent = false;
      let equivalentTo: string | undefined;

      for (const uniqueRegex of unique) {
        // Check cancellation before each comparison
        if (this.cancellationTokenSource?.token.isCancellationRequested) {
          throw new Error('Filtering cancelled by user');
        }
        
        // Direct automata-based equivalence check
        try {
          logger.info(`Equivalence check: comparing "${regex}" vs "${uniqueRegex}"...`);
          const equivalent = await this.checkEquivalenceWithTimeout(regex, uniqueRegex, 8000, this.cancellationTokenSource?.token);

          if (equivalent) {
            logger.info(`Found equivalent: "${regex}" === "${uniqueRegex}"`);
            isEquivalent = true;
            equivalentTo = uniqueRegex;
            break;
          }
        } catch (error) {
          const errMsg = String(error);
          if (errMsg.includes('cancelled')) {
            throw error; // Re-throw cancellation
          }

          // Equivalence analysis failed or timed out. Log and conservatively keep both.
          logger.warn(`Equivalence analysis failed for "${regex}" vs "${uniqueRegex}": ${errMsg}`);
          automataAnalysisFailures++;
        }
      }

      if (!isEquivalent) {
        unique.push(regex);
        equivalenceMap.set(regex, new Set<string>(duplicates));
        logger.info(`Keeping unique regex: "${regex}" (${unique.length} total)`);
      } else if (equivalentTo) {
        const group = equivalenceMap.get(equivalentTo) ?? new Set<string>();
        duplicates.forEach(d => group.add(d));
        group.add(regex);
        equivalenceMap.set(equivalentTo, group);
      }
    }

    // Show warning if automata analysis failed for some regexes
    if (automataAnalysisFailures > 0) {
      const message = `Unexpected automata analysis failures (${automataAnalysisFailures}). Some regexes may not have been properly deduplicated.`;
      logger.warn(message);
    }

    logger.info(`Final: ${unique.length}/${regexes.length} semantically unique regexes`);
    const finalMap = new Map<string, string[]>();
    for (const regex of unique) {
      const equivalents = equivalenceMap.get(regex);
      finalMap.set(regex, equivalents ? Array.from(equivalents) : []);
    }

    return { uniqueRegexes: unique, equivalenceMap: finalMap };
  }

  private sendMessage(message: any) {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'pickView.html');
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'pickView.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'pickView.css'));
    
    try {
      let html = fs.readFileSync(htmlPath, 'utf8');
      // Inject the CSS and JS file URIs into the HTML
      html = html.replace('<!--CSS_URI_PLACEHOLDER-->', cssUri.toString());
      html = html.replace('<!--JS_URI_PLACEHOLDER-->', jsUri.toString());
      return html;
    } catch (err) {
      // In test environments the media file may not be available. Return a minimal
      // HTML fallback so unit tests that instantiate the view provider don't fail
      // with ENOENT. This keeps production behavior unchanged when the file exists.
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(`Could not read webview HTML at ${htmlPath}: ${errorMessage}`);
      return `<!doctype html><html><body><div id="pick-root"></div><script>const vscode = acquireVsCodeApi();</script></body></html>`;
    }
  }

  // Separated clipboard access for easier stubbing in tests
  private async copyToClipboard(text: string) {
    return vscode.env.clipboard.writeText(text);
  }
}
