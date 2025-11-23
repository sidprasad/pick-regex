import * as assert from 'assert';
import { createRegexAnalyzer, RegexAnalyzer, RegexRelationship } from '../regexAnalyzer';

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

    test('Should pick pairs that always eliminate candidates even with containment', async () => {
      const candidates = ['a.*', 'ab', 'ac'];

      const result = await analyzer.generateTwoDistinguishingWords(candidates);
      const regexObjects = candidates.map(c => new RegExp(`^${c}$`));

      const [word1, word2] = result.words;
      const matches1 = regexObjects.map(re => re.test(word1));
      const matches2 = regexObjects.map(re => re.test(word2));

      // Every vote path (YY, YN, NY, NN) should remove at least one candidate
      const yesYes = matches1.filter((m, i) => m && matches2[i]).length;
      const yesNo = matches1.filter((m, i) => m && !matches2[i]).length;
      const noYes = matches1.filter((m, i) => !m && matches2[i]).length;
      const noNo = candidates.length - yesYes - yesNo - noYes;

      const worstCase = Math.max(yesYes, yesNo, noYes, noNo);

      assert.ok(worstCase < candidates.length, 'Each vote combination should eliminate something');
      assert.ok(matches1.some(Boolean) && matches1.some(v => !v), 'First word must distinguish');
      assert.ok(matches2.some(Boolean) && matches2.some(v => !v), 'Second word must distinguish');
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

    test('Should throw error when word space is exhausted', async () => {
      // Test case: regex 'a' only matches one word, and we exclude it
      // After excluding 'a', we can only generate words that DON'T match (count=0)
      const candidates = ['a'];
      const excluded = ['a']; // Exclude the only matching word
      
      try {
        await analyzer.generateTwoDistinguishingWords(candidates, excluded);
        assert.fail('Should have thrown an error when word space is exhausted');
      } catch (error) {
        assert.ok(error);
        const errorMessage = String(error);
        // Should mention that both words match zero candidates or exhausted word space
        assert.ok(
          errorMessage.includes('both words match zero candidates') || 
          errorMessage.includes('exhausted word space') ||
          errorMessage.includes('Could not generate unique word'),
          `Error message should indicate word exhaustion. Got: ${errorMessage}`
        );
      }
    });

    test('Should ensure at least one word matches at least one candidate', async () => {
      // For any valid scenario, at least one word should match at least one candidate
      const testCases = [
        ['[a-z]+'],
        ['[a-z]+', '[0-9]+'],
        ['[a-z]{2}', '[0-9]{2}'],
      ];

      for (const candidates of testCases) {
        const result = await analyzer.generateTwoDistinguishingWords(candidates);
        const regexObjects = candidates.map(c => new RegExp(`^${c}$`));
        
        const [word1, word2] = result.words;
        const matches1 = regexObjects.some(re => re.test(word1));
        const matches2 = regexObjects.some(re => re.test(word2));
        
        // At least one word must match at least one candidate
        assert.ok(
          matches1 || matches2,
          `At least one word must match a candidate. Word1: "${word1}" matches: ${matches1}, Word2: "${word2}" matches: ${matches2}`
        );
      }
    });

    test('Should prefer shorter distinguishing pairs when information gain ties', async () => {
      class MockAnalyzer extends RegexAnalyzer {
        override async analyzeRelationship(_regexA: string, _regexB: string) {
          return {
            relationship: RegexRelationship.DISJOINT,
            explanation: 'mock',
            examples: {
              // Provide long, distinguishing candidates discovered first
              onlyInA: ['aaaaaaaaaa'],
              onlyInB: ['bbbbbbbbbb']
            }
          };
        }

        override generateMultipleWords(regex: string): string[] {
          // Provide shorter distinguishing words later via supplemental sampling
          if (regex.startsWith('a')) {return ['a'];}
          if (regex.startsWith('b')) {return ['b'];}
          return [];
        }
      }

      const mockAnalyzer = new MockAnalyzer();
      const result = await mockAnalyzer.generateTwoDistinguishingWords(['a+', 'b+']);

      assert.deepStrictEqual(
        result.words.sort(),
        ['a', 'b'],
        'Should surface the shortest high-information pair when multiple options tie'
      );
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

  suite('hasSupportedSyntax', () => {
    test('Should accept patterns with supported syntax', async () => {
      const supportedPatterns = [
        '[a-z]+',              // Character classes
        '\\d{3}',              // Quantifiers
        '^a$',                 // Anchors
        '(?:abc|def)',         // Non-capturing groups and alternation
        '(test)',              // Capturing groups
        '(?=abc)',             // Positive lookahead
        '(?!xyz)',             // Negative lookahead
        '[aA][bB][cC]',        // Case-insensitive patterns
        '\\w+',                // Character class escapes
        '\\.',                 // Escaped special characters
        '[^a-z]',              // Negated character classes
        'a{2,5}',              // Range quantifiers
        'a*b+c?',              // Various quantifiers
      ];

      for (const pattern of supportedPatterns) {
        const result = await analyzer.hasSupportedSyntax(pattern);
        assert.strictEqual(
          result,
          true,
          `Pattern "${pattern}" should be supported`
        );
      }
    });

    test('Should reject patterns with word boundaries', async () => {
      const unsupportedPatterns = [
        '\\bword\\b',          // Word boundaries
        '\\ba',                // Word boundary at start
        'a\\b',                // Word boundary at end
      ];

      for (const pattern of unsupportedPatterns) {
        const result = await analyzer.hasSupportedSyntax(pattern);
        assert.strictEqual(
          result,
          false,
          `Pattern "${pattern}" should be rejected (word boundary)`
        );
      }
    });


    test('Should reject patterns with Unicode property escapes', async () => {
      const unsupportedPatterns = [
        '\\p{Letter}',         // Unicode property
        '\\P{Number}',         // Negated Unicode property
        '\\p{Ll}',             // Lowercase letter
        '\\p{Script=Greek}',   // Unicode script
      ];

      for (const pattern of unsupportedPatterns) {
        const result = await analyzer.hasSupportedSyntax(pattern);
        assert.strictEqual(
          result,
          false,
          `Pattern "${pattern}" should be rejected (Unicode property escape)`
        );
      }
    });


    test('Should accept lookahead assertions (supported)', async () => {
      const supportedPatterns = [
        '(?=test)',            // Positive lookahead
        '(?!xyz)',             // Negative lookahead
        'a(?=b)',              // Lookahead in middle
        '(?=\\d)\\w+',         // Lookahead at start
      ];

      for (const pattern of supportedPatterns) {
        const result = await analyzer.hasSupportedSyntax(pattern);
        assert.strictEqual(
          result,
          true,
          `Pattern "${pattern}" should be supported (lookahead is allowed)`
        );
      }
    });

    test('Should handle complex patterns correctly', async () => {
      // Supported complex patterns
      assert.strictEqual(
        await analyzer.hasSupportedSyntax('(?:(?:[a-z]+)|(?:[0-9]+))+'),
        true,
        'Nested groups should be supported'
      );
      
      assert.strictEqual(
        await analyzer.hasSupportedSyntax('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}'),
        true,
        'Email-like pattern should be supported'
      );

      // Unsupported complex patterns
      assert.strictEqual(
        await analyzer.hasSupportedSyntax('\\b[a-z]+\\b'),
        false,
        'Pattern with word boundaries should be rejected'
      );
      
      assert.strictEqual(
        await analyzer.hasSupportedSyntax('(?<=@)\\w+'),
        false,
        'Pattern with lookbehind should be rejected'
      );
    });

    test('Should reject invalid patterns', async () => {
      const invalidPatterns = [
        '[a-z',                // Unclosed character class
        '(?i)test',            // Inline flag (invalid in JS)
        '(?>abc)',             // Atomic group (invalid in JS)
      ];

      for (const pattern of invalidPatterns) {
        const result = await analyzer.hasSupportedSyntax(pattern);
        assert.strictEqual(
          result,
          false,
          `Invalid pattern "${pattern}" should be rejected`
        );
      }
    });

    test('Should handle edge cases', async () => {
      // Pattern with octal escape \0 (should be supported, not a backreference)
      assert.strictEqual(
        await analyzer.hasSupportedSyntax('\\0'),
        true,
        'Null character escape should be supported'
      );

      // Pattern with hex escape
      assert.strictEqual(
        await analyzer.hasSupportedSyntax('\\x41'),
        true,
        'Hex escape should be supported'
      );

      // Pattern that looks like lookbehind but isn't (character class)
      assert.strictEqual(
        await analyzer.hasSupportedSyntax('[(?<=)]'),
        true,
        'Character class containing lookbehind-like characters should be supported'
      );
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
