# Fix for Vote Change State Update Bug

## Issue Description
When a user changed a vote from REJECT to ACCEPT (e.g., "wicket leg" from downvote to upvote), the status remained "no candidates match" even though candidates should have become active again after recalculation.

## Root Cause
When `updateClassification()` was called to change a vote:
1. It called `recalculateVotes()` which reset all candidate votes and replayed classifications
2. After replay, some candidates that were previously eliminated became active again
3. `checkFinalState()` was called to update the state
4. However, the condition `activeCount > 1 && this.state === PickState.FINAL_RESULT` was supposed to transition from FINAL_RESULT back to VOTING
5. For some reason, this transition was not happening, leaving the state as FINAL_RESULT

## Solution
The fix resets the state from FINAL_RESULT to VOTING at the beginning of `recalculateVotes()`, before replaying classifications. This ensures that when `checkFinalState()` is called after replay, it evaluates the situation fresh:

- If there are 0 active candidates, `checkFinalState()` sets state to FINAL_RESULT (correct)
- If there is 1 active candidate with a matching accepted word, state is set to FINAL_RESULT (correct)
- If there is 1 active candidate without a matching accepted word, state remains VOTING (correct)
- If there are 2+ active candidates, state remains VOTING (correct - this was the bug!)

## Code Changes

### pickController.ts
1. Added debug logging to `checkFinalState()` to log which branch is taken
2. Added state reset logic in `recalculateVotes()`:
   ```typescript
   // If we were in FINAL_RESULT state, reset to VOTING since we're recalculating
   // checkFinalState will set it back to FINAL_RESULT if appropriate
   if (this.state === PickState.FINAL_RESULT) {
     this.state = PickState.VOTING;
     this.finalRegex = null;
     this.currentPair = null;
     logger.info('Resetting state from FINAL_RESULT to VOTING for recalculation.');
   }
   ```

### pickController.test.ts
Added a new test case `Vote Change State Update` that:
1. Creates 4 candidates similar to the cricket example
2. Classifies words to potentially eliminate candidates
3. Changes a word from REJECT to ACCEPT
4. Verifies the state transitions correctly based on the number of active candidates

## Testing
The fix ensures that existing tests for state transitions continue to pass:
- "Voting should re-open when changing classifications from FINAL_RESULT state"
- "Voting should re-open with single candidate when accepted word no longer matches"

## Expected Behavior After Fix
When a user changes a vote:
1. If the change results in 0 active candidates, state is FINAL_RESULT with null regex
2. If the change results in 1 active candidate with a matching accepted word, state is FINAL_RESULT with that regex
3. If the change results in 1 active candidate without a matching accepted word, state is VOTING
4. If the change results in 2+ active candidates, state is VOTING

In the original bug scenario (changing "wicket leg" from REJECT to ACCEPT), 2 candidates became active again, so the state should transition to VOTING and generate a new pair for the user to vote on.
