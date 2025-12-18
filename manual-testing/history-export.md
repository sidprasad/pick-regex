# Copy classification history as JSON

**Purpose**: Verify that users can export their previous classifications to the clipboard as JSON.

## Steps
1. Classify at least two words (one upvote, one downvote) so the history list is populated.
2. Click the **Copy JSON** button in the “Word Classification History” header.
3. Confirm a brief status message appears next to the button.
4. Paste the clipboard contents into a text editor and verify it contains JSON entries formatted as:
   ```json
   {
     "word": "<text>",
     "classification": "in|out|unsure"
   }
   ```
5. Change a classification in the history list and click **Copy JSON** again. Verify the pasted JSON reflects the updated classification values.
