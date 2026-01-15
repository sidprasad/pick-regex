# Manual Testing: No regex match revision guidance

## Scope
- No regex match UI messaging now nudges users to revise their prompt and clarifies classifications are preserved.

## Steps
1. Run the extension and reach a state where no candidate regexes match ("No regex match").
2. Confirm the error panel includes guidance to revise the description and explicitly says classifications are preserved.
3. Click "Revise description" and verify the prompt edit UI opens while keeping the existing classification history visible.

## Notes
- Automated test not added; UI behavior is in the VS Code webview layer.
