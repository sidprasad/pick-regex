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
});
