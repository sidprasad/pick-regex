import RandExp from 'randexp';
import { RB } from '@gruhn/regex-utils';

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
  analyzeRelationship(regexA: string, regexB: string): RelationshipResult {
    try {
      const rbA = RB(new RegExp(`^${regexA}$`));
      const rbB = RB(new RegExp(`^${regexB}$`));
      
      // Use regex-utils predicates
      const isEquiv = rbA.isEquivalent(new RegExp(`^${regexB}$`));
      const aSubsetB = rbA.isSubsetOf(new RegExp(`^${regexB}$`));
      const bSubsetA = rbB.isSubsetOf(new RegExp(`^${regexA}$`));
      const isDisjoint = rbA.isDisjointFrom(new RegExp(`^${regexB}$`));
      
      // Collect examples
      const samplesA = Array.from(rbA.sample().take(5)) as string[];
      const samplesB = Array.from(rbB.sample().take(5)) as string[];
      const reA = new RegExp(`^${regexA}$`);
      const reB = new RegExp(`^${regexB}$`);
      
      const inBoth = samplesA.filter(w => reB.test(w)).slice(0, 3);
      const onlyInA = samplesA.filter(w => !reB.test(w)).slice(0, 3);
      const onlyInB = samplesB.filter(w => !reA.test(w)).slice(0, 3);
      
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
        examples: { inBoth, onlyInA, onlyInB }
      };
    } catch (error) {
      throw new Error(`Failed to analyze: ${error}`);
    }
  }

  /**
   * 3. Generate a word IN and a word NOT IN a regex
   */
  generateWordPair(regex: string, excludedWords: string[] = []): WordPairResult {
    try {
      const re = new RegExp(`^${regex}$`);
      
      // Word that matches
      const wordIn = this.generateWord(regex, excludedWords).word;
      
      // Word that doesn't match (using complement)
      const rb = RB(new RegExp(`^${regex}$`));
      const complement = rb.not();
      
      let wordNotIn = '';
      try {
        // Try to generate from complement
        for (const word of complement.sample().take(10)) {
          if (!excludedWords.includes(word) && word !== wordIn) {
            wordNotIn = word;
            break;
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
  generateMultipleWords(regex: string, count: number): string[] {
    const words: string[] = [];
    const seen = new Set<string>();

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
   * Verify match
   */
  verifyMatch(word: string, regex: string): boolean {
    try {
      return new RegExp(`^${regex}$`).test(word);
    } catch {
      return false;
    }
  }

  /**
   * Generate distinguishing words between two regexes
   */
  generateDistinguishingWords(
    regex1: string,
    regex2: string,
    excludedWords: string[] = []
  ): DistinguishingWordsResult {
    try {
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
        for (const word of onlyIn1.sample().take(10)) {
          if (!excludedWords.includes(word)) {
            word1 = word;
            break;
          }
        }
      } catch {
        // Fallback
        word1 = this.generateWord(regex1, excludedWords).word;
      }
      
      try {
        for (const word of onlyIn2.sample().take(10)) {
          if (!excludedWords.includes(word) && word !== word1) {
            word2 = word;
            break;
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
   */
  generateTwoDistinguishingWords(
    candidateRegexes: string[],
    excludedWords: string[] = []
  ): TwoDistinguishingWordsResult {
    if (candidateRegexes.length === 0) {
      throw new Error('Need at least one candidate regex');
    }

    try {
      const regexObjects = candidateRegexes.map(r => new RegExp(`^${r}$`));
      
      // Generate candidates from all regexes
      const allWords: string[] = [];
      for (const regex of candidateRegexes) {
        try {
          const words = this.generateMultipleWords(regex, 5);
          allWords.push(...words);
        } catch {
          continue;
        }
      }
      
      // Remove duplicates and excluded
      const unique = Array.from(new Set(allWords))
        .filter(w => !excludedWords.includes(w));
      
      // Find two words with max different match vectors
      interface Scored {
        word: string;
        matches: boolean[];
        count: number;
      }
      
      const scored: Scored[] = unique.map(word => {
        const matches = regexObjects.map(re => re.test(word));
        const count = matches.filter(m => m).length;
        return { word, matches, count };
      });
      
      let best1 = scored[0];
      let best2 = scored[1] || scored[0];
      let maxDiff = 0;
      
      for (let i = 0; i < scored.length; i++) {
        for (let j = i + 1; j < scored.length; j++) {
          const diff = scored[i].matches.filter((m, k) => m !== scored[j].matches[k]).length;
          if (diff > maxDiff) {
            maxDiff = diff;
            best1 = scored[i];
            best2 = scored[j];
          }
        }
      }
      
      return {
        words: [best1.word, best2.word],
        explanation: `Max distinguishing power (diff: ${maxDiff})`,
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
