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
            await vscode.env.clipboard.writeText(data.regex || '');
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

      // Filter out equivalent/duplicate regexes
      this.sendMessage({ type: 'status', message: 'Filtering duplicate regexes...' });
      const uniqueCandidates = await this.filterEquivalentRegexes(candidates);
      
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

      // Initialize controller with unique candidates
      await this.controller.generateCandidates(prompt, uniqueCandidates);
      
      this.sendMessage({
        type: 'candidatesGenerated',
        candidates: this.controller.getStatus().candidateDetails
      });

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
      
      if (finalRegex === null) {
        // All candidates were eliminated - none are correct
        this.sendMessage({
          type: 'noRegexFound',
          message: 'All candidate regexes were eliminated. None of them match your requirements.',
          candidateDetails: this.controller.getStatus().candidateDetails
        });
        return;
      }

      const examples = await this.controller.generateFinalExamples(5);
      
      this.sendMessage({
        type: 'finalResult',
        regex: finalRegex,
        wordsIn: examples.wordsIn,
        wordsOut: examples.wordsOut
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

      // Filter out equivalent/duplicate regexes
      this.sendMessage({ type: 'status', message: 'Filtering duplicate regexes...' });
      const uniqueCandidates = await this.filterEquivalentRegexes(candidates);
      
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

      // Refine candidates with preserved classifications
      await this.controller.refineCandidates(prompt, uniqueCandidates);
      
      this.sendMessage({
        type: 'candidatesRefined',
        candidates: this.controller.getStatus().candidateDetails,
        preservedClassifications: sessionData.wordHistory.length
      });

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
      this.cancellationTokenSource.dispose();
      this.cancellationTokenSource = undefined;
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
   * Filter out equivalent/duplicate regexes
   */
  private async filterEquivalentRegexes(regexes: string[]): Promise<string[]> {
    const unique: string[] = [];
    
    for (const regex of regexes) {
      let isEquivalent = false;
      
      // Check against all already added unique regexes
      for (const uniqueRegex of unique) {
        try {
          const result = await this.analyzer.analyzeRelationship(regex, uniqueRegex);
          if (result.relationship === RegexRelationship.EQUIVALENT) {
            isEquivalent = true;
            break;
          }
        } catch (error) {
          // If analysis fails, be conservative and keep both
          console.warn(`Failed to analyze relationship between regexes: ${error}`);
        }
      }
      
      if (!isEquivalent) {
        unique.push(regex);
      }
    }
    
    return unique;
  }

  private sendMessage(message: any) {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'pickView.html');
    return fs.readFileSync(htmlPath, 'utf8');
  }
}
