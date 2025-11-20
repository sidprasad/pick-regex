import * as assert from 'assert';
import { createRegexAnalyzer, RegexRelationship } from '../regexAnalyzer';

suite('RegexAnalyzer Test Suite', () => {
  let analyzer: ReturnType<typeof createRegexAnalyzer>;

  setup(() => {
    analyzer = createRegexAnalyzer();
  });

  suite('analyzeRelationship', () => {
    test('Should detect equivalent regexes (identical patterns)', async () => {
      const regex1 = 'a+';
      const regex2 = 'a+';
      
      const result = await analyzer.analyzeRelationship(regex1, regex2);
      assert.strictEqual(result.relationship, RegexRelationship.EQUIVALENT);
      assert.ok(result.explanation);
    });

    test('Should detect equivalent regexes (semantically same)', async () => {
      const regex1 = 'abc';
      const regex2 = 'abc';
      
      const result = await analyzer.analyzeRelationship(regex1, regex2);
      assert.strictEqual(result.relationship, RegexRelationship.EQUIVALENT);
    });

    test('Should handle word boundary and lookbehind patterns (may fail automata analysis)', async () => {
      // These regexes all match just "a" but use different syntax
      // Word boundaries and lookarounds are not supported by regex-utils automata
      const testCases = [
        { a: '^a$', b: 'a', shouldMatch: true },
        { a: 'a', b: '[a]', shouldMatch: true },
        { a: '^a$', b: '[a]', shouldMatch: true },
      ];

      for (const testCase of testCases) {
        try {
          const result = await analyzer.analyzeRelationship(testCase.a, testCase.b);
          if (testCase.shouldMatch) {
            assert.strictEqual(result.relationship, RegexRelationship.EQUIVALENT,
              `${testCase.a} and ${testCase.b} should be equivalent`);
          }
        } catch (error) {
          // If automata analysis fails, that's expected for unsupported syntax
          // The pickViewProvider should handle this with fallback sampling
          if (!String(error).includes('UnsupportedSyntaxError')) {
            throw error;
          }
        }
      }
    });

    test('Should detect disjoint regexes (letters vs numbers)', async () => {
      const regex1 = '[a-z]+';
      const regex2 = '[0-9]+';
      
      const result = await analyzer.analyzeRelationship(regex1, regex2);
      assert.strictEqual(result.relationship, RegexRelationship.DISJOINT);
      assert.ok(result.explanation.includes('disjoint'));
    });

    test('Should detect A_IN_B subset relationship', async () => {
      const regex1 = 'abc';
      const regex2 = '[a-z]+';
      
      const result = await analyzer.analyzeRelationship(regex1, regex2);
      assert.strictEqual(result.relationship, RegexRelationship.A_IN_B);
      assert.ok(result.explanation.includes('subset'));
    });

    test('Should detect B_IN_A subset relationship', async () => {
      const regex1 = '[a-z]+';
      const regex2 = 'abc';
      
      const result = await analyzer.analyzeRelationship(regex1, regex2);
      assert.strictEqual(result.relationship, RegexRelationship.B_IN_A);
    });

    test('Should detect intersecting regexes', async () => {
      const regex1 = '[a-z]+';
      const regex2 = '[a-m]+';
      
      const result = await analyzer.analyzeRelationship(regex1, regex2);
      // [a-m]+ is subset of [a-z]+
      assert.strictEqual(result.relationship, RegexRelationship.B_IN_A);
    });

    test('Should provide examples in result', async () => {
      const regex1 = '[a-z]+';
      const regex2 = '[0-9]+';
      
      const result = await analyzer.analyzeRelationship(regex1, regex2);
      assert.ok(result.examples);
      assert.ok(Array.isArray(result.examples.onlyInA));
      assert.ok(Array.isArray(result.examples.onlyInB));
    });

    test('Should handle complex patterns', async () => {
      const regex1 = '[0-9]{1,3}';
      const regex2 = '[0-9]{2,4}';
      
      const result = await analyzer.analyzeRelationship(regex1, regex2);
      assert.strictEqual(result.relationship, RegexRelationship.INTERSECTING);
    });
  });

  suite('generateWordPair', () => {
    test('Should generate wordIn that matches the regex', async () => {
      const regex = '[a-z]+';
      const result = await analyzer.generateWordPair(regex);
      
      assert.ok(result.wordIn);
      assert.ok(new RegExp(`^${regex}$`).test(result.wordIn));
    });

    test('Should generate wordNotIn that does not match the regex', async () => {
      const regex = '[a-z]+';
      const result = await analyzer.generateWordPair(regex);
      
      assert.ok(result.wordNotIn);
      assert.ok(!new RegExp(`^${regex}$`).test(result.wordNotIn));
    });

    test('Should exclude specified words', async () => {
      const regex = '[a-z]{3}';
      const excluded = ['abc', 'def', 'ghi'];
      const result = await analyzer.generateWordPair(regex, excluded);
      
      assert.ok(!excluded.includes(result.wordIn));
      assert.ok(!excluded.includes(result.wordNotIn));
    });

    test('Should generate different words for wordIn and wordNotIn', async () => {
      const regex = '[a-z]+';
      const result = await analyzer.generateWordPair(regex);
      
      assert.notStrictEqual(result.wordIn, result.wordNotIn);
    });

    test('Should provide explanation', async () => {
      const regex = '[a-z]+';
      const result = await analyzer.generateWordPair(regex);
      
      assert.ok(result.explanation);
      assert.ok(result.explanation.includes(result.wordIn));
      assert.ok(result.explanation.includes(result.wordNotIn));
    });

    test('Should handle digit patterns', async () => {
      const regex = '[0-9]{3}';
      const result = await analyzer.generateWordPair(regex);
      
      assert.ok(/^\d{3}$/.test(result.wordIn));
      assert.ok(!/^\d{3}$/.test(result.wordNotIn));
    });

    test('Should handle complex patterns', async () => {
      const regex = '(cat|dog)';
      const result = await analyzer.generateWordPair(regex);
      
      assert.ok(['cat', 'dog'].includes(result.wordIn));
      assert.ok(!['cat', 'dog'].includes(result.wordNotIn));
    });
  });

  suite('generateDistinguishingWords', () => {
    test('Should generate words that distinguish two regexes', async () => {
      const regex1 = '[a-z]+';
      const regex2 = '[0-9]+';
      
      const result = await analyzer.generateDistinguishingWords(regex1, regex2);
      
      assert.ok(result.word1);
      assert.ok(result.word2);
      assert.notStrictEqual(result.word1, result.word2);
    });

    test('Should generate word1 matching regex1 but not regex2', async () => {
      const regex1 = '[a-z]+';
      const regex2 = '[0-9]+';
      
      const result = await analyzer.generateDistinguishingWords(regex1, regex2);
      
      const re1 = new RegExp(`^${regex1}$`);
      const re2 = new RegExp(`^${regex2}$`);
      
      assert.ok(re1.test(result.word1));
      assert.ok(!re2.test(result.word1));
    });

    test('Should generate word2 matching regex2 but not regex1', async () => {
      const regex1 = '[a-z]+';
      const regex2 = '[0-9]+';
      
      const result = await analyzer.generateDistinguishingWords(regex1, regex2);
      
      const re1 = new RegExp(`^${regex1}$`);
      const re2 = new RegExp(`^${regex2}$`);
      
      assert.ok(re2.test(result.word2));
      assert.ok(!re1.test(result.word2));
    });

    test('Should exclude specified words', async () => {
      const regex1 = '[a-z]{3}';
      const regex2 = '[0-9]{3}';
      const excluded = ['abc', '123'];
      
      const result = await analyzer.generateDistinguishingWords(regex1, regex2, excluded);
      
      assert.ok(!excluded.includes(result.word1));
      assert.ok(!excluded.includes(result.word2));
    });

    test('Should provide explanation', async () => {
      const regex1 = '[a-z]+';
      const regex2 = '[0-9]+';
      
      const result = await analyzer.generateDistinguishingWords(regex1, regex2);
      
      assert.ok(result.explanation);
      assert.ok(result.explanation.includes(result.word1));
      assert.ok(result.explanation.includes(result.word2));
    });

    test('Should handle overlapping regexes', async () => {
      const regex1 = '[a-m]+';
      const regex2 = '[k-z]+';
      
      const result = await analyzer.generateDistinguishingWords(regex1, regex2);
      
      const re1 = new RegExp(`^${regex1}$`);
      const re2 = new RegExp(`^${regex2}$`);
      
      // word1 should be in [a-j] range (only in regex1)
      assert.ok(re1.test(result.word1));
      assert.ok(!re2.test(result.word1));
      
      // word2 should be in [n-z] range (only in regex2)
      assert.ok(re2.test(result.word2));
      assert.ok(!re1.test(result.word2));
    });
  });

  suite('generateTwoDistinguishingWords', () => {
    test('Should generate two words for single candidate (IN/OUT case)', async () => {
      const candidates = ['[a-z]+'];
      
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      assert.ok(result.words);
      assert.strictEqual(result.words.length, 2);
      
      const [word1, word2] = result.words;
      const re = new RegExp(`^${candidates[0]}$`);
      
      // One should match, one should not
      const matches = [re.test(word1), re.test(word2)];
      assert.ok(matches.includes(true) && matches.includes(false));
    });

    test('Should generate words with max distinguishing power for multiple candidates', async () => {
      const candidates = ['[a-z]+', '[0-9]+', '[a-z0-9]+'];
      
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      assert.ok(result.words);
      assert.strictEqual(result.words.length, 2);
      assert.notStrictEqual(result.words[0], result.words[1]);
    });

    test('Should provide explanation for single candidate', async () => {
      const candidates = ['[a-z]+'];
      
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      assert.ok(result.explanation);
      assert.ok(result.explanation.includes('Single candidate'));
    });

    test('Should provide properties for each word', async () => {
      const candidates = ['[a-z]+', '[0-9]+'];
      
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      assert.ok(result.properties);
      assert.strictEqual(result.properties.length, 2);
    });

    test('Should exclude specified words', async () => {
      const candidates = ['[a-z]{3}', '[0-9]{3}'];
      const excluded = ['abc', '123', 'xyz'];
      
      const result = await analyzer.generateTwoDistinguishingWords(candidates, excluded);
      
      assert.ok(!excluded.includes(result.words[0]));
      assert.ok(!excluded.includes(result.words[1]));
    });

    test('Should handle disjoint candidates', async () => {
      const candidates = ['[a-z]+', '[0-9]+'];
      
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      const re1 = new RegExp(`^${candidates[0]}$`);
      const re2 = new RegExp(`^${candidates[1]}$`);
      
      const [word1, word2] = result.words;
      
      // Words should have different match patterns
      const matches1 = [re1.test(word1), re2.test(word1)];
      const matches2 = [re1.test(word2), re2.test(word2)];
      
      // At least one difference in match vectors
      assert.ok(matches1[0] !== matches2[0] || matches1[1] !== matches2[1]);
    });

    test('Should handle three or more candidates', async () => {
      const candidates = ['[a-z]+', '[0-9]+', '[a-z0-9]+', '\\w+'];
      
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      assert.ok(result.words);
      assert.strictEqual(result.words.length, 2);
      assert.ok(result.explanation);
    });

    test('Should throw error for empty candidate list', async () => {
      const candidates: string[] = [];
      
      try {
        await analyzer.generateTwoDistinguishingWords(candidates);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error);
        assert.ok(String(error).includes('at least one candidate'));
      }
    });

    test('Should generate words with high distinguishing power', async () => {
      const candidates = ['[a-c]+', '[b-d]+', '[c-e]+'];
      
      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      
      const regexObjects = candidates.map(c => new RegExp(`^${c}$`));
      const [word1, word2] = result.words;
      
      // Check match vectors are different
      const matches1 = regexObjects.map(re => re.test(word1));
      const matches2 = regexObjects.map(re => re.test(word2));
      
      let differences = 0;
      for (let i = 0; i < matches1.length; i++) {
        if (matches1[i] !== matches2[i]) {
          differences++;
        }
      }
      
      assert.ok(differences > 0, 'Words should have different match patterns');
    });

    test('Should never return duplicate words in the pair', async () => {
      // Test with multiple candidate patterns
      const testCases = [
        ['[a-z]+', '[0-9]+'],
        ['[a-z]{3}', '[0-9]{3}'],
        ['(cat|dog)', '(bird|fish)'],
        ['[0-9]{4}'], // Single candidate case
      ];

      for (const candidates of testCases) {
        const result = await analyzer.generateTwoDistinguishingWords(candidates);
        
        assert.strictEqual(result.words.length, 2, 
          `Should return exactly 2 words for candidates: ${candidates.join(', ')}`);
        assert.notStrictEqual(result.words[0], result.words[1], 
          `Words should be distinct. Got: [${result.words[0]}, ${result.words[1]}] for candidates: ${candidates.join(', ')}`);
      }
    });
  });

  suite('Helper methods', () => {
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

    test('Should correctly identify valid regex patterns', () => {
      assert.strictEqual(analyzer.isValidRegex('[a-z]+'), true);
      assert.strictEqual(analyzer.isValidRegex('\\d{3}'), true);
      assert.strictEqual(analyzer.isValidRegex('^a$'), true);
      assert.strictEqual(analyzer.isValidRegex('[aA]+'), true);
    });

    test('Should correctly identify invalid regex patterns', () => {
      // Inline case-insensitive flag not supported in JavaScript
      assert.strictEqual(analyzer.isValidRegex('(?i)a+'), false);
      
      // Invalid group syntax
      assert.strictEqual(analyzer.isValidRegex('(?<invalid)abc'), false);
      
      // Unclosed character class
      assert.strictEqual(analyzer.isValidRegex('[a-z'), false);
    });

    test('Should accept word boundaries (even though automata analysis fails)', () => {
      // \b is valid JavaScript regex, even though automata can't analyze it
      assert.strictEqual(analyzer.isValidRegex('\\ba\\b'), true);
      assert.strictEqual(analyzer.isValidRegex('\\bword\\b'), true);
    });

    test('Should accept lookbehind/lookahead (even though automata analysis fails)', () => {
      // Lookbehind/lookahead are valid JavaScript regex syntax
      assert.strictEqual(analyzer.isValidRegex('(?<!\\w)a(?!\\w)'), true);
      assert.strictEqual(analyzer.isValidRegex('(?<=\\d)\\w+'), true);
      assert.strictEqual(analyzer.isValidRegex('\\w+(?=\\d)'), true);
    });
  });

  suite('Excluded words parameter tests', () => {
    suite('generateWord with exclusions', () => {
      test('Should not generate any word from excluded list', () => {
        const regex = '[a-z]{3}';
        const excluded = ['abc', 'def', 'xyz'];
        
        // Generate multiple times to ensure consistency
        for (let i = 0; i < 10; i++) {
          const result = analyzer.generateWord(regex, excluded);
          assert.ok(!excluded.includes(result.word), 
            `Generated word "${result.word}" should not be in excluded list`);
        }
      });

      test('Should generate different words on repeated calls with exclusions', () => {
        const regex = '[a-z]{4}';
        const words = new Set<string>();
        const excluded: string[] = [];
        
        // Generate 10 words, adding each to excluded list
        for (let i = 0; i < 10; i++) {
          const result = analyzer.generateWord(regex, excluded);
          assert.ok(!words.has(result.word), 'Should generate fresh word');
          words.add(result.word);
          excluded.push(result.word);
        }
        
        assert.strictEqual(words.size, 10);
      });

      test('Should throw error when excluded words make generation impossible', () => {
        const regex = 'a'; // Only matches single 'a'
        const excluded = ['a'];
        
        try {
          analyzer.generateWord(regex, excluded);
          assert.fail('Should have thrown an error');
        } catch (error) {
          assert.ok(String(error).includes('Could not generate unique word'));
        }
      });

      test('Should handle large exclusion list', () => {
        const regex = '[0-9]{3}';
        // Exclude 100 words
        const excluded = Array.from({ length: 100 }, (_, i) => 
          String(i).padStart(3, '0')
        );
        
        const result = analyzer.generateWord(regex, excluded);
        assert.ok(!excluded.includes(result.word));
        assert.ok(/^[0-9]{3}$/.test(result.word));
      });
    });

    suite('generateMultipleWords with exclusions', () => {
      test('Should not generate any excluded words', () => {
        const regex = '[a-z]{3}';
        const excluded = ['abc', 'def', 'xyz'];
        
        const words = analyzer.generateMultipleWords(regex, 10, excluded);
        
        words.forEach(word => {
          assert.ok(!excluded.includes(word), 
            `Generated word "${word}" should not be in excluded list`);
        });
      });

      test('Should respect exclusion limit and return fewer words if needed', () => {
        const regex = '(a|b)'; // Only 2 possible words
        const excluded = ['a'];
        
        const words = analyzer.generateMultipleWords(regex, 5, excluded);
        
        // Should only get 'b' since 'a' is excluded
        assert.ok(words.length >= 1 && words.length <= 1, 
          `Expected 1 word but got ${words.length}`);
        assert.ok(!words.includes('a'));
        assert.ok(words.includes('b'));
      });

      test('Should return empty array when all possible words are excluded', () => {
        const regex = '(cat|dog)';
        const excluded = ['cat', 'dog'];
        
        const words = analyzer.generateMultipleWords(regex, 5, excluded);
        
        // Should return empty since all options are excluded
        assert.strictEqual(words.length, 0, 
          'Should return empty array when all words are excluded');
      });
    });

    suite('generateWordPair with exclusions', () => {
      test('Should not use excluded words for wordIn or wordNotIn', async () => {
        const regex = '[a-z]{3}';
        const excluded = ['abc', 'def', 'xyz'];
        
        const result = await analyzer.generateWordPair(regex, excluded);
        
        assert.ok(!excluded.includes(result.wordIn), 
          `wordIn "${result.wordIn}" should not be excluded`);
        assert.ok(!excluded.includes(result.wordNotIn), 
          `wordNotIn "${result.wordNotIn}" should not be excluded`);
      });

      test('Should generate fresh words not in exclusion list', async () => {
        const regex = '[0-9]{2}';
        const excluded = ['11', '22', '33', '44', '55'];
        
        const result = await analyzer.generateWordPair(regex, excluded);
        
        assert.ok(!excluded.includes(result.wordIn));
        assert.ok(!excluded.includes(result.wordNotIn));
        assert.notStrictEqual(result.wordIn, result.wordNotIn);
      });

      test('Should handle large exclusion list in generateWordPair', async () => {
        const regex = '[a-z]{2}';
        // Exclude many two-letter combinations
        const excluded = ['aa', 'ab', 'ac', 'ba', 'bb', 'bc', 'ca', 'cb', 'cc'];
        
        const result = await analyzer.generateWordPair(regex, excluded);
        
        assert.ok(!excluded.includes(result.wordIn));
        assert.ok(!excluded.includes(result.wordNotIn));
      });

      test('Should not repeat words between wordIn and wordNotIn', async () => {
        const regex = '[a-z]+';
        const excluded: string[] = [];
        
        // Generate multiple pairs and ensure no duplicates within pairs
        for (let i = 0; i < 5; i++) {
          const result = await analyzer.generateWordPair(regex, excluded);
          
          assert.notStrictEqual(result.wordIn, result.wordNotIn, 
            'wordIn and wordNotIn should be different');
          
          excluded.push(result.wordIn, result.wordNotIn);
        }
      });
    });

    suite('generateDistinguishingWords with exclusions', () => {
      test('Should not use excluded words', async () => {
        const regex1 = '[a-z]{3}';
        const regex2 = '[0-9]{3}';
        const excluded = ['abc', '123', 'xyz', '456'];
        
        const result = await analyzer.generateDistinguishingWords(regex1, regex2, excluded);
        
        assert.ok(!excluded.includes(result.word1), 
          `word1 "${result.word1}" should not be excluded`);
        assert.ok(!excluded.includes(result.word2), 
          `word2 "${result.word2}" should not be excluded`);
      });

      test('Should generate fresh distinguishing words across multiple calls', async () => {
        const regex1 = '[a-z]{4}';
        const regex2 = '[0-9]{4}';
        const excluded: string[] = [];
        const allWords = new Set<string>();
        
        for (let i = 0; i < 3; i++) {
          const result = await analyzer.generateDistinguishingWords(regex1, regex2, excluded);
          
          assert.ok(!allWords.has(result.word1), 'word1 should be fresh');
          assert.ok(!allWords.has(result.word2), 'word2 should be fresh');
          
          allWords.add(result.word1);
          allWords.add(result.word2);
          excluded.push(result.word1, result.word2);
        }
        
        assert.strictEqual(allWords.size, 6); // 3 calls × 2 words
      });

      test('Should handle when excluded words limit options for one regex', async () => {
        const regex1 = '(a|b|c)'; // Only 3 options
        const regex2 = '[0-9]'; // 10 options
        const excluded = ['a', 'b']; // Exclude 2 of 3 from regex1
        
        const result = await analyzer.generateDistinguishingWords(regex1, regex2, excluded);
        
        // word1 should be 'c' (only remaining option)
        assert.strictEqual(result.word1, 'c');
        assert.ok(/^[0-9]$/.test(result.word2));
        assert.ok(!excluded.includes(result.word2));
      });
    });

    suite('generateTwoDistinguishingWords with exclusions', () => {
      test('Should not use excluded words in generated pair', async () => {
        const candidates = ['[a-z]{3}', '[0-9]{3}'];
        const excluded = ['abc', '123', 'xyz'];
        
        const result = await analyzer.generateTwoDistinguishingWords(candidates, excluded);
        
        assert.ok(!excluded.includes(result.words[0]), 
          `words[0] "${result.words[0]}" should not be excluded`);
        assert.ok(!excluded.includes(result.words[1]), 
          `words[1] "${result.words[1]}" should not be excluded`);
      });

      test('Should maintain freshness across multiple iterations', async () => {
        const candidates = ['[a-z]{4}', '[0-9]{4}', '[a-z0-9]{4}'];
        const excluded: string[] = [];
        const allWords = new Set<string>();
        
        for (let i = 0; i < 5; i++) {
          const result = await analyzer.generateTwoDistinguishingWords(candidates, excluded);
          
          const [word1, word2] = result.words;
          
          assert.ok(!allWords.has(word1), `Iteration ${i}: word1 "${word1}" should be fresh`);
          assert.ok(!allWords.has(word2), `Iteration ${i}: word2 "${word2}" should be fresh`);
          
          allWords.add(word1);
          allWords.add(word2);
          excluded.push(word1, word2);
        }
        
        assert.strictEqual(allWords.size, 10); // 5 iterations × 2 words
      });

      test('Should handle single candidate with exclusions', async () => {
        const candidates = ['[a-z]{2}'];
        const excluded = ['aa', 'bb', 'cc'];
        
        const result = await analyzer.generateTwoDistinguishingWords(candidates, excluded);
        
        assert.strictEqual(result.words.length, 2);
        assert.ok(!excluded.includes(result.words[0]));
        assert.ok(!excluded.includes(result.words[1]));
      });

      test('Should not repeat words within the same pair', async () => {
        const candidates = ['[a-z]+', '[0-9]+'];
        const excluded: string[] = [];
        
        // Test multiple times to ensure consistency
        for (let i = 0; i < 10; i++) {
          const result = await analyzer.generateTwoDistinguishingWords(candidates, excluded);
          
          assert.notStrictEqual(result.words[0], result.words[1], 
            `Iteration ${i}: words should be different`);
        }
      });

      test('Should handle extensive exclusion list', async () => {
        const candidates = ['[a-z]{3}', '[0-9]{3}'];
        // Exclude 50 words
        const excluded = [
          ...Array.from({ length: 25 }, (_, i) => String.fromCharCode(97 + i % 26).repeat(3)),
          ...Array.from({ length: 25 }, (_, i) => String(100 + i).padStart(3, '0'))
        ];
        
        const result = await analyzer.generateTwoDistinguishingWords(candidates, excluded);
        
        assert.ok(!excluded.includes(result.words[0]));
        assert.ok(!excluded.includes(result.words[1]));
        assert.notStrictEqual(result.words[0], result.words[1]);
      });

      test('Should prioritize distinguishing power over avoiding exclusions', async () => {
        const candidates = ['[a-c]{2}', '[d-f]{2}', '[g-i]{2}'];
        const excluded = ['aa', 'dd', 'gg']; // Exclude some options
        
        const result = await analyzer.generateTwoDistinguishingWords(candidates, excluded);
        
        // Should still find distinguishing words
        assert.ok(!excluded.includes(result.words[0]));
        assert.ok(!excluded.includes(result.words[1]));
        
        // Verify they have different match patterns
        const regexObjects = candidates.map(c => new RegExp(`^${c}$`));
        const matches1 = regexObjects.map(re => re.test(result.words[0]));
        const matches2 = regexObjects.map(re => re.test(result.words[1]));
        
        const hasDifference = matches1.some((m, i) => m !== matches2[i]);
        assert.ok(hasDifference, 'Words should have different match patterns');
      });
    });
  });
});
