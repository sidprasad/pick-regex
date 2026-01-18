import * as assert from 'assert';
import { selectEdgeCaseSuggestions } from '../pickViewProvider';
import { RegexCandidate } from '../regexService';

const analyzer = {
  verifyMatch(word: string, pattern: string): boolean {
    return new RegExp(`^${pattern}$`).test(word);
  }
};

suite('PickViewProvider edge case selection', () => {
  test('should include up to two unmatched edge cases after distinguishing picks', () => {
    const candidates: RegexCandidate[] = [
      { regex: 'foo', explanation: '', edgeCases: ['foo', 'miss1'] },
      { regex: 'bar', explanation: '', edgeCases: ['bar', 'miss2', 'miss3'] }
    ];

    const result = selectEdgeCaseSuggestions(candidates, analyzer, 5);

    assert.deepStrictEqual(result, ['foo', 'bar', 'miss1', 'miss2']);
  });

  test('should cap unmatched edge cases even when more are available', () => {
    const candidates: RegexCandidate[] = [
      { regex: 'cat', explanation: '', edgeCases: ['cat', 'nomatch1', 'nomatch2', 'nomatch3'] },
      { regex: 'dog', explanation: '', edgeCases: ['dog'] }
    ];

    const result = selectEdgeCaseSuggestions(candidates, analyzer, 6);

    assert.deepStrictEqual(result, ['cat', 'dog', 'nomatch1', 'nomatch2']);
  });

  test('should filter out words with identical match signatures', () => {
    const candidates: RegexCandidate[] = [
      { regex: 'a+', explanation: '', edgeCases: ['a', 'aa', 'aaa'] },
      { regex: 'b+', explanation: '', edgeCases: ['b', 'bb'] }
    ];

    // All 'a*' variations match only first regex, all 'b*' match only second
    // They have identical match patterns within each group
    const result = selectEdgeCaseSuggestions(candidates, analyzer, 6);

    // Should only get one from each match signature group
    assert.strictEqual(result.length, 2);
    assert.ok(result.includes('a') || result.includes('aa') || result.includes('aaa'));
    assert.ok(result.includes('b') || result.includes('bb'));
  });

  test('should keep words with different match signatures', () => {
    const candidates: RegexCandidate[] = [
      { regex: '[a-z]+', explanation: '', edgeCases: ['abc', 'xyz', 'nomatch'] },
      { regex: '[0-9]+', explanation: '', edgeCases: ['456', '789'] }
    ];

    const result = selectEdgeCaseSuggestions(candidates, analyzer, 6);

    // 'abc' and 'xyz' both match first only → signature "true,false" (only one kept)
    // 'nomatch' matches neither → unmatched
    // '456' and '789' both match second only → signature "false,true" (only one kept)
    // So we should get 2 distinguishing + 1 unmatched = 3, but must be even so 2
    assert.strictEqual(result.length, 2);
    assert.ok(result.includes('abc') || result.includes('xyz')); // One from first match signature
    assert.ok(result.includes('456') || result.includes('789')); // One from second match signature
  });

  test('should handle empty edge cases', () => {
    const candidates: RegexCandidate[] = [
      { regex: 'foo', explanation: '' },
      { regex: 'bar', explanation: '' }
    ];

    const result = selectEdgeCaseSuggestions(candidates, analyzer, 4);

    assert.deepStrictEqual(result, []);
  });

  test('should return empty array when maxSuggestions is 0', () => {
    const candidates: RegexCandidate[] = [
      { regex: 'foo', explanation: '', edgeCases: ['foo', 'bar'] }
    ];

    const result = selectEdgeCaseSuggestions(candidates, analyzer, 0);

    assert.deepStrictEqual(result, []);
  });
});