import * as assert from 'assert';
import { PickController, PickState, WordClassification } from '../pickController';

suite('PickController Test Suite', () => {
  let controller: PickController;

  setup(() => {
    controller = new PickController();
  });

  test('Initial state should be INITIAL', () => {
    assert.strictEqual(controller.getState(), PickState.INITIAL);
  });

  test('Should initialize candidates correctly', async () => {
    const patterns = ['[a-z]+', '[0-9]+', '[a-zA-Z0-9]+'];
    await controller.generateCandidates('test prompt', patterns);
    
    assert.strictEqual(controller.getState(), PickState.VOTING);
    assert.strictEqual(controller.getActiveCandidateCount(), 3);
    
    const status = controller.getStatus();
    assert.strictEqual(status.totalCandidates, 3);
    assert.strictEqual(status.activeCandidates, 3);
  });

  test('Should track word classifications', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    await controller.generateCandidates('test', patterns);
    
    const pair = await controller.generateNextPair();
    
    // Classify first word as ACCEPT
    controller.classifyWord(pair.word1, WordClassification.ACCEPT);
    
    let history = controller.getWordHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].word, pair.word1);
    assert.strictEqual(history[0].classification, WordClassification.ACCEPT);
    
    // Classify second word as REJECT
    controller.classifyWord(pair.word2, WordClassification.REJECT);
    
    history = controller.getWordHistory();
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[1].word, pair.word2);
    assert.strictEqual(history[1].classification, WordClassification.REJECT);
  });

  test('Should handle UNSURE classification without affecting votes', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    await controller.generateCandidates('test', patterns);
    
    const pair = await controller.generateNextPair();
    
    // Classify both as UNSURE
    controller.classifyWord(pair.word1, WordClassification.UNSURE);
    controller.classifyWord(pair.word2, WordClassification.UNSURE);
    
    const status = controller.getStatus();
    
    // All candidates should still be active
    assert.strictEqual(status.activeCandidates, 2);
    
    // No votes should have been cast
    status.candidateDetails.forEach(c => {
      assert.strictEqual(c.positiveVotes, 0);
      assert.strictEqual(c.negativeVotes, 0);
    });
  });

  test('Should update classification when changed', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    await controller.generateCandidates('test', patterns);
    
    const pair = await controller.generateNextPair();
    
    // Initially classify as ACCEPT
    controller.classifyWord(pair.word1, WordClassification.ACCEPT);
    
    let history = controller.getWordHistory();
    assert.strictEqual(history[0].classification, WordClassification.ACCEPT);
    
    // Update to REJECT
    controller.updateClassification(0, WordClassification.REJECT);
    
    history = controller.getWordHistory();
    assert.strictEqual(history[0].classification, WordClassification.REJECT);
  });

  test('Should check if both words are classified', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    await controller.generateCandidates('test', patterns);
    
    const pair = await controller.generateNextPair();
    
    assert.strictEqual(controller.areBothWordsClassified(), false);
    
    controller.classifyWord(pair.word1, WordClassification.ACCEPT);
    assert.strictEqual(controller.areBothWordsClassified(), false);
    
    controller.classifyWord(pair.word2, WordClassification.REJECT);
    assert.strictEqual(controller.areBothWordsClassified(), true);
  });

  test('Should reset controller state', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    await controller.generateCandidates('test', patterns);
    
    const pair = await controller.generateNextPair();
    controller.classifyWord(pair.word1, WordClassification.ACCEPT);
    
    controller.reset();
    
    assert.strictEqual(controller.getState(), PickState.INITIAL);
    assert.strictEqual(controller.getActiveCandidateCount(), 0);
    assert.strictEqual(controller.getWordHistory().length, 0);
  });

  test('Should respect threshold for elimination', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    controller.setThreshold(2);
    await controller.generateCandidates('test', patterns);
    
    const status = controller.getStatus();
    assert.strictEqual(status.threshold, 2);
    
    // Generate pair and classify to give negative votes
    const pair1 = await controller.generateNextPair();
    
    // Classify word1 as reject (gives negative votes to patterns matching word1)
    controller.classifyWord(pair1.word1, WordClassification.REJECT);
    controller.classifyWord(pair1.word2, WordClassification.UNSURE);
    controller.clearCurrentPair();
    
    let currentStatus = controller.getStatus();
    
    // Find which candidate got negative votes
    const candidateWithVote = currentStatus.candidateDetails.find(c => c.negativeVotes > 0);
    
    if (candidateWithVote) {
      assert.strictEqual(candidateWithVote.negativeVotes, 1);
      assert.strictEqual(candidateWithVote.eliminated, false);
      
      // Generate another pair and reject the same type of word again
      const pair2 = await controller.generateNextPair();
      
      // Determine which word in pair2 would match the same pattern
      const matchesCandidate1 = new RegExp(`^${candidateWithVote.pattern}$`).test(pair2.word1);
      const wordToReject = matchesCandidate1 ? pair2.word1 : pair2.word2;
      
      controller.classifyWord(wordToReject, WordClassification.REJECT);
      
      currentStatus = controller.getStatus();
      const updatedCandidate = currentStatus.candidateDetails.find(c => c.pattern === candidateWithVote.pattern);
      
      if (updatedCandidate) {
        // After second reject, should be eliminated (threshold = 2)
        assert.strictEqual(updatedCandidate.negativeVotes, 2);
        assert.strictEqual(updatedCandidate.eliminated, true);
      }
    }
  });

  test('Should get and set threshold', () => {
    assert.strictEqual(controller.getThreshold(), 2); // default
    
    controller.setThreshold(3);
    assert.strictEqual(controller.getThreshold(), 3);
    
    controller.setThreshold(0); // should be clamped to minimum 1
    assert.strictEqual(controller.getThreshold(), 1);
  });

  test('Should handle single candidate from start', async () => {
    const patterns = ['[a-z]+'];
    await controller.generateCandidates('test', patterns);
    
    assert.strictEqual(controller.getState(), PickState.VOTING);
    assert.strictEqual(controller.getActiveCandidateCount(), 1);
    
    // When single candidate with no votes, checkFinalState should transition to FINAL_RESULT
    const status = controller.getStatus();
    assert.strictEqual(status.activeCandidates, 1);
  });

  test('Should handle empty candidates array', async () => {
    const patterns: string[] = [];
    await controller.generateCandidates('test', patterns);
    
    assert.strictEqual(controller.getState(), PickState.VOTING);
    assert.strictEqual(controller.getActiveCandidateCount(), 0);
  });

  test('Should preserve current prompt', async () => {
    const prompt = 'test prompt';
    const patterns = ['[a-z]+', '[0-9]+'];
    await controller.generateCandidates(prompt, patterns);
    
    assert.strictEqual(controller.getCurrentPrompt(), prompt);
  });

  test('Should refine candidates while preserving classifications', async () => {
    // Initial setup
    const patterns = ['[a-z]+', '[0-9]+'];
    await controller.generateCandidates('initial prompt', patterns);
    
    // Generate pair and classify
    const pair = await controller.generateNextPair();
    controller.classifyWord(pair.word1, WordClassification.ACCEPT);
    controller.classifyWord(pair.word2, WordClassification.REJECT);
    
    const historyBefore = controller.getWordHistory();
    assert.strictEqual(historyBefore.length, 2);
    
    // Refine with new candidates
    const newPatterns = ['[a-z]{3}', '[0-9]{2}'];
    await controller.refineCandidates('refined prompt', newPatterns);
    
    // Classifications should be preserved
    const historyAfter = controller.getWordHistory();
    assert.strictEqual(historyAfter.length, 2);
    assert.strictEqual(historyAfter[0].word, historyBefore[0].word);
    assert.strictEqual(historyAfter[0].classification, historyBefore[0].classification);
    
    // Prompt should be updated
    assert.strictEqual(controller.getCurrentPrompt(), 'refined prompt');
    
    // New candidates should be initialized
    assert.strictEqual(controller.getActiveCandidateCount(), 2);
    const status = controller.getStatus();
    assert.strictEqual(status.candidateDetails.some(c => c.pattern === '[a-z]{3}'), true);
  });

  test('Should apply preserved classifications to new candidates during refinement', async () => {
    // Setup initial candidates and classify a word
    const patterns = ['[a-z]+', '[0-9]+'];
    await controller.generateCandidates('initial', patterns);
    
    // Generate pair and classify
    const pair = await controller.generateNextPair();
    
    // Classify word1 as ACCEPT
    controller.classifyWord(pair.word1, WordClassification.ACCEPT);
    controller.classifyWord(pair.word2, WordClassification.UNSURE);
    controller.clearCurrentPair();
    
    const historyBefore = controller.getWordHistory();
    const acceptedWord = historyBefore[0].word;
    
    // Refine with new patterns
    const newPatterns = ['[a-z]{3}', '[0-9]{3}'];
    await controller.refineCandidates('refined', newPatterns);
    
    // Check if votes were applied to new candidates
    const status = controller.getStatus();
    
    // Find which new candidate matches the accepted word
    const matchingCandidate = status.candidateDetails.find(c => 
      new RegExp(`^${c.pattern}$`).test(acceptedWord)
    );
    
    // The accepted word should give positive votes to matching new candidates
    if (matchingCandidate) {
      assert.ok(matchingCandidate.positiveVotes > 0, 'Preserved classification should apply positive votes');
    }
  });

  test('Should reset with preserveClassifications flag', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    await controller.generateCandidates('test', patterns);
    
    const pair = await controller.generateNextPair();
    controller.classifyWord(pair.word1, WordClassification.ACCEPT);
    
    const historyBefore = controller.getWordHistory();
    const usedWordsBefore = controller.getStatus().usedWords;
    
    // Reset preserving classifications
    controller.reset(true);
    
    assert.strictEqual(controller.getState(), PickState.INITIAL);
    assert.strictEqual(controller.getActiveCandidateCount(), 0);
    
    // Word history should be preserved
    const historyAfter = controller.getWordHistory();
    assert.strictEqual(historyAfter.length, historyBefore.length);
    
    // Used words should be preserved
    const usedWordsAfter = controller.getStatus().usedWords;
    assert.strictEqual(usedWordsAfter, usedWordsBefore);
  });

  test('Should reset without preserving classifications', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    await controller.generateCandidates('test', patterns);
    
    const pair = await controller.generateNextPair();
    controller.classifyWord(pair.word1, WordClassification.ACCEPT);
    
    // Reset without preserving
    controller.reset(false);
    
    assert.strictEqual(controller.getState(), PickState.INITIAL);
    assert.strictEqual(controller.getActiveCandidateCount(), 0);
    assert.strictEqual(controller.getWordHistory().length, 0);
    assert.strictEqual(controller.getStatus().usedWords, 0);
    assert.strictEqual(controller.getCurrentPrompt(), '');
  });

  test('Should get session data', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    const prompt = 'test prompt';
    await controller.generateCandidates(prompt, patterns);
    
    const pair = await controller.generateNextPair();
    controller.classifyWord(pair.word1, WordClassification.ACCEPT);
    
    const sessionData = controller.getSessionData();
    
    assert.strictEqual(sessionData.currentPrompt, prompt);
    assert.strictEqual(sessionData.threshold, controller.getThreshold());
    assert.strictEqual(sessionData.wordHistory.length, 1);
    assert.strictEqual(sessionData.usedWords.length > 0, true);
  });
});
