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
    return RB(new RegExp(`^${pattern}$`));
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
      new RegExp(`^${pattern}$`);
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
      return new RegExp(`^${regex}$`).test(word);
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
          if (words.length >= count) break;
        }
      }
      
      return words;
    } catch (error) {
      if (isCacheOverflowError(error)) {
        logger.warn(`Regex too complex for word generation: '${regex}'`);
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
   */
  async generateTwoDistinguishingWords(
    candidateRegexes: string[],
    excludedWords: string[] = []
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
    const regexObjects = candidateRegexes.map(r => new RegExp(`^${r}$`));
    const pool = new Set<string>();

    try {
      // Sample from pairwise symmetric differences (A\B and B\A)
      // This is the key insight from @gruhn/regex-utils equiv checker
      for (let i = 0; i < candidateRegexes.length && pool.size < 30; i++) {
        for (let j = i + 1; j < candidateRegexes.length && pool.size < 30; j++) {
          try {
            const rbA = await createRb(candidateRegexes[i]);
            const rbB = await createRb(candidateRegexes[j]);
            
            // Compute symmetric difference parts
            const diffAB = rbA.without(rbB); // strings in A but not B
            const diffBA = rbB.without(rbA); // strings in B but not A
            
            // Sample from A \ B
            if (!diffAB.isEmpty()) {
              let count = 0;
              for (const word of diffAB.enumerate()) {
                if (!excluded.has(word) && !pool.has(word)) {
                  pool.add(word);
                  count++;
                  if (count >= 3) break;
                }
              }
            }
            
            // Sample from B \ A
            if (!diffBA.isEmpty()) {
              let count = 0;
              for (const word of diffBA.enumerate()) {
                if (!excluded.has(word) && !pool.has(word)) {
                  pool.add(word);
                  count++;
                  if (count >= 3) break;
                }
              }
            }
          } catch {
            // Skip this pair if too complex
          }
        }
      }

      // Also sample directly from each candidate (for intersection words)
      for (const regex of candidateRegexes) {
        if (pool.size >= 30) break;
        try {
          const rb = await createRb(regex);
          let count = 0;
          for (const word of rb.enumerate()) {
            if (!excluded.has(word) && !pool.has(word)) {
              pool.add(word);
              count++;
              if (count >= 3) break;
            }
          }
        } catch {
          // Skip if too complex
        }
      }

      // Filter pool to words that match at least one candidate
      const poolArray = Array.from(pool).filter(w => 
        !excluded.has(w) && regexObjects.some(re => re.test(w))
      );

      if (poolArray.length < 2) {
        throw new Error('Could not find enough distinguishing words');
      }

      // Score all pairs and find the best one
      let bestPair: [string, string] | null = null;
      let bestScore = Infinity;

      for (let i = 0; i < poolArray.length; i++) {
        for (let j = i + 1; j < poolArray.length; j++) {
          const w1 = poolArray[i];
          const w2 = poolArray[j];
          
          // Compute match vectors
          const m1 = regexObjects.map(re => re.test(w1));
          const m2 = regexObjects.map(re => re.test(w2));
          
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
            bestPair = [w1, w2];
          }
        }
      }

      if (!bestPair) {
        bestPair = [poolArray[0], poolArray[1]];
      }

      // Validate result
      const [word1, word2] = bestPair;
      if (!regexObjects.some(re => re.test(word1)) && !regexObjects.some(re => re.test(word2))) {
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
