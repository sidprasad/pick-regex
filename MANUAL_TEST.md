# Manual Test Cases for Word Exhaustion Fix

## Test Case 1: Word Exhaustion Handling

### Setup
1. Install the extension in VS Code
2. Open the PICK Regex Builder view

### Steps to Reproduce Original Issue
1. Enter a simple prompt like "The letter a repeating"
2. Click "Generate" to create candidates
3. Classify words until the system runs out of distinguishing words
   - You should see an error in the log: "Exhausted word space"

### Expected Behavior (After Fix)
1. ✅ The UI should show a clean warning message: "Unable to generate more words"
2. ✅ The remaining candidates should be displayed in a list
3. ✅ The "Build a New Regex" button should be visible and functional
4. ✅ No garbled JSON or error stack traces should appear in the UI
5. ✅ Clicking "Build a New Regex" should properly reset to initial state

### Expected Behavior (Before Fix - DO NOT TEST)
1. ❌ Multiple error messages would appear
2. ❌ Garbled JSON-like content with error stack traces
3. ❌ Broken "Start Over" button with location.reload()
4. ❌ Clicking "Build New Regex" might not properly reset state

## Test Case 2: Normal Error Handling

### Steps
1. Generate candidates with a valid prompt
2. Manually trigger an error condition (if possible)

### Expected Behavior
1. ✅ Error messages should show the error message text only, not full stack traces
2. ✅ Error section should be clearable
3. ✅ Can recover by generating new candidates

## Test Case 3: Threshold Adjustment Behavior

### Setup
Enter prompt: "The letter a repeating"

### Expected Log Output
```
[INFO] Generated 5 candidates from LLM
[INFO] Auto-adjusted elimination threshold from 2 to 1...
[INFO] Raised elimination threshold for 'a*' to 2 (had 2 distinguishing examples)
```

### Expected Behavior
1. ℹ️ `a*` may not be eliminated immediately after rejecting empty string ""
2. ℹ️ This is working as designed - `a*` has raised threshold of 2
3. ℹ️ Requires 2 negative votes before elimination

### Notes
- This behavior is by design to prevent premature elimination
- If this is undesirable, the threshold adjustment algorithm needs modification
- Not in scope for this minimal bug fix
