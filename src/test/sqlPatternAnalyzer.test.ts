import * as assert from 'assert';
import { createSqlPatternAnalyzer } from '../sqlPatternAnalyzer';

suite('SqlPatternAnalyzer Test Suite', () => {
  let analyzer: ReturnType<typeof createSqlPatternAnalyzer>;

  setup(() => {
    analyzer = createSqlPatternAnalyzer();
  });

  test('Should verify match for LIKE pattern with %', () => {
    const pattern = 'abc%';
    
    assert.strictEqual(analyzer.verifyMatch('abc', pattern, 'like'), true);
    assert.strictEqual(analyzer.verifyMatch('abcdef', pattern, 'like'), true);
    assert.strictEqual(analyzer.verifyMatch('abc123', pattern, 'like'), true);
    assert.strictEqual(analyzer.verifyMatch('ab', pattern, 'like'), false);
    assert.strictEqual(analyzer.verifyMatch('xabc', pattern, 'like'), false);
  });

  test('Should verify match for LIKE pattern with _', () => {
    const pattern = 'a_c';
    
    assert.strictEqual(analyzer.verifyMatch('abc', pattern, 'like'), true);
    assert.strictEqual(analyzer.verifyMatch('axc', pattern, 'like'), true);
    assert.strictEqual(analyzer.verifyMatch('a1c', pattern, 'like'), true);
    assert.strictEqual(analyzer.verifyMatch('ac', pattern, 'like'), false);
    assert.strictEqual(analyzer.verifyMatch('abbc', pattern, 'like'), false);
  });

  test('Should verify match for LIKE pattern with multiple wildcards', () => {
    const pattern = 'a%b_c';
    
    assert.strictEqual(analyzer.verifyMatch('axbxc', pattern, 'like'), true);
    assert.strictEqual(analyzer.verifyMatch('axxxbxc', pattern, 'like'), true);
    assert.strictEqual(analyzer.verifyMatch('abc', pattern, 'like'), false);
  });

  test('Should generate word matching pattern', () => {
    const pattern = 'test%';
    const result = analyzer.generateWord(pattern, 'like');
    
    assert.ok(result.pattern);
    assert.ok(analyzer.verifyMatch(result.pattern, pattern, 'like'));
  });

  test('Should generate unique words', () => {
    const pattern = 'abc%';
    const seen = ['abc', 'abcdef'];
    const result = analyzer.generateWord(pattern, 'like', seen);
    
    assert.ok(result.pattern);
    assert.ok(!seen.includes(result.pattern));
    assert.ok(analyzer.verifyMatch(result.pattern, pattern, 'like'));
  });

  test('Should generate multiple unique words', () => {
    const pattern = 'test%';
    const words = analyzer.generateMultipleWords(pattern, 'like', 3);
    
    assert.ok(words.length > 0);
    assert.ok(words.length <= 3);
    
    // Check uniqueness
    const uniqueWords = new Set(words);
    assert.strictEqual(uniqueWords.size, words.length);
    
    // Check all match
    words.forEach(word => {
      assert.ok(analyzer.verifyMatch(word, pattern, 'like'));
    });
  });

  test('Should generate word pair with IN and NOT IN', () => {
    const pattern = 'abc%';
    const pair = analyzer.generateWordPair(pattern, 'like');
    
    assert.ok(pair.wordIn);
    assert.ok(pair.wordNotIn);
    assert.ok(analyzer.verifyMatch(pair.wordIn, pattern, 'like'));
    assert.ok(!analyzer.verifyMatch(pair.wordNotIn, pattern, 'like'));
  });

  test('Should generate distinguishing words for single candidate', async () => {
    const patterns = ['test%'];
    const result = await analyzer.generateTwoDistinguishingWords(patterns, 'like');
    
    assert.ok(result.words);
    assert.strictEqual(result.words.length, 2);
    assert.ok(result.words[0]);
    assert.ok(result.words[1]);
  });

  test('Should generate distinguishing words for multiple candidates', async () => {
    const patterns = ['a%', 'b%'];
    const result = await analyzer.generateTwoDistinguishingWords(patterns, 'like');
    
    assert.ok(result.words);
    assert.strictEqual(result.words.length, 2);
    assert.ok(result.words[0]);
    assert.ok(result.words[1]);
    assert.notStrictEqual(result.words[0], result.words[1]);
  });
});
