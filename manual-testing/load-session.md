# Load Session Feature

## Feature
Added the ability to load a previously exported session from a JSON file. This is gated power-user functionality that allows users to:
- Share sessions with others
- Resume work on complex regex patterns
- Reproduce and debug specific scenarios
- Use exported data for testing or documentation

## Implementation

### UI Changes
- **[media/pickView.html](../media/pickView.html#L219-L221)**: Added "Load" button next to the "Export" button in the Word Classification History section
  - Button uses folder icon to indicate file loading
  - Hidden file input element for JSON file selection
  - Placed unobtrusively alongside existing export functionality

### Frontend (pickView.js)
- **File input handling**: Click on "Load" button triggers file picker for JSON files
- **JSON parsing and validation**: 
  - Validates presence of `candidates` and `classifications` arrays
  - Shows clear error messages for invalid formats
  - Resets file input after each attempt (allows re-loading same file)
- **Error handling**: Shows errors using the existing status display system with red error styling

### Backend (pickViewProvider.ts)
- **[handleLoadSession](../src/pickViewProvider.ts#L1024-L1155)**: New method to process loaded session data
  - Validates data structure (candidates array, classifications array)
  - Extracts candidate patterns with explanations, confidence scores, and equivalents
  - Converts export format classifications ('in'/'out'/'unsure') to internal format (ACCEPT/REJECT/UNSURE)
  - Resets controller and generates candidates
  - Applies all classifications from the file
  - Transitions to appropriate state (voting or final result)
  - Provides detailed logging for debugging

### Format Compatibility
The loader accepts the same format as the export:
```json
{
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

**Classification format conversion**:
- Export: `"in"` / `"out"` / `"unsure"`
- Internal: `ACCEPT` / `REJECT` / `UNSURE`

### Status Updates
Enhanced `setHistoryCopyStatus` function to support different styling:
- Normal messages (default color)
- Error messages (red)
- Muted messages (description foreground)

## Tests
- **[src/test/loadSession.test.ts](../src/test/loadSession.test.ts)**: 6 comprehensive tests covering:
  - Session data structure validation
  - Classification format conversion
  - Empty classifications handling
  - Optional candidate fields (explanation, confidence, equivalents)
  - Case-insensitive classification normalization
  - Invalid input handling

All tests pass (136/136 in pickController suite, 6/6 in loadSession suite).

## Usage

1. **Export a session**: Click the "Export" button in the Word Classification History section
2. **Save the JSON file**: Copy is saved to clipboard, paste into a `.json` file
3. **Load the session**: Click the "Load" button and select the JSON file
4. **Session restored**: All candidates and classifications are restored, and you can continue voting or see the final result

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
   - UI shows correct active/eliminated candidate states
   - Can continue voting if not in final state
