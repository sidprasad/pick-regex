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
    const patterns = ['abc', 'def'];
    controller.setThreshold(2);
    await controller.generateCandidates('test', patterns);
    
    const status = controller.getStatus();
    assert.strictEqual(status.threshold, 2);
    
    // Generate pair and classify
    const pair1 = await controller.generateNextPair();
    
    // If one pattern matches 'abc', reject it
    controller.classifyWord('abc', WordClassification.REJECT);
    controller.classifyWord(pair1.word2, WordClassification.UNSURE);
    controller.clearCurrentPair();
    
    let currentStatus = controller.getStatus();
    const abcCandidate = currentStatus.candidateDetails.find(c => c.pattern === 'abc');
    
    if (abcCandidate) {
      // After first reject
      assert.strictEqual(abcCandidate.negativeVotes, 1);
      assert.strictEqual(abcCandidate.eliminated, false);
      
      // Generate another pair and reject abc again
      const pair2 = await controller.generateNextPair();
      controller.classifyWord('abc', WordClassification.REJECT);
      
      currentStatus = controller.getStatus();
      const abcCandidate2 = currentStatus.candidateDetails.find(c => c.pattern === 'abc');
      
      if (abcCandidate2) {
        // After second reject, should be eliminated (threshold = 2)
        assert.strictEqual(abcCandidate2.negativeVotes, 2);
        assert.strictEqual(abcCandidate2.eliminated, true);
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
});
