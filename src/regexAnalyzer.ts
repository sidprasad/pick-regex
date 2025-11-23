import { logger } from './logger';

/**
 * Lazy load the ES module
 */
async function getRB() {
  const module = await import('@gruhn/regex-utils');
  return module.RB;
}

/**
 * Represents the relationship between two regular expressions
 */
export enum RegexRelationship {
  A_IN_B = 'A_IN_B',
  B_IN_A = 'B_IN_A',
  EQUIVALENT = 'EQUIVALENT',
  DISJOINT = 'DISJOINT',
  INTERSECTING = 'INTERSECTING'
}

export interface WordGenerationResult {
  word: string;
  explanation?: string;
}

export interface RelationshipResult {
  relationship: RegexRelationship;
  explanation: string;
  examples?: {
    inBoth?: string[];
    onlyInA?: string[];
    onlyInB?: string[];
  };
}

export interface WordPairResult {
  wordIn: string;
  wordNotIn: string;
  explanation?: string;
}

export interface DistinguishingWordsResult {
  word1: string;
  word2: string;
  explanation: string;
  distinguishingProperty?: string;
}

export interface TwoDistinguishingWordsResult {
  words: [string, string];
  explanation: string;
  properties?: string[];
}

async function createRb(pattern: string) {
  try {
    const RB = await getRB();
    return RB(new RegExp(`^${pattern}$`));
  } catch (error) {
    throw new Error(`Unsupported regex syntax for '${pattern}': ${error}`);
  }
}

/**
 * RegexAnalyzer using automata theory (randexp + regex-utils)
 */
export class RegexAnalyzer {
  private maxAttempts = 100;

  /**
   * Rough heuristic for regex complexity to decide when to avoid heavy automata analysis.
   */
  estimateComplexity(pattern: string): number {
    const lengthWeight = pattern.length;
    const quantifierWeight = ((pattern.match(/[*+?{]/g) || []).length) * 5;
    const alternationWeight = ((pattern.match(/\|/g) || []).length) * 8;
    const groupWeight = ((pattern.match(/\(/g) || []).length) * 3;
    return lengthWeight + quantifierWeight + alternationWeight + groupWeight;
  }

  /**
   * Create a quick fingerprint of a regex by sampling a few words.
   * Used for cheap deduplication buckets before expensive checks.
   */
  async sampleSignature(regex: string, sampleCount = 8, cancellationToken?: { isCancellationRequested: boolean }): Promise<string> {
    const samples = await this.generateMultipleWords(regex, sampleCount, [], cancellationToken);
    return samples.sort().join('|');
  }

  /**
   * 1. Generate a word matching a regex (excluding seen words)
   */

  /**
   * 2. Analyze relationship between two regexes using automata
   */
  async analyzeRelationship(regexA: string, regexB: string): Promise<RelationshipResult> {
    try {
      const rbA = await createRb(regexA);
      const rbB = await createRb(regexB);
      
      // Use regex-utils predicates
      const isEquiv = rbA.isEquivalent(new RegExp(`^${regexB}$`));
      const aSubsetB = rbA.isSubsetOf(new RegExp(`^${regexB}$`));
      const bSubsetA = rbB.isSubsetOf(new RegExp(`^${regexA}$`));
      const isDisjoint = rbA.isDisjointFrom(new RegExp(`^${regexB}$`));
      
      // Collect examples using set operations
      const inBoth: string[] = [];
      const onlyInA: string[] = [];
      const onlyInB: string[] = [];

      const trySample = (gen: Iterator<string>, limit: number, bucket: string[]) => {
        for (let i = 0; i < limit; i++) {
          const next = gen.next();
          if (next.done) {break;}
          bucket.push(next.value);
        }
      };

      try {
        const intersection = rbA.and(new RegExp(`^${regexB}$`));
        trySample(intersection.sample(), 5, inBoth);
      } catch {
        // ignore if set operation unsupported
      }

      try {
        const onlyA = rbA.without(new RegExp(`^${regexB}$`));
        trySample(onlyA.sample(), 5, onlyInA);
      } catch {
        // ignore if set operation unsupported
      }

      try {
        const onlyB = rbB.without(new RegExp(`^${regexA}$`));
        trySample(onlyB.sample(), 5, onlyInB);
      } catch {
        // ignore if set operation unsupported
      }
      
      let relationship: RegexRelationship;
      let explanation: string;
      
      if (isEquiv) {
        relationship = RegexRelationship.EQUIVALENT;
        explanation = 'Regexes are equivalent (match the same strings)';
      } else if (aSubsetB) {
        relationship = RegexRelationship.A_IN_B;
        explanation = 'A is a subset of B';
      } else if (bSubsetA) {
        relationship = RegexRelationship.B_IN_A;
        explanation = 'B is a subset of A';
      } else if (isDisjoint) {
        relationship = RegexRelationship.DISJOINT;
        explanation = 'Regexes are disjoint (no overlap)';
      } else {
        relationship = RegexRelationship.INTERSECTING;
        explanation = 'Regexes intersect but neither is a subset';
      }
      
      return {
        relationship,
        explanation,
        examples: { 
          inBoth: inBoth.slice(0, 3), 
          onlyInA: onlyInA.slice(0, 3), 
          onlyInB: onlyInB.slice(0, 3) 
        }
      };
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('CacheOverflowError')) {
        logger.warn(`Regex too complex for relationship analysis: '${regexA}' vs '${regexB}' - ${errorMessage}`);
        // For complex regexes, return a conservative INTERSECTING relationship
        return {
          relationship: RegexRelationship.INTERSECTING,
          explanation: 'Regexes are too complex to analyze (cache overflow)',
          examples: { inBoth: [], onlyInA: [], onlyInB: [] }
        };
      }
      throw new Error(`Failed to analyze: ${error}`);
    }
  }

  /**
   * 3. Generate a word IN and a word NOT IN a regex
   */
  async generateWordPair(regex: string, excludedWords: string[] = []): Promise<WordPairResult> {
    try {
      const rb = await createRb(regex);
      const re = new RegExp(`^${regex}$`);

      // Word that matches
      const genIn = rb.sample();
      let wordIn = '';
      for (let i = 0; i < this.maxAttempts; i++) {
        const next = genIn.next();
        if (next.done) {break;}
        if (!excludedWords.includes(next.value)) {
          wordIn = next.value;
          break;
        }
      }
      if (!wordIn) {
        throw new Error('Could not generate word matching regex');
      }
      
      // Word that doesn't match (using complement)
      let wordNotIn = '';
      try {
        const complement = rb.not();
        const gen = complement.sample();
        for (let i = 0; i < 10; i++) {
          const next = gen.next();
          if (!next.done) {
            const word = next.value;
            if (!excludedWords.includes(word) && word !== wordIn) {
              wordNotIn = word;
              break;
            }
          }
        }
      } catch {
        // Fallback: simple mutations
        const strategies = [
          () => wordIn + 'X',
          () => 'X' + wordIn,
          () => wordIn.slice(0, -1),
          () => wordIn.toUpperCase() !== wordIn ? wordIn.toUpperCase() : wordIn.toLowerCase(),
        ];
        
        for (const strategy of strategies) {
          const candidate = strategy();
          if (!re.test(candidate) && !excludedWords.includes(candidate)) {
            wordNotIn = candidate;
            break;
          }
        }
      }
      
      if (!wordNotIn) {
        wordNotIn = '!!!invalid!!!';
      }
      
      return {
        wordIn,
        wordNotIn,
        explanation: `'${wordIn}' matches, '${wordNotIn}' doesn't`
      };
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('CacheOverflowError')) {
        logger.warn(`Regex too complex for word pair generation: '${regex}' - ${errorMessage}`);
        // Return a simple fallback pair
        return {
          wordIn: 'test',
          wordNotIn: 'invalid',
          explanation: 'Regex too complex - using fallback words'
        };
      }
      throw new Error(`Failed to generate word pair: ${error}`);
    }
  }

  /**
   * Generate multiple unique words matching a regex
   * Uses @gruhn/regex-utils .sample() iterator with filtering
   */
  async generateMultipleWords(regex: string, count: number, excludedWords: string[] = [], cancellationToken?: { isCancellationRequested: boolean }): Promise<string[]> {
    try {
      const rb = await createRb(regex);
      const words: string[] = [];
      const seen = new Set<string>(excludedWords);
      
      const sampler = rb.sample();
      for (let i = 0; i < this.maxAttempts && words.length < count; i++) {
        // Check for cancellation every few iterations to avoid hanging
        if (cancellationToken?.isCancellationRequested) {
          throw new Error('Word generation cancelled by user');
        }
        
        const next = sampler.next();
        if (next.done) {break;}
        
        const word = next.value;
        if (!seen.has(word)) {
          words.push(word);
          seen.add(word);
        }
      }
      
      return words;
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('cancelled')) {
        throw error; // Re-throw cancellation errors
      }
      if (errorMessage.includes('CacheOverflowError')) {
        logger.warn(`Regex too complex for word generation: '${regex}' - ${errorMessage}`);
        return []; // Return empty array for complex regexes that overflow the cache
      }
      throw new Error(`Failed to generate words for '${regex}': ${error}`);
    }
  }

  /**
   * Check if a regex pattern is valid JavaScript regex syntax
   */
  isValidRegex(pattern: string): boolean {
    try {
      new RegExp(`^${pattern}$`);
      return true;
    } catch (e) {
      logger.warn(`Invalid regex pattern: ${pattern} because ${e}`);
      return false;
    }
  }

  /**
   * Check if a regex pattern uses only syntax supported by @gruhn/regex-utils
   * 
   * This method attempts to create a regex-utils RB object from the pattern.
   * If the library throws an exception, the pattern uses unsupported syntax.
   * 
   * Supported syntax:
   * - Quantifiers: *, +, ?, {m,n}
   * - Alternation: |
   * - Character classes: ., \w, \d, \s, [...]
   * - Escaping: \$, \., etc.
   * - Groups: (?:...), (...)
   * - Positive/negative lookahead: (?=...), (?!...)
   * 
   * Unsupported syntax that will cause this to return false:
   * - Word boundaries: \b, \B
   * - Lookbehind assertions: (?<=...), (?<!...)
   * - Backreferences: \1, \2, etc.
   * - Unicode property escapes: \p{...}, \P{...}
   * - Named groups: (?<name>...)
   * - Global/local flags (these shouldn't appear in pattern body anyway)
   */
  async hasSupportedSyntax(pattern: string): Promise<boolean> {
    // First check if it's valid JavaScript regex
    if (!this.isValidRegex(pattern)) {
      logger.warn(`Pattern has invalid JavaScript syntax: ${pattern}`);
      return false;
    }

    // Try to create an RB object from the pattern
    // If @gruhn/regex-utils throws an exception, the syntax is unsupported
    try {
      await createRb(pattern);
      return true;
    } catch (error) {
      logger.warn(`Pattern uses unsupported syntax for @gruhn/regex-utils: ${pattern} - ${error}`);
      return false;
    }
  }

  /**
   * Verify match
   */
  verifyMatch(word: string, regex: string): boolean {
    try {
      return new RegExp(`^${regex}$`).test(word);
    } catch (error) {
      logger.error(`Error verifying match for word '${word}' and regex '${regex}': ${error}`);
      return false;
    }
  }

  /**
   * Lightweight heuristic check: sample strings and compare
   * Returns true if regexes MIGHT be equivalent (need full analysis)
   * Returns false if definitely different (skip expensive analysis)
   */
  async quickSampleCheck(regexA: string, regexB: string, sampleCount = 20): Promise<boolean> {
    try {
      // Check if both regexes are valid
      if (!this.isValidRegex(regexA) || !this.isValidRegex(regexB)) {
        return false; // Invalid regexes are not equivalent
      }

      const reA = new RegExp(`^${regexA}$`);
      const reB = new RegExp(`^${regexB}$`);
      
      // Generate samples from A and check if B accepts them all
      const samplesA = await this.generateMultipleWords(regexA, sampleCount);
      for (const word of samplesA) {
        if (!reB.test(word)) {
          return false; // Found a word in A but not B - definitely not equivalent
        }
      }
      
      // Generate samples from B and check if A accepts them all
      const samplesB = await this.generateMultipleWords(regexB, sampleCount);
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
   * Direct equivalence check using @gruhn/regex-utils (RB) without extra set operations.
   */
  async areEquivalent(regexA: string, regexB: string): Promise<boolean> {
    try {
      const rbA = await createRb(regexA);
      return rbA.isEquivalent(new RegExp(`^${regexB}$`));
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('CacheOverflowError')) {
        logger.warn(`Regex too complex for equivalence check: '${regexA}' vs '${regexB}' - ${errorMessage}`);
        // For complex regexes that overflow the cache, conservatively assume they're not equivalent
        // This prevents hanging and allows the deduplication to continue
        return false;
      }
      throw error;
    }
  }


  /**
   * Generate two distinguishing words from candidates
   * 
   * Uses automata analysis to find words that maximally distinguish between candidates.
   * Each word pair is chosen to provide maximum information gain by splitting the
   * candidate set as evenly as possible.
   */
  async generateTwoDistinguishingWords(
    candidateRegexes: string[],
    excludedWords: string[] = []
  ): Promise<TwoDistinguishingWordsResult> {
    if (candidateRegexes.length === 0) {
      throw new Error('Need at least one candidate regex');
    }

    // Special case: only one candidate - show word IN and word NOT IN
    if (candidateRegexes.length === 1) {
      const regex = candidateRegexes[0];
      const pair = await this.generateWordPair(regex, excludedWords);
      
      return {
        words: [pair.wordIn, pair.wordNotIn],
        explanation: `Single candidate: '${pair.wordIn}' matches, '${pair.wordNotIn}' doesn't`,
        properties: [
          'Matches the regex',
          'Does not match the regex'
        ]
      };
    }

    try {
      const sampleFromDifference = async (a: string, b: string): Promise<string | null> => {
        try {
          const diff = (await createRb(a)).without(new RegExp(`^${b}$`)).sample();
          for (let i = 0; i < 10; i++) {
            const next = diff.next();
            if (!next.done) {return next.value;}
          }
        } catch {
          return null;
        }
        return null;
      };

      const candidateWords: string[] = [];

      // Limit pairwise analysis to first few pairs for performance
      const LIMIT = 5;
      for (let i = 0; i < candidateRegexes.length && i < LIMIT; i++) {
        for (let j = i + 1; j < candidateRegexes.length && j < LIMIT; j++) {
          const a = candidateRegexes[i];
          const b = candidateRegexes[j];
          const fromA = await sampleFromDifference(a, b);
          const fromB = await sampleFromDifference(b, a);
          if (fromA) {candidateWords.push(fromA);}
          if (fromB) {candidateWords.push(fromB);}
        }
      }
      
      // Remove duplicates and excluded words (preserve order)
      const seenWords = new Set<string>();
      const uniqueWords = candidateWords
        .filter(w => !excludedWords.includes(w))
        .filter(w => {
          if (seenWords.has(w)) {return false;}
          seenWords.add(w);
          return true;
        });
      
      // If we don't have enough words from pairwise differences, supplement with sampling
      let noProgressCount = 0;
      const MAX_NO_PROGRESS = 3; // Stop after 3 failed attempts to generate new words
      
      while (uniqueWords.length < 4 && uniqueWords.length < candidateRegexes.length * 2) {
        const beforeLength = uniqueWords.length;
        const regex = candidateRegexes[uniqueWords.length % candidateRegexes.length];
        const words = await this.generateMultipleWords(regex, 2, Array.from(seenWords));
        for (const w of words) {
          if (!seenWords.has(w) && !excludedWords.includes(w)) {
            uniqueWords.push(w);
            seenWords.add(w);
          }
        }
        
        // Detect if we're stuck (no new words added)
        if (uniqueWords.length === beforeLength) {
          noProgressCount++;
          if (noProgressCount >= MAX_NO_PROGRESS) {
            break; // Give up trying to generate more words
          }
        } else {
          noProgressCount = 0; // Reset on progress
        }
      }
      
      // Ensure we have at least 2 words - add fallbacks that are maximally different
      if (uniqueWords.length < 2) {
        const fallbacks = ['abc', '123', 'xyz', '000', 'test', '999'];
        for (const fallback of fallbacks) {
          if (!seenWords.has(fallback) && !excludedWords.includes(fallback)) {
            uniqueWords.push(fallback);
            seenWords.add(fallback);
            if (uniqueWords.length >= 2) {break;}
          }
        }
      }

      const regexObjects = candidateRegexes.map(r => new RegExp(`^${r}$`));

      // Score words by how well they split the candidate set
      const wordScores: Array<{word: string; score: number; balance: number}> = [];
      for (const word of uniqueWords) {
        const matches = regexObjects.map(re => re.test(word));
        const trueCount = matches.filter(Boolean).length;
        const falseCount = matches.length - trueCount;
        const balance = Math.abs(trueCount - falseCount);
        const score = Math.min(trueCount, falseCount);
        wordScores.push({ word, score, balance });
      }

      wordScores.sort((a, b) => {
        const byScore = b.score - a.score;
        if (byScore !== 0) {return byScore;}
        const byBalance = a.balance - b.balance;
        if (byBalance !== 0) {return byBalance;}
        const byLength = a.word.length - b.word.length;
        if (byLength !== 0) {return byLength;}
        return a.word.localeCompare(b.word);
      });

      const chosenWords: string[] = [];
      
      // Try to pick words with different match patterns for maximum information gain
      for (const candidate of wordScores) {
        if (chosenWords.includes(candidate.word)) {continue;}
        
        if (chosenWords.length === 0) {
          // Always take the highest scoring word first
          chosenWords.push(candidate.word);
        } else {
          // For the second word, prefer one with a different match pattern
          const firstWord = chosenWords[0];
          const matches1 = regexObjects.map(re => re.test(firstWord));
          const matches2 = regexObjects.map(re => re.test(candidate.word));
          
          // Check if this word has a different match pattern
          const hasDifference = matches1.some((m, i) => m !== matches2[i]);
          
          if (hasDifference) {
            chosenWords.push(candidate.word);
            break; // Found a good second word
          }
        }
      }
      
      // If we couldn't find a word with different pattern, just take the next best
      if (chosenWords.length < 2) {
        for (const candidate of wordScores) {
          if (!chosenWords.includes(candidate.word)) {
            chosenWords.push(candidate.word);
            if (chosenWords.length >= 2) {break;}
          }
        }
      }

      const [word1, word2] = chosenWords.length >= 2
        ? chosenWords.slice(0, 2)
        : ['abc', '123'];

      // CRITICAL: Validate that at least one word matches at least one candidate
      // This prevents infinite loops when generateMultipleWords produces garbage
      const word1Matches = regexObjects.some(re => re.test(word1));
      const word2Matches = regexObjects.some(re => re.test(word2));
      
      if (!word1Matches && !word2Matches) {
        throw new Error(
          `Exhausted word space: generated words "${word1}" and "${word2}" match zero active candidates. ` +
          `Cannot continue classification loop.`
        );
      }

      return {
        words: [word1, word2],
        explanation: `Words selected to best split candidate set (${candidateRegexes.length} candidates)`,
        properties: ['Distinguishing word 1', 'Distinguishing word 2']
      };
    } catch (error) {
      throw new Error(`Failed to generate two distinguishing words: ${error}`);
    }
  }
}

/**
 * Create analyzer instance
 */
export function createRegexAnalyzer(): RegexAnalyzer {
  return new RegexAnalyzer();
}
