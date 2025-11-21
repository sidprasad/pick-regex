import RandExp from 'randexp';
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

/**
 * RegexAnalyzer using automata theory (randexp + regex-utils)
 */
export class RegexAnalyzer {
  private maxAttempts = 100;

  /**
   * 1. Generate a word matching a regex (excluding seen words)
   */
  generateWord(regex: string, seenWords: string[] = []): WordGenerationResult {
    try {
      const randexp = new RandExp(regex);
      randexp.max = 10;
      
      const seenSet = new Set(seenWords);
      
      for (let i = 0; i < this.maxAttempts; i++) {
        const word = randexp.gen();
        if (!seenSet.has(word)) {
          return { word, explanation: `Generated from: ${regex}` };
        }
      }
      
      throw new Error(`Could not generate unique word after ${this.maxAttempts} attempts`);
    } catch (error) {
      throw new Error(`Failed to generate word for '${regex}': ${error}`);
    }
  }

  /**
   * 2. Analyze relationship between two regexes using automata
   */
  async analyzeRelationship(regexA: string, regexB: string): Promise<RelationshipResult> {
    try {
      const RB = await getRB();
      const rbA = RB(new RegExp(`^${regexA}$`));
      const rbB = RB(new RegExp(`^${regexB}$`));
      
      // Use regex-utils predicates
      const isEquiv = rbA.isEquivalent(new RegExp(`^${regexB}$`));
      const aSubsetB = rbA.isSubsetOf(new RegExp(`^${regexB}$`));
      const bSubsetA = rbB.isSubsetOf(new RegExp(`^${regexA}$`));
      const isDisjoint = rbA.isDisjointFrom(new RegExp(`^${regexB}$`));
      
      // Collect examples using set operations for accuracy
      const inBoth: string[] = [];
      const onlyInA: string[] = [];
      const onlyInB: string[] = [];
      
      // Get intersection (A ∩ B) - words in both
      try {
        const intersection = rbA.and(new RegExp(`^${regexB}$`));
        const genIntersection = intersection.sample();
        for (let i = 0; i < 5; i++) {
          const next = genIntersection.next();
          if (!next.done) {
            inBoth.push(next.value);
          }
        }
      } catch {
        // Intersection might fail, try fallback
        const genA = rbA.sample();
        const reB = new RegExp(`^${regexB}$`);
        for (let i = 0; i < 10; i++) {
          const next = genA.next();
          if (!next.done && reB.test(next.value)) {
            inBoth.push(next.value);
            if (inBoth.length >= 5) {break;}
          }
        }
      }
      
      // Get words only in A (A - B)
      try {
        const onlyInASet = rbA.without(new RegExp(`^${regexB}$`));
        const genOnlyA = onlyInASet.sample();
        for (let i = 0; i < 5; i++) {
          const next = genOnlyA.next();
          if (!next.done) {
            onlyInA.push(next.value);
          }
        }
      } catch {
        // Set difference might fail, try fallback
        const genA = rbA.sample();
        const reB = new RegExp(`^${regexB}$`);
        for (let i = 0; i < 20; i++) {
          const next = genA.next();
          if (!next.done && !reB.test(next.value)) {
            onlyInA.push(next.value);
            if (onlyInA.length >= 5) {break;}
          }
        }
      }
      
      // Get words only in B (B - A)
      try {
        const onlyInBSet = rbB.without(new RegExp(`^${regexA}$`));
        const genOnlyB = onlyInBSet.sample();
        for (let i = 0; i < 5; i++) {
          const next = genOnlyB.next();
          if (!next.done) {
            onlyInB.push(next.value);
          }
        }
      } catch {
        // Set difference might fail, try fallback
        const genB = rbB.sample();
        const reA = new RegExp(`^${regexA}$`);
        for (let i = 0; i < 20; i++) {
          const next = genB.next();
          if (!next.done && !reA.test(next.value)) {
            onlyInB.push(next.value);
            if (onlyInB.length >= 5) {break;}
          }
        }
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
      throw new Error(`Failed to analyze: ${error}`);
    }
  }

  /**
   * 3. Generate a word IN and a word NOT IN a regex
   */
  async generateWordPair(regex: string, excludedWords: string[] = []): Promise<WordPairResult> {
    try {
      const RB = await getRB();
      const re = new RegExp(`^${regex}$`);
      
      // Word that matches
      const wordIn = this.generateWord(regex, excludedWords).word;
      
      // Word that doesn't match (using complement)
      const rb = RB(new RegExp(`^${regex}$`));
      const complement = rb.not();
      
      let wordNotIn = '';
      try {
        // Try to generate from complement
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
      throw new Error(`Failed to generate word pair: ${error}`);
    }
  }

  /**
   * Generate multiple unique words
   */
  generateMultipleWords(regex: string, count: number, excludedWords: string[] = []): string[] {
    const words: string[] = [];
    const seen = new Set<string>([...excludedWords]);

    for (let i = 0; i < count && i < this.maxAttempts; i++) {
      try {
        const result = this.generateWord(regex, Array.from(seen));
        if (!seen.has(result.word)) {
          words.push(result.word);
          seen.add(result.word);
        }
      } catch {
        break;
      }
    }

    return words;
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
      const RB = await getRB();
      RB(new RegExp(`^${pattern}$`));
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
  quickSampleCheck(regexA: string, regexB: string, sampleCount = 20): boolean {
    try {
      // Check if both regexes are valid
      if (!this.isValidRegex(regexA) || !this.isValidRegex(regexB)) {
        return false; // Invalid regexes are not equivalent
      }

      const reA = new RegExp(`^${regexA}$`);
      const reB = new RegExp(`^${regexB}$`);
      
      // Generate samples from A and check if B accepts them all
      const samplesA = this.generateMultipleWords(regexA, sampleCount);
      for (const word of samplesA) {
        if (!reB.test(word)) {
          return false; // Found a word in A but not B - definitely not equivalent
        }
      }
      
      // Generate samples from B and check if A accepts them all
      const samplesB = this.generateMultipleWords(regexB, sampleCount);
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
   * Generate distinguishing words between two regexes
   */
  async generateDistinguishingWords(
    regex1: string,
    regex2: string,
    excludedWords: string[] = []
  ): Promise<DistinguishingWordsResult> {
    try {
      const RB = await getRB();
      const rb1 = RB(new RegExp(`^${regex1}$`));
      const rb2 = RB(new RegExp(`^${regex2}$`));
      
      // Get words only in regex1 (A - B)
      const onlyIn1 = rb1.without(new RegExp(`^${regex2}$`));
      // Get words only in regex2 (B - A)
      const onlyIn2 = rb2.without(new RegExp(`^${regex1}$`));
      
      let word1 = '';
      let word2 = '';
      
      // Try to sample from differences
      try {
        const gen1 = onlyIn1.sample();
        for (let i = 0; i < 10; i++) {
          const next = gen1.next();
          if (!next.done) {
            const word = next.value;
            if (!excludedWords.includes(word)) {
              word1 = word;
              break;
            }
          }
        }
      } catch {
        // Fallback
        word1 = this.generateWord(regex1, excludedWords).word;
      }
      
      try {
        const gen2 = onlyIn2.sample();
        for (let i = 0; i < 10; i++) {
          const next = gen2.next();
          if (!next.done) {
            const word = next.value;
            if (!excludedWords.includes(word) && word !== word1) {
              word2 = word;
              break;
            }
          }
        }
      } catch {
        // Fallback
        word2 = this.generateWord(regex2, [...excludedWords, word1]).word;
      }
      
      return {
        word1,
        word2,
        explanation: `'${word1}' distinguishes from regex1, '${word2}' from regex2`,
        distinguishingProperty: 'Maximally different matching patterns'
      };
    } catch (error) {
      throw new Error(`Failed to generate distinguishing words: ${error}`);
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
      const regexObjects = candidateRegexes.map(r => new RegExp(`^${r}$`));
      
      // Use automata analysis to find distinguishing examples between pairs
      // Collect candidate words from pairwise differences
      const candidateWords: string[] = [];
      
      // Analyze relationships between all pairs of regexes to find distinguishing words
      for (let i = 0; i < candidateRegexes.length && i < 3; i++) {
        for (let j = i + 1; j < candidateRegexes.length && j < 3; j++) {
          try {
            // Use analyzeRelationship which deterministically finds distinguishing examples
            const analysis = await this.analyzeRelationship(
              candidateRegexes[i],
              candidateRegexes[j]
            );
            
            // Add words that are only in one regex (these are guaranteed to distinguish)
            if (analysis.examples) {
              if (analysis.examples.onlyInA) {
                candidateWords.push(...analysis.examples.onlyInA);
              }
              if (analysis.examples.onlyInB) {
                candidateWords.push(...analysis.examples.onlyInB);
              }
              if (analysis.examples.inBoth) {
                candidateWords.push(...analysis.examples.inBoth);
              }
            }
          } catch {
            // Analysis might fail for complex regexes, continue
            continue;
          }
        }
      }
      
      // Remove duplicates and excluded words
      const unique = Array.from(new Set(candidateWords))
        .filter(w => !excludedWords.includes(w));
      
      // If we don't have enough words from automata analysis, supplement with sampling
      if (unique.length < 10) {
        for (const regex of candidateRegexes) {
          try {
            const words = this.generateMultipleWords(regex, 5, excludedWords);
            unique.push(...words);
          } catch {
            continue;
          }
        }
      }
      
      // Score each word by how it splits the candidate set
      interface Scored {
        word: string;
        matches: boolean[];
        count: number;
      }
      
      const scored: Scored[] = Array.from(new Set(unique))
        .filter(w => !excludedWords.includes(w))
        .map(word => {
          const matches = regexObjects.map(re => re.test(word));
          const count = matches.filter(m => m).length;
          return { word, matches, count };
        });
      
      if (scored.length === 0) {
        throw new Error('Could not generate any candidate words');
      }
      
      // Find the pair of words that provides maximum information gain
      // Best pair is one where the words split candidates as differently as possible
      let best1 = scored[0];
      let best2 = scored.length > 1 ? scored[1] : null;
      let maxInfoGain = 0;
      
      for (let i = 0; i < scored.length; i++) {
        for (let j = i + 1; j < scored.length; j++) {
          // Calculate how differently these words split the candidates
          const diff = scored[i].matches.filter((m, k) => m !== scored[j].matches[k]).length;
          
          // Prefer pairs where both words are informative (not all or none)
          const balance1 = Math.min(scored[i].count, candidateRegexes.length - scored[i].count);
          const balance2 = Math.min(scored[j].count, candidateRegexes.length - scored[j].count);
          const infoGain = diff * (balance1 + balance2);
          
          if (infoGain > maxInfoGain) {
            maxInfoGain = infoGain;
            best1 = scored[i];
            best2 = scored[j];
          }
        }
      }
      
      // If we only had one scored word, generate a word NOT matching any regex
      if (!best2) {
        // Generate a word that doesn't match any of the candidate regexes
        // This provides maximum information gain by testing if candidates incorrectly accept non-target strings
        const allExcluded = [...excludedWords, best1.word];
        
        // Try multiple strategies to generate a non-matching word
        const strategies = [
          // Strategy 1: Simple mutations of the existing word
          () => best1.word + 'X',
          () => 'X' + best1.word,
          () => best1.word.slice(0, -1) || '!',
          () => best1.word.toUpperCase() !== best1.word ? best1.word.toUpperCase() : best1.word.toLowerCase(),
          // Strategy 2: Common non-matching patterns
          () => '!!!invalid!!!',
          () => '@@@@',
          () => '____',
          () => '0000',
          () => 'XXXX',
          // Strategy 3: Empty or very short strings
          () => '',
          () => ' ',
          () => '\n',
        ];
        
        for (const strategy of strategies) {
          const candidate = strategy();
          
          // Check if this word is excluded or matches any regex
          if (allExcluded.includes(candidate)) {
            continue;
          }
          
          const matches = regexObjects.map(re => re.test(candidate));
          const count = matches.filter(m => m).length;
          
          // We want a word that doesn't match any regex (count === 0)
          // or at least matches differently than best1
          if (count === 0 || matches.some((m, k) => m !== best1.matches[k])) {
            best2 = { word: candidate, matches, count };
            break;
          }
        }
      }
      
      // If we still don't have a second word, throw an error rather than returning duplicates
      if (!best2) {
        throw new Error('Could not generate two distinct distinguishing words');
      }
      
      // CRITICAL: At least ONE word must match at least one candidate
      // If both words have count === 0, we've run out of words to generate
      if (best1.count === 0 && best2.count === 0) {
        throw new Error('Could not generate unique word - both words match zero candidates (exhausted word space)');
      }
      
      return {
        words: [best1.word, best2.word],
        explanation: `Maximally distinguishing pair (info gain: ${maxInfoGain})`,
        properties: [
          `Matches ${best1.count}/${candidateRegexes.length}`,
          `Matches ${best2.count}/${candidateRegexes.length}`
        ]
      };
    } catch (error) {
      throw new Error(`Failed: ${error}`);
    }
  }
}

/**
 * Create analyzer instance
 */
export function createRegexAnalyzer(): RegexAnalyzer {
  return new RegexAnalyzer();
}
