import * as assert from 'assert';
import { createRegexAnalyzer, checkAutomataSupport } from '../regexAnalyzer';

/**
 * Integration tests for the improved regex support detection
 */
suite('Regex Support Integration Tests', () => {
  let analyzer: ReturnType<typeof createRegexAnalyzer>;

  setup(() => {
    analyzer = createRegexAnalyzer();
  });

  test('Should detect and handle \\b patterns gracefully', async () => {
    // pattern1 uses \b which is unsupported by automata
    // pattern2 uses anchors which ARE supported
    const pattern1 = '\\btest\\b';
    const pattern2 = '^test$';
    
    // Verify pattern1 is detected as unsupported
    const support1 = checkAutomataSupport(pattern1);
    assert.strictEqual(support1.isSupported, false);
    assert.ok(support1.unsupportedFeatures.some(f => f.includes('word boundary')));
    
    // Verify pattern2 is supported
    const support2 = checkAutomataSupport(pattern2);
    assert.strictEqual(support2.isSupported, true);
    
    // The analyzeRelationship should throw due to \b in pattern1
    // The pickViewProvider will catch this and use sampling fallback
    try {
      await analyzer.analyzeRelationship(pattern1, pattern2);
      assert.fail('Should have thrown error for \\b pattern');
    } catch (error) {
      // Expected - automata analysis should fail for \b
      assert.ok(String(error).includes('word-boundary') || String(error).includes('assertion'));
    }
  });

  test('Should detect and handle lookbehind patterns gracefully', async () => {
    const pattern1 = '(?<=@)\\w+';  // Lookbehind
    const pattern2 = '@\\w+';       // Regular pattern
    
    // Verify lookbehind is detected as unsupported
    const support1 = checkAutomataSupport(pattern1);
    assert.strictEqual(support1.isSupported, false);
    assert.ok(support1.unsupportedFeatures.includes('lookbehind assertion'));
    
    const support2 = checkAutomataSupport(pattern2);
    assert.strictEqual(support2.isSupported, true);
    
    // The analyzeRelationship should throw due to lookbehind
    try {
      await analyzer.analyzeRelationship(pattern1, pattern2);
      assert.fail('Should have thrown error for lookbehind pattern');
    } catch (error) {
      // Expected - automata analysis should fail for lookbehind
      assert.ok(String(error).includes('lookbehind') || String(error).includes('assertion'));
    }
  });

  test('Should handle supported patterns normally', async () => {
    const pattern1 = '[a-z]+';
    const pattern2 = '[a-z]+';
    
    // Verify both are supported
    const support1 = checkAutomataSupport(pattern1);
    const support2 = checkAutomataSupport(pattern2);
    assert.strictEqual(support1.isSupported, true);
    assert.strictEqual(support2.isSupported, true);
    
    // Analysis should succeed
    const result = await analyzer.analyzeRelationship(pattern1, pattern2);
    assert.ok(result);
    assert.ok(result.relationship);
  });

  test('Should handle \\w pattern (which IS supported)', async () => {
    const pattern1 = '\\w+';
    const pattern2 = '[a-zA-Z0-9_]+';
    
    // Verify \w is supported
    const support1 = checkAutomataSupport(pattern1);
    assert.strictEqual(support1.isSupported, true);
    
    // Analysis should succeed
    const result = await analyzer.analyzeRelationship(pattern1, pattern2);
    assert.ok(result);
    // These should be equivalent
    // Note: \w is [a-zA-Z0-9_] in JavaScript
  });

  test('Should provide helpful suggestions for unsupported patterns', () => {
    const pattern = '\\bword\\b';
    const support = checkAutomataSupport(pattern);
    
    assert.strictEqual(support.isSupported, false);
    assert.ok(support.suggestion);
    assert.ok(support.suggestion.includes('character classes'));
  });

  test('Should detect multiple unsupported features', () => {
    const pattern = '\\b(test)\\1(?<=abc)';
    const support = checkAutomataSupport(pattern);
    
    assert.strictEqual(support.isSupported, false);
    assert.ok(support.unsupportedFeatures.includes('word boundary (\\b)'));
    assert.ok(support.unsupportedFeatures.includes('backreferences'));
    assert.ok(support.unsupportedFeatures.includes('lookbehind assertion'));
  });

  test('Should use deepSamplingEquivalenceCheck for truly equivalent patterns', () => {
    // These patterns ARE semantically equivalent
    const pattern1 = '^a$';
    const pattern2 = 'a';  // When wrapped with ^ and $, this is same as ^a$
    
    // When used in the context of ^...$ anchors (which the analyzer adds), they're equivalent
    const result = analyzer.deepSamplingEquivalenceCheck(pattern1, pattern2);
    assert.strictEqual(result, true);
  });

  test('Should correctly identify non-equivalent patterns via sampling', () => {
    const pattern1 = '^a$';
    const pattern2 = '^b$';
    
    const result = analyzer.deepSamplingEquivalenceCheck(pattern1, pattern2);
    assert.strictEqual(result, false);
  });

  test('Should correctly identify non-equivalent patterns with different quantifiers', () => {
    const pattern1 = '^a$';
    const pattern2 = '^a+$';
    
    const result = analyzer.deepSamplingEquivalenceCheck(pattern1, pattern2);
    assert.strictEqual(result, false);
  });
});
