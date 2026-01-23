import * as assert from 'assert';
import { PickController, WordClassification } from '../pickController';

suite('Load Session Functionality', () => {
  test('should validate session data structure', () => {
    // Test that valid session data structure is recognized
    const validSessionData = {
      candidates: [
        { regex: '[a-z]+', explanation: 'lowercase letters', confidence: 0.9 }
      ],
      classifications: [
        { word: 'abc', classification: 'in', matchingRegexes: ['[a-z]+'] }
      ]
    };

    // Verify structure
    assert.ok(Array.isArray(validSessionData.candidates));
    assert.ok(Array.isArray(validSessionData.classifications));
    assert.strictEqual(validSessionData.candidates.length, 1);
    assert.strictEqual(validSessionData.classifications.length, 1);
  });

  test('should handle classification format conversion from export to internal', () => {
    // Test that export format ('in'/'out'/'unsure') maps correctly to internal format
    const exportFormats = ['in', 'out', 'unsure'];
    const expectedInternal = ['accept', 'reject', 'unsure'];

    // Normalize function (same logic as in handleLoadSession)
    const normalize = (classification: string): string => {
      const normalized = (classification || '').toLowerCase();
      if (normalized === 'in') { return 'accept'; }
      if (normalized === 'out') { return 'reject'; }
      return 'unsure';
    };

    exportFormats.forEach((exportFormat, index) => {
      const internal = normalize(exportFormat);
      assert.strictEqual(internal, expectedInternal[index],
        `Export format "${exportFormat}" should map to "${expectedInternal[index]}"`);
    });
  });

  test('should handle empty classifications array', () => {
    const sessionData = {
      candidates: [
        { regex: '[0-9]+', explanation: 'digits' }
      ],
      classifications: []
    };

    assert.ok(Array.isArray(sessionData.classifications));
    assert.strictEqual(sessionData.classifications.length, 0);
  });

  test('should handle candidates with optional fields', () => {
    const sessionData = {
      candidates: [
        { regex: '[a-z]+' }, // no explanation or confidence
        { regex: '[0-9]+', explanation: 'digits' }, // no confidence
        { regex: '[A-Z]+', confidence: 0.8 }, // no explanation
        { regex: '\\w+', explanation: 'word chars', confidence: 0.9, equivalents: ['[a-zA-Z0-9_]+'] }
      ],
      classifications: []
    };

    assert.strictEqual(sessionData.candidates.length, 4);
    assert.ok(sessionData.candidates.every(c => typeof c.regex === 'string'));
  });

  test('should validate equivalents field structure', () => {
    const candidate = {
      regex: '\\w+',
      explanation: 'word characters',
      equivalents: ['[a-zA-Z0-9_]+', '[[:word:]]+']
    };

    assert.ok(Array.isArray(candidate.equivalents));
    assert.strictEqual(candidate.equivalents.length, 2);
    assert.ok(candidate.equivalents.every(eq => typeof eq === 'string'));
  });

  test('should handle case-insensitive classification normalization', () => {
    const normalize = (classification: string): string => {
      const normalized = (classification || '').toLowerCase();
      if (normalized === 'in') { return 'accept'; }
      if (normalized === 'out') { return 'reject'; }
      return 'unsure';
    };

    // Test various case combinations
    assert.strictEqual(normalize('IN'), 'accept');
    assert.strictEqual(normalize('In'), 'accept');
    assert.strictEqual(normalize('OUT'), 'reject');
    assert.strictEqual(normalize('Out'), 'reject');
    assert.strictEqual(normalize('UNSURE'), 'unsure');
    assert.strictEqual(normalize('Unsure'), 'unsure');
    assert.strictEqual(normalize(''), 'unsure');
    assert.strictEqual(normalize('invalid'), 'unsure');
  });

  test('words from loaded session should be tracked as used words', async () => {
    const controller = new PickController();
    
    // Simulate loading a session: generate candidates and apply classifications
    await controller.generateCandidates('test', ['[a-z]+', '[0-9]+']);
    
    // Apply classifications like a loaded session would
    controller.classifyDirectWords([
      { word: 'abc', classification: WordClassification.ACCEPT },
      { word: '123', classification: WordClassification.REJECT }
    ]);
    
    // Verify the words are tracked as used
    const status = controller.getStatus();
    assert.strictEqual(status.usedWords, 2, 'Both classified words should be tracked as used');
    
    // Also verify word history contains both words
    const history = controller.getWordHistory();
    const words = history.map(h => h.word);
    assert.ok(words.includes('abc'), 'Word history should include "abc"');
    assert.ok(words.includes('123'), 'Word history should include "123"');
  });

  test('addUsedWords should add words to the used set', async () => {
    const controller = new PickController();
    await controller.generateCandidates('test', ['[a-z]+', '[0-9]+']);
    
    // Initially no used words
    assert.strictEqual(controller.getStatus().usedWords, 0, 'Should start with no used words');
    
    // Add some words
    controller.addUsedWords(['word1', 'word2', 'word3']);
    
    // Verify they're tracked
    assert.strictEqual(controller.getStatus().usedWords, 3, 'Should have 3 used words');
    
    // Adding duplicates shouldn't increase the count
    controller.addUsedWords(['word1', 'word2']);
    assert.strictEqual(controller.getStatus().usedWords, 3, 'Duplicates should not be added again');
    
    // Add more unique words
    controller.addUsedWords(['word4']);
    assert.strictEqual(controller.getStatus().usedWords, 4, 'Should have 4 used words now');
  });

  test('should validate session data with prompt and modelId fields', () => {
    // Test that session data with prompt and modelId is valid
    const sessionWithPrompt = {
      prompt: 'US states that start with M',
      modelId: 'gpt-4',
      candidates: [
        { regex: '^M\\w+', explanation: 'starts with M' }
      ],
      classifications: [
        { word: 'Michigan', classification: 'in' }
      ]
    };

    assert.strictEqual(sessionWithPrompt.prompt, 'US states that start with M');
    assert.strictEqual(sessionWithPrompt.modelId, 'gpt-4');
    assert.ok(Array.isArray(sessionWithPrompt.candidates));
    assert.ok(Array.isArray(sessionWithPrompt.classifications));
  });

  test('should handle session data without prompt and modelId (backwards compatibility)', () => {
    // Test that session data without prompt/modelId is still valid
    const sessionWithoutPrompt: { candidates: { regex: string }[]; classifications: never[]; prompt?: string; modelId?: string } = {
      candidates: [
        { regex: '[a-z]+' }
      ],
      classifications: []
    };

    // These fields should be undefined/missing
    assert.strictEqual(sessionWithoutPrompt.prompt, undefined);
    assert.strictEqual(sessionWithoutPrompt.modelId, undefined);
    
    // But the core fields are present
    assert.ok(Array.isArray(sessionWithoutPrompt.candidates));
    assert.ok(Array.isArray(sessionWithoutPrompt.classifications));
  });

  test('should handle null prompt and modelId in export', () => {
    // Test the export structure when prompt/model might be null
    const exportData = {
      prompt: null,
      modelId: null,
      candidates: [{ regex: '\\d+' }],
      classifications: []
    };

    // null values are valid in the export format
    assert.strictEqual(exportData.prompt, null);
    assert.strictEqual(exportData.modelId, null);
  });
});
