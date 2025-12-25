# Warning surfacing

_Date:_ 2025-12-25

## Scenario
Verify that LLM-provided cautions appear in the status bar and persist while classifying words.

## Steps
1. Open the PICK view and enter a prompt that is likely to trigger non-regular concerns (e.g., "match valid nested HTML").
2. Click **Generate** and wait for candidates to appear.
3. Confirm a yellow warning banner appears in the status bar with the caution text.
4. Continue classifying several word pairs and observe that the warning remains visible while statuses update.
5. Click **Build a New Regex** and confirm the warning banner clears before the next run.

## Result
Warnings surfaced in the status area and persisted until the session was reset.
