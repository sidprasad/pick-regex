# Eliminated Candidate Tracking

## Issue
Previously, when a candidate was eliminated from contention, the system would stop updating its upvotes and downvotes count. Additionally, eliminated candidates would not appear in the `matchingRegexes` field in the export, making it unclear which eliminated candidates matched specific words.

## Fix
Modified the `applyClassification` method in `pickController.ts` to:
1. Continue tracking all candidates (including eliminated ones) in the `matchingRegexes` field
2. Continue updating `positiveVotes` and `negativeVotes` for eliminated candidates
3. Prevent re-elimination by checking `!candidate.eliminated` before setting `eliminated = true`

## Changes Made
- [src/pickController.ts](../src/pickController.ts#L385-L387): Removed filter that excluded eliminated candidates from `matchingRegexes`
- [src/pickController.ts](../src/pickController.ts#L407-L429): Removed `continue` statement that skipped eliminated candidates in ACCEPT classification
- [src/pickController.ts](../src/pickController.ts#L436-L456): Removed `continue` statement that skipped eliminated candidates in REJECT classification
- [src/test/pickController.test.ts](../src/test/pickController.test.ts): Added comprehensive test suite "Eliminated Candidate Tracking" with 4 tests

## Tests Added
All tests pass (57/57):
1. **Eliminated candidates should continue to have votes updated** - Verifies negative votes continue to accumulate
2. **Eliminated candidates should appear in matchingRegexes for export** - Ensures export includes all matching candidates
3. **Eliminated candidates should continue to receive positive votes** - Verifies positive votes are tracked
4. **Eliminated candidates should be properly tracked through REJECT classifications** - Verifies REJECT path works correctly

## Behavior
- **UI Display**: Eliminated candidates will show updated vote counts in real-time as users continue classifying words
- **Export**: The JSON export will include eliminated candidates in the `matchingRegexes` array for each classification, providing complete tracking of which candidates (active or eliminated) matched each word

## Verification
Run automated tests:
```bash
npm test
```

To manually verify:
1. Generate candidates and eliminate one by classifying words it doesn't match/matches incorrectly
2. Continue classifying more words that would match/not match the eliminated candidate
3. Observe that the eliminated candidate's vote counts continue to update in the UI
4. Export the history and verify that `matchingRegexes` includes the eliminated candidate where applicable
