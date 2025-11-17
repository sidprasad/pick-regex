import { createRegexAnalyzer, RegexAnalyzer } from './regexAnalyzer';
import * as vscode from 'vscode';
import { logger } from './logger';

interface CandidateRegex {
  pattern: string;
  negativeVotes: number;
  positiveVotes: number;
  eliminated: boolean;
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

  constructor() {
    this.analyzer = createRegexAnalyzer();
    // Read threshold from configuration
    const config = vscode.workspace.getConfiguration('pick');
    this.thresholdVotes = config.get<number>('eliminationThreshold', 2);
    logger.info(`Initialized PickController with elimination threshold ${this.thresholdVotes}`);
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
  async generateCandidates(prompt: string, candidatePatterns: string[]): Promise<void> {
    this.state = PickState.GENERATING_CANDIDATES;
    logger.info(`Generating candidates for prompt: ${prompt}`);

    // Initialize candidates
    this.candidates = candidatePatterns.map(pattern => ({
      pattern,
      negativeVotes: 0,
      positiveVotes: 0,
      eliminated: false
    }));
    logger.info(`Initialized ${this.candidates.length} candidate regexes.`);

    this.usedWords.clear();
    this.wordHistory = [];
    this.state = PickState.VOTING;
    logger.info('Transitioned to VOTING state.');
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
    logger.info(`Request to generate next pair with ${activeCandidates.length} active candidates.`);

    if (activeCandidates.length <= 1) {
      throw new Error('Not enough active candidates to generate pairs');
    }

    try {
      const result = await this.analyzer.generateTwoDistinguishingWords(
        activeCandidates,
        Array.from(this.usedWords)
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
      // Give positive votes to matching regexes
      logger.info(
        `Classified "${word}" as ACCEPT. Updating ${this.candidates.length} candidates for positive votes.`
      );
      for (const candidate of this.candidates) {
        if (candidate.eliminated) {
          continue;
        }
        if (this.analyzer.verifyMatch(word, candidate.pattern)) {
          candidate.positiveVotes++;
        }
      }
    } else if (classification === WordClassification.REJECT) {
      // Give negative votes to matching regexes
      logger.info(
        `Classified "${word}" as REJECT. Applying elimination threshold ${this.thresholdVotes}.`
      );
      for (const candidate of this.candidates) {
        if (candidate.eliminated) {
          continue;
        }
        if (this.analyzer.verifyMatch(word, candidate.pattern)) {
          candidate.negativeVotes++;

          // Eliminate if threshold reached
          if (candidate.negativeVotes >= this.thresholdVotes) {
            candidate.eliminated = true;
            logger.info(
              `Eliminated candidate ${candidate.pattern} after ${candidate.negativeVotes} negative votes.`
            );
          }
        }
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
      return false;
    }

    const { word1, word2 } = this.currentPair;
    const word1Classified = this.wordHistory.some(r => r.word === word1);
    const word2Classified = this.wordHistory.some(r => r.word === word2);

    return word1Classified && word2Classified;
  }

  /**
   * Clear current pair (call after both words are classified)
   */
  clearCurrentPair(): void {
    this.currentPair = null;
  }

  /**
   * Check if we should transition to final result state
   */
  private checkFinalState(): void {
    const activeCandidates = this.getActiveCandidates();
    const activeCount = activeCandidates.length;

    if (activeCount === 1) {
      const candidate = this.candidates.find(c => !c.eliminated);
      // Select if it has at least one positive vote OR if it's the only candidate from the start
      if (candidate && (candidate.positiveVotes > 0 || this.wordHistory.length === 0)) {
        this.state = PickState.FINAL_RESULT;
        this.finalRegex = candidate.pattern;
        logger.info(`Final regex selected with remaining candidate: ${this.finalRegex}`);
      }
    } else if (activeCount === 0) {
      // All eliminated - pick the one with most positive votes, or least negative votes
      const best = this.candidates.reduce((prev, curr) => {
        if (curr.positiveVotes > prev.positiveVotes) {
          return curr;
        }
        if (curr.positiveVotes === prev.positiveVotes && curr.negativeVotes < prev.negativeVotes) {
          return curr;
        }
        return prev;
      });
      this.state = PickState.FINAL_RESULT;
      this.finalRegex = best.pattern;
      logger.warn('All candidates eliminated; selected best remaining regex based on votes.');
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
            if (candidate.negativeVotes >= this.thresholdVotes) {
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
      const inWords = this.analyzer.generateMultipleWords(
        this.finalRegex,
        count
      ).filter(w => !this.usedWords.has(w));
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
   */
  reset(): void {
    this.candidates = [];
    this.usedWords.clear();
    this.state = PickState.INITIAL;
    this.currentPair = null;
    this.finalRegex = null;
    this.wordHistory = [];
    logger.info('Reset PickController state to INITIAL.');
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
      negativeVotes: number;
      positiveVotes: number;
      eliminated: boolean;
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
        negativeVotes: c.negativeVotes,
        positiveVotes: c.positiveVotes,
        eliminated: c.eliminated
      })),
      wordHistory: this.getWordHistory()
    };
  }

  /**
   * Set the threshold for elimination
   */
  setThreshold(threshold: number): void {
    this.thresholdVotes = Math.max(1, threshold);
    logger.info(`Updated elimination threshold to ${this.thresholdVotes}`);
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.thresholdVotes;
  }
}
