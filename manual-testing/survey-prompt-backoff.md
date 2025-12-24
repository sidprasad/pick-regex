# Survey prompt backoff

## Scenario
Ensure the survey prompt spacing grows after each appearance instead of showing every three uses.

## Steps
1. In VS Code, run the **PICK: Clear Local Storage** command to reset survey state.
2. Exercise PICK three times (e.g., by running a small build/save cycle that triggers the survey count) until the feedback prompt appears once.
3. Dismiss the prompt without selecting any action.
4. Use PICK again and confirm no prompt appears until the usage count has advanced by at least six additional runs (the next ask should be after roughly nine total runs).
5. Dismiss the prompt a second time and continue using PICK, confirming the next prompt waits for roughly twelve more uses (around twenty-one total) rather than appearing every three.
