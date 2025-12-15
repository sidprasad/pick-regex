import { createRegexAnalyzer, RegexAnalyzer } from './regexAnalyzer';
import * as vscode from 'vscode';
import { logger } from './logger';

interface CandidateRegex {
  pattern: string;
  explanation?: string;
  confidence?: number;
  negativeVotes: number;
  positiveVotes: number;
  eliminated: boolean;
  eliminationThreshold: number;
  equivalents: string[];
}

interface CandidateSeed {
  pattern: string;
  explanation?: string;
  confidence?: number;
}

export interface WordPair {
  word1: string;
  word2: string;
}

export enum WordClassification {
  ACCEPT = 'accept',
  REJECT = 'reject',
  UNSURE = 'unsure'
}

export interface WordClassificationRecord {
  word: string;
  classification: WordClassification;
  timestamp: number;
  matchingRegexes: string[];
}

export enum PickState {
  INITIAL = 'initial',
  GENERATING_CANDIDATES = 'generating_candidates',
  VOTING = 'voting',
  FINAL_RESULT = 'final_result'
}

/**
 * Controller for the PICK interactive regex learning process
 */
export class PickController {
  private analyzer: RegexAnalyzer;
  private candidates: CandidateRegex[] = [];
  private usedWords = new Set<string>();
  private state: PickState = PickState.INITIAL;
  private thresholdVotes = 2;
  private currentPair: WordPair | null = null;
  private finalRegex: string | null = null;
  private wordHistory: WordClassificationRecord[] = [];
  private currentPrompt: string = '';
  private pairsWithoutProgress = 0;
  private lastActiveCandidateCount = 0;
  private maxClassifications = 50;
  private maxPairsWithoutProgress = 2;
  private searchTimeoutMs = 2000;
  private searchPoolSize = 30;

  constructor() {
    this.analyzer = createRegexAnalyzer();
    // Read threshold from configuration
    const config = vscode.workspace.getConfiguration('pick');
    this.thresholdVotes = config.get<number>('eliminationThreshold', 2);
    this.maxClassifications = config.get<number>('maxClassifications', 50);
    this.maxPairsWithoutProgress = config.get<number>('maxPairsWithoutProgress', 2);
    logger.info(`Initialized PickController with elimination threshold ${this.thresholdVotes}, max classifications ${this.maxClassifications}, max stale pairs ${this.maxPairsWithoutProgress}`);
  }

  /**
   * Get current state
   */
  getState(): PickState {
    return this.state;
  }

  /**
   * Start the process with a user prompt
   */
  async generateCandidates(
    prompt: string,
    candidatePatterns: Array<string | CandidateSeed>,
    equivalenceMap: Map<string, string[]> = new Map(),
    progressCallback?: (current: number, total: number) => void
  ): Promise<void> {
    this.state = PickState.GENERATING_CANDIDATES;
    logger.info(`Generating candidates for prompt: ${prompt}`);
    this.currentPrompt = prompt;

    // Initialize candidates
    const normalizedCandidates: CandidateSeed[] = candidatePatterns.map(candidate =>
      typeof candidate === 'string'
        ? { pattern: candidate }
        : candidate
    );

    this.candidates = normalizedCandidates.map(candidate => ({
      pattern: candidate.pattern,
      explanation: candidate.explanation,
      confidence: candidate.confidence,
      negativeVotes: 0,
      positiveVotes: 0,
      eliminated: false,
      eliminationThreshold: this.thresholdVotes,
      equivalents: equivalenceMap.get(candidate.pattern) ?? []
    }));
    logger.info(`Initialized ${this.candidates.length} candidate regexes.`);

    await this.autoAdjustThreshold(normalizedCandidates.map(c => c.pattern), progressCallback);

    this.usedWords.clear();
    this.wordHistory = [];
    this.state = PickState.VOTING;
    logger.info('Transitioned to VOTING state.');
  }

  /**
   * Refine the current prompt with new candidates while preserving existing classifications
   * This allows users to iterate on their prompt without losing their work
   */
  async refineCandidates(
    newPrompt: string,
    newCandidatePatterns: Array<string | CandidateSeed>,
    equivalenceMap: Map<string, string[]> = new Map(),
    progressCallback?: (current: number, total: number) => void
  ): Promise<void> {
    this.state = PickState.GENERATING_CANDIDATES;
    logger.info(`Refining candidates with new prompt: ${newPrompt}`);
    logger.info(`Preserving ${this.wordHistory.length} existing classifications`);
    this.currentPrompt = newPrompt;

    // Initialize new candidates
    const normalizedCandidates: CandidateSeed[] = newCandidatePatterns.map(candidate =>
      typeof candidate === 'string'
        ? { pattern: candidate }
        : candidate
    );

    this.candidates = normalizedCandidates.map(candidate => ({
      pattern: candidate.pattern,
      explanation: candidate.explanation,
      confidence: candidate.confidence,
      negativeVotes: 0,
      positiveVotes: 0,
      eliminated: false,
      eliminationThreshold: this.thresholdVotes,
      equivalents: equivalenceMap.get(candidate.pattern) ?? []
    }));
    logger.info(`Initialized ${this.candidates.length} new candidate regexes.`);

    // Re-apply existing classifications to new candidates
    this.recalculateVotes();

    await this.autoAdjustThreshold(normalizedCandidates.map(c => c.pattern), progressCallback);

    this.state = PickState.VOTING;
    logger.info('Transitioned to VOTING state after refinement.');
  }

  /**
   * Get active (non-eliminated) candidates
   */
  getActiveCandidates(): string[] {
    return this.candidates
      .filter(c => !c.eliminated)
      .map(c => c.pattern);
  }

  /**
   * Get number of active candidates
   */
  getActiveCandidateCount(): number {
    return this.candidates.filter(c => !c.eliminated).length;
  }

  /**
   * Generate the next distinguishing word pair
   */
  async generateNextPair(): Promise<WordPair> {
    const activeCandidates = this.getActiveCandidates();
    
    if (activeCandidates.length === 0) {
      throw new Error('No active candidates to generate pairs');
    }

    // If we're making no progress, increase search parameters to find harder distinguishing words
    if (this.pairsWithoutProgress > 0) {
      this.searchTimeoutMs = Math.min(this.searchTimeoutMs * 2, 16000);
      this.searchPoolSize = Math.min(this.searchPoolSize * 2, 200);
      logger.info(
        `No progress after ${this.pairsWithoutProgress} pairs. Increasing search parameters: timeout=${this.searchTimeoutMs}ms, poolSize=${this.searchPoolSize}`
      );
      // Counter will reset only when we actually make progress (eliminate a candidate)
    }

    try {
      const result = await this.analyzer.generateTwoDistinguishingWords(
        activeCandidates,
        Array.from(this.usedWords),
        this.searchTimeoutMs,
        this.searchPoolSize
      );

      this.currentPair = {
        word1: result.words[0],
        word2: result.words[1]
      };

      // Mark words as used
      this.usedWords.add(result.words[0]);
      this.usedWords.add(result.words[1]);

      logger.info(
        `Generated distinguishing pair: "${result.words[0]}" vs "${result.words[1]}". Used words count: ${this.usedWords.size}.`
      );

      return this.currentPair;
    } catch (error) {
      logger.error(error, 'Failed to generate word pair');
      throw new Error(`Failed to generate word pair: ${error}`);
    }
  }

  /**
   * Classify a word as Accept, Reject, or Unsure
   * @param word The word to classify
   * @param classification The classification type
   */
  classifyWord(word: string, classification: WordClassification): void {
    if (!this.currentPair) {
      throw new Error('No current pair to classify');
    }

    const { word1, word2 } = this.currentPair;
    if (word !== word1 && word !== word2) {
      throw new Error('Word is not in the current pair');
    }

    // Get matching regexes for this word
    const matchingRegexes = this.candidates
      .filter(c => !c.eliminated && this.analyzer.verifyMatch(word, c.pattern))
      .map(c => c.pattern);

    // Record classification
    this.wordHistory.push({
      word,
      classification,
      timestamp: Date.now(),
      matchingRegexes
    });

    // Process classification
    if (classification === WordClassification.ACCEPT) {
      // ACCEPT means: this word SHOULD match the target pattern
      // - Positive vote for candidates that DO match (they're correct)
      // - Negative vote for candidates that DON'T match (they're wrong - missing this word)
      logger.info(
        `Classified "${word}" as ACCEPT. Updating ${this.candidates.length} candidates.`
      );
      for (const candidate of this.candidates) {
        if (candidate.eliminated) {
          continue;
        }
        const matches = this.analyzer.verifyMatch(word, candidate.pattern);
        
        if (matches) {
          // Candidate correctly matches the accepted word
          candidate.positiveVotes++;
        } else {
          // Candidate fails to match the accepted word - it's missing something it should have
          candidate.negativeVotes++;
          
          // Eliminate if threshold reached
          if (candidate.negativeVotes >= candidate.eliminationThreshold) {
            candidate.eliminated = true;
            logger.info(
              `Eliminated candidate "${candidate.pattern}" after ${candidate.negativeVotes} negative votes (failed to match accepted word "${word}" with threshold ${candidate.eliminationThreshold}).`
            );
          }
        }
      }
    } else if (classification === WordClassification.REJECT) {
      // REJECT means: this word should NOT match the target pattern
      // - Negative vote for candidates that DO match (they're wrong - accepting bad input)
      // - No vote for candidates that DON'T match (neutral - just doing their job)
      logger.info(
        `Classified "${word}" as REJECT. Applying elimination threshold ${this.thresholdVotes}.`
      );
      for (const candidate of this.candidates) {
        if (candidate.eliminated) {
          continue;
        }
        const matches = this.analyzer.verifyMatch(word, candidate.pattern);
        
        if (matches) {
          // Candidate incorrectly matches the rejected word
          candidate.negativeVotes++;

          // Eliminate if threshold reached
          if (candidate.negativeVotes >= candidate.eliminationThreshold) {
            candidate.eliminated = true;
            logger.info(
              `Eliminated candidate "${candidate.pattern}" after ${candidate.negativeVotes} negative votes (incorrectly matched rejected word "${word}" with threshold ${candidate.eliminationThreshold}).`
            );
          }
        }
        // If doesn't match: no vote (correctly rejecting is neutral/expected)
      }
    }
    // If UNSURE, don't update any votes

    // Check if we need to transition to final result
    this.checkFinalState();
  }

  /**
   * Check if both words in current pair have been classified
   */
  areBothWordsClassified(): boolean {
    if (!this.currentPair) {
      logger.info('areBothWordsClassified: no current pair');
      return false;
    }

    const { word1, word2 } = this.currentPair;
    const word1Classified = this.wordHistory.some(r => r.word === word1);
    const word2Classified = this.wordHistory.some(r => r.word === word2);

    logger.info(
      `areBothWordsClassified: word1="${word1}" (classified: ${word1Classified}), word2="${word2}" (classified: ${word2Classified})`
    );

    return word1Classified && word2Classified;
  }

  /**
   * Clear current pair (call after both words are classified)
   */
  clearCurrentPair(): void {
    this.currentPair = null;
  }

  /**
   * Update a word in the current pair (when user edits it)
   * @param originalWord The original word to replace
   * @param newWord The new word to use
   */
  updateWordInPair(originalWord: string, newWord: string): void {
    if (!this.currentPair) {
      throw new Error('No current pair to update');
    }

    const { word1, word2 } = this.currentPair;
    
    if (word1 === originalWord) {
      this.currentPair.word1 = newWord;
      logger.info(`Updated word1 in current pair from "${originalWord}" to "${newWord}"`);
    } else if (word2 === originalWord) {
      this.currentPair.word2 = newWord;
      logger.info(`Updated word2 in current pair from "${originalWord}" to "${newWord}"`);
    } else {
      logger.warn(`Original word "${originalWord}" not found in current pair (${word1}, ${word2})`);
    }
  }

  /**
   * Check if we should transition to final result state
   */
  private checkFinalState(): void {
    const activeCandidates = this.getActiveCandidates();
    const activeCount = activeCandidates.length;

    // Check if we made progress (eliminated at least one candidate)
    if (activeCount < this.lastActiveCandidateCount) {
      this.pairsWithoutProgress = 0;
    } else if (this.lastActiveCandidateCount > 0) {
      this.pairsWithoutProgress++;
    }
    this.lastActiveCandidateCount = activeCount;

    // Check termination conditions
    const totalClassifications = this.wordHistory.length;
    const reachedMaxClassifications = totalClassifications >= this.maxClassifications;
    const staleProgress = this.pairsWithoutProgress >= this.maxPairsWithoutProgress;

    if (activeCount === 1) {
      // Check if user has accepted a word that matches this regex
      const remainingRegex = activeCandidates[0];
      const hasAcceptedMatchingWord = this.wordHistory.some(
        record => 
          record.classification === WordClassification.ACCEPT && 
          record.matchingRegexes.includes(remainingRegex)
      );
      
      if (hasAcceptedMatchingWord) {
        // User has accepted a word IN the remaining regex - we're done!
        this.state = PickState.FINAL_RESULT;
        this.finalRegex = remainingRegex;
        logger.info(`Converged to single candidate: "${remainingRegex}"`);
      }
    } else if (activeCount === 0) {
      // All eliminated - NO REGEX IS CORRECT
      this.state = PickState.FINAL_RESULT;
      this.finalRegex = null;
      logger.info('All candidates eliminated - no correct regex found');
    } else if (reachedMaxClassifications) {
      // Hit maximum classification limit - force termination
      this.state = PickState.FINAL_RESULT;
      const best = this.selectBestCandidate();
      this.finalRegex = best;
      logger.info(`Reached maximum classifications (${totalClassifications}/${this.maxClassifications}). Forcing termination with best candidate: "${best}"`);
    } else if (staleProgress && activeCount > 1) {
      // No progress for too many pairs - candidates are indistinguishable
      this.state = PickState.FINAL_RESULT;
      const best = this.selectBestCandidate(); 
      this.finalRegex = best;
      logger.info(`No progress after ${this.pairsWithoutProgress} consecutive pairs. Forcing termination with best candidate: "${best}"`);
    }
    // When there's 1 candidate but no accepted word yet, continue showing pairs
  }

  /**
   * Select the best candidate from active or all candidates
   */
  private selectBestCandidate(): string {
    const activeCandidates = this.candidates.filter(c => !c.eliminated);
    
    if (activeCandidates.length === 0) {
      // Pick best from all candidates
      const best = this.candidates.reduce((prev, curr) => {
        if (curr.positiveVotes > prev.positiveVotes) {
          return curr;
        }
        if (curr.positiveVotes === prev.positiveVotes && curr.negativeVotes < prev.negativeVotes) {
          return curr;
        }
        return prev;
      });
      return best.pattern;
    } else {
      // Pick best from active candidates
      const best = activeCandidates.reduce((prev, curr) => {
        if (curr.positiveVotes > prev.positiveVotes) {
          return curr;
        }
        if (curr.positiveVotes === prev.positiveVotes && curr.negativeVotes < prev.negativeVotes) {
          return curr;
        }
        return prev;
      });
      return best.pattern;
    }
  }

  /**
   * Update a previous classification
   * @param index Index in word history
   * @param newClassification New classification
   */
  updateClassification(index: number, newClassification: WordClassification): void {
    if (index < 0 || index >= this.wordHistory.length) {
      throw new Error('Invalid history index');
    }

    const record = this.wordHistory[index];
    const oldClassification = record.classification;

    // Update the record
    record.classification = newClassification;
    record.timestamp = Date.now();

    logger.info(
      `Updated classification for word "${record.word}" from ${oldClassification} to ${newClassification}.`
    );

    // Recalculate all votes from scratch
    this.recalculateVotes();
  }

  /**
   * Recalculate all votes from word history
   */
  private recalculateVotes(): void {
    // Reset all votes
    for (const candidate of this.candidates) {
      candidate.negativeVotes = 0;
      candidate.positiveVotes = 0;
      candidate.eliminated = false;
    }

    logger.info('Recalculating votes from word history.');

    // Replay all classifications
    for (const record of this.wordHistory) {
      if (record.classification === WordClassification.ACCEPT) {
        for (const candidate of this.candidates) {
          if (this.analyzer.verifyMatch(record.word, candidate.pattern)) {
            candidate.positiveVotes++;
          }
        }
      } else if (record.classification === WordClassification.REJECT) {
        for (const candidate of this.candidates) {
          if (this.analyzer.verifyMatch(record.word, candidate.pattern)) {
            candidate.negativeVotes++;
            if (candidate.negativeVotes >= candidate.eliminationThreshold) {
              candidate.eliminated = true;
            }
          }
        }
      }
    }

    logger.info('Finished recalculating votes. Checking final state.');

    // Check if state needs to change
    this.checkFinalState();
  }

  /**
   * Get word classification history
   */
  getWordHistory(): WordClassificationRecord[] {
    return [...this.wordHistory];
  }

  /**
   * Process user vote on current word pair (legacy method for compatibility)
   * @param acceptedWord The word the user accepted (word1 or word2)
   */
  processVote(acceptedWord: string): void {
    if (!this.currentPair) {
      throw new Error('No current pair to vote on');
    }

    const { word1, word2 } = this.currentPair;
    const rejectedWord = acceptedWord === word1 ? word2 : word1;

    // Classify accepted word as ACCEPT and rejected as REJECT
    this.classifyWord(acceptedWord, WordClassification.ACCEPT);
    this.classifyWord(rejectedWord, WordClassification.REJECT);

    this.currentPair = null;
  }

  /**
   * Get the final regex (when state is FINAL_RESULT)
   */
  getFinalRegex(): string | null {
    return this.finalRegex;
  }

  /**
   * Generate example words IN and OUT of the final regex
   */
  async generateFinalExamples(count: number = 5): Promise<{ wordsIn: string[]; wordsOut: string[] }> {
    if (!this.finalRegex) {
      throw new Error('No final regex available');
    }

    try {
      logger.info(`Generating final examples for regex ${this.finalRegex}`);
      const wordsIn: string[] = [];
      const wordsOut: string[] = [];
      
      // Generate words IN the regex
      const inWords = (await this.analyzer.generateMultipleWords(
        this.finalRegex,
        count
      )).filter(w => !this.usedWords.has(w));
      wordsIn.push(...inWords);
      
      // Generate words OUT of the regex
      for (let i = 0; i < count; i++) {
        try {
          const pair = await this.analyzer.generateWordPair(
            this.finalRegex,
            Array.from(this.usedWords)
          );
          if (!this.usedWords.has(pair.wordNotIn)) {
            wordsOut.push(pair.wordNotIn);
            this.usedWords.add(pair.wordNotIn);
          }
        } catch {
          break;
        }
      }

      return { wordsIn, wordsOut };
    } catch (error) {
      logger.error(error, 'Failed to generate final examples');
      throw new Error(`Failed to generate examples: ${error}`);
    }
  }

  /**
   * Reset the controller for a new session
   * @param preserveClassifications If true, keep word history for refining prompts
   */
  reset(preserveClassifications = false): void {
    this.candidates = [];
    this.state = PickState.INITIAL;
    this.currentPair = null;
    this.finalRegex = null;
    this.pairsWithoutProgress = 0;
    this.lastActiveCandidateCount = 0;
    this.searchTimeoutMs = 2000;
    this.searchPoolSize = 30;
    
    if (!preserveClassifications) {
      this.usedWords.clear();
      this.wordHistory = [];
      this.currentPrompt = '';
      logger.info('Reset PickController state to INITIAL (full reset).');
    } else {
      // Keep usedWords and wordHistory for prompt refinement
      logger.info(`Reset PickController state to INITIAL (preserving ${this.wordHistory.length} classifications).`);
    }
  }

  /**
   * Get the current prompt
   */
  getCurrentPrompt(): string {
    return this.currentPrompt;
  }

  /**
   * Get session data for preserving state
   */
  getSessionData(): {
    wordHistory: WordClassificationRecord[];
    usedWords: string[];
    currentPrompt: string;
    threshold: number;
  } {
    return {
      wordHistory: [...this.wordHistory],
      usedWords: Array.from(this.usedWords),
      currentPrompt: this.currentPrompt,
      threshold: this.thresholdVotes
    };
  }

  /**
   * Manually finish and select the final regex
   */
  finishSelection(): void {
    const activeCandidates = this.getActiveCandidates();
    
    if (activeCandidates.length === 0) {
      // Pick best from eliminated candidates
      const best = this.candidates.reduce((prev, curr) => {
        if (curr.positiveVotes > prev.positiveVotes) {
          return curr;
        }
        if (curr.positiveVotes === prev.positiveVotes && curr.negativeVotes < prev.negativeVotes) {
          return curr;
        }
        return prev;
      });
      this.finalRegex = best.pattern;
    } else if (activeCandidates.length === 1) {
      // Select the remaining candidate
      this.finalRegex = activeCandidates[0];
    } else {
      // Multiple candidates - pick the one with most positive votes
      const activeDetails = this.candidates.filter(c => !c.eliminated);
      const best = activeDetails.reduce((prev, curr) => 
        curr.positiveVotes > prev.positiveVotes ? curr : prev
      );
      this.finalRegex = best.pattern;
    }
    
    this.state = PickState.FINAL_RESULT;
  }

  /**
   * Get current status summary
   */
  getStatus(): {
    state: PickState;
    activeCandidates: number;
    totalCandidates: number;
    usedWords: number;
    threshold: number;
    candidateDetails: Array<{
      pattern: string;
      explanation?: string;
      confidence?: number;
      negativeVotes: number;
      positiveVotes: number;
      eliminated: boolean;
      eliminationThreshold: number;
      equivalents: string[];
    }>;
    wordHistory: WordClassificationRecord[];
  } {
    return {
      state: this.state,
      activeCandidates: this.getActiveCandidateCount(),
      totalCandidates: this.candidates.length,
      usedWords: this.usedWords.size,
      threshold: this.thresholdVotes,
      candidateDetails: this.candidates.map(c => ({
        pattern: c.pattern,
        explanation: c.explanation,
        confidence: c.confidence,
        negativeVotes: c.negativeVotes,
        positiveVotes: c.positiveVotes,
        eliminated: c.eliminated,
        eliminationThreshold: c.eliminationThreshold,
        equivalents: c.equivalents
      })),
      wordHistory: this.getWordHistory()
    };
  }

  /**
   * Set the threshold for elimination
   */
  setThreshold(threshold: number): void {
    this.thresholdVotes = Math.max(1, threshold);
    this.candidates.forEach(candidate => {
      candidate.eliminationThreshold = this.thresholdVotes;
    });
    logger.info(`Updated elimination threshold to ${this.thresholdVotes}`);
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.thresholdVotes;
  }

  /**
   * Set elimination threshold for each candidate based on pairwise distinguishing words.
   * 
   * For each candidate, the threshold is the SMALLEST number of distinguishing words
   * between it and ANY other candidate, capped at the default threshold.
   */
  private async autoAdjustThreshold(
    candidatePatterns: string[],
    progressCallback?: (current: number, total: number) => void
  ): Promise<void> {
    if (candidatePatterns.length < 2) {
      return;
    }

    const defaultThreshold = this.thresholdVotes;
    const minDistinguishing = new Map<string, number>();
    
    // Initialize with default threshold
    candidatePatterns.forEach(pattern => minDistinguishing.set(pattern, defaultThreshold));

    logger.info(`Computing distinguishability for ${candidatePatterns.length} candidates...`);
    let timeoutCount = 0;

    // Calculate total comparisons for progress
    const totalComparisons = (candidatePatterns.length * (candidatePatterns.length - 1)) / 2;
    let completedComparisons = 0;
    let foundMinThreshold = false;

    // Compare all pairs
    for (let i = 0; i < candidatePatterns.length && !foundMinThreshold; i++) {
      for (let j = i + 1; j < candidatePatterns.length && !foundMinThreshold; j++) {
        try {
          // Add timeout to prevent hanging on complex regex comparisons
          const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 5000); // 5 second timeout per comparison
          });
          
          const countPromise = (async () => {
            const countANotB = await this.analyzer.countWordsInANotInB(
              candidatePatterns[i],
              candidatePatterns[j]
            );
            const countBNotA = await this.analyzer.countWordsInANotInB(
              candidatePatterns[j],
              candidatePatterns[i]
            );

            // Convert bigint to number, capping at default threshold
            const countA = countANotB !== undefined 
              ? Math.min(Number(countANotB), defaultThreshold)
              : defaultThreshold;
            const countB = countBNotA !== undefined 
              ? Math.min(Number(countBNotA), defaultThreshold)
              : defaultThreshold;

            // Update minimum for each candidate
            const currentMinA = minDistinguishing.get(candidatePatterns[i])!;
            const currentMinB = minDistinguishing.get(candidatePatterns[j])!;
            minDistinguishing.set(candidatePatterns[i], Math.min(currentMinA, countA));
            minDistinguishing.set(candidatePatterns[j], Math.min(currentMinB, countB));
            
            // Check if we've reached minimum threshold - can stop early
            if (Math.min(currentMinA, countA) === 1 || Math.min(currentMinB, countB) === 1) {
              foundMinThreshold = true;
              logger.info('Found minimum threshold of 1 - stopping early');
            }
          })();

          await Promise.race([countPromise, timeoutPromise]);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          if (errMsg === 'Timeout') {
            timeoutCount++;
            logger.warn(`Timeout counting distinguishing words for pair ${i+1}-${j+1} - will use minimum threshold`);
            // Set both to 1 (safest/most conservative) if we timeout
            minDistinguishing.set(candidatePatterns[i], 1);
            minDistinguishing.set(candidatePatterns[j], 1);
            foundMinThreshold = true; // Can stop since we hit minimum
          } else {
            logger.warn(`Could not count distinguishing words for '${candidatePatterns[i]}' vs '${candidatePatterns[j]}': ${error}`);
          }
        } finally {
          completedComparisons++;
          if (progressCallback) {
            progressCallback(completedComparisons, totalComparisons);
          }
        }
      }
    }

    if (timeoutCount > 0) {
      logger.warn(`${timeoutCount} pairwise comparison(s) timed out - using conservative threshold of 1`);
    }

    // Set threshold for each candidate (minimum 1)
    let globalMin = defaultThreshold;
    this.candidates.forEach(candidate => {
      const threshold = Math.max(1, minDistinguishing.get(candidate.pattern) ?? defaultThreshold);
      candidate.eliminationThreshold = threshold;
      globalMin = Math.min(globalMin, threshold);
      
      if (threshold < defaultThreshold) {
        logger.info(`Set threshold for '${candidate.pattern}' to ${threshold} (min distinguishing words with any other candidate)`);
      }
    });
    
    // Update global threshold to the minimum across all candidates
    if (globalMin < this.thresholdVotes) {
      logger.info(`Updated global threshold from ${this.thresholdVotes} to ${globalMin}`);
      this.thresholdVotes = globalMin;
    }
  }
}
