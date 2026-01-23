# Load Session Feature

## Feature
Added the ability to load a previously exported session from a JSON file. This is gated power-user functionality that allows users to:
- Start a session without using an LLM
- Share sessions with others
- Resume work on complex regex patterns
- Reproduce and debug specific scenarios
- Use exported data for testing or documentation

## Key Improvements
1. **Session load is accessible from the initial prompt screen** - Users can load a session before ever calling an LLM
2. **Used words are tracked** - Words from loaded sessions are tracked as "used" to prevent them from being resurfaced in pair generation

## Implementation

### UI Changes
- **[media/pickView.html](../media/pickView.html#L95-L103)**: Added "Load Session" button on the initial prompt screen
  - Placed below the prompt input with explanatory text "Or load a previous session"
  - Allows users to start with candidates + classifications without calling LLM
- **[media/pickView.html](../media/pickView.html#L219-L221)**: "Load" button in the Word Classification History section (during voting)
  - Allows reloading a session mid-workflow

### Backend (pickController.ts)
- **[addUsedWords method](../src/pickController.ts#L976-L984)**: New method to add words to the used set
  - Prevents loaded session words from being resurfaced in pair generation
  - Used for programmatic addition of used words

### Backend (pickViewProvider.ts)
- **[handleLoadSession](../src/pickViewProvider.ts#L1024-L1155)**: Session loading handler
  - Validates data structure
  - Generates candidates from loaded data
  - Applies classifications (which automatically marks words as used)
  - Sends `showVoting` message to transition UI

### Format Compatibility
The loader accepts the same format as the export:
```json
{
  "prompt": "US states that start with M",
  "modelId": "gpt-4",
  "candidates": [
    {
      "regex": "[a-z]+",
      "explanation": "lowercase letters",
      "confidence": 0.9,
      "equivalents": ["[a-z]*[a-z]"]
    }
  ],
  "classifications": [
    {
      "word": "abc",
      "classification": "in",
      "matchingRegexes": ["[a-z]+"]
    }
  ]
}
```

**New fields (optional, for full session recreation)**:
- `prompt`: The original prompt used to generate candidates. If present, it will be populated in the prompt input on load, allowing the user to use "Revise" functionality.
- `modelId`: The model ID used to generate candidates. If present and the model is available, it will be selected in the model dropdown.

**Classification format conversion**:
- Export: `"in"` / `"out"` / `"unsure"`
- Internal: `ACCEPT` / `REJECT` / `UNSURE`

### Status Updates
Enhanced `setHistoryCopyStatus` function to support different styling:
- Normal messages (default color)
- Error messages (red)
- Muted messages (description foreground)

## Tests
- **[src/test/loadSession.test.ts](../src/test/loadSession.test.ts)**: 9 comprehensive tests covering:
  - Session data structure validation
  - Classification format conversion
  - Empty classifications handling
  - Optional candidate fields (explanation, confidence, equivalents)
  - Case-insensitive classification normalization
  - Invalid input handling
  - Prompt and modelId field validation
  - Backwards compatibility (sessions without prompt/modelId)
  - Null prompt/modelId handling in export

All tests pass.

## Usage

1. **Export a session**: Click the "Export" button in the Word Classification History section
2. **Save the JSON file**: Copy is saved to clipboard, paste into a `.json` file
3. **Load the session**: Click the "Load" button and select the JSON file
4. **Session restored**: All candidates, classifications, prompt, and model are restored
5. **Continue working**: You can continue voting, see the final result, or use "Revise" to refine the prompt

### Full Session Recreation
When a session is loaded with a prompt and modelId:
- The prompt input field is populated with the original prompt
- The prompt is added to the recent prompts history
- The prompt display (above candidates) shows the loaded prompt
- If the model is available, it's selected in the model dropdown
- The "Revise" functionality works as expected, allowing you to refine the prompt

## Error Handling

Clear error messages are shown for:
- Invalid JSON syntax
- Missing required fields (candidates, classifications)
- Empty candidates array
- Invalid data types
- File read failures

## Manual Verification

To manually verify:
1. Start a PICK session and classify several words
2. Export the history to clipboard
3. Save to a JSON file
4. Reset PICK
5. Click "Load" and select the saved JSON file
6. Verify:
   - All candidates are restored with correct explanations and confidence scores
   - All classifications are restored and reflected in vote counts
   - The prompt input field shows the original prompt
   - The prompt display shows the loaded prompt
   - The "Revise" button works and shows the original prompt for editing
   - UI shows correct active/eliminated candidate states
   - Can continue voting if not in final state
