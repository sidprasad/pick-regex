# Warning Formatting Improvement

_Date:_ 2026-01-17

## Changes Made
1. **Removed background color** from warning box (`.status-warnings`) - now uses only border styling for visibility
2. **Improved text formatting** - warnings now display with proper line breaks:
   - Introduction on its own line
   - Model notes on separate lines
   - Bullet points for multiple warnings displayed vertically (not inline)
   - Disclaimer on its own line at the end
3. **Enhanced readability** - added `line-height: 1.5` and `white-space: pre-wrap` to warning text

## Testing Steps
1. Open the PICK view and enter a prompt that will trigger warnings (e.g., "match valid nested HTML" or "validate email addresses")
2. Click **Generate** and wait for candidates to appear
3. Verify that the warning box appears with:
   - No colored background (just border outline)
   - Text is readable against the editor background
   - Proper formatting with line breaks between sections
   - Bullet points displayed vertically (if multiple warnings)
   - Clear visual separation between intro, warnings, and disclaimer

## Expected Result
- Warning box is clearly visible with border but no background color
- All text is readable without color contrast issues
- Message is well-formatted with proper line breaks
- Multiple warnings appear as a bulleted list (vertical, not inline)
- Overall appearance is clean and professional

## Files Modified
- `media/pickView.css` - Removed background color styling, improved text layout
- `src/pickViewProvider.ts` - Reformatted warning message with proper line breaks
- `media/pickView.js` - Added newline-to-br conversion for HTML rendering
