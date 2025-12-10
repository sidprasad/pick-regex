# Webview UI Manual Test Suite

This document outlines manual tests for the PICK webview UI to prevent regressions, particularly around DOM-based event handling.

## Critical UI Interaction Tests

### Test 1: Revise Button Functionality
**Purpose**: Ensure the "Revise" button works correctly in all contexts

**Steps**:
1. Open PICK extension
2. Enter a prompt (e.g., "email addresses")
3. Click Generate
4. Wait for candidates to appear
5. Click the "Revise" button next to "Your Description"
6. **Expected**: Input field and model selector appear
7. Modify the prompt text
8. **Expected**: Text updates in the input field
9. Click the submit arrow button
10. **Expected**: New candidates are generated with the revised prompt
11. **Expected**: The revised prompt is displayed (not the original)

**Variations**:
- Test from voting section (currentPromptDisplay)
- Test from final result section (finalPromptDisplay)
- Test with model change during revision
- Test canceling the revision

### Test 2: Word Classification with Special Characters
**Purpose**: Ensure special characters in words don't break event handlers

**Steps**:
1. Generate candidates for a pattern that produces special chars (e.g., "quotes and apostrophes")
2. When word pair appears with special characters like: `"hello"`, `'world'`, `\n`, `\t`, etc.
3. Click Accept/Reject/Skip buttons
4. **Expected**: Classification works without errors
5. Check browser console for errors
6. **Expected**: No JavaScript errors

**Test Characters**:
- Single quotes: `'`, `"`, `` ` ``
- Backslashes: `\`, `\\`, `\n`, `\t`
- Unicode: `\u0000`, emoji, etc.
- HTML special chars: `<`, `>`, `&`

### Test 3: Word History Classification Update
**Purpose**: Ensure classification dropdowns work correctly

**Steps**:
1. Generate candidates and classify several words
2. Scroll to "Word Classification History"
3. Find a word and change its classification via dropdown
4. **Expected**: Dropdown updates immediately
5. **Expected**: Candidates are re-evaluated
6. **Expected**: No console errors

### Test 4: Candidate Copy Buttons
**Purpose**: Ensure all copy buttons work with event listeners

**Steps**:
1. Generate candidates
2. Click copy button on any candidate
3. **Expected**: "Copied to clipboard" message appears
4. Paste clipboard content
5. **Expected**: Correct regex is pasted
6. Test copy on equivalent patterns (expand alternatives, then copy)
7. **Expected**: Alternative patterns copy correctly

### Test 5: Modal and Menu Interactions
**Purpose**: Ensure modals and menus work with DOM-based approach

**Steps**:
1. Click the "?" button next to "Regex Candidates"
2. **Expected**: Modal opens
3. Click X or overlay to close
4. **Expected**: Modal closes
5. Click settings gear icon
6. **Expected**: Display options menu appears
7. Toggle checkboxes
8. **Expected**: UI updates accordingly (literal mode, diff, candidates visibility)

### Test 6: Prompt History
**Purpose**: Ensure recent prompts menu works

**Steps**:
1. Generate several different prompts over time
2. Click clock icon for prompt history
3. **Expected**: Menu shows recent prompts
4. Click a prompt from history
5. **Expected**: Prompt input is populated
6. **Expected**: Menu closes

## Regression Test Checklist

Run this checklist after any DOM manipulation changes:

- [ ] Revise button shows edit interface
- [ ] Revise submit button works
- [ ] Revise cancel button works
- [ ] Model selector in revision works
- [ ] Enter key in revision input works
- [ ] Revised prompt displays correctly after submission
- [ ] Accept/Reject/Skip buttons work on all words
- [ ] Word history classification dropdowns work
- [ ] Copy buttons work on all candidates
- [ ] Copy buttons work on equivalent patterns
- [ ] Display options checkboxes work
- [ ] Candidates help modal opens and closes
- [ ] Prompt history menu opens and closes
- [ ] No JavaScript console errors during any interaction

## Known Gotchas

### Event Listener Cloning
When using `cloneNode(true)`, event listeners are NOT copied. After cloning DOM elements, you must re-attach event listeners:

```javascript
const clone = container.cloneNode(true);
const button = clone.querySelector('button');
if (button) {
    button.addEventListener('click', handlerFunction);
}
```

### Avoiding Inline Handlers
Never use inline `onclick`, `onchange`, etc. attributes when data contains special characters. Always use `addEventListener`:

❌ **Bad**: `<button onclick="handleClick('${word}')">Click</button>`
✅ **Good**: 
```javascript
const button = document.createElement('button');
button.addEventListener('click', () => handleClick(word));
```

### Element IDs in Cloned Content
If you clone content with elements that have IDs (like `editPromptInput`), be aware that multiple elements with the same ID may exist temporarily. Use `getElementById` carefully or query within the specific container.

## Automated Testing Possibilities

For future consideration:

1. **Playwright/Puppeteer**: Could test webview in a browser context
2. **VS Code Webview Testing**: Microsoft has experimental webview testing APIs
3. **Mock Webview**: Create a mock webview environment for unit testing
4. **Snapshot Testing**: Test rendered HTML structure (though this doesn't catch event listener issues)

## Related Issues

- Issue #120: DOM refactoring to fix special character handling
- Commit 18014d83: Initial DOM refactoring that inadvertently broke revise button
