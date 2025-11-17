import * as assert from 'assert';
import { createRegexAnalyzer, RegexRelationship } from '../regexAnalyzer';

suite('RegexAnalyzer Test Suite', () => {
  let analyzer: ReturnType<typeof createRegexAnalyzer>;

  setup(() => {
    analyzer = createRegexAnalyzer();
  });

  test('Should detect equivalent regexes', async () => {
    const regex1 = 'a+';
    const regex2 = 'a+';
    
    const result = await analyzer.analyzeRelationship(regex1, regex2);
    assert.strictEqual(result.relationship, RegexRelationship.EQUIVALENT);
  });

  test('Should detect equivalent regexes with different patterns', async () => {
    const regex1 = 'abc';
    const regex2 = 'abc';
    
    const result = await analyzer.analyzeRelationship(regex1, regex2);
    assert.strictEqual(result.relationship, RegexRelationship.EQUIVALENT);
  });

  test('Should detect non-equivalent regexes', async () => {
    const regex1 = '[a-z]+';
    const regex2 = '[0-9]+';
    
    const result = await analyzer.analyzeRelationship(regex1, regex2);
    assert.notStrictEqual(result.relationship, RegexRelationship.EQUIVALENT);
  });

  test('Should detect disjoint regexes', async () => {
    const regex1 = '[a-z]+';
    const regex2 = '[0-9]+';
    
    const result = await analyzer.analyzeRelationship(regex1, regex2);
    assert.strictEqual(result.relationship, RegexRelationship.DISJOINT);
  });

  test('Should detect subset relationships', async () => {
    const regex1 = 'abc';
    const regex2 = '[a-z]+';
    
    const result = await analyzer.analyzeRelationship(regex1, regex2);
    assert.strictEqual(result.relationship, RegexRelationship.A_IN_B);
  });

  test('Should generate word matching regex', () => {
    const regex = '[a-z]+';
    const result = analyzer.generateWord(regex);
    
    assert.ok(result.word);
    assert.ok(new RegExp(`^${regex}$`).test(result.word));
  });

  test('Should generate unique words', () => {
    const regex = '[a-z]+';
    const seen = ['abc', 'def', 'ghi'];
    const result = analyzer.generateWord(regex, seen);
    
    assert.ok(result.word);
    assert.ok(!seen.includes(result.word));
  });

  test('Should verify match correctly', () => {
    const regex = '[a-z]+';
    
    assert.strictEqual(analyzer.verifyMatch('abc', regex), true);
    assert.strictEqual(analyzer.verifyMatch('123', regex), false);
    assert.strictEqual(analyzer.verifyMatch('abc123', regex), false);
  });

  test('Should generate multiple unique words', () => {
    const regex = '[a-z]{3}';
    const words = analyzer.generateMultipleWords(regex, 5);
    
    assert.ok(words.length > 0);
    assert.ok(words.length <= 5);
    
    // Check uniqueness
    const uniqueWords = new Set(words);
    assert.strictEqual(uniqueWords.size, words.length);
    
    // Check all match
    words.forEach(word => {
      assert.ok(new RegExp(`^${regex}$`).test(word));
    });
  });
});
