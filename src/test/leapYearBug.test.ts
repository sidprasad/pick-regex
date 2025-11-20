import * as assert from 'assert';
import { createRegexAnalyzer } from '../regexAnalyzer';

/**
 * Test suite for the leap year bug reported in:
 * https://github.com/sidprasad/pick-regex/issues/X
 * 
 * Issue: Two nearly-equivalent leap year regexes went through 24 classifications
 * without finding the distinguishing example (year 2000).
 */
suite('Leap Year Bug Fix Test Suite', () => {
  let analyzer: ReturnType<typeof createRegexAnalyzer>;

  setup(() => {
    analyzer = createRegexAnalyzer();
  });

  test('Should find "2000" as distinguishing word for leap year regexes', async () => {
    // These are the actual regexes from the bug report
    const regex1 = '(2000|2004|2008|2012|2016|2020|2024|2028|2032|2036|2040|2044|2048|2052|2056|2060|2064|2068|2072|2076|2080|2084|2088|2092|2096)';
    const regex2 = '20(0[48]|[2468][048]|[13579][26])';
    
    const candidates = [regex1, regex2];
    
    // Generate distinguishing words multiple times to ensure reliability
    let found2000 = false;
    const maxAttempts = 10;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      // Check if "2000" appears in either word
      if (result.words[0] === '2000' || result.words[1] === '2000') {
        found2000 = true;
        
        // Verify that 2000 actually distinguishes these regexes
        const re1 = new RegExp(`^${regex1}$`);
        const re2 = new RegExp(`^${regex2}$`);
        
        assert.strictEqual(re1.test('2000'), true, 'regex1 should match 2000');
        assert.strictEqual(re2.test('2000'), false, 'regex2 should NOT match 2000');
        
        console.log(`Found "2000" on attempt ${attempt + 1}`);
        break;
      }
    }
    
    assert.ok(
      found2000,
      `Should find "2000" as a distinguishing word within ${maxAttempts} attempts. ` +
      `This is the key distinguishing example that was missed in the bug report.`
    );
  });

  test('Should consistently find distinguishing words between different regex pairs', async () => {
    const regex1 = '(2000|2004|2008|2012|2016|2020|2024|2028|2032|2036|2040|2044|2048|2052|2056|2060|2064|2068|2072|2076|2080|2084|2088|2092|2096)';
    const regex2 = '20(0[48]|[2468][048]|[13579][26])';
    
    const candidates = [regex1, regex2];
    const re1 = new RegExp(`^${regex1}$`);
    const re2 = new RegExp(`^${regex2}$`);
    
    // Run multiple times and verify we get distinguishing words
    for (let i = 0; i < 5; i++) {
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      const word1 = result.words[0];
      const word2 = result.words[1];
      
      // At least one word should distinguish the regexes
      const match1_re1 = re1.test(word1);
      const match1_re2 = re2.test(word1);
      const match2_re1 = re1.test(word2);
      const match2_re2 = re2.test(word2);
      
      const word1Distinguishes = match1_re1 !== match1_re2;
      const word2Distinguishes = match2_re1 !== match2_re2;
      
      assert.ok(
        word1Distinguishes || word2Distinguishes,
        `Attempt ${i + 1}: At least one word should distinguish the regexes. ` +
        `word1="${word1}" (re1:${match1_re1}, re2:${match1_re2}), ` +
        `word2="${word2}" (re1:${match2_re1}, re2:${match2_re2})`
      );
    }
  });

  test('Should find distinguishing words with increased sample count', async () => {
    // Test that our increased sample count (from 5 to 20) helps find edge cases
    const regex1 = '(a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z)';
    const regex2 = '(b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z)'; // missing 'a'
    
    const candidates = [regex1, regex2];
    const re1 = new RegExp(`^${regex1}$`);
    const re2 = new RegExp(`^${regex2}$`);
    
    let foundA = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      if (result.words[0] === 'a' || result.words[1] === 'a') {
        foundA = true;
        
        // Verify 'a' distinguishes
        assert.strictEqual(re1.test('a'), true);
        assert.strictEqual(re2.test('a'), false);
        break;
      }
    }
    
    assert.ok(
      foundA,
      'Should find "a" as distinguishing word - this tests that increased sampling helps'
    );
  });

  test('Should use set difference strategy for better coverage', async () => {
    // Test with regexes where set difference would be particularly helpful
    const regex1 = '[0-9]{2}'; // 00-99
    const regex2 = '[1-9][0-9]'; // 10-99 (missing 00-09)
    
    const candidates = [regex1, regex2];
    const re1 = new RegExp(`^${regex1}$`);
    const re2 = new RegExp(`^${regex2}$`);
    
    let foundSingleDigitPrefixed = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      // Check if we found any 0X number (00-09)
      for (const word of result.words) {
        if (/^0[0-9]$/.test(word)) {
          foundSingleDigitPrefixed = true;
          
          // Verify it distinguishes
          assert.strictEqual(re1.test(word), true, `${word} should match regex1`);
          assert.strictEqual(re2.test(word), false, `${word} should NOT match regex2`);
          break;
        }
      }
      
      if (foundSingleDigitPrefixed) {
        break;
      }
    }
    
    assert.ok(
      foundSingleDigitPrefixed,
      'Should find a 0X number (00-09) that distinguishes these regexes'
    );
  });

  test('Should handle multiple candidates efficiently', async () => {
    // Test with three candidates to ensure the pairwise strategy works
    const regex1 = '(2000|2004|2008)';
    const regex2 = '(2004|2008|2012)';
    const regex3 = '(2008|2012|2016)';
    
    const candidates = [regex1, regex2, regex3];
    const regexObjects = candidates.map(r => new RegExp(`^${r}$`));
    
    const result = await analyzer.generateTwoDistinguishingWords(candidates);
    
    // Verify the words are different
    assert.notStrictEqual(result.words[0], result.words[1]);
    
    // Verify they have different match patterns across the candidates
    const matches1 = regexObjects.map(re => re.test(result.words[0]));
    const matches2 = regexObjects.map(re => re.test(result.words[1]));
    
    let hasDifference = false;
    for (let i = 0; i < matches1.length; i++) {
      if (matches1[i] !== matches2[i]) {
        hasDifference = true;
        break;
      }
    }
    
    assert.ok(
      hasDifference,
      'The two words should have different match patterns across candidates'
    );
  });
});
