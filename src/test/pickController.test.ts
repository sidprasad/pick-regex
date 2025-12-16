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

  test('Should surface LLM-suggested edge cases before analyzer pairs', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    const suggestedWords = ['Alpha', '123', 'edge-case', 'another edge'];

    controller.setMaxSuggestedEdgeCases(4);

    await controller.generateCandidates('test prompt', patterns, new Map(), undefined, suggestedWords);

    const firstPair = await controller.generateNextPair();
    assert.deepStrictEqual([firstPair.word1, firstPair.word2], ['Alpha', '123']);

    const secondPair = await controller.generateNextPair();
    assert.deepStrictEqual([secondPair.word1, secondPair.word2], ['edge-case', 'another edge']);
  });

  test('Should limit LLM-suggested edge cases to configured even count', async () => {
    const patterns = ['[a-z]+', '[0-9]+'];
    const suggestedWords = ['one', 'two', 'three', 'four', 'five'];

    controller.setMaxSuggestedEdgeCases(3);

    await controller.generateCandidates('test prompt', patterns, new Map(), undefined, suggestedWords);

    const queueLength = (controller as any).suggestedWordsQueue.length;
    assert.strictEqual(queueLength, 2);

    const pair = await controller.generateNextPair();
    assert.deepStrictEqual([pair.word1, pair.word2], ['one', 'two']);
  });

  test('Should skip non-distinguishing LLM edge cases', async () => {
    const patterns = ['\\d+', '\\d{2,}'];
    const suggestedWords = ['123', '456'];

    await controller.generateCandidates('test prompt', patterns, new Map(), undefined, suggestedWords);

    const pair = await controller.generateNextPair();

    const matches1 = patterns.map(pattern => new RegExp(`^${pattern}$`).test(pair.word1));
    const matches2 = patterns.map(pattern => new RegExp(`^${pattern}$`).test(pair.word2));

    const distinguishes = (matches: boolean[]) => matches.some(match => match !== matches[0]);

    assert.ok(
      distinguishes(matches1) || distinguishes(matches2),
      'Returned pair should distinguish between candidates even when LLM suggestions do not'
    );
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
      
      // Determine which word in pair2 would match the same pattern (if any)
      const matches1 = new RegExp(`^${candidateWithVote.pattern}$`).test(pair2.word1);
      const matches2 = new RegExp(`^${candidateWithVote.pattern}$`).test(pair2.word2);
      const wordToReject = matches1 ? pair2.word1 : (matches2 ? pair2.word2 : null);
      
      if (wordToReject) {
        controller.classifyWord(wordToReject, WordClassification.REJECT);
        
        currentStatus = controller.getStatus();
        const updatedCandidate = currentStatus.candidateDetails.find(c => c.pattern === candidateWithVote.pattern);
        
        if (updatedCandidate) {
          // After second reject, should be eliminated (threshold = 2)
          assert.strictEqual(updatedCandidate.negativeVotes, 2);
          assert.strictEqual(updatedCandidate.eliminated, true);
        }
      } else {
        // Skip test if neither word matches the pattern
        console.log('Skipping elimination check - no matching word in pair');
      }
    }
  });

  test('Should lower threshold when candidates barely differ', async () => {
    controller.setThreshold(3);
    await controller.generateCandidates('test', ['a*', 'a+']);

    const status = controller.getStatus();

    assert.strictEqual(status.threshold, 1);
    status.candidateDetails.forEach(candidate => {
      assert.strictEqual(candidate.eliminationThreshold, 1);
    });
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

  suite('Vote mechanics', () => {
    test('Should give positive votes only to matching candidates on ACCEPT', async () => {
      const patterns = ['[a-z]+', '[0-9]+', '[a-zA-Z]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      
      // Find a word that matches only some patterns
      const word = pair.word1;
      controller.classifyWord(word, WordClassification.ACCEPT);
      
      const status = controller.getStatus();
      
      // Check that only matching patterns got positive votes
      status.candidateDetails.forEach(candidate => {
        const matches = new RegExp(`^${candidate.pattern}$`).test(word);
        if (matches) {
          assert.strictEqual(candidate.positiveVotes, 1, 
            `Pattern ${candidate.pattern} should have 1 positive vote for word "${word}"`);
        } else {
          assert.strictEqual(candidate.positiveVotes, 0,
            `Pattern ${candidate.pattern} should have 0 positive votes for word "${word}"`);
        }
      });
    });

    test('Should give negative votes only to matching candidates on REJECT', async () => {
      const patterns = ['[a-z]+', '[0-9]+', '[a-zA-Z]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      
      const word = pair.word1;
      controller.classifyWord(word, WordClassification.REJECT);
      
      const status = controller.getStatus();
      
      // Check that only matching patterns got negative votes
      status.candidateDetails.forEach(candidate => {
        const matches = new RegExp(`^${candidate.pattern}$`).test(word);
        if (matches) {
          assert.strictEqual(candidate.negativeVotes, 1,
            `Pattern ${candidate.pattern} should have 1 negative vote for word "${word}"`);
        } else {
          assert.strictEqual(candidate.negativeVotes, 0,
            `Pattern ${candidate.pattern} should have 0 negative votes for word "${word}"`);
        }
      });
    });

    test('Should not give any votes on UNSURE', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      
      controller.classifyWord(pair.word1, WordClassification.UNSURE);
      
      const status = controller.getStatus();
      
      // No votes should be cast for UNSURE
      status.candidateDetails.forEach(candidate => {
        assert.strictEqual(candidate.positiveVotes, 0);
        assert.strictEqual(candidate.negativeVotes, 0);
      });
    });

    test('Should accumulate votes over multiple classifications', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      // First pair
      const pair1 = await controller.generateNextPair();
      controller.classifyWord(pair1.word1, WordClassification.ACCEPT);
      controller.classifyWord(pair1.word2, WordClassification.REJECT);
      controller.clearCurrentPair();
      
      const statusAfterFirst = controller.getStatus();
      const voteCountAfterFirst = statusAfterFirst.candidateDetails.reduce(
        (sum, c) => sum + c.positiveVotes + c.negativeVotes, 0
      );
      
      // Second pair
      const pair2 = await controller.generateNextPair();
      controller.classifyWord(pair2.word1, WordClassification.ACCEPT);
      controller.classifyWord(pair2.word2, WordClassification.REJECT);
      
      const statusAfterSecond = controller.getStatus();
      const voteCountAfterSecond = statusAfterSecond.candidateDetails.reduce(
        (sum, c) => sum + c.positiveVotes + c.negativeVotes, 0
      );
      
      // Should have more votes after second classification
      assert.ok(voteCountAfterSecond >= voteCountAfterFirst,
        'Vote count should increase with more classifications');
    });

    test('Should eliminate candidate when threshold is reached', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      controller.setThreshold(2);
      await controller.generateCandidates('test', patterns);
      
      let pair = await controller.generateNextPair();
      
      // Get initial status
      const initialStatus = controller.getStatus();
      const initialActive = initialStatus.activeCandidates;
      
      // Reject same type of word twice
      const firstWord = pair.word1;
      controller.classifyWord(firstWord, WordClassification.REJECT);
      
      // Find pattern that matched first word
      const targetPattern = initialStatus.candidateDetails
        .find(c => new RegExp(`^${c.pattern}$`).test(firstWord))?.pattern;
      
      if (targetPattern) {
        // Reject the second word only if it also matches the target pattern
        if (new RegExp(`^${targetPattern}$`).test(pair.word2)) {
          controller.classifyWord(pair.word2, WordClassification.REJECT);
        } else {
          controller.classifyWord(pair.word2, WordClassification.UNSURE);
          controller.clearCurrentPair();
          
          // Generate another pair and find/reject a matching word
          pair = await controller.generateNextPair();
          const matchingWord = new RegExp(`^${targetPattern}$`).test(pair.word1) 
            ? pair.word1 
            : (new RegExp(`^${targetPattern}$`).test(pair.word2) ? pair.word2 : null);
          
          if (matchingWord) {
            controller.classifyWord(matchingWord, WordClassification.REJECT);
          }
        }
        
        const finalStatus = controller.getStatus();
        const eliminatedCandidate = finalStatus.candidateDetails
          .find(c => c.pattern === targetPattern);
        
        if (eliminatedCandidate) {
          assert.strictEqual(eliminatedCandidate.eliminated, true,
            'Candidate should be eliminated after reaching threshold');
          assert.ok(finalStatus.activeCandidates < initialActive,
            'Active candidate count should decrease');
        }
      }
    });

    test('Should update vote counts when classification is changed', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      const word = pair.word1;
      
      // Initially ACCEPT
      controller.classifyWord(word, WordClassification.ACCEPT);
      
      const statusAfterAccept = controller.getStatus();
      const candidateAfterAccept = statusAfterAccept.candidateDetails
        .find(c => new RegExp(`^${c.pattern}$`).test(word));
      
      if (candidateAfterAccept) {
        const positiveVotesAfterAccept = candidateAfterAccept.positiveVotes;
        
        // Change to REJECT
        controller.updateClassification(0, WordClassification.REJECT);
        
        const statusAfterReject = controller.getStatus();
        const candidateAfterReject = statusAfterReject.candidateDetails
          .find(c => c.pattern === candidateAfterAccept.pattern);
        
        if (candidateAfterReject) {
          assert.strictEqual(candidateAfterReject.positiveVotes, 
            positiveVotesAfterAccept - 1,
            'Positive votes should decrease by 1');
          assert.strictEqual(candidateAfterReject.negativeVotes, 1,
            'Negative votes should increase by 1');
        }
      }
    });
  });

  suite('State transitions and edge cases', () => {
    test('Should transition to VOTING state after candidate generation', async () => {
      assert.strictEqual(controller.getState(), PickState.INITIAL);
      
      await controller.generateCandidates('test', ['[a-z]+']);
      
      assert.strictEqual(controller.getState(), PickState.VOTING);
    });

    test('Should maintain VOTING state during classification', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      
      assert.strictEqual(controller.getState(), PickState.VOTING);
      
      controller.classifyWord(pair.word1, WordClassification.ACCEPT);
      
      assert.strictEqual(controller.getState(), PickState.VOTING);
    });

    test('Should handle multiple refinements in sequence', async () => {
      const patterns1 = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('prompt1', patterns1);
      
      const pair1 = await controller.generateNextPair();
      controller.classifyWord(pair1.word1, WordClassification.ACCEPT);
      
      // First refinement
      const patterns2 = ['[a-z]{2}', '[0-9]{2}'];
      await controller.refineCandidates('prompt2', patterns2);
      
      const pair2 = await controller.generateNextPair();
      controller.classifyWord(pair2.word1, WordClassification.REJECT);
      
      // Second refinement
      const patterns3 = ['[a-z]{3}', '[0-9]{3}'];
      await controller.refineCandidates('prompt3', patterns3);
      
      // All classifications should be preserved
      const history = controller.getWordHistory();
      assert.strictEqual(history.length, 2);
      
      // Current prompt should be the latest
      assert.strictEqual(controller.getCurrentPrompt(), 'prompt3');
      
      // Should have new patterns
      const status = controller.getStatus();
      assert.ok(status.candidateDetails.some(c => c.pattern === '[a-z]{3}'));
    });

    test('Should throw error when classifying word not in current pair', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      
      try {
        controller.classifyWord('notinpair', WordClassification.ACCEPT);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(String(error).includes('not in the current pair'));
      }
    });

    test('Should throw error when generating pair with no active candidates', async () => {
      const patterns: string[] = [];
      await controller.generateCandidates('test', patterns);
      
      try {
        await controller.generateNextPair();
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(String(error).includes('No active candidates'));
      }
    });

    test('Should clear current pair correctly', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      
      controller.classifyWord(pair.word1, WordClassification.ACCEPT);
      assert.strictEqual(controller.areBothWordsClassified(), false);
      
      controller.clearCurrentPair();
      
      // After clearing, should not be able to classify old words
      try {
        controller.classifyWord(pair.word1, WordClassification.REJECT);
        assert.fail('Should have thrown error after clearing pair');
      } catch (error) {
        assert.ok(String(error).includes('No current pair'));
      }
    });

    test('Should handle all candidates eliminated scenario', async () => {
      const patterns = ['[a-z]', '[0-9]']; // Single char patterns
      controller.setThreshold(1);
      await controller.generateCandidates('test', patterns);
      
      // Classify enough to potentially eliminate all
      for (let i = 0; i < 3; i++) {
        try {
          const pair = await controller.generateNextPair();
          controller.classifyWord(pair.word1, WordClassification.REJECT);
          controller.classifyWord(pair.word2, WordClassification.REJECT);
          controller.clearCurrentPair();
        } catch (error) {
          // Expected to fail when all candidates eliminated
          break;
        }
      }
      
      const status = controller.getStatus();
      // At least some candidates should be eliminated
      const eliminatedCount = status.candidateDetails.filter(c => c.eliminated).length;
      assert.ok(eliminatedCount > 0, 'Some candidates should be eliminated');
    });

    test('Should preserve word history when all candidates are eliminated', async () => {
      // This test ensures the fix for the bug where words in/out weren't shown
      // when no regex was found after all candidates were eliminated
      const patterns = ['January \\d{1,2}', 'Jan(?:uary)? \\d{1,2}'];
      controller.setThreshold(1);
      await controller.generateCandidates('January birthdays', patterns);
      
      const classifiedWords: string[] = [];
      
      // Classify words to eliminate all candidates
      for (let i = 0; i < 5; i++) {
        try {
          const pair = await controller.generateNextPair();
          
          // Reject both words to eliminate candidates
          controller.classifyWord(pair.word1, WordClassification.REJECT);
          classifiedWords.push(pair.word1);
          
          controller.classifyWord(pair.word2, WordClassification.REJECT);
          classifiedWords.push(pair.word2);
          
          controller.clearCurrentPair();
          
          // Check if all candidates are eliminated
          const status = controller.getStatus();
          if (status.activeCandidates === 0) {
            break;
          }
        } catch (error) {
          // Expected to fail when all candidates eliminated or no more pairs
          break;
        }
      }
      
      // Verify that even though all candidates are eliminated,
      // the word history is still available
      const wordHistory = controller.getWordHistory();
      assert.ok(wordHistory.length > 0, 'Word history should be preserved');
      
      // All words should be marked as REJECT
      const rejectWords = wordHistory.filter(record => record.classification === WordClassification.REJECT);
      assert.strictEqual(rejectWords.length, wordHistory.length, 'All words should be classified as REJECT');
      
      // Verify getFinalRegex returns null (no regex found)
      const finalRegex = controller.getFinalRegex();
      assert.strictEqual(finalRegex, null, 'Final regex should be null when all candidates eliminated');
      
      // Verify state is FINAL_RESULT
      assert.strictEqual(controller.getState(), PickState.FINAL_RESULT, 'State should be FINAL_RESULT');
      
      // Verify all classified words are in the history
      for (const word of classifiedWords) {
        const found = wordHistory.some(record => record.word === word);
        assert.ok(found, `Classified word "${word}" should be in history`);
      }
    });
  });

  suite('Word history and tracking', () => {
    test('Should track timestamps in word history', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      const beforeTimestamp = Date.now();
      
      controller.classifyWord(pair.word1, WordClassification.ACCEPT);
      
      const afterTimestamp = Date.now();
      const history = controller.getWordHistory();
      
      assert.ok(history[0].timestamp >= beforeTimestamp &&
                history[0].timestamp <= afterTimestamp,
                'Timestamp should be within expected range');
    });

    test('Should track matching regexes for each classified word', async () => {
      const patterns = ['[a-z]+', '[0-9]+', '[a-zA-Z]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      const word = pair.word1;
      
      controller.classifyWord(word, WordClassification.ACCEPT);
      
      const history = controller.getWordHistory();
      const record = history[0];
      
      assert.ok(Array.isArray(record.matchingRegexes));
      assert.ok(record.matchingRegexes.length > 0);
      
      // Verify each matching regex actually matches the word
      record.matchingRegexes.forEach(pattern => {
        assert.ok(new RegExp(`^${pattern}$`).test(word),
          `Pattern ${pattern} should match word "${word}"`);
      });
    });

    test('Should not track duplicate words in used words set', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      // Generate multiple pairs
      const usedWords = new Set<string>();
      
      for (let i = 0; i < 3; i++) {
        const pair = await controller.generateNextPair();
        usedWords.add(pair.word1);
        usedWords.add(pair.word2);
        
        controller.classifyWord(pair.word1, WordClassification.UNSURE);
        controller.classifyWord(pair.word2, WordClassification.UNSURE);
        controller.clearCurrentPair();
      }
      
      const status = controller.getStatus();
      
      // All generated words should be tracked
      assert.strictEqual(status.usedWords, usedWords.size);
    });

    test('Should maintain word history order', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const words: string[] = [];
      
      // Classify 3 pairs
      for (let i = 0; i < 3; i++) {
        const pair = await controller.generateNextPair();
        controller.classifyWord(pair.word1, WordClassification.ACCEPT);
        words.push(pair.word1);
        controller.classifyWord(pair.word2, WordClassification.REJECT);
        words.push(pair.word2);
        controller.clearCurrentPair();
      }
      
      const history = controller.getWordHistory();
      
      // History should maintain classification order
      for (let i = 0; i < words.length; i++) {
        assert.strictEqual(history[i].word, words[i],
          `Word at position ${i} should match`);
      }
    });
  });

  suite('Status and reporting', () => {
    test('Should report correct candidate details', async () => {
      const patterns = ['[a-z]+', '[0-9]+', '[a-zA-Z0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const status = controller.getStatus();
      
      assert.strictEqual(status.candidateDetails.length, 3);
      
      status.candidateDetails.forEach((detail, index) => {
        assert.ok(patterns.includes(detail.pattern));
        assert.strictEqual(detail.positiveVotes, 0);
        assert.strictEqual(detail.negativeVotes, 0);
        assert.strictEqual(detail.eliminated, false);
      });
    });

    test('Should report correct counts after eliminations', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      controller.setThreshold(1);
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      controller.classifyWord(pair.word1, WordClassification.REJECT);
      
      const status = controller.getStatus();
      
      assert.strictEqual(status.totalCandidates, 2);
      assert.ok(status.activeCandidates <= 2);
      assert.strictEqual(status.activeCandidates + 
        status.candidateDetails.filter(c => c.eliminated).length,
        status.totalCandidates);
    });

    test('Should include threshold in status', async () => {
      controller.setThreshold(5);
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const status = controller.getStatus();
      
      assert.strictEqual(status.threshold, 5);
    });

    test('Should report used words count correctly', async () => {
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair1 = await controller.generateNextPair();
      controller.classifyWord(pair1.word1, WordClassification.ACCEPT);
      controller.classifyWord(pair1.word2, WordClassification.REJECT);
      controller.clearCurrentPair();
      
      const statusAfter1 = controller.getStatus();
      assert.strictEqual(statusAfter1.usedWords, 2);
      
      const pair2 = await controller.generateNextPair();
      controller.classifyWord(pair2.word1, WordClassification.ACCEPT);
      
      const statusAfter2 = controller.getStatus();
      assert.ok(statusAfter2.usedWords >= 3);
    });
  });

  suite('Implicit voting logic', () => {
    test('ACCEPT should give positive votes to matching and negative to non-matching', async () => {
      // Set up three candidates: letters, numbers, alphanumeric
      const patterns = ['[a-z]+', '[0-9]+', '[a-z0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      // Generate a word that matches only letters (e.g., "abc")
      // Force generate from the first pattern
      const letterWords = await controller['analyzer'].generateMultipleWords('[a-z]+', 1);
      const letterWord = letterWords[0];
      
      // Accept this letter-only word
      const pair = await controller.generateNextPair();
      // Use one of the pair words or inject our test word into history
      controller['currentPair'] = { word1: letterWord, word2: pair.word2 };
      
      controller.classifyWord(letterWord, WordClassification.ACCEPT);
      
      const status = controller.getStatus();
      
      // Find each candidate
      const letterCandidate = status.candidateDetails.find(c => c.pattern === '[a-z]+');
      const numberCandidate = status.candidateDetails.find(c => c.pattern === '[0-9]+');
      const alphanumCandidate = status.candidateDetails.find(c => c.pattern === '[a-z0-9]+');
      
      // Letter pattern should match and get positive vote
      assert.ok(letterCandidate, 'Letter candidate should exist');
      assert.strictEqual(letterCandidate.positiveVotes, 1, 
        'Letter candidate should have 1 positive vote (matched accepted word)');
      assert.strictEqual(letterCandidate.negativeVotes, 0,
        'Letter candidate should have 0 negative votes');
      
      // Number pattern should NOT match and get negative vote (implicit)
      assert.ok(numberCandidate, 'Number candidate should exist');
      assert.strictEqual(numberCandidate.positiveVotes, 0,
        'Number candidate should have 0 positive votes');
      assert.strictEqual(numberCandidate.negativeVotes, 1,
        'Number candidate should have 1 negative vote (failed to match accepted word)');
      
      // Alphanumeric pattern should match and get positive vote
      assert.ok(alphanumCandidate, 'Alphanumeric candidate should exist');
      assert.strictEqual(alphanumCandidate.positiveVotes, 1,
        'Alphanumeric candidate should have 1 positive vote (matched accepted word)');
      assert.strictEqual(alphanumCandidate.negativeVotes, 0,
        'Alphanumeric candidate should have 0 negative votes');
    });

    test('REJECT should give negative votes to matching and positive to non-matching', async () => {
      // Set up three candidates: letters, numbers, alphanumeric
      const patterns = ['[a-z]+', '[0-9]+', '[a-z0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      // Generate a word that matches only letters (e.g., "abc")
      const letterWords = await controller['analyzer'].generateMultipleWords('[a-z]+', 1);
      const letterWord = letterWords[0];
      
      // Reject this letter-only word (saying "no, letters should NOT be in the pattern")
      const pair = await controller.generateNextPair();
      controller['currentPair'] = { word1: letterWord, word2: pair.word2 };
      
      controller.classifyWord(letterWord, WordClassification.REJECT);
      
      const status = controller.getStatus();
      
      // Find each candidate
      const letterCandidate = status.candidateDetails.find(c => c.pattern === '[a-z]+');
      const numberCandidate = status.candidateDetails.find(c => c.pattern === '[0-9]+');
      const alphanumCandidate = status.candidateDetails.find(c => c.pattern === '[a-z0-9]+');
      
      // Letter pattern should match and get negative vote (wrong to accept rejected word)
      assert.ok(letterCandidate, 'Letter candidate should exist');
      assert.strictEqual(letterCandidate.positiveVotes, 0,
        'Letter candidate should have 0 positive votes');
      assert.strictEqual(letterCandidate.negativeVotes, 1,
        'Letter candidate should have 1 negative vote (incorrectly matched rejected word)');
      
      // Number pattern should NOT match and get no vote (neutral - correctly rejects)
      assert.ok(numberCandidate, 'Number candidate should exist');
      assert.strictEqual(numberCandidate.positiveVotes, 0,
        'Number candidate should have 0 positive votes (no reward for correct rejection)');
      assert.strictEqual(numberCandidate.negativeVotes, 0,
        'Number candidate should have 0 negative votes');
      
      // Alphanumeric pattern should match and get negative vote
      assert.ok(alphanumCandidate, 'Alphanumeric candidate should exist');
      assert.strictEqual(alphanumCandidate.positiveVotes, 0,
        'Alphanumeric candidate should have 0 positive votes');
      assert.strictEqual(alphanumCandidate.negativeVotes, 1,
        'Alphanumeric candidate should have 1 negative vote (incorrectly matched rejected word)');
    });

    test('Implicit voting should help eliminate incorrect candidates faster', async () => {
      // With implicit voting, accepting a word that only matches one candidate
      // should immediately give negative votes to all other candidates
      const patterns = ['[a-z]+', '[0-9]+', '[A-Z]+'];
      controller.setThreshold(2); // Eliminate after 2 negative votes
      await controller.generateCandidates('test', patterns);
      
      // Generate and accept two lowercase letter words
      const words = await controller['analyzer'].generateMultipleWords('[a-z]+', 2);
      const word1 = words[0];
      const word2 = words[1];
      
      const pair = await controller.generateNextPair();
      controller['currentPair'] = { word1, word2: pair.word2 };
      
      // Accept first word
      controller.classifyWord(word1, WordClassification.ACCEPT);
      
      let status = controller.getStatus();
      let numberCandidate = status.candidateDetails.find(c => c.pattern === '[0-9]+');
      let upperCandidate = status.candidateDetails.find(c => c.pattern === '[A-Z]+');
      
      // After first accept, number and upper should each have 1 negative vote
      assert.strictEqual(numberCandidate?.negativeVotes, 1,
        'Number candidate should have 1 negative vote after first accept');
      assert.strictEqual(upperCandidate?.negativeVotes, 1,
        'Uppercase candidate should have 1 negative vote after first accept');
      assert.strictEqual(numberCandidate?.eliminated, false,
        'Number candidate should not yet be eliminated');
      assert.strictEqual(upperCandidate?.eliminated, false,
        'Uppercase candidate should not yet be eliminated');
      
      // Accept second word
      controller['currentPair'] = { word1: word2, word2: pair.word2 };
      controller.classifyWord(word2, WordClassification.ACCEPT);
      
      status = controller.getStatus();
      numberCandidate = status.candidateDetails.find(c => c.pattern === '[0-9]+');
      upperCandidate = status.candidateDetails.find(c => c.pattern === '[A-Z]+');
      
      // After second accept, both should be eliminated (threshold = 2)
      assert.strictEqual(numberCandidate?.negativeVotes, 2,
        'Number candidate should have 2 negative votes');
      assert.strictEqual(upperCandidate?.negativeVotes, 2,
        'Uppercase candidate should have 2 negative votes');
      assert.strictEqual(numberCandidate?.eliminated, true,
        'Number candidate should be eliminated after reaching threshold');
      assert.strictEqual(upperCandidate?.eliminated, true,
        'Uppercase candidate should be eliminated after reaching threshold');
      
      // Only lowercase candidate should remain
      assert.strictEqual(controller.getActiveCandidateCount(), 1,
        'Only one candidate should remain active');
    });
  });

  // Regression test for issue: Extension Hanging mid vote
  // See: https://github.com/sidprasad/pick-regex/issues (Extension Hanging mid vote)
  suite('Special Character Handling (Regression Tests)', () => {
    test('Should handle words with double quotes in classification', async () => {
      // This test ensures that words containing double quotes can be classified
      // Previously, double quotes would break when using inline onclick attributes
      // Now uses programmatic DOM building with event listeners (no escaping needed)
      const patterns = ['[!"#$%&\'()*,\\-./:;<=>?@[\\]^_`{|}~]{2,}', '!!+"*'];
      await controller.generateCandidates('punctuation test', patterns);
      
      // Simulate a word pair that contains double quotes
      const wordWithQuote = '!!"';  // This was causing the hang
      const normalWord = '!!';
      
      // Set up the current pair manually to test classification
      controller['currentPair'] = { word1: wordWithQuote, word2: normalWord };
      
      // This should not throw and should properly classify the word
      assert.doesNotThrow(() => {
        controller.classifyWord(wordWithQuote, WordClassification.ACCEPT);
      }, 'Should handle words with double quotes without throwing');
      
      // Verify the word was recorded in history
      const history = controller.getWordHistory();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].word, wordWithQuote);
      assert.strictEqual(history[0].classification, WordClassification.ACCEPT);
      
      // Classify the second word
      assert.doesNotThrow(() => {
        controller.classifyWord(normalWord, WordClassification.ACCEPT);
      });
      
      // Verify both words are now classified
      assert.strictEqual(controller.areBothWordsClassified(), true);
      assert.strictEqual(controller.getWordHistory().length, 2);
    });

    test('Should handle words with various special characters', async () => {
      // Test a comprehensive set of special characters that could break HTML escaping
      const specialChars = [
        '"',           // Double quote
        "'",           // Single quote
        '\\',          // Backslash
        '&',           // Ampersand
        '<',           // Less than
        '>',           // Greater than
        '\n',          // Newline
        '\t',          // Tab
        '!!"',         // The specific case from the bug report
        '\'"',         // Mixed quotes
        'say "hello"', // Realistic example with quotes
        "can't"        // Realistic example with apostrophe
      ];
      
      const patterns = ['.*'];
      await controller.generateCandidates('special chars test', patterns);
      
      // Test each special character
      for (const specialChar of specialChars) {
        // Reset for next test
        controller.reset();
        await controller.generateCandidates('special chars test', patterns);
        
        controller['currentPair'] = { word1: specialChar, word2: 'normal' };
        
        // Should not throw when classifying words with special characters
        assert.doesNotThrow(() => {
          controller.classifyWord(specialChar, WordClassification.ACCEPT);
        }, `Should handle special character: ${JSON.stringify(specialChar)}`);
        
        // Verify it was recorded correctly
        const history = controller.getWordHistory();
        assert.strictEqual(history[0].word, specialChar,
          `Word should be recorded correctly for: ${JSON.stringify(specialChar)}`);
      }
    });

    test('Should handle words that match punctuation regex patterns', async () => {
      // Test the actual patterns from the bug report logs
      const patterns = [
        '([!"#$%&\'()*,\\-./:;<=>?@[\\]^_`{|}~])\\1+',  // Repeated punctuation (with backreference)
        '([.,!?;:])\\1+',                               // Common sentence punctuation repeated
        '[!"#$%&\'()*,\\-./:;<=>?@[\\]^_`{|}~]{2,}',   // Any 2+ punctuation marks
        '(?:[.,!?]){2,}',                               // Sequences of specific marks
        '(\\W)\\1+'                                     // Any non-word character repeated
      ];
      
      await controller.generateCandidates('repeated punctuation', patterns);
      
      // Test words from the bug report that caused the hang
      const problematicWords = ['!!', ',!', '!,"', '!,'];
      
      for (const word of problematicWords) {
        controller.reset();
        await controller.generateCandidates('repeated punctuation', patterns);
        
        controller['currentPair'] = { word1: word, word2: '...' };
        
        assert.doesNotThrow(() => {
          controller.classifyWord(word, WordClassification.ACCEPT);
          controller.classifyWord('...', WordClassification.REJECT);
        }, `Should handle word from bug report: ${JSON.stringify(word)}`);
        
        assert.strictEqual(controller.areBothWordsClassified(), true,
          `Both words should be classified for: ${JSON.stringify(word)}`);
      }
    });
  });

  suite('Regression tests', () => {
    test('Word history should include matchingRegexes when all candidates are eliminated', async () => {
      // Regression test for bug where matchingRegexes was empty when no regex found
      const patterns = ['[a-z]+', '[0-9]+', '[A-Z]+'];
      controller.setThreshold(1);
      await controller.generateCandidates('test', patterns);
      
      // Classify enough words to eliminate all candidates
      for (let i = 0; i < 5; i++) {
        try {
          const pair = await controller.generateNextPair();
          
          // Reject both words
          controller.classifyWord(pair.word1, WordClassification.REJECT);
          controller.classifyWord(pair.word2, WordClassification.REJECT);
          controller.clearCurrentPair();
          
          // Check if all eliminated
          if (controller.getActiveCandidateCount() === 0) {
            break;
          }
        } catch (error) {
          break;
        }
      }
      
      // Verify word history has matchingRegexes even though all candidates eliminated
      const wordHistory = controller.getWordHistory();
      assert.ok(wordHistory.length > 0, 'Word history should not be empty');
      
      // Each record should have matchingRegexes array (might be empty if word didn't match any)
      wordHistory.forEach((record, index) => {
        assert.ok(Array.isArray(record.matchingRegexes), 
          `Record ${index} should have matchingRegexes array`);
        assert.ok('word' in record && typeof record.word === 'string',
          `Record ${index} should have word field`);
        assert.ok('classification' in record,
          `Record ${index} should have classification field`);
        assert.ok('timestamp' in record && typeof record.timestamp === 'number',
          `Record ${index} should have timestamp field`);
      });
      
      // Verify getFinalRegex returns null
      assert.strictEqual(controller.getFinalRegex(), null,
        'Final regex should be null when all candidates eliminated');
      assert.strictEqual(controller.getState(), PickState.FINAL_RESULT,
        'State should be FINAL_RESULT');
    });

    test('Final regex must have at least one upvote (positive vote)', async () => {
      // Regression test to ensure we never select a regex that has no positive votes
      const patterns = ['[a-z]+', '[0-9]+', '[A-Z]+'];
      await controller.generateCandidates('test', patterns);
      
      controller.setMaxClassifications(5);
      
      // Classify only with UNSURE and REJECT - no ACCEPT votes
      for (let i = 0; i < 5; i++) {
        try {
          const pair = await controller.generateNextPair();
          
          // Use only UNSURE and REJECT, never ACCEPT
          controller.classifyWord(pair.word1, i % 2 === 0 ? WordClassification.UNSURE : WordClassification.REJECT);
          controller.classifyWord(pair.word2, WordClassification.REJECT);
          controller.clearCurrentPair();
        } catch (error) {
          break;
        }
      }
      
      // Force check final state (happens after max classifications)
      controller.checkFinalState();
      
      // Verify final regex is null because no candidate has positive votes
      const finalRegex = controller.getFinalRegex();
      assert.strictEqual(finalRegex, null,
        'Final regex should be null when no candidate has positive votes');
      
      // Verify all candidates have zero positive votes
      const status = controller.getStatus();
      const candidatesWithPositiveVotes = status.candidateDetails.filter(c => c.positiveVotes > 0);
      assert.strictEqual(candidatesWithPositiveVotes.length, 0,
        'No candidates should have positive votes');
    });

    test('Final regex is selected only when it has at least one upvote', async () => {
      // Positive test: verify final regex IS selected when candidate has upvotes
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      
      // Accept one word to give positive vote
      controller.classifyWord(pair.word1, WordClassification.ACCEPT);
      controller.classifyWord(pair.word2, WordClassification.REJECT);
      
      // Check that at least one candidate has positive votes
      const status = controller.getStatus();
      const candidatesWithPositiveVotes = status.candidateDetails.filter(c => c.positiveVotes > 0);
      assert.ok(candidatesWithPositiveVotes.length > 0,
        'At least one candidate should have positive votes after ACCEPT classification');
      
      // Force termination by maxing out classifications
      controller.setMaxClassifications(2);
      controller.checkFinalState();
      
      // Verify a final regex was selected
      const finalRegex = controller.getFinalRegex();
      assert.ok(finalRegex !== null,
        'Final regex should be selected when candidates have positive votes');
      assert.strictEqual(controller.getState(), PickState.FINAL_RESULT,
        'State should be FINAL_RESULT');
    });

    test('Reclassifying same word repeatedly should not advance to next pair', async () => {
      // Regression test: updating classification shouldn't skip to next pair
      // if both words haven't been classified yet
      const patterns = ['[a-z]+', '[0-9]+'];
      await controller.generateCandidates('test', patterns);
      
      const pair = await controller.generateNextPair();
      const { word1, word2 } = pair;
      
      // Classify first word as REJECT
      controller.classifyWord(word1, WordClassification.REJECT);
      assert.strictEqual(controller.areBothWordsClassified(), false,
        'Only one word should be classified');
      
      // Update classification to ACCEPT
      controller.updateClassification(0, WordClassification.ACCEPT);
      assert.strictEqual(controller.areBothWordsClassified(), false,
        'Still only one word should be classified after update');
      
      // Update again to UNSURE
      controller.updateClassification(0, WordClassification.UNSURE);
      assert.strictEqual(controller.areBothWordsClassified(), false,
        'Still only one word should be classified after another update');
      
      // Update back to REJECT
      controller.updateClassification(0, WordClassification.REJECT);
      assert.strictEqual(controller.areBothWordsClassified(), false,
        'Still only one word should be classified');
      
      // Verify the word history only has one entry (same word, updated multiple times)
      const history = controller.getWordHistory();
      assert.strictEqual(history.length, 1,
        'Should only have one entry in history for the same word');
      assert.strictEqual(history[0].word, word1,
        'History entry should be for word1');
      assert.strictEqual(history[0].classification, WordClassification.REJECT,
        'Classification should be the latest value (REJECT)');
      
      // Current pair should still be the same
      assert.strictEqual(controller.areBothWordsClassified(), false,
        'Current pair should still be waiting for second word');
    });

    test('Voting should re-open when changing classifications from FINAL_RESULT state', async () => {
      // Regression test: When in FINAL_RESULT state, changing classifications
      // should transition back to VOTING if there are now multiple active candidates
      
      const patterns = [
        'Canada|United States|Mexico',
        'Canada|United States(?: of America)?|Mexico|Greenland|Bermuda',
        'USA|US|CAN|MEX'
      ];
      
      await controller.generateCandidates('test', patterns);
      
      // Classify words to reach a final state
      controller.classifyDirectWords([
        { word: 'Greenland', classification: WordClassification.ACCEPT },
        { word: 'Bermuda', classification: WordClassification.REJECT },
        { word: 'USA', classification: WordClassification.ACCEPT }
      ]);
      
      // Should converge to single candidate
      assert.strictEqual(controller.getState(), PickState.FINAL_RESULT,
        'Should be in FINAL_RESULT state');
      assert.strictEqual(controller.getActiveCandidateCount(), 1,
        'Should have one active candidate');
      
      // Now change classifications so that multiple candidates are active again
      // Change "Greenland" from ACCEPT to UNSURE
      const history = controller.getWordHistory();
      const greenlandIndex = history.findIndex(h => h.word === 'Greenland');
      controller.updateClassification(greenlandIndex, WordClassification.UNSURE);
      
      // Change "Bermuda" from REJECT to UNSURE
      const bermudaIndex = history.findIndex(h => h.word === 'Bermuda');
      controller.updateClassification(bermudaIndex, WordClassification.UNSURE);
      
      // Change "USA" from ACCEPT to UNSURE
      const usaIndex = history.findIndex(h => h.word === 'USA');
      controller.updateClassification(usaIndex, WordClassification.UNSURE);
      
      // Now we should have multiple active candidates and be back in VOTING state
      const activeCandidates = controller.getActiveCandidateCount();
      assert.ok(activeCandidates > 1,
        `Should have multiple active candidates, got ${activeCandidates}`);
      assert.strictEqual(controller.getState(), PickState.VOTING,
        'Should transition back to VOTING state when multiple candidates are active');
      assert.strictEqual(controller.getFinalRegex(), null,
        'Final regex should be null when back in VOTING state');
    });

    test('Voting should re-open with single candidate when accepted word no longer matches', async () => {
      // Regression test: When in FINAL_RESULT with 1 candidate, if the user changes
      // the accepted word classification, voting should re-open
      
      const patterns = [
        'Canada|Mexico',
        'USA|US|CAN|MEX'
      ];
      
      await controller.generateCandidates('test', patterns);
      
      // Classify to converge to second candidate (eliminate first by accepting USA which only second matches)
      controller.classifyDirectWords([
        { word: 'Canada', classification: WordClassification.REJECT },
        { word: 'Mexico', classification: WordClassification.REJECT },
        { word: 'USA', classification: WordClassification.ACCEPT }
      ]);
      
      // Should converge to single candidate
      assert.strictEqual(controller.getState(), PickState.FINAL_RESULT,
        'Should be in FINAL_RESULT state');
      assert.strictEqual(controller.getActiveCandidateCount(), 1,
        'Should have one active candidate');
      assert.strictEqual(controller.getFinalRegex(), 'USA|US|CAN|MEX',
        'Final regex should be the abbreviations pattern');
      
      // Now change "USA" from ACCEPT to UNSURE
      const history = controller.getWordHistory();
      const usaIndex = history.findIndex(h => h.word === 'USA');
      controller.updateClassification(usaIndex, WordClassification.UNSURE);
      
      // With only one candidate remaining but no accepted word matching it,
      // voting should re-open
      assert.strictEqual(controller.getState(), PickState.VOTING,
        'Should transition back to VOTING state when accepted word is removed');
      assert.strictEqual(controller.getFinalRegex(), null,
        'Final regex should be null when back in VOTING state');
      assert.strictEqual(controller.getActiveCandidateCount(), 1,
        'Should still have one active candidate');
    });

    test('Refinement correctly replays classification history', async () => {
      // This test ensures that refinement preserves and replays classification history
      
      const patterns = [
        'India|Pakistan|Bangladesh',
        '(?:India|Pakistan|Bangladesh)s?'
      ];
      
      const controller = new PickController();
      controller.setMaxClassifications(100);
      await controller.generateCandidates('test', patterns);
      
      // Apply some classifications
      controller.classifyDirectWords([
        { word: 'India', classification: WordClassification.ACCEPT },
        { word: 'Indias', classification: WordClassification.REJECT }
      ]);
      
      const beforeRefinement = controller.getStatus();
      const wordHistoryBefore = controller.getWordHistory();
      
      // Refine with same candidates
      await controller.refineCandidates('test refined', patterns);
      
      const afterRefinement = controller.getStatus();
      const wordHistoryAfter = controller.getWordHistory();
      
      // Verify word history is preserved
      assert.strictEqual(wordHistoryAfter.length, wordHistoryBefore.length,
        'Word history length should be preserved');
      
      for (let i = 0; i < wordHistoryBefore.length; i++) {
        assert.strictEqual(wordHistoryAfter[i].word, wordHistoryBefore[i].word,
          `Word history entry ${i} word should match`);
        assert.strictEqual(wordHistoryAfter[i].classification, wordHistoryBefore[i].classification,
          `Word history entry ${i} classification should match`);
      }
      
      // Verify candidates have same patterns in same order
      assert.strictEqual(afterRefinement.candidateDetails.length, beforeRefinement.candidateDetails.length,
        'Should have same number of candidates');
      
      for (let i = 0; i < beforeRefinement.candidateDetails.length; i++) {
        assert.strictEqual(afterRefinement.candidateDetails[i].pattern, beforeRefinement.candidateDetails[i].pattern,
          `Candidate ${i} pattern should match`);
      }
    });
  });

  // Test for the bug where changing a vote from REJECT to ACCEPT doesn't update state
  suite('Vote Change State Update', () => {
    test('Should transition from FINAL_RESULT back to VOTING when classification change makes candidates active', async () => {
      // Setup: Create 4 candidates similar to the cricket example
      const patterns = [
        '(?:deep|short|silly)?\\s*(?:mid|long|fine|square)?\\s*(?:on|off|leg|wicket)?\\s*(?:slip|gully|point)',
        '[a-zA-Z]+(?:\\s+[a-zA-Z]+){0,3}(?:\\s+(?:slip|point|cover|leg|wicket|on|off|man|gully))',
        '(?:first|second|third)?\\s*slip|(?:deep|short)?\\s*(?:point|cover|leg)',
        '(?:wicket[\\s-]?keeper|keeper)|(?:[a-zA-Z]+\\s+)*(?:slip|gully|point|cover|leg)'
      ];
      
      await controller.generateCandidates('test positions', patterns);
      assert.strictEqual(controller.getState(), PickState.VOTING);
      
      // Classify words to eliminate all candidates
      // Word 1: "silly mid off" - ACCEPT
      controller.classifyDirectWords([{ word: 'silly mid off', classification: WordClassification.ACCEPT }]);
      
      // Word 2: "backward short leg" - REJECT (should eliminate candidates 2 and 4 that match it)
      controller.classifyDirectWords([{ word: 'backward short leg', classification: WordClassification.REJECT }]);
      
      // Word 3: "forward short leg" - ACCEPT (should eliminate candidate 3 that doesn't match it)
      controller.classifyDirectWords([{ word: 'forward short leg', classification: WordClassification.ACCEPT }]);
      
      // Word 4: "wicket leg" - REJECT (should eliminate remaining candidates that match it)
      controller.classifyDirectWords([{ word: 'wicket leg', classification: WordClassification.REJECT }]);
      
      // At this point, all candidates should be eliminated
      const stateBeforeChange = controller.getState();
      const activeBeforeChange = controller.getActiveCandidateCount();
      
      console.log(`Before change: state=${stateBeforeChange}, active=${activeBeforeChange}`);
      console.log(`Candidate details:`, controller.getStatus().candidateDetails.map(c => ({
        pattern: c.pattern.substring(0, 30) + '...',
        eliminated: c.eliminated,
        negVotes: c.negativeVotes,
        posVotes: c.positiveVotes
      })));
      
      // Now change "wicket leg" from REJECT to ACCEPT
      const wordHistory = controller.getWordHistory();
      const wicketLegIndex = wordHistory.findIndex(r => r.word === 'wicket leg');
      assert.notStrictEqual(wicketLegIndex, -1, 'Should find "wicket leg" in history');
      
      controller.updateClassification(wicketLegIndex, WordClassification.ACCEPT);
      
      // After the change, some candidates should become active again
      const stateAfterChange = controller.getState();
      const activeAfterChange = controller.getActiveCandidateCount();
      
      console.log(`After change: state=${stateAfterChange}, active=${activeAfterChange}`);
      console.log(`Candidate details:`, controller.getStatus().candidateDetails.map(c => ({
        pattern: c.pattern.substring(0, 30) + '...',
        eliminated: c.eliminated,
        negVotes: c.negativeVotes,
        posVotes: c.positiveVotes
      })));
      
      // The bug is: state remains FINAL_RESULT even though we have active candidates
      // Expected: state should transition back to VOTING
      assert.ok(activeAfterChange > 0, 'Should have active candidates after changing vote');
      assert.strictEqual(stateAfterChange, PickState.VOTING, 
        `State should transition to VOTING when candidates become active (was ${stateAfterChange})`);
    });
  });
});
