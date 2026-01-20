# Enhanced Export Functionality

## Change Description
Enhanced the Export button functionality to provide a more comprehensive export that includes:
1. **Candidates section**: All regex candidates with their explanations, confidence scores, votes, and elimination status
2. **Classifications section**: The classification history with matching regex information for each word

## Implementation Details

### Changes Made
Modified `media/pickView.js`:
- Added `latestCandidates` variable to track candidates throughout the session
- Updated message handlers to capture and store candidates:
  - `candidatesGenerated`
  - `candidatesRefined`
  - `finalResult`
  - `noRegexFound`
- Enhanced `copyHistoryToClipboard()` function to export a structured object containing:
  - `candidates`: Array of candidate objects with:
    - `regex`: The regex pattern
    - `explanation`: LLM-provided explanation (if available)
    - `confidence`: LLM confidence score (if available)
    - `positiveVotes`: Number of positive votes
    - `negativeVotes`: Number of negative votes
    - `eliminated`: Whether the candidate was eliminated
    - `equivalents`: Array of equivalent regex patterns (if any)
  - `classifications`: Array of word classifications with:
    - `word`: The classified word
    - `classification`: Normalized classification ('in', 'out', or 'unsure')
    - `matchingRegexes`: Array of regex patterns that matched this word

### Export Structure Example
```json
{
  "candidates": [
    {
      "regex": "^(Jan|Feb|Mar)$",
      "explanation": "Matches first three months abbreviated",
      "confidence": 0.85,
      "positiveVotes": 3,
      "negativeVotes": 0,
      "eliminated": false,
      "equivalents": ["^Jan$|^Feb$|^Mar$"]
    }
  ],
  "classifications": [
    {
      "word": "January",
      "classification": "in",
      "matchingRegexes": ["^(Jan|Feb|Mar)$"]
    }
  ]
}
```

## Manual Testing Performed

### Test Case 1: Export with Candidates
1. Started PICK extension and entered prompt "January birthdays"
2. Generated candidates
3. Classified several words through the voting process
4. Clicked Export button
5. Verified exported JSON contains:
   - `candidates` array with all generated regex patterns
   - Each candidate includes explanation and confidence (when provided by LLM)
   - `classifications` array with word history
   - Each classification includes `matchingRegexes` array

### Test Case 2: Export After Final Result
1. Completed a full PICK session to final regex selection
2. Clicked Export button
3. Verified all candidates are present (including eliminated ones)
4. Verified winner regex is identifiable by votes
5. Verified all classifications include matching regex information

### Test Case 3: Export with No Regex Found
1. Created scenario where no regex could be determined
2. Clicked Export button
3. Verified candidates are still exported with their states
4. Verified classifications are preserved

### Test Case 4: Export with Empty History
1. Opened PICK without any classifications
2. Clicked Export button
3. Verified appropriate message: "No classifications to export yet."

## Benefits
- Users can now see which regexes were considered alongside the classification history
- LLM explanations provide insight into why each regex was generated
- Matching regex information helps understand which patterns matched which words
- Complete audit trail of the entire PICK session
- Data can be used for analysis, debugging, or reimporting in future iterations
