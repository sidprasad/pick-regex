import { logger } from './logger';

/**
 * Lazy-load the @gruhn/regex-utils ES module
 */
async function getRegexUtils() {
  return await import('@gruhn/regex-utils');
}

/**
 * Check if an error is a CacheOverflowError from regex-utils
 */
function isCacheOverflowError(error: unknown): boolean {
  return error instanceof Error && error.name === 'CacheOverflowError';
}

/**
 * Wrap a regex pattern with anchors to match full string.
 * Uses non-capturing group to handle alternation correctly.
 */
function wrapPattern(pattern: string): string {
  return `^(?:${pattern})$`;
}

/**
 * Timeout helper - resolves with result or rejects after timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback?: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (fallback !== undefined) {
        resolve(fallback);
      } else {
        reject(new Error(`Operation timed out after ${ms}ms`));
      }
    }, ms);

    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

export interface WordPairResult {
  wordIn: string;
  wordNotIn: string;
  explanation?: string;
}

export interface TwoDistinguishingWordsResult {
  words: [string, string];
  explanation: string;
  properties?: string[];
}

// Type for the RegexBuilder from @gruhn/regex-utils
type RegexBuilder = ReturnType<Awaited<ReturnType<typeof getRegexUtils>>['RB']>;

/**
 * Create an RB (RegexBuilder) from a pattern string.
 * Wraps with ^...$ anchors so patterns match the full string.
 */
async function createRb(pattern: string): Promise<RegexBuilder> {
  const { RB } = await getRegexUtils();
  try {
    return RB(new RegExp(wrapPattern(pattern)));
  } catch (error) {
    throw new Error(`Unsupported regex syntax for '${pattern}': ${error}`);
  }
}

/**
 * RegexAnalyzer - uses @gruhn/regex-utils for automata-based regex analysis
 * 
 * Key library capabilities:
 * - isEquivalent(): check if two regexes match the same language
 * - without(): compute set difference (A \ B)  
 * - enumerate(): fairly enumerate all matching strings
 * - sample(): randomly sample matching strings
 * - not(): compute complement
 * - isEmpty(): check if language is empty
 * - size(): count matching strings (bigint, undefined if infinite)
 */
export class RegexAnalyzer {

  /**
   * Check if a pattern is valid JavaScript regex syntax
   */
  isValidRegex(pattern: string): boolean {
    try {
      new RegExp(wrapPattern(pattern));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a pattern uses syntax supported by @gruhn/regex-utils
   */
  async hasSupportedSyntax(pattern: string): Promise<boolean> {
    if (!this.isValidRegex(pattern)) {
      return false;
    }
    try {
      await createRb(pattern);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Test if a word matches a regex pattern
   */
  verifyMatch(word: string, regex: string): boolean {
    try {
      return new RegExp(wrapPattern(regex)).test(word);
    } catch {
      return false;
    }
  }

  /**
   * Check if two regex patterns are equivalent (match the same language).
   * Uses symmetric difference: A ≡ B iff (A \ B) and (B \ A) are both empty.
   */
  async areEquivalent(regexA: string, regexB: string): Promise<boolean> {
    try {
      const rbA = await createRb(regexA);
      const rbB = await createRb(regexB);

      // Compute symmetric difference
      const diffAB = rbA.without(rbB);
      const diffBA = rbB.without(rbA);

      return diffAB.isEmpty() && diffBA.isEmpty();
    } catch (error) {
      if (isCacheOverflowError(error)) {
        logger.warn(`Regex too complex for equivalence check: '${regexA}' vs '${regexB}'`);
        logger.warn(`Client lib cache overflow error: ${error}`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Get the size of the set difference A \ B (words in A but not B)
   * Returns undefined if infinite or too complex to compute
   */
  async countWordsInANotInB(regexA: string, regexB: string): Promise<bigint | undefined> {
    try {
      const rbA = await createRb(regexA);
      const rbB = await createRb(regexB);
      return rbA.without(rbB).size();
    } catch (error) {
      if (isCacheOverflowError(error)) {
        logger.warn(`Regex too complex for set difference: '${regexA}' \\ '${regexB}'`);
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Generate a word that matches and a word that doesn't match a regex
   */
  async generateWordPair(regex: string, excludedWords: string[] = []): Promise<WordPairResult> {
    const excluded = new Set(excludedWords);

    try {
      const rb = await createRb(regex);

      // Find a word that matches using enumerate()
      let wordIn = '';
      for (const word of rb.enumerate()) {
        if (!excluded.has(word)) {
          wordIn = word;
          break;
        }
      }
      if (!wordIn) {
        throw new Error('Could not generate word matching regex');
      }

      // Find a word that doesn't match using complement
      let wordNotIn = '';
      try {
        for (const word of rb.not().enumerate()) {
          if (!excluded.has(word) && word !== wordIn) {
            wordNotIn = word;
            break;
          }
        }
      } catch {
        // Fallback: simple mutation
        wordNotIn = wordIn + 'X';
      }

      if (!wordNotIn) {
        wordNotIn = wordIn + '!!!';
      }

      return { wordIn, wordNotIn, explanation: `'${wordIn}' matches, '${wordNotIn}' doesn't` };
    } catch (error) {
      if (isCacheOverflowError(error)) {
        logger.warn(`Regex too complex for word pair generation: '${regex}'`);
        logger.warn(`Client lib cache overflow error: ${error}`);
        // Can we also warn in VSCode?

        return { wordIn: 'test', wordNotIn: 'invalid', explanation: 'Regex too complex' };
      }
      throw new Error(`Failed to generate word pair: ${error}`);
    }
  }

  /**
   * Generate multiple unique words matching a regex
   */
  async generateMultipleWords(
    regex: string,
    count: number,
    excludedWords: string[] = []
  ): Promise<string[]> {
    const excluded = new Set(excludedWords);
    const words: string[] = [];

    try {
      const rb = await createRb(regex);

      for (const word of rb.enumerate()) {
        if (!excluded.has(word)) {
          words.push(word);
          if (words.length >= count) {
            break;
          }
        }
      }

      return words;
    } catch (error) {
      if (isCacheOverflowError(error)) {
        logger.warn(`Regex too complex for word pair generation: '${regex}'`);
        logger.warn(`Client lib cache overflow error: ${error}`);
        return words;
      }
      throw new Error(`Failed to generate words: ${error}`);
    }
  }

  /**
   * Generate two distinguishing words that best split a set of candidate regexes.
   * 
   * Uses symmetric difference sampling (like @gruhn/regex-utils equiv checker):
   * - For each pair (A, B): sample from A\B and B\A
   * - This efficiently finds words that distinguish between candidates
   * - Times out after timeoutMs, returning best result found so far
   * @param candidateRegexes - The candidate regex patterns
   * @param excludedWords - Words to exclude from generation
   * @param timeoutMs - Maximum time to spend searching (default 2000ms)
   * @param poolSizeLimit - Maximum number of candidate words to sample (default 30)
   */
  async generateTwoDistinguishingWords(
    candidateRegexes: string[],
    excludedWords: string[] = [],
    timeoutMs: number = 2000,
    poolSizeLimit: number = 30
  ): Promise<TwoDistinguishingWordsResult> {
    if (candidateRegexes.length === 0) {
      throw new Error('Need at least one candidate regex');
    }

    // Single candidate: return word in and word not in
    if (candidateRegexes.length === 1) {
      const pair = await this.generateWordPair(candidateRegexes[0], excludedWords);
      return {
        words: [pair.wordIn, pair.wordNotIn],
        explanation: `Single candidate: '${pair.wordIn}' matches, '${pair.wordNotIn}' doesn't`,
        properties: ['Matches the regex', 'Does not match the regex']
      };
    }

    const excluded = new Set(excludedWords);
    const pool = new Set<string>();

    // Build RBs for all candidates upfront
    const rbs: (RegexBuilder | null)[] = await Promise.all(
      candidateRegexes.map(async r => {
        try {
          return await createRb(r);
        } catch {
          return null;
        }
      })
    );

    const startTime = Date.now();
    const isTimedOut = () => Date.now() - startTime > timeoutMs;

    try {
      // Sample from pairwise symmetric differences (A\B and B\A)
      // Take multiple samples from each difference to increase chance of finding distinguishing words
      outerLoop:
      for (let i = 0; i < candidateRegexes.length && pool.size < poolSizeLimit; i++) {
        for (let j = i + 1; j < candidateRegexes.length && pool.size < poolSizeLimit; j++) {
          if (isTimedOut()) { break outerLoop; }

          const rbA = rbs[i];
          const rbB = rbs[j];
          if (!rbA || !rbB) { continue; }

          try {
            // Compute symmetric difference parts
            const diffAB = rbA.without(rbB); // strings in A but not B
            const diffBA = rbB.without(rbA); // strings in B but not A

            // Sample multiple words from A \ B to increase diversity
            if (!diffAB.isEmpty()) {
              let samplesFromDiff = 0;
              const MAX_SAMPLES_PER_DIFF = Math.max(5, Math.floor(poolSizeLimit / 4));
              for (const word of diffAB.enumerate()) {
                if (pool.size >= poolSizeLimit || isTimedOut()) { break; }
                if (!excluded.has(word) && !pool.has(word)) {
                  pool.add(word);
                  samplesFromDiff++;
                  if (samplesFromDiff >= MAX_SAMPLES_PER_DIFF) { break; }
                }
              }
            }

            // Sample multiple words from B \ A
            if (!diffBA.isEmpty()) {
              let samplesFromDiff = 0;
              const MAX_SAMPLES_PER_DIFF = Math.max(5, Math.floor(poolSizeLimit / 4));
              for (const word of diffBA.enumerate()) {
                if (pool.size >= poolSizeLimit || isTimedOut()) { break; }
                if (!excluded.has(word) && !pool.has(word)) {
                  pool.add(word);
                  samplesFromDiff++;
                  if (samplesFromDiff >= MAX_SAMPLES_PER_DIFF) { break; }
                }
              }
            }
          } catch {
            // Skip this pair if too complex
          }
        }
      }

      // Also sample 1 word directly from each candidate (for intersection words)
      for (let i = 0; i < candidateRegexes.length && pool.size < poolSizeLimit; i++) {
        if (isTimedOut()) { break; }
        const rb = rbs[i];
        if (!rb) { continue; }

        try {
          for (const word of rb.enumerate()) {
            if (!excluded.has(word) && !pool.has(word)) {
              pool.add(word);
              break;
            }
          }
        } catch {
          // Skip if too complex
        }
      }

      // Filter pool to words that match at least one candidate (using RBs)
      const poolArray: string[] = [];
      for (const w of pool) {
        if (excluded.has(w)) { continue; }
        // Check if word matches any candidate using verifyMatch
        if (rbs.some((rb, idx) => rb && this.verifyMatch(w, candidateRegexes[idx]))) {
          poolArray.push(w);
        }
      }

      if (poolArray.length < 2) {
        throw new Error('Could not find enough distinguishing words');
      }

      // Score all pairs and find the best one
      let bestPair: [string, string] | null = null;
      let bestScore = Infinity;

      // Pre-compute match vectors for all words
      const matchVectors = poolArray.map(w =>
        candidateRegexes.map(r => this.verifyMatch(w, r))
      );

      for (let i = 0; i < poolArray.length; i++) {
        for (let j = i + 1; j < poolArray.length; j++) {
          if (isTimedOut() && bestPair) { break; }

          const m1 = matchVectors[i];
          const m2 = matchVectors[j];

          // Count survivors for each of the 4 possible classification outcomes
          const survivors = [
            m1.filter((m, idx) => m && m2[idx]).length,      // accept both
            m1.filter((m, idx) => m && !m2[idx]).length,     // accept w1, reject w2
            m1.filter((m, idx) => !m && m2[idx]).length,     // reject w1, accept w2
            m1.filter((m, idx) => !m && !m2[idx]).length     // reject both
          ];

          // Score = worst case survivors (lower is better)
          const worstCase = Math.max(...survivors);

          // Prefer pairs that actually distinguish (different match patterns)
          const distinguishes = m1.some((m, idx) => m !== m2[idx]);
          const score = distinguishes ? worstCase : worstCase + 1000;

          if (score < bestScore) {
            bestScore = score;
            bestPair = [poolArray[i], poolArray[j]];
          }
        }
      }

      if (!bestPair) {
        bestPair = [poolArray[0], poolArray[1]];
      }

      // Validate result
      const [word1, word2] = bestPair;
      const anyMatch = candidateRegexes.some(r => this.verifyMatch(word1, r) || this.verifyMatch(word2, r));
      if (!anyMatch) {
        throw new Error('Generated words match no candidates');
      }

      return {
        words: bestPair,
        explanation: `Words selected to split ${candidateRegexes.length} candidates`,
        properties: ['Distinguishing word 1', 'Distinguishing word 2']
      };
    } catch (error) {
      throw new Error(`Failed to generate distinguishing words: ${error}`);
    }
  }
}

/**
 * Create analyzer instance
 */
export function createRegexAnalyzer(): RegexAnalyzer {
  return new RegexAnalyzer();
}
