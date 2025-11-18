import * as vscode from 'vscode';
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
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PICK - Regex Builder</title>
  <style>
    body {
      padding: 10px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      font-size: var(--vscode-font-size);
    }
    
    .container {
      max-width: 100%;
    }
    
    .section {
      margin-bottom: 20px;
      padding: 15px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
    }
    
    h2 {
      margin-top: 0;
      color: var(--vscode-titleBar-activeForeground);
      font-size: 1.2em;
    }
    
    input[type="text"] {
      width: 100%;
      padding: 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      box-sizing: border-box;
      margin-bottom: 10px;
    }
    
    button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 13px;
      margin-right: 8px;
      margin-bottom: 8px;
    }
    
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    
    .word-pair {
      display: flex;
      gap: 10px;
      margin: 15px 0;
    }
    
    .word-card {
      flex: 1;
      padding: 12px 10px;
      background: var(--vscode-editor-background);
      border: 2px solid var(--vscode-input-border);
      border-radius: 4px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .word-card:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }
    
    .word-card .word {
      font-size: 1.25em;
      font-weight: bold;
      margin-bottom: 10px;
      color: var(--vscode-editor-foreground);
      font-family: monospace;
    }

    .word-actions {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      justify-content: center;
    }

    .btn {
      border: none;
      background: transparent;
      padding: 6px;
      border-radius: 6px;
      cursor: pointer;
      min-width: 36px;
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .btn svg { width: 16px; height: 16px; }

  .btn.accept { color: var(--vscode-terminal-ansiGreen, #16a34a); }
  .btn.reject { color: var(--vscode-terminal-ansiRed, #ef4444); }
    .btn.unsure { color: var(--vscode-foreground); }

    .btn:hover { background: var(--vscode-list-hoverBackground); }

    .btn:disabled { opacity: 0.6; cursor: default; }
    
    .status-bar {
      padding: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 4px;
      margin-bottom: 15px;
      font-size: 0.9em;
    }
    
    .candidates-list {
      margin-top: 10px;
    }
    
    .candidate-item {
      padding: 8px;
      margin: 4px 0;
      background: var(--vscode-list-inactiveSelectionBackground);
      border-radius: 2px;
      font-family: monospace;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .candidate-item.eliminated {
      opacity: 0.5;
      text-decoration: line-through;
    }
    
    .candidate-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      border-left: 3px solid var(--vscode-focusBorder);
    }
    
    .badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 0.85em;
    }
    
    .final-result {
      text-align: center;
    }
    
    .regex-display {
      font-size: 1.5em;
      font-family: monospace;
      padding: 15px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      margin: 15px 0;
      word-break: break-all;
    }
    
    .examples {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-top: 15px;
    }
    
    .example-box {
      padding: 10px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
    }
    
    .example-box h3 {
      margin-top: 0;
      font-size: 1em;
    }
    
    .example-box.in {
      border-left: 3px solid #4caf50;
    }
    
    .example-box.out {
      border-left: 3px solid #f44336;
    }
    
    .example-item {
      font-family: monospace;
      padding: 4px 8px;
      margin: 4px 0;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 2px;
    }
    
    .hidden {
      display: none;
    }
    
    .loading {
      text-align: center;
      padding: 20px;
      color: var(--vscode-descriptionForeground);
    }
    
    .error {
      padding: 10px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
      border-radius: 4px;
      margin: 10px 0;
    }

    /* New styles for word classification UI */
    .word-actions {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 10px;
    }

    button.accept {
      background: #4caf50;
      color: white;
    }

    button.accept:hover {
      background: #45a049;
    }

    button.reject {
      background: #f44336;
      color: white;
    }

    button.reject:hover {
      background: #da190b;
    }

    button.unsure {
      background: #ff9800;
      color: white;
    }

    button.unsure:hover {
      background: #e68900;
    }

    .word-card.classified {
      opacity: 0.7;
      border-color: var(--vscode-descriptionForeground);
    }

    .word-card.classified-accept {
      border-color: #4caf50;
      background: rgba(76, 175, 80, 0.1);
    }

    .word-card.classified-reject {
      border-color: #f44336;
      background: rgba(244, 67, 54, 0.1);
    }

    .word-card.classified-unsure {
      border-color: #ff9800;
      background: rgba(255, 152, 0, 0.1);
    }

    .word-history {
      margin-top: 20px;
      padding: 15px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      max-height: 300px;
      overflow-y: auto;
    }

    .word-history h3 {
      margin-top: 0;
      font-size: 1em;
      color: var(--vscode-titleBar-activeForeground);
    }

    .history-item {
      padding: 6px 8px;
      margin: 6px 0;
      background: var(--vscode-list-inactiveSelectionBackground);
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .history-word {
      font-family: monospace;
      font-weight: bold;
      font-size: 1.1em;
    }

    .history-classification {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .history-classification select {
      padding: 6px 10px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 2px;
      cursor: pointer;
    }

    .classification-badge {
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: bold;
    }

    .classification-badge.accept {
      background: var(--vscode-terminal-ansiGreen, #4caf50);
      color: var(--vscode-foreground);
    }

    .classification-badge.reject {
      background: var(--vscode-terminal-ansiRed, #ef4444);
      color: var(--vscode-foreground);
    }

    .classification-badge.unsure {
      background: var(--vscode-titleBar-activeBackground, #ff9800);
      color: var(--vscode-foreground);
    }

    .history-matches {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .threshold-info {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
      margin-top: 5px;
    }

    .candidate-votes {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .current-prompt-display {
      padding: 12px 15px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-focusBorder);
      border-radius: 4px;
      margin-bottom: 15px;
      font-family: var(--vscode-font-family);
    }

    .current-prompt-display .prompt-label {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .current-prompt-display .prompt-text {
      font-size: 1em;
      color: var(--vscode-foreground);
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Initial Prompt -->
    <div id="promptSection" class="section">
      <h2>PICK: Regex Builder</h2>
      <p>Describe the regex you want to build:</p>
      <input type="text" id="promptInput" placeholder="e.g., email addresses, phone numbers, dates..." />
      <button id="generateBtn">Start PICKing</button>
    </div>

    <!-- Status Bar -->
    <div id="statusBar" class="status-bar hidden"></div>
    <div id="cancelSection" class="hidden" style="margin-bottom: 15px;">
      <button id="cancelBtn" class="secondary">Cancel Operation</button>
    </div>

    <!-- Voting Section -->
    <div id="votingSection" class="section hidden">
      <div id="currentPromptDisplay" class="current-prompt-display"></div>
      <h2>Classify each word - Accept, Reject, or Unsure:</h2>
      <div class="word-pair" id="wordPair"></div>
      <div class="candidates-list" id="candidatesList"></div>
      <div class="word-history" id="wordHistory">
        <h3>Word Classification History</h3>
        <div id="historyItems"></div>
      </div>
      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--vscode-panel-border);">
        <button id="cancelVotingBtn" class="secondary">Cancel</button>
        <button id="refineBtn" class="secondary">Refine Prompt</button>
        <button id="startFreshBtn" class="secondary">Start Fresh</button>
      </div>
    </div>

    <!-- Final Result -->
    <div id="finalSection" class="section hidden">
      <div class="final-result">
        <div id="finalPromptDisplay" class="current-prompt-display"></div>
        <h2>Final Regex</h2>
        <div class="regex-display" id="finalRegex"></div>
        <div class="examples">
          <div class="example-box in">
            <h3>✅ Words IN</h3>
            <div id="wordsIn"></div>
          </div>
          <div class="example-box out">
            <h3>❌ Words OUT</h3>
            <div id="wordsOut"></div>
          </div>
        </div>
        <button id="refineResultBtn" class="secondary">Refine Prompt</button>
        <button id="resetBtn">Start Fresh</button>
      </div>
    </div>

    <!-- Error Display -->
    <div id="errorSection" class="error hidden"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    // UI Elements
    const promptSection = document.getElementById('promptSection');
    const votingSection = document.getElementById('votingSection');
    const finalSection = document.getElementById('finalSection');
    const statusBar = document.getElementById('statusBar');
    const cancelSection = document.getElementById('cancelSection');
    const errorSection = document.getElementById('errorSection');
    const generateBtn = document.getElementById('generateBtn');
    const promptInput = document.getElementById('promptInput');
    const wordPair = document.getElementById('wordPair');
    const candidatesList = document.getElementById('candidatesList');
    const historyItems = document.getElementById('historyItems');
    const finalRegex = document.getElementById('finalRegex');
    const wordsIn = document.getElementById('wordsIn');
    const wordsOut = document.getElementById('wordsOut');
    const resetBtn = document.getElementById('resetBtn');
    const refineBtn = document.getElementById('refineBtn');
    const startFreshBtn = document.getElementById('startFreshBtn');
    const refineResultBtn = document.getElementById('refineResultBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const cancelVotingBtn = document.getElementById('cancelVotingBtn');
    const currentPromptDisplay = document.getElementById('currentPromptDisplay');
    const finalPromptDisplay = document.getElementById('finalPromptDisplay');

    // Track classified words in current pair
    let classifiedWords = new Set();

    // Helper function to update prompt display
    function updatePromptDisplay(prompt) {
      const html = \`
        <div class="prompt-label">Your Prompt</div>
        <div class="prompt-text">\${prompt}</div>
      \`;
      if (currentPromptDisplay) {
        currentPromptDisplay.innerHTML = html;
      }
      if (finalPromptDisplay) {
        finalPromptDisplay.innerHTML = html;
      }
    }

    // Event Listeners
    generateBtn.addEventListener('click', () => {
      const prompt = promptInput.value.trim();
      if (prompt) {
        updatePromptDisplay(prompt);
        vscode.postMessage({ type: 'generateCandidates', prompt });
        showSection('loading');
      }
    });

    resetBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'reset', preserveClassifications: false });
    });

    refineBtn.addEventListener('click', () => {
      showRefinePromptDialog();
    });

    startFreshBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'reset', preserveClassifications: false });
    });

    refineResultBtn.addEventListener('click', () => {
      showRefinePromptDialog();
    });

    cancelBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    cancelVotingBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.type) {
        case 'status':
          showStatus(message.message);
          break;
        case 'error':
          showError(message.message);
          break;
        case 'warning':
          showWarning(message.message);
          break;
        case 'candidatesGenerated':
          updateCandidates(message.candidates, 2);
          break;
        case 'candidatesRefined':
          showStatus(\`Refined with \${message.preservedClassifications} preserved classification(s)\`);
          updateCandidates(message.candidates, 2);
          break;
        case 'newPair':
          classifiedWords.clear();
          showWordPair(message.pair, message.status);
          break;
        case 'wordClassified':
          updateStatus(message.status);
          if (message.bothClassified) {
            classifiedWords.clear();
          }
          break;
        case 'classificationUpdated':
          updateStatus(message.status);
          break;
        case 'voteProcessed':
          updateStatus(message.status);
          break;
        case 'finalResult':
          showFinalResult(message.regex, message.wordsIn, message.wordsOut);
          break;
        case 'noRegexFound':
          showNoRegexFound(message.message, message.candidateDetails);
          break;
        case 'insufficientWords':
          showInsufficientWords(message.candidates, message.status);
          break;
        case 'reset':
          resetUI(message.preserveClassifications);
          break;
        case 'cancelled':
          handleCancelled(message.message);
          break;
      }
    });

    function showSection(section) {
      promptSection.classList.add('hidden');
      votingSection.classList.add('hidden');
      finalSection.classList.add('hidden');
      errorSection.classList.add('hidden');
      cancelSection.classList.add('hidden');
      
      if (section === 'prompt') {
        promptSection.classList.remove('hidden');
      } else if (section === 'voting') {
        votingSection.classList.remove('hidden');
        statusBar.classList.remove('hidden');
      } else if (section === 'final') {
        finalSection.classList.remove('hidden');
      } else if (section === 'loading') {
        statusBar.classList.remove('hidden');
        cancelSection.classList.remove('hidden');
      }
    }

    function showStatus(message) {
      statusBar.textContent = message;
      statusBar.classList.remove('hidden');
      cancelSection.classList.remove('hidden');
    }

    function showError(message) {
      errorSection.textContent = message;
      errorSection.classList.remove('hidden');
    }

    function showWarning(message) {
      statusBar.textContent = '⚠️ ' + message;
      statusBar.classList.remove('hidden');
    }

    function showInsufficientWords(candidates, status) {
      showSection('voting');
      updateCandidates(candidates, status.threshold);
      updateWordHistory(status.wordHistory);
      
      // Show a message in the word pair area
      wordPair.innerHTML = \`
        <div style="text-align: center; padding: 20px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); border-radius: 4px;">
          <h3>⚠️ Unable to Generate More Words</h3>
          <p>The system ran out of distinguishing words to generate.</p>
          <p>Here are the remaining candidates - you may need to choose manually or start over with a different prompt.</p>
          <button onclick="location.reload()" style="margin-top: 10px;">Start Over</button>
        </div>
      \`;
    }

    function updateCandidates(candidates, threshold) {
      candidatesList.innerHTML = '<h3>Candidate Regexes:</h3>';
      if (threshold !== undefined) {
        const thresholdDiv = document.createElement('div');
        thresholdDiv.className = 'threshold-info';
        thresholdDiv.textContent = \`Rejection threshold: \${threshold} negative votes\`;
        candidatesList.appendChild(thresholdDiv);
      }
      
      candidates.forEach(c => {
        const div = document.createElement('div');
        div.className = \`candidate-item \${c.eliminated ? 'eliminated' : 'active'}\`;
        div.innerHTML = \`
          <span>\${c.pattern}</span>
          <div class="candidate-votes">
            <span class="badge" style="background: #4caf50;">✓ \${c.positiveVotes}</span>
            <span class="badge" style="background: #f44336;">✗ \${c.negativeVotes}</span>
          </div>
        \`;
        candidatesList.appendChild(div);
      });
    }

    function updateStatus(status) {
      updateCandidates(status.candidateDetails, status.threshold);
      updateWordHistory(status.wordHistory);
      showStatus(\`Active: \${status.activeCandidates}/\${status.totalCandidates} | Words classified: \${status.wordHistory.length}\`);
    }

    function classifyWord(word, classification) {
      classifiedWords.add(word);
      vscode.postMessage({ 
        type: 'classifyWord', 
        word: word, 
        classification: classification 
      });
      
      // Update UI to show word is classified
      const wordCards = document.querySelectorAll('.word-card');
      wordCards.forEach(card => {
        const cardWord = card.querySelector('.word').textContent;
        if (cardWord === word) {
          card.classList.add('classified', \`classified-\${classification}\`);
          const buttons = card.querySelectorAll('button');
          buttons.forEach(btn => btn.disabled = true);
        }
      });
    }

    function showWordPair(pair, status) {
      showSection('voting');
      updateCandidates(status.candidateDetails, status.threshold);
      updateWordHistory(status.wordHistory);
      showStatus(\`Active: \${status.activeCandidates}/\${status.totalCandidates} | Words classified: \${status.wordHistory.length}\`);
      
      wordPair.innerHTML = \`
        <div class="word-card" id="card-\${pair.word1}">
          <div class="word">\${pair.word1}</div>
          <div class="word-actions">
            <button class="btn accept" onclick="classifyWord('\${pair.word1}', 'accept')" title="Accept">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="btn reject" onclick="classifyWord('\${pair.word1}', 'reject')" title="Reject">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="btn unsure" onclick="classifyWord('\${pair.word1}', 'unsure')" title="Unsure">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 14v-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M11.5 9a1.5 1.5 0 1 1 1.5 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="word-card" id="card-\${pair.word2}">
          <div class="word">\${pair.word2}</div>
          <div class="word-actions">
            <button class="btn accept" onclick="classifyWord('\${pair.word2}', 'accept')" title="Accept">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="btn reject" onclick="classifyWord('\${pair.word2}', 'reject')" title="Reject">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="btn unsure" onclick="classifyWord('\${pair.word2}', 'unsure')" title="Unsure">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 14v-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M11.5 9a1.5 1.5 0 1 1 1.5 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      \`;
    }

    function updateWordHistory(history) {
      if (!history || history.length === 0) {
        historyItems.innerHTML = '<p style="color: var(--vscode-descriptionForeground); font-style: italic;">No words classified yet.</p>';
        return;
      }

      historyItems.innerHTML = '';
      history.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = \`
          <div>
            <div class="history-word">\${item.word}</div>
            <div class="history-matches">\${item.matchingRegexes.length} regex(es) match this word</div>
          </div>
          <div class="history-classification">
            <select onchange="updateClassification(\${index}, this.value)">
              <option value="accept" \${item.classification === 'accept' ? 'selected' : ''}>✓ Accept</option>
              <option value="reject" \${item.classification === 'reject' ? 'selected' : ''}>✗ Reject</option>
              <option value="unsure" \${item.classification === 'unsure' ? 'selected' : ''}>? Unsure</option>
            </select>
          </div>
        \`;
        historyItems.appendChild(div);
      });
    }

    function updateClassification(index, newClassification) {
      vscode.postMessage({
        type: 'updateClassification',
        index: index,
        classification: newClassification
      });
    }

    function vote(word) {
      vscode.postMessage({ type: 'vote', acceptedWord: word });
    }

    function showFinalResult(regex, inWords, outWords) {
      showSection('final');
      finalRegex.textContent = regex;
      
      wordsIn.innerHTML = inWords.map(w => 
        \`<div class="example-item">\${w}</div>\`
      ).join('');
      
      wordsOut.innerHTML = outWords.map(w => 
        \`<div class="example-item">\${w}</div>\`
      ).join('');
    }

    function showNoRegexFound(message, candidateDetails) {
      showSection('final');
      finalRegex.textContent = 'No regex found';
      finalRegex.style.color = '#f48771';
      
      const detailsHtml = candidateDetails.map(c => 
        \`<div class="example-item" style="opacity: 0.7;">
          <strong>\${c.pattern}</strong> - Eliminated with \${c.negativeVotes} negative votes
        </div>\`
      ).join('');
      
      wordsIn.innerHTML = \`
        <div style="padding: 10px; background: var(--vscode-editorWarning-background); color: var(--vscode-editorWarning-foreground); border-radius: 4px; margin-bottom: 10px;">
          \${message}
        </div>
        <div style="margin-top: 10px; font-size: 12px; opacity: 0.8;">
          <strong>All candidates were eliminated:</strong>
        </div>
        \${detailsHtml}
      \`;
      wordsOut.innerHTML = '';
    }

    function resetUI(preserveClassifications = false) {
      if (!preserveClassifications) {
        promptInput.value = '';
        if (currentPromptDisplay) {
          currentPromptDisplay.innerHTML = '';
        }
        if (finalPromptDisplay) {
          finalPromptDisplay.innerHTML = '';
        }
      }
      classifiedWords.clear();
      showSection('prompt');
      statusBar.classList.add('hidden');
      cancelSection.classList.add('hidden');
    }

    function handleCancelled(message) {
      showStatus(message || 'Operation cancelled');
      setTimeout(() => {
        resetUI(false);
      }, 2000);
    }

    function showRefinePromptDialog() {
      // Create a simple inline prompt form in the voting section
      const currentPrompt = promptInput.value;
      const dialogHtml = \`
        <div style="padding: 20px; background: var(--vscode-editor-background); border: 2px solid var(--vscode-focusBorder); border-radius: 4px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Refine Your Prompt</h3>
          <p style="color: var(--vscode-descriptionForeground);">
            Update your prompt to generate new candidates while preserving your existing classifications.
          </p>
          <input type="text" id="refinePromptInput" value="\${currentPrompt}" 
                 style="width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 2px; margin-bottom: 10px;" 
                 placeholder="Enter a refined description..." />
          <div>
            <button onclick="submitRefinedPrompt()" style="background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; padding: 8px 16px; cursor: pointer; margin-right: 8px;">
              Generate New Candidates
            </button>
            <button onclick="cancelRefine()" style="background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; padding: 8px 16px; cursor: pointer;">
              Cancel
            </button>
          </div>
        </div>
      \`;
      
      // Show dialog in the word pair area or at the top of voting section
      const dialogContainer = document.createElement('div');
      dialogContainer.id = 'refineDialog';
      dialogContainer.innerHTML = dialogHtml;
      
      // Insert at the beginning of voting section
      const votingSectionElement = document.getElementById('votingSection');
      votingSectionElement.insertBefore(dialogContainer, votingSectionElement.firstChild);
    }

    function submitRefinedPrompt() {
      const refineInput = document.getElementById('refinePromptInput');
      const newPrompt = refineInput.value.trim();
      if (newPrompt) {
        promptInput.value = newPrompt;
        updatePromptDisplay(newPrompt);
        vscode.postMessage({ type: 'refineCandidates', prompt: newPrompt });
        // Remove dialog
        const dialog = document.getElementById('refineDialog');
        if (dialog) {
          dialog.remove();
        }
        showSection('loading');
      }
    }

    function cancelRefine() {
      const dialog = document.getElementById('refineDialog');
      if (dialog) {
        dialog.remove();
      }
    }

    // Make functions available globally for inline onclick handlers
    window.classifyWord = classifyWord;
    window.updateClassification = updateClassification;
    window.vote = vote;
    window.submitRefinedPrompt = submitRefinedPrompt;
    window.cancelRefine = cancelRefine;
  </script>
</body>
</html>`;
  }
}
