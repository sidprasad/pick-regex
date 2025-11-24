import { logger } from './logger';

/**
 * Lazy load the ES module
 */
async function getRB() {
  const module = await import('@gruhn/regex-utils');
  return module.RB;
}

/**
 * Check if an error is a CacheOverflowError
 */
function isCacheOverflowError(error: unknown): boolean {
  // Check by name since we might not have loaded the class yet
  return error instanceof Error && error.name === 'CacheOverflowError';
}

export interface WordGenerationResult {
  word: string;
  explanation?: string;
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
   * 3. Generate a word IN and a word NOT IN a regex
   * 
   * This method includes a timeout to prevent hanging on complex regexes.
   * Uses enumerate() for fair enumeration instead of random sampling.
   */
  async generateWordPair(regex: string, excludedWords: string[] = []): Promise<WordPairResult> {
    const timeoutMs = 5000; // 5 seconds timeout
    
    let timeoutId: NodeJS.Timeout | undefined;
    let partialWordIn = ''; // Track partial result for timeout case
    
    const generationPromise = (async () => {
      try {
        const rb = await createRb(regex);
        const re = new RegExp(`^${regex}$`);

        // Word that matches - use enumerate() for fair enumeration
        const genIn = rb.enumerate();
        let wordIn = '';
        for (let i = 0; i < this.maxAttempts; i++) {
          const next = genIn.next();
          if (next.done) {break;}
          if (!excludedWords.includes(next.value)) {
            wordIn = next.value;
            partialWordIn = wordIn; // Store partial result
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
          const gen = complement.enumerate(); // Use enumerate here too
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
        if (isCacheOverflowError(error)) {
          logger.warn(`Regex too complex for word pair generation: '${regex}' - cache overflow`);
          // Use partial result if available
          if (partialWordIn) {
            return {
              wordIn: partialWordIn,
              wordNotIn: partialWordIn + 'X',
              explanation: 'Regex too complex - using partial results'
            };
          }
          // Otherwise use fallback
          return {
            wordIn: 'test',
            wordNotIn: 'invalid',
            explanation: 'Regex too complex - using fallback words'
          };
        }
        throw new Error(`Failed to generate word pair: ${error}`);
      } finally {
        // Clear timeout when generation completes
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    })();
    
    const timeoutPromise = new Promise<WordPairResult>((resolve) => {
      timeoutId = setTimeout(() => {
        logger.warn(`Word pair generation timed out after ${timeoutMs}ms for regex: '${regex}' - using partial results`);
        // Use partial result if available
        if (partialWordIn) {
          resolve({
            wordIn: partialWordIn,
            wordNotIn: partialWordIn + 'X',
            explanation: 'Timeout - using partial enumeration results'
          });
        } else {
          resolve({
            wordIn: 'test',
            wordNotIn: 'invalid',
            explanation: 'Timeout - regex too complex for word generation'
          });
        }
      }, timeoutMs);
    });
    
    // Race between generation and timeout
    const result = await Promise.race([generationPromise, timeoutPromise]);
    
    // Clean up timeout if it hasn't fired yet
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    
    return result;
  }

  /**
   * Generate multiple unique words matching a regex
   * Uses @gruhn/regex-utils .enumerate() iterator for fair enumeration
   * 
   * This method includes a timeout to prevent hanging on complex regexes.
   * If the timeout is exceeded, returns any words generated so far.
   */
  async generateMultipleWords(regex: string, count: number, excludedWords: string[] = [], cancellationToken?: { isCancellationRequested: boolean }): Promise<string[]> {
    // Wrap in a timeout to prevent hanging
    const timeoutMs = 5000; // 5 seconds timeout for word generation
    
    let timeoutId: NodeJS.Timeout | undefined;
    let partialWords: string[] = []; // Track partial results for timeout case
    
    const generationPromise = (async () => {
      try {
        const rb = await createRb(regex);
        const words: string[] = [];
        const seen = new Set<string>(excludedWords);
        
        // Use enumerate() for fair enumeration instead of random sample()
        const enumerator = rb.enumerate();
        for (let i = 0; i < this.maxAttempts && words.length < count; i++) {
          // Check for cancellation every few iterations to avoid hanging
          if (cancellationToken?.isCancellationRequested) {
            throw new Error('Word generation cancelled by user');
          }
          
          const next = enumerator.next();
          if (next.done) {break;}
          
          const word = next.value;
          if (!seen.has(word)) {
            words.push(word);
            seen.add(word);
            partialWords = [...words]; // Update partial results
          }
        }
        
        return words;
      } catch (error) {
        // Check for cancellation - look for our cancellation message
        if (error instanceof Error && error.message.includes('cancelled')) {
          throw error; // Re-throw cancellation errors
        }
        if (isCacheOverflowError(error)) {
          logger.warn(`Regex too complex for word generation: '${regex}' - cache overflow`);
          return partialWords.length > 0 ? partialWords : []; // Return partial results if available
        }
        throw new Error(`Failed to generate words for '${regex}': ${error}`);
      } finally {
        // Clear timeout when generation completes
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    })();
    
    const timeoutPromise = new Promise<string[]>((resolve) => {
      timeoutId = setTimeout(() => {
        logger.warn(`Word generation timed out after ${timeoutMs}ms for regex: '${regex}' - returning ${partialWords.length} partial results`);
        resolve(partialWords); // Return partial results instead of empty array
      }, timeoutMs);
    });
    
    // Race between generation and timeout
    const result = await Promise.race([generationPromise, timeoutPromise]);
    
    // Clean up timeout if it hasn't fired yet
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    
    return result;
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
   * Direct equivalence check using @gruhn/regex-utils (RB) without extra set operations.
   */
  async areEquivalent(regexA: string, regexB: string): Promise<boolean> {
    try {
      const rbA = await createRb(regexA);
      return rbA.isEquivalent(new RegExp(`^${regexB}$`));
    } catch (error) {
      if (isCacheOverflowError(error)) {
        logger.warn(`Regex too complex for equivalence check: '${regexA}' vs '${regexB}' - cache overflow`);
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
      const excluded = new Set(excludedWords);
      const regexObjects = candidateRegexes.map(r => new RegExp(`^${r}$`));

      // Helper: sample from source \ other, respecting exclusions.
      const sampleDifference = async (source: string, other: string, count: number): Promise<string[]> => {
        const results: string[] = [];
        const seen = new Set<string>();
        const otherRe = new RegExp(`^${other}$`);
        try {
          const diff = (await createRb(source)).without(new RegExp(`^${other}$`)).sample();
          for (let i = 0; i < count * 3; i++) { // allow extra attempts
            const next = diff.next();
            if (next.done) {break;}
            const candidate = next.value;
            if (excluded.has(candidate) || seen.has(candidate)) {continue;}
            results.push(candidate);
            seen.add(candidate);
            if (results.length >= count) {break;}
          }
        } catch {
          // ignore and fall back
        }

        if (results.length < count) {
          try {
            const extras = await this.generateMultipleWords(source, count * 3, Array.from(excluded));
            for (const w of extras) {
              if (seen.has(w) || excluded.has(w)) {continue;}
              if (!otherRe.test(w)) {
                results.push(w);
                seen.add(w);
                if (results.length >= count) {break;}
              }
            }
          } catch {
            // ignore
          }
        }

        return results;
      };

      const pool = new Set<string>();

      // 1) Gather from pairwise differences
      for (let i = 0; i < candidateRegexes.length; i++) {
        for (let j = i + 1; j < candidateRegexes.length; j++) {
          const a = candidateRegexes[i];
          const b = candidateRegexes[j];
          const fromA = await sampleDifference(a, b, 4);
          const fromB = await sampleDifference(b, a, 4);
          fromA.forEach(w => pool.add(w));
          fromB.forEach(w => pool.add(w));
        }
      }

      // 2) If still short, enumerate from each candidate directly
      if (pool.size < 10) {
        for (const regex of candidateRegexes) {
          try {
            const samples = await this.generateMultipleWords(regex, 6, Array.from(excluded));
            samples.forEach(s => pool.add(s));
          } catch {
            // ignore and continue
          }
        }
      }

      // Keep only words that match at least one candidate and aren’t excluded
      const poolArray = Array.from(pool).filter(w => !excluded.has(w) && regexObjects.some(re => re.test(w)));

      if (poolArray.length < 2) {
        throw new Error('Exhausted word space: could not find two candidate-matching words after sampling all candidates.');
      }

      // Score every pair for worst-case survivors and expected survivors
      const totalCandidates = regexObjects.length;
      let bestPair: [string, string] | null = null;
      let bestScore: { worst: number; expected: number; length: number } | null = null;
      let fallbackPair: [string, string] | null = null;
      let fallbackScore: { worst: number; expected: number; length: number } | null = null;

      for (let i = 0; i < poolArray.length; i++) {
        for (let j = i + 1; j < poolArray.length; j++) {
          const w1 = poolArray[i];
          const w2 = poolArray[j];
          const m1 = regexObjects.map(re => re.test(w1));
          const m2 = regexObjects.map(re => re.test(w2));

          const survivorsAA = m1.filter((m, idx) => m && m2[idx]).length;
          const survivorsAR = m1.filter((m, idx) => m && !m2[idx]).length;
          const survivorsRA = m1.filter((m, idx) => !m && m2[idx]).length;
          const survivorsRR = totalCandidates - (survivorsAA + survivorsAR + survivorsRA);

          const worst = Math.max(survivorsAA, survivorsAR, survivorsRA, survivorsRR);
          const expected = (survivorsAA + survivorsAR + survivorsRA + survivorsRR) / 4;
          const length = w1.length + w2.length;

          const hasDifference = m1.some((m, idx) => m !== m2[idx]);
          const score = { worst, expected, length };

          if (hasDifference) {
            if (!bestScore ||
                score.worst < bestScore.worst ||
                (score.worst === bestScore.worst && score.expected < bestScore.expected) ||
                (score.worst === bestScore.worst && score.expected === bestScore.expected && score.length < bestScore.length)
            ) {
              bestScore = score;
              bestPair = [w1, w2];
            }
          }

          // Track a fallback even when match patterns are identical
          if (!fallbackScore ||
              score.worst < fallbackScore.worst ||
              (score.worst === fallbackScore.worst && score.expected < fallbackScore.expected) ||
              (score.worst === fallbackScore.worst && score.expected === fallbackScore.expected && score.length < fallbackScore.length)
          ) {
            fallbackScore = score;
            fallbackPair = [w1, w2];
          }
        }
      }

      if (!bestPair) {
        // Fall back to any best-scoring pair even if match vectors are identical
        if (!fallbackPair) {
          throw new Error('Exhausted word space: unable to select two distinguishing words that match at least one active candidate.');
        }
        bestPair = fallbackPair;
      }

      const [word1, word2] = bestPair;

      // CRITICAL: Validate that at least one word matches at least one candidate
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




  /** 
   * Gets the number of words in the language of regexA that are not in the language of regexB.
   * Note: This is a potentially expensive operation and may not terminate for complex regexes.
   */
  async countWordsInANotInB(regexA: string, regexB: string, maxCount: number = 1000): Promise<bigint | undefined> {
    try {
      const rbA = await createRb(regexA);
      const rbB = await createRb(regexB);
      const difference = rbA.without(new RegExp(`^${regexB}$`));

      const size = difference.size();
      return size;
    } catch (error) {
      if (isCacheOverflowError(error)) {
        logger.warn(`Regex too complex for counting words in A not in B: '${regexA}' vs '${regexB}' - cache overflow`);
        return undefined;
      }
    }
  }
}

/**
 * Create analyzer instance
 */
export function createRegexAnalyzer(): RegexAnalyzer {
  return new RegexAnalyzer();
}
