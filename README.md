# PICK — Regex builder for VS Code

PICK (Pairwise Iterative-Choice Knockout) helps you turn a short natural-language description into an accurate regular expression. Instead of guessing one pattern, PICK generates several viable candidates using your chosen LLM and guides you through a fast, pairwise human-in-the-loop elimination process. You classify example strings as IN, OUT, or Unsure; each judgment knocks out incompatible candidates until one final, intention-aligned regex remains.

---

## Quick Start

**The first time you use PICK, VS Code will ask you to allow the extension to use Language Models. You must grant this permission for candidate generation.**

1. Install PICK Regex Builder and open its view from the Activity Bar.
2. Enter a brief description of the pattern you want (e.g., "IPv4 octet 0–255", "email local-part").
3. Click Start to generate candidate regexes.
4. Classify the presented example strings:
   - Accept (IN): the string should match the desired pattern
   - Reject (OUT): the string should not match
   - Unsure: skip
5. Continue until a single regex remains or you accept one.
6. Copy or insert the final regex.

Tips:
- Short, precise descriptions produce better LLM results.
- Edit the existing description to refine or adjust the set of candidate regexes while preserving prior classifications.


---

## How It Works

1. Your description is sent to the selected LLM provider.
2. Multiple candidate regexes are generated.
3. A structural and semantic deduplication pass removes equivalent expressions.
4. PICK shows example strings; your IN/OUT judgments eliminate incompatible candidates.
5. The process stops when one candidate remains or none do.

PICK uses `@gruhn/regex-utils` for automata-based equivalence and `randexp` for example generation.

---

## Settings

All settings appear under the `pick` section in VS Code Settings.

- `pick.eliminationThreshold` (number, default: 2)  
  Number of negative votes required to eliminate a candidate.

- `pick.llm.vendor` (string, default: `copilot`)  
  LLM provider to use. Options: `copilot`, `openai`, `anthropic`.

- `pick.llm.family` (string, default: `gpt-4o`)  
  Preferred model family for candidate generation.

---

## Troubleshooting and Logs

1. Open View → Output (Ctrl/Cmd + Shift + U).
2. Select "PICK Regex Builder" in the Output dropdown.
3. The log stream includes timestamps and categorized messages (INFO, WARN, ERROR).

Common issues:
- Candidate generation fails: the LLM permission popup may not yet have been approved.
- Timeouts: extremely complex regexes may exceed analysis limits; simplify the prompt.
- Cancel does not stop a task: reload the PICK view or restart the Extension Development Host.

Issue tracker: https://github.com/sidprasad/pick-regex/issues

---

## Privacy and Data

PICK sends your prompt to the configured LLM provider solely for candidate generation.  
The extension performs no storage of prompts or results.  
LLM providers may log requests according to their own policies.  
Avoid placing sensitive information in prompts if this is a concern.

---

## Contributing

Bug reports, feature requests, and pull requests are welcome:  
https://github.com/sidprasad/pick-regex

Development workflow:

1. `npm install && npm run compile`
2. `npm run watch` for incremental builds
3. Launch the Extension Development Host from VS Code

---

## License

MIT. See the `LICENSE` file.
