import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PickController, PickState, WordClassification } from './pickController';
import { generateRegexFromDescription, PermissionRequiredError, NoModelsAvailableError, ModelNotSupportedError, ModelNotEnabledError, getAvailableChatModels, RegexCandidate } from './regexService';
import { logger } from './logger';
import { createRegexAnalyzer } from './regexAnalyzer';
import { openIssueReport } from './issueReporter';
import { SurveyPrompt } from './surveyPrompt';

interface RegexMatchVerifier {
  verifyMatch(word: string, pattern: string): boolean;
}

export function selectEdgeCaseSuggestions(
  candidates: RegexCandidate[],
  analyzer: RegexMatchVerifier,
  maxSuggestions: number
): string[] {
  const maxAllowed = Math.min(6, Math.max(0, Math.trunc(maxSuggestions)));

  if (maxAllowed === 0) {
    logger.info('Skipping LLM-suggested edge cases because user limit is 0.');
    return [];
  }

  const allSuggestedWords = candidates
    .flatMap(candidate => candidate.edgeCases ?? [])
    .map(word => word.trim())
    .filter(word => word.length > 0);

  const uniqueWords = Array.from(new Set(allSuggestedWords));

  const candidateRegexes = Array.from(new Set(candidates.map(candidate => candidate.regex)));
  const stats = uniqueWords.map((word, index) => {
    const matches = candidateRegexes.map(regex => analyzer.verifyMatch(word, regex));
    const matchCount = matches.filter(Boolean).length;
    const nonMatchCount = matches.length - matchCount;

    return { word, index, matchCount, nonMatchCount };
  });

  const distinguishing = stats
    .filter(entry => entry.matchCount > 0 && entry.nonMatchCount > 0)
    .map(entry => ({
      word: entry.word,
      score: Math.min(entry.matchCount, entry.nonMatchCount),
      index: entry.index
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const unmatched = stats.filter(entry => entry.matchCount === 0).sort((a, b) => a.index - b.index);

  const selected: string[] = distinguishing.slice(0, maxAllowed).map(entry => entry.word);

  const remainingSlots = Math.max(0, maxAllowed - selected.length);
  const unmatchedToInclude = Math.min(2, remainingSlots);
  selected.push(...unmatched.slice(0, unmatchedToInclude).map(entry => entry.word));

  if (selected.length % 2 === 1) {
    selected.pop();
  }

  if (selected.length > 0) {
    const unmatchedCount = unmatched.slice(0, unmatchedToInclude).length;
    const distinguishingCount = selected.length - unmatchedCount;
    logger.info(
      `Collected ${selected.length} LLM-suggested edge case word(s) to classify first ` +
      `(distinguishing: ${distinguishingCount}, unmatched: ${unmatchedCount}).`
    );
  }

  return selected;
}

export class PickViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'pick.pickView';
  private view?: vscode.WebviewView;
  private controller: PickController;
  private analyzer = createRegexAnalyzer();
  private cancellationTokenSource?: vscode.CancellationTokenSource;
  private activeHeartbeat?: { stop: () => void };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly surveyPrompt: SurveyPrompt,
    private readonly globalState: vscode.Memento
  ) {
    this.controller = new PickController();
  }

  private readonly preferredModelKey = 'pick.preferredModelId';

  private getPreferredModelId(): string | undefined {
    return this.globalState.get<string>(this.preferredModelKey);
  }

  private async setPreferredModelId(modelId?: string) {
    await this.globalState.update(this.preferredModelKey, modelId);
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
        case 'webviewReady':
          // Webview is initialized and ready to receive messages
          logger.info('Webview initialized and ready');
          await this.checkAvailableModels();
          break;
        case 'log':
          // Forward webview logs to backend logger
          if (data.level === 'info') {
            logger.info(`[Webview] ${data.message}`);
          } else if (data.level === 'warn') {
            logger.warn(`[Webview] ${data.message}`);
          } else if (data.level === 'error') {
            logger.error(`[Webview] ${data.message}`);
          }
          break;
        case 'generateCandidates':
          // Don't await - run asynchronously so other messages can be processed
          this.handleGenerateCandidates(data.prompt, data.modelId).catch(error => {
            logger.error(error, 'Error in handleGenerateCandidates');
          });
          break;
        case 'refineCandidates':
          // Don't await - run asynchronously so other messages can be processed
          this.handleRefineCandidates(data.prompt, data.modelId, data.modelChanged, data.previousModelId).catch(error => {
            logger.error(error, 'Error in handleRefineCandidates');
          });
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
        case 'checkModels':
          await this.checkAvailableModels();
          break;
        case 'modelSelected':
          await this.setPreferredModelId(data.modelId);
          break;
        case 'reportIssue':
          try {
            await openIssueReport();
          } catch (error) {
            logger.error(error, 'Failed to open issue report');
            this.sendMessage({ type: 'error', message: 'Failed to open issue report' });
          }
          break;
      }
    });
  }

  /**
   * Check if language models are available and notify the webview
   */
  private async checkAvailableModels() {
    try {
      const models = await getAvailableChatModels();
      const preferredModelId = this.getPreferredModelId();

      if (models.length === 0) {
        logger.warn('No language models available on startup');
        this.sendMessage({
          type: 'noModelsAvailable',
          message: 'No language models available. Please ensure you have a language model extension installed (e.g., GitHub Copilot) and that you are signed in.'
        });
      } else {
        logger.info(`Found ${models.length} available language model(s): ${models.map(m => m.name).join(', ')}`);
        const availableIds = models.map(m => m.id);
        const selectedModelId = (preferredModelId && availableIds.includes(preferredModelId))
          ? preferredModelId
          : models[0].id;
        await this.setPreferredModelId(selectedModelId);

        this.sendMessage({
          type: 'modelsAvailable',
          models: models,
          preferredModelId: selectedModelId
        });
      }
    } catch (error) {
      logger.warn(`Failed to check available models: ${error}`);
      // Don't show an error here - the user will see it when they try to generate
    }
  }

  /**
   * Build a friendly description of the model being used so we can surface it in UI status updates
   */
  private async getModelDescription(modelId?: string): Promise<string | null> {
    try {
      const models = await getAvailableChatModels();
      if (models.length === 0) {
        return null;
      }

      const preferred = modelId ? models.find(m => m.id === modelId) : undefined;
      const model = preferred ?? models[0];
      const vendorPart = model.vendor ? ` from ${model.vendor}` : '';
      const familyPart = model.family ? ` (${model.family})` : '';
      return `${model.name}${familyPart}${vendorPart}`;
    } catch (error) {
      logger.warn(`Unable to describe model for status message: ${error}`);
      return null;
    }
  }

  private collectEdgeCaseSuggestions(candidates: RegexCandidate[]): string[] {
    const config = vscode.workspace.getConfiguration('pick');
    const maxSuggestions = config.get<number>('maxSuggestedEdgeCases', 2);

    return selectEdgeCaseSuggestions(candidates, this.analyzer, maxSuggestions);
  }

  private async handleGenerateCandidates(prompt: string, modelId?: string) {
    try {
      const modelDescription = await this.getModelDescription(modelId);
      const statusMessage = modelDescription
        ? `Asking ${modelDescription} to propose candidate regexes...`
        : 'Asking your language model to propose candidate regexes...';
      this.sendMessage({ type: 'status', message: statusMessage });

      // While VS Code surfaces some LLM activity in the UI, the webview does not receive those updates.
      // Send periodic heartbeats so users see that the model is still working when responses take longer.
      const heartbeat = this.startModelHeartbeat(
        modelDescription
          ? `Waiting for ${modelDescription} to respond with candidates...`
          : 'Waiting for your language model to respond with candidates...'
      );

      // Generate candidate regexes using LLM
      // Dispose any existing cancellation token
      if (this.cancellationTokenSource) {
        this.cancellationTokenSource.dispose();
      }
      this.cancellationTokenSource = new vscode.CancellationTokenSource();
      
      let candidates: RegexCandidate[] = [];
      try {
        const result = await generateRegexFromDescription(prompt, this.cancellationTokenSource.token, modelId);
        candidates = result.candidates;
        logger.info(`Generated ${candidates.length} candidates from LLM`);

        // Log each candidate with explanation
        result.candidates.forEach((c, i) => {
          logger.info(`Candidate ${i + 1}: ${c.regex} (confidence: ${c.confidence ?? 'N/A'}) - ${c.explanation}`);
        });
      } catch (error) {
        // Debug logging to see what type of error we're getting
        logger.info(`Caught error type: ${error?.constructor?.name}, instanceof ModelNotSupportedError: ${error instanceof ModelNotSupportedError}`);
        
        // Check if it was cancelled
        if (this.cancellationTokenSource.token.isCancellationRequested) {
          logger.info('Candidate generation was cancelled by user');
          this.sendMessage({
            type: 'cancelled',
            message: 'Operation cancelled by user.'
          });
          return;
        }

        // Handle specific error types
        if (error instanceof PermissionRequiredError) {
          logger.error(error, 'Permission required for language model access');
          this.sendMessage({
            type: 'permissionRequired',
            message: error.message
          });
          return;
        }

        if (error instanceof NoModelsAvailableError) {
          logger.error(error, 'No language models available');
          this.sendMessage({
            type: 'noModelsAvailable',
            message: error.message
          });
          return;
        }

        if (error instanceof ModelNotSupportedError) {
          logger.error(error, 'Model not supported');
          this.sendMessage({
            type: 'error',
            message: error.message
          });
          return;
        }

        if (error instanceof ModelNotEnabledError) {
          logger.error(error, 'Model not enabled/accessible');
          this.sendMessage({
            type: 'error',
            message: error.message
          });
          return;
        }

        // Check for model_not_supported in error message (fallback if error class doesn't match)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('model_not_supported') || 
            errorMessage.toLowerCase().includes('model is not supported')) {
          logger.error(error, 'Model not supported (detected from message)');
          const msg = 'The selected model is not currently supported. Please try a different model.';
          vscode.window.showErrorMessage(msg, 'Select Different Model').then(selection => {
            if (selection === 'Select Different Model') {
              this.checkAvailableModels();
            }
          });
          this.sendMessage({
            type: 'error',
            message: msg
          });
          return;
        }

        logger.error(error, 'Failed to generate candidate regexes');
        this.sendMessage({
          type: 'error',
          message: 'Could not generate any candidate regexes. Please try again.'
        });
        return;
      } finally {
        heartbeat.stop();
      }

      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled after model responded (before validation)');
        this.sendMessage({
          type: 'cancelled',
          message: 'Operation cancelled by user.'
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

      this.sendMessage({ type: 'status', message: 'Validating model output (syntax checks)...' });

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
      const validCandidates: RegexCandidate[] = [];
      for (const candidate of candidates) {
        const regex = candidate.regex;
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

        validCandidates.push(candidate);
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
        const deduped = await this.filterEquivalentRegexes(validCandidates.map(c => c.regex));
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
      this.sendMessage({ type: 'status', message: 'Determining elimination thresholds...' });
      const candidateMeta = new Map<string, RegexCandidate>();
      validCandidates.forEach(candidate => {
        if (!candidateMeta.has(candidate.regex)) {
          candidateMeta.set(candidate.regex, candidate);
        }
      });

      const suggestedWords = this.collectEdgeCaseSuggestions(validCandidates);

      const seeds = uniqueCandidates.map(regex => {
        const meta = candidateMeta.get(regex);
        return {
          pattern: regex,
          explanation: meta?.explanation,
          confidence: meta?.confidence
        };
      });

      await this.controller.generateCandidates(prompt, seeds, equivalenceMap, (current, total) => {
        const percent = Math.round((current / total) * 100);
        this.sendMessage({ type: 'status', message: `Determining elimination thresholds... ${percent}%` });
      }, suggestedWords);
      
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
    logger.info('handleRequestNextPair called');
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
      logger.info(`Active candidates: ${activeCount}`);
      
      if (activeCount === 0) {
        // No candidates left - check if we're in a refinement scenario
        const wordHistory = this.controller.getWordHistory();
        const hasClassifications = wordHistory.length > 0;
        
        logger.warn('No active candidates remaining, cannot generate next pair');
        
        if (hasClassifications) {
          // This happened after re-applying classifications during refinement
          this.sendMessage({ 
            type: 'noRegexFound',
            message: `All ${this.controller.getStatus().totalCandidates} candidate regexes were eliminated after re-applying your ${wordHistory.length} previous classification${wordHistory.length === 1 ? '' : 's'}. Try revising your prompt or starting fresh.`,
            candidateDetails: this.controller.getStatus().candidateDetails,
            wordsIn: wordHistory.filter(r => r.classification === 'accept').map(r => r.word),
            wordsOut: wordHistory.filter(r => r.classification === 'reject').map(r => r.word)
          });
        } else {
          // This is an unexpected error with no classifications
          this.sendMessage({ 
            type: 'error', 
            message: 'No active candidates remaining. Please try generating candidates again.' 
          });
        }
        return;
      }

      logger.info('Calling controller.generateNextPair()');
      const pair = await this.controller.generateNextPair();
      const status = this.controller.getStatus();
      
      logger.info(`Generated pair: word1="${pair.word1}" (length: ${pair.word1.length}), word2="${pair.word2}" (length: ${pair.word2.length})`);
      
      // Check cancellation before sending pair to UI
      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled after generating pair, before sending to UI');
        this.sendMessage({ 
          type: 'cancelled', 
          message: 'Operation cancelled by user.' 
        });
        return;
      }

      logger.info('Sending newPair message to webview');
      this.sendMessage({
        type: 'newPair',
        pair,
        status,
        matches: this.getPairMatches(pair, status)
      });
      logger.info('handleRequestNextPair completed successfully');
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
        logger.warn(`Insufficient words to continue, ${activeCandidates.length} candidates remain`);
        this.sendMessage({
          type: 'insufficientWords',
          candidates: activeCandidates,
          status,
          message: `Unable to generate more distinguishing words. ${activeCandidates.length} candidate(s) remain.`
        });
      } else {
        // For other errors, send a clean error message
        const cleanErrorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to generate pair: ${cleanErrorMessage}`);
        this.sendMessage({ 
          type: 'error', 
          message: `Error generating pair: ${cleanErrorMessage}` 
        });
      }
    }
  }

  /**
   * Compute which active candidate regexes match each word in the current pair.
   */
  private getPairMatches(pair: { word1: string; word2: string }, status: ReturnType<PickController['getStatus']>) {
    const activeCandidates = status.candidateDetails.filter(c => !c.eliminated);
    const matchesForWord = (word: string) => 
      activeCandidates
        .filter(c => this.analyzer.verifyMatch(word, c.pattern))
        .map(c => c.pattern);

    return {
      word1: matchesForWord(pair.word1),
      word2: matchesForWord(pair.word2)
    };
  }

  private async handleClassifyWord(word: string, classification: string) {
    try {
      logger.info(`handleClassifyWord called: word="${word}" (length: ${word.length}), classification="${classification}"`);
      
      const classificationEnum = classification as WordClassification;
      this.controller.classifyWord(word, classificationEnum);
      
      const state = this.controller.getState();
      const status = this.controller.getStatus();
      
      logger.info(`After classifyWord: state=${state}, activeCandidates=${status.activeCandidates}`);
      
      if (state === PickState.FINAL_RESULT) {
        logger.info('State transitioned to FINAL_RESULT, calling handleFinalResult');
        await this.handleFinalResult();
      } else {
        // Check if both words are classified
        const bothClassified = this.controller.areBothWordsClassified();
        logger.info(`Checking areBothWordsClassified: ${bothClassified}`);
        
        if (bothClassified) {
          this.controller.clearCurrentPair();
          logger.info('Both words classified, clearing current pair and generating next pair');
          
          // Send updated status
          this.sendMessage({
            type: 'wordClassified',
            status,
            bothClassified: true
          });
          
          // Generate next pair
          this.handleRequestNextPair();
        } else {
          logger.info('Only one word classified so far, waiting for second word');
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
        
        // Track usage completion and potentially show survey prompt
        await this.surveyPrompt.incrementUsageAndCheckPrompt();
        
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
      
      // Track usage completion and potentially show survey prompt
      await this.surveyPrompt.incrementUsageAndCheckPrompt();
    } catch (error) {
      logger.error(error, 'Error showing final results');
      this.sendMessage({
        type: 'error',
        message: `Error showing results: ${error}`
      });
    }
  }

  private async handleRefineCandidates(prompt: string, modelId?: string, modelChanged?: boolean, previousModelId?: string) {
    try {
      // Log revision type
      if (modelChanged && previousModelId) {
        const prevModelDesc = await this.getModelDescription(previousModelId);
        const newModelDesc = await this.getModelDescription(modelId);
        logger.info(`Revising with MODEL CHANGE: ${prevModelDesc || previousModelId} → ${newModelDesc || modelId}`);
      } else {
        logger.info(`Revising with prompt refinement (same model: ${modelId || 'default'})`);
      }

      const modelDescription = await this.getModelDescription(modelId);
      const statusMessage = modelDescription
        ? `Asking ${modelDescription} to refine your regex candidates...`
        : 'Asking your language model to refine your regex candidates...';
      this.sendMessage({ type: 'status', message: statusMessage });

      const heartbeat = this.startModelHeartbeat(
        modelDescription
          ? `Waiting for ${modelDescription} to finish refining your candidates...`
          : 'Waiting for your language model to finish refining your candidates...'
      );

      // Get session data before refinement
      const sessionData = this.controller.getSessionData();
      
      // Generate new candidate regexes using LLM
      // Dispose any existing cancellation token
      if (this.cancellationTokenSource) {
        this.cancellationTokenSource.dispose();
      }
      this.cancellationTokenSource = new vscode.CancellationTokenSource();
      
      let candidates: RegexCandidate[] = [];
      try {
        const result = await generateRegexFromDescription(prompt, this.cancellationTokenSource.token, modelId);
        candidates = result.candidates;
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

        // Handle specific error types
        if (error instanceof PermissionRequiredError) {
          logger.error(error, 'Permission required for language model access');
          this.sendMessage({
            type: 'permissionRequired',
            message: error.message
          });
          return;
        }

        if (error instanceof NoModelsAvailableError) {
          logger.error(error, 'No language models available');
          this.sendMessage({
            type: 'noModelsAvailable',
            message: error.message
          });
          return;
        }

        if (error instanceof ModelNotSupportedError) {
          logger.error(error, 'Model not supported');
          this.sendMessage({
            type: 'error',
            message: error.message
          });
          return;
        }

        if (error instanceof ModelNotEnabledError) {
          logger.error(error, 'Model not enabled/accessible');
          this.sendMessage({
            type: 'error',
            message: error.message
          });
          return;
        }

        // Check for model_not_supported in error message (fallback if error class doesn't match)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('model_not_supported') || 
            errorMessage.toLowerCase().includes('model is not supported')) {
          logger.error(error, 'Model not supported (detected from message)');
          const msg = 'The selected model is not currently supported. Please try a different model.';
          vscode.window.showErrorMessage(msg, 'Select Different Model').then(selection => {
            if (selection === 'Select Different Model') {
              this.checkAvailableModels();
            }
          });
          this.sendMessage({
            type: 'error',
            message: msg
          });
          return;
        }

        logger.error(error, 'Failed to generate candidate regexes during refinement');
        this.sendMessage({
          type: 'error',
          message: 'Could not generate any candidate regexes. Please try again.'
        });
        return;
      } finally {
        heartbeat.stop();
      }

      if (this.cancellationTokenSource?.token.isCancellationRequested) {
        logger.info('Operation cancelled after model responded (refinement, before validation)');
        this.sendMessage({
          type: 'cancelled',
          message: 'Operation cancelled by user.'
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

      this.sendMessage({ type: 'status', message: 'Validating model output (syntax checks)...' });

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
      const validCandidates: RegexCandidate[] = [];
      for (const candidate of candidates) {
        const regex = candidate.regex;
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

        validCandidates.push(candidate);
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
        const deduped = await this.filterEquivalentRegexes(validCandidates.map(c => c.regex));
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
      if (sessionData.wordHistory.length > 0) {
        this.sendMessage({ 
          type: 'status', 
          message: `Re-applying your ${sessionData.wordHistory.length} previous classification${sessionData.wordHistory.length === 1 ? '' : 's'} to new candidates...` 
        });
      }
      this.sendMessage({ type: 'status', message: 'Determining elimination thresholds...' });
      const candidateMeta = new Map<string, RegexCandidate>();
      validCandidates.forEach(candidate => {
        if (!candidateMeta.has(candidate.regex)) {
          candidateMeta.set(candidate.regex, candidate);
        }
      });

      const suggestedWords = this.collectEdgeCaseSuggestions(validCandidates);

      const seeds = uniqueCandidates.map(regex => {
        const meta = candidateMeta.get(regex);
        return {
          pattern: regex,
          explanation: meta?.explanation,
          confidence: meta?.confidence
        };
      });

      await this.controller.refineCandidates(prompt, seeds, equivalenceMap, (current, total) => {
        const percent = Math.round((current / total) * 100);
        this.sendMessage({ type: 'status', message: `Determining elimination thresholds... ${percent}%` });
      }, suggestedWords);
      
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
    this.stopActiveHeartbeat();
    
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

  /**
   * Periodically surface a status heartbeat to the webview while waiting for LLM responses.
   */
  private startModelHeartbeat(message: string, intervalMs = 8000): { stop: () => void } {
    this.stopActiveHeartbeat();

    const interval = setInterval(() => this.sendMessage({ type: 'status', message }), intervalMs);
    const stop = () => {
      clearInterval(interval);
      if (this.activeHeartbeat && this.activeHeartbeat.stop === stop) {
        this.activeHeartbeat = undefined;
      }
    };

    const heartbeat = { stop };
    this.activeHeartbeat = heartbeat;
    return heartbeat;
  }

  private stopActiveHeartbeat() {
    if (this.activeHeartbeat) {
      this.activeHeartbeat.stop();
      this.activeHeartbeat = undefined;
    }
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'pickView.html');
    const splashPath = path.join(this.extensionUri.fsPath, 'media', 'pickSplash.html');
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'pickView.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'pickView.css'));
    const prismCoreUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'vendor', 'prism-core.min.js'));
    const prismRegexUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'vendor', 'prism-regex.min.js'));
    
    try {
      const splashHtml = fs.readFileSync(splashPath, 'utf8');
      let html = fs.readFileSync(htmlPath, 'utf8');
      // Inject the CSS, JS, and splash partial into the HTML
      html = html.replace('<!--CSS_URI_PLACEHOLDER-->', cssUri.toString());
      html = html.replace('<!--PRISM_CORE_URI_PLACEHOLDER-->', prismCoreUri.toString());
      html = html.replace('<!--PRISM_REGEX_URI_PLACEHOLDER-->', prismRegexUri.toString());
      html = html.replace('<!--JS_URI_PLACEHOLDER-->', jsUri.toString());
      html = html.replace('<!--SPLASH_HTML_PLACEHOLDER-->', splashHtml);
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

  /**
   * Clear any persisted webview state (prompt history, splash acknowledgement).
   * Invoked by the reset command so the splash and history reset alongside global storage.
   */
  public async resetLocalWebviewState() {
    await this.setPreferredModelId(undefined);
    this.sendMessage({ type: 'resetLocalState' });
  }

  // Separated clipboard access for easier stubbing in tests
  private async copyToClipboard(text: string) {
    return vscode.env.clipboard.writeText(text);
  }
}
