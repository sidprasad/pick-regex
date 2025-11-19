# PICK — Regex Builder for VS Code

PICK is a VS Code extension that helps you turn a natural-language description into a precise regular expression through a short interactive workflow.

Instead of guessing a single regex, PICK generates multiple candidate patterns and asks you to classify example strings to quickly narrow down the correct regex. It uses automata-based analysis (via @gruhn/regex-utils) for formally correct set operations and `randexp` for example generation.

Key ideas:
- Generate a set of candidate regexes from an LLM (3–5 candidates).
- Iterate: show two example strings and ask which one is "IN" (matches) or "OUT" (doesn't match). The controller uses these judgments to eliminate candidates.
- Continue until you accept an example for one regex (we select it), or all candidates are eliminated (then we tell you none matched).
- The extension ensures examples are unique and tries to maximize information gained from each judgment.
- **Session Management**: Refine your prompt while preserving your existing classifications, or start fresh with a new prompt.

Quick start
-----------
| **Note**: When you first use PICK, VS Code will show a permission popup asking to allow the extension to use "Language Models" (or "Chat Models"). You need to grant this permission for the extension to generate regex candidates.

1. In VS Code, open the PICK Regex Builder view in the Activity Bar (left sidebar).
2. Enter a short description of the regex you want (e.g., "IPv4 octet, from 0–255").
3. Classify example strings until PICK converges to a final regex, or the candidates are exhausted.
4. **Refine Your Prompt**: If you want to iterate on your prompt without losing your work, click "Refine Prompt" to generate new candidates while preserving your existing classifications.
5. **Start Fresh**: If you want to begin a completely new regex task, click "Start Fresh" to clear all state and begin anew.



## Configuration

Settings are under `pick`:
- `pick.eliminationThreshold` — number of negative votes required to eliminate a candidate (default: 2)
- `pick.llm.vendor` — LLM vendor to use for candidate generation (default: `copilot`)
- `pick.llm.family` — LLM model family to prefer (default: `gpt-4o`)

## Troubleshooting

If you encounter issues with the extension, check the logs for detailed information:

1. Open the Output panel in VS Code (View → Output, or Ctrl+Shift+U / Cmd+Shift+U)
2. In the dropdown at the top right of the Output panel, select "PICK Regex Builder"
3. The logs will show detailed information about extension operations, LLM requests, and any errors

The logs include timestamps and are categorized by severity (INFO, WARN, ERROR) to help with debugging.


License
-------
MIT

