import { createRegexAnalyzer, RegexAnalyzer } from './regexAnalyzer';

interface CandidateRegex {
  pattern: string;
  negativeVotes: number;
  eliminated: boolean;
}

export interface WordPair {
  word1: string;
  word2: string;
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

  constructor() {
    this.analyzer = createRegexAnalyzer();
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
    
    // Initialize candidates
    this.candidates = candidatePatterns.map(pattern => ({
      pattern,
      negativeVotes: 0,
      eliminated: false
    }));
    
    this.usedWords.clear();
    this.state = PickState.VOTING;
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
      
      return this.currentPair;
    } catch (error) {
      throw new Error(`Failed to generate word pair: ${error}`);
    }
  }

  /**
   * Process user vote on current word pair
   * @param acceptedWord The word the user accepted (word1 or word2)
   */
  processVote(acceptedWord: string): void {
    if (!this.currentPair) {
      throw new Error('No current pair to vote on');
    }

    const { word1, word2 } = this.currentPair;
    const rejectedWord = acceptedWord === word1 ? word2 : word1;

    // Find which regexes match the rejected word and increment their negative votes
    for (const candidate of this.candidates) {
      if (candidate.eliminated) {
        continue;
      }

      const matches = this.analyzer.verifyMatch(rejectedWord, candidate.pattern);
      if (matches) {
        candidate.negativeVotes++;
        
        // Eliminate if threshold reached
        if (candidate.negativeVotes >= this.thresholdVotes) {
          candidate.eliminated = true;
        }
      }
    }

    // Check if we're done
    const activeCount = this.getActiveCandidateCount();
    if (activeCount === 1) {
      this.state = PickState.FINAL_RESULT;
      this.finalRegex = this.getActiveCandidates()[0];
    } else if (activeCount === 0) {
      // All eliminated - pick the one with fewest negative votes
      const best = this.candidates.reduce((prev, curr) => 
        curr.negativeVotes < prev.negativeVotes ? curr : prev
      );
      this.state = PickState.FINAL_RESULT;
      this.finalRegex = best.pattern;
    }

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
  }

  /**
   * Get current status summary
   */
  getStatus(): {
    state: PickState;
    activeCandidates: number;
    totalCandidates: number;
    usedWords: number;
    candidateDetails: Array<{ pattern: string; votes: number; eliminated: boolean }>;
  } {
    return {
      state: this.state,
      activeCandidates: this.getActiveCandidateCount(),
      totalCandidates: this.candidates.length,
      usedWords: this.usedWords.size,
      candidateDetails: this.candidates.map(c => ({
        pattern: c.pattern,
        votes: c.negativeVotes,
        eliminated: c.eliminated
      }))
    };
  }

  /**
   * Set the threshold for elimination
   */
  setThreshold(threshold: number): void {
    this.thresholdVotes = Math.max(1, threshold);
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.thresholdVotes;
  }
}
