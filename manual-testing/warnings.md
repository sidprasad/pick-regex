# Warning surfacing

_Date:_ 2025-12-25

## Scenario
Verify that LLM-provided cautions appear in the status bar and persist while classifying words.

## Steps
1. Open the PICK view and enter a prompt that is likely to trigger non-regular concerns (e.g., "match valid nested HTML").
2. Click **Generate** and wait for candidates to appear.
3. Confirm a yellow warning banner appears in the status bar beneath the spinner area with the new phrasing:
   - "This task may not be best suited for regular expressions. The LLM cautions that ... (However, this is an LLM, so take it with a grain of salt.)"
4. Continue classifying several word pairs and observe that the warning remains visible while statuses update and after the spinner disappears.
5. Click the **Dismiss** button on the banner and confirm it hides while other status messages continue to show.
6. Click **Build a New Regex** and confirm the warning banner stays cleared before the next run.

## Result
Warnings surfaced in the status area, could be dismissed manually, and persisted through status updates until cleared.
