import * as assert from 'assert';
import { createRegexAnalyzer } from '../regexAnalyzer';

/**
 * Integration tests for equivalence filtering of regexes with unsupported syntax
 * Tests the scenario where automata analysis fails and we need sampling-based fallback
 */
suite('Equivalence Filtering - Unsupported Syntax', () => {
  let analyzer: ReturnType<typeof createRegexAnalyzer>;

  setup(() => {
    analyzer = createRegexAnalyzer();
  });

  test('Should detect equivalent: ^a$ and a', () => {
    const result = analyzer.deepSamplingEquivalenceCheck('^a$', 'a');
    assert.strictEqual(result, true, '^a$ and a should be detected as equivalent');
  });

  test('Should detect equivalent: ^a$ and [a]', () => {
    const result = analyzer.deepSamplingEquivalenceCheck('^a$', '[a]');
    assert.strictEqual(result, true, '^a$ and [a] should be detected as equivalent');
  });

  test('Should detect equivalent: a and [a]', () => {
    const result = analyzer.deepSamplingEquivalenceCheck('a', '[a]');
    assert.strictEqual(result, true, 'a and [a] should be detected as equivalent');
  });

  test('Should detect equivalent: \\ba\\b and ^a$ (word boundary case)', () => {
    // Note: \b is not supported by regex-utils automata, so this relies on sampling
    const result = analyzer.deepSamplingEquivalenceCheck('\\ba\\b', '^a$');
    assert.strictEqual(result, true, '\\ba\\b and ^a$ should be detected as equivalent for single letter');
  });

  test('Should detect equivalent: (?<!\\w)a(?!\\w) and ^a$ (lookbehind case)', () => {
    // Lookbehind/lookahead not supported by regex-utils, relies on sampling
    const result = analyzer.deepSamplingEquivalenceCheck('(?<!\\w)a(?!\\w)', '^a$');
    assert.strictEqual(result, true, '(?<!\\w)a(?!\\w) and ^a$ should be detected as equivalent');
  });

  test('Should detect equivalent: \\ba\\b and (?<!\\w)a(?!\\w)', () => {
    // Both unsupported by automata analysis
    const result = analyzer.deepSamplingEquivalenceCheck('\\ba\\b', '(?<!\\w)a(?!\\w)');
    assert.strictEqual(result, true, '\\ba\\b and (?<!\\w)a(?!\\w) should be detected as equivalent');
  });

  test('Should detect NOT equivalent: [a-z]+ and [0-9]+', () => {
    const result = analyzer.deepSamplingEquivalenceCheck('[a-z]+', '[0-9]+');
    assert.strictEqual(result, false, '[a-z]+ and [0-9]+ should NOT be equivalent');
  });

  test('Should detect NOT equivalent: ^a$ and ^b$', () => {
    const result = analyzer.deepSamplingEquivalenceCheck('^a$', '^b$');
    assert.strictEqual(result, false, '^a$ and ^b$ should NOT be equivalent');
  });

  test('Should detect NOT equivalent: a+ and a', () => {
    const result = analyzer.deepSamplingEquivalenceCheck('a+', 'a');
    assert.strictEqual(result, false, 'a+ and a should NOT be equivalent');
  });

  test('Should detect NOT equivalent: a? and a', () => {
    const result = analyzer.deepSamplingEquivalenceCheck('a?', 'a');
    assert.strictEqual(result, false, 'a? and a should NOT be equivalent (a? matches empty string)');
  });

  test('Real-world case: filtering the three equivalent "a" regexes', () => {
    // This is the exact case from the bug report
    const regexes = ['^a$', '\\ba\\b', '(?<!\\w)a(?!\\w)'];
    const unique: string[] = [];

    for (const regex of regexes) {
      let isEquivalent = false;
      
      for (const uniqueRegex of unique) {
        // In real code, this would try automata analysis first and fail
        // Then fall back to sampling
        if (analyzer.deepSamplingEquivalenceCheck(regex, uniqueRegex)) {
          isEquivalent = true;
          break;
        }
      }
      
      if (!isEquivalent) {
        unique.push(regex);
      }
    }

    assert.strictEqual(unique.length, 1, 
      `Should filter down to 1 unique regex, but got ${unique.length}: [${unique.join(', ')}]`);
  });

  test('Should handle regexes with different quantifiers correctly', () => {
    // These are NOT equivalent
    const regexes = ['^a$', '^a+$', '^a*$', '^a?$'];
    const unique: string[] = [];

    for (const regex of regexes) {
      let isEquivalent = false;
      
      for (const uniqueRegex of unique) {
        if (analyzer.deepSamplingEquivalenceCheck(regex, uniqueRegex)) {
          isEquivalent = true;
          break;
        }
      }
      
      if (!isEquivalent) {
        unique.push(regex);
      }
    }

    assert.strictEqual(unique.length, 4, 
      'All four quantifier variations should be kept as unique');
  });

  test('Should handle character class variations', () => {
    // These ARE equivalent
    const regexes = ['[abc]', '[a-c]', '(a|b|c)'];
    
    // Check pairwise
    assert.strictEqual(analyzer.deepSamplingEquivalenceCheck('[abc]', '[a-c]'), true);
    assert.strictEqual(analyzer.deepSamplingEquivalenceCheck('[abc]', '(a|b|c)'), true);
    assert.strictEqual(analyzer.deepSamplingEquivalenceCheck('[a-c]', '(a|b|c)'), true);
  });

  test('Edge case: empty string matching', () => {
    // ^$ matches only empty string, a? matches empty or a
    const result = analyzer.deepSamplingEquivalenceCheck('^$', 'a?');
    assert.strictEqual(result, false, '^$ and a? should NOT be equivalent');
  });

  test('Edge case: anchors with same content', () => {
    const result = analyzer.deepSamplingEquivalenceCheck('^test$', 'test');
    assert.strictEqual(result, true, '^test$ and test should be equivalent');
  });
});
