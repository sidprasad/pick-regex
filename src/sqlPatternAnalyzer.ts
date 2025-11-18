/**
 * SQL Pattern Analyzer for LIKE and SIMILAR TO patterns
 * 
 * This module provides functionality to work with SQL patterns including:
 * - LIKE patterns (% for any characters, _ for single character)
 * - SIMILAR TO patterns (SQL regex patterns)
 */

export interface SqlPatternResult {
  pattern: string;
  explanation?: string;
}

export interface SqlWordPairResult {
  wordIn: string;
  wordNotIn: string;
  explanation?: string;
}

export interface SqlDistinguishingWordsResult {
  words: [string, string];
  explanation: string;
  properties?: string[];
}

/**
 * Convert SQL LIKE pattern to JavaScript regex
 */
function likeToRegex(likePattern: string): RegExp {
  // Escape special regex characters except % and _
  let regexPattern = likePattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  
  return new RegExp(`^${regexPattern}$`, 'i');
}

/**
 * Convert SQL SIMILAR TO pattern to JavaScript regex
 * SIMILAR TO uses standard SQL regex syntax
 */
function similarToRegex(similarPattern: string): RegExp {
  // SIMILAR TO patterns are similar to POSIX regex
  // For simplicity, we'll treat them as standard regex with minor adjustments
  return new RegExp(`^${similarPattern}$`, 'i');
}

/**
 * SqlPatternAnalyzer for SQL LIKE and SIMILAR TO patterns
 */
export class SqlPatternAnalyzer {
  private maxAttempts = 100;

  /**
   * Verify if a word matches a SQL pattern
   */
  verifyMatch(word: string, pattern: string, patternType: 'like' | 'similar' = 'like'): boolean {
    try {
      const regex = patternType === 'like' ? likeToRegex(pattern) : similarToRegex(pattern);
      return regex.test(word);
    } catch {
      return false;
    }
  }

  /**
   * Generate a word matching a SQL pattern
   */
  generateWord(pattern: string, patternType: 'like' | 'similar' = 'like', seenWords: string[] = []): SqlPatternResult {
    try {
      const seenSet = new Set(seenWords);
      
      // Simple generation based on pattern structure
      const words = this.generateWordsFromPattern(pattern, patternType);
      
      for (const word of words) {
        if (!seenSet.has(word)) {
          return { pattern: word, explanation: `Generated from: ${pattern}` };
        }
      }
      
      throw new Error(`Could not generate unique word after examining ${words.length} candidates`);
    } catch (error) {
      throw new Error(`Failed to generate word for '${pattern}': ${error}`);
    }
  }

  /**
   * Generate example words from a SQL pattern
   */
  private generateWordsFromPattern(pattern: string, patternType: 'like' | 'similar'): string[] {
    const words: string[] = [];
    
    if (patternType === 'like') {
      // Generate examples for LIKE patterns
      // % matches any characters, _ matches single character
      
      // Replace % with various strings
      let current = pattern.replace(/%/g, 'abc');
      words.push(current);
      
      current = pattern.replace(/%/g, 'xyz');
      words.push(current);
      
      current = pattern.replace(/%/g, 'test');
      words.push(current);
      
      current = pattern.replace(/%/g, '12345');
      words.push(current);
      
      // Replace _ with various single characters
      for (let i = 0; i < words.length; i++) {
        let word = words[i];
        if (word.includes('_')) {
          words.push(word.replace(/_/g, 'a'));
          words.push(word.replace(/_/g, 'x'));
          words.push(word.replace(/_/g, '1'));
        }
      }
    } else {
      // For SIMILAR TO, generate some example strings
      // This is a simplified version
      words.push('example');
      words.push('test123');
      words.push('abc');
      words.push('xyz');
    }
    
    return words.filter(w => this.verifyMatch(w, pattern, patternType));
  }

  /**
   * Generate multiple unique words
   */
  generateMultipleWords(pattern: string, patternType: 'like' | 'similar' = 'like', count: number): string[] {
    const words: string[] = [];
    const seen = new Set<string>();
    
    const candidates = this.generateWordsFromPattern(pattern, patternType);
    
    for (const candidate of candidates) {
      if (!seen.has(candidate) && words.length < count) {
        words.push(candidate);
        seen.add(candidate);
      }
    }
    
    return words;
  }

  /**
   * Generate a word IN and a word NOT IN a pattern
   */
  generateWordPair(pattern: string, patternType: 'like' | 'similar' = 'like', excludedWords: string[] = []): SqlWordPairResult {
    try {
      // Word that matches
      const wordIn = this.generateWord(pattern, patternType, excludedWords).pattern;
      
      // Word that doesn't match
      let wordNotIn = '';
      
      if (patternType === 'like') {
        // Generate a word that violates the pattern
        if (pattern.includes('%')) {
          // Add characters that break the pattern
          wordNotIn = '!!!invalid';
        } else if (pattern.includes('_')) {
          // Wrong length
          wordNotIn = pattern.replace(/_/g, 'XX');
        } else {
          // Different string
          wordNotIn = wordIn + 'X';
        }
      } else {
        wordNotIn = '!!!invalid';
      }
      
      // Ensure it doesn't match
      let attempts = 0;
      while (this.verifyMatch(wordNotIn, pattern, patternType) && attempts < 10) {
        wordNotIn = wordNotIn + 'X';
        attempts++;
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
   * Generate two distinguishing words from candidate patterns
   */
  async generateTwoDistinguishingWords(
    candidatePatterns: string[],
    patternType: 'like' | 'similar' = 'like',
    excludedWords: string[] = []
  ): Promise<SqlDistinguishingWordsResult> {
    if (candidatePatterns.length === 0) {
      throw new Error('Need at least one candidate pattern');
    }

    // Special case: only one candidate - show word IN and word NOT IN
    if (candidatePatterns.length === 1) {
      const pattern = candidatePatterns[0];
      const pair = this.generateWordPair(pattern, patternType, excludedWords);
      
      return {
        words: [pair.wordIn, pair.wordNotIn],
        explanation: `Single candidate: '${pair.wordIn}' matches, '${pair.wordNotIn}' doesn't`,
        properties: [
          'Matches the pattern',
          'Does not match the pattern'
        ]
      };
    }

    try {
      // Generate candidates from all patterns
      const allWords: string[] = [];
      for (const pattern of candidatePatterns) {
        try {
          const words = this.generateMultipleWords(pattern, patternType, 5);
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
        const matches = candidatePatterns.map(pattern => this.verifyMatch(word, pattern, patternType));
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
          `Matches ${best1.count}/${candidatePatterns.length}`,
          `Matches ${best2.count}/${candidatePatterns.length}`
        ]
      };
    } catch (error) {
      throw new Error(`Failed: ${error}`);
    }
  }
}

/**
 * Create SQL pattern analyzer instance
 */
export function createSqlPatternAnalyzer(): SqlPatternAnalyzer {
  return new SqlPatternAnalyzer();
}
