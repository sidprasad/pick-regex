# Retain context when hidden

## Scenario
Confirm the PICK webview retains its state when the left activity bar panel is closed and reopened.

## Steps
1. Launch the extension in the VS Code Extension Host.
2. Open the **Regex Builder** view from the PICK activity bar container.
3. Interact with the UI (e.g., type a prompt or classify a word) to create visible state.
4. Collapse or hide the left activity bar to hide the view.
5. Reopen the activity bar and reselect **Regex Builder**.

## Expected
- The webview content remains intact (typed text and classifications are still present).
- The webview does not reinitialize or lose state when the view is re-shown.

## Result
- [ ] Pass
- [ ] Fail
- Notes: _Not yet executed in this environment._
