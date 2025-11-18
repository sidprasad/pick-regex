# PICK — Regex Learner for VS Code

PICK is a productivity extension that helps you turn a natural-language description into a precise regular expression through a short interactive workflow.

Instead of guessing a single regex, PICK generates multiple candidate patterns and asks you to classify example strings to quickly narrow down the correct regex. It uses automata-based analysis (via @gruhn/regex-utils) for formally correct set operations and `randexp` for example generation.

Key ideas:
- Generate a set of candidate regexes from an LLM (3–5 candidates).
- Iterate: show two example strings and ask which one is "IN" (matches) or "OUT" (doesn't match). The controller uses these judgments to eliminate candidates.
- Continue until you accept an example for one regex (we select it), or all candidates are eliminated (then we tell you none matched).
- The extension ensures examples are unique and tries to maximize information gained from each judgment.

Quick start
-----------
1. In VS Code, press F1 and select: "PICK: Start Regex Learner".
2. Enter a short description of the regex you want (e.g., "IPv4 octet, from 0–255").
3. Classify example strings until PICK converges to a final regex, or the candidates are exhausted.

Developer workflow / Try it locally
------------------
- Build (TypeScript):
	- npm run compile
- Lint:
	- npm run lint
- Test:
	- npm test
- Run the extension in development: press F5 from this repository with VS Code extension host.

Try locally using the CLI:
```
npm ci
npm run compile
npm run package:vsix
# Use "Extensions: Install from VSIX..." in VS Code to install the generated .vsix
```

Configuration
-------------
Settings are under `pick`:
- `pick.eliminationThreshold` — number of negative votes required to eliminate a candidate (default: 2)
- `pick.llm.vendor` — LLM vendor to use for candidate generation (default: `copilot`)
- `pick.llm.family` — LLM model family to prefer (default: `gpt-4o`)

Publishing (release process)
 We use GitHub Actions to build (CI) and publish the extension.

Local tag helper script
-----------------------
You can create and push the tag matching your package.json version using the included utility script:

```bash
# Create a tag based on the package version and push it
npm run release:tag

# For additional options
# --dry-run: show commands without executing
# --force: delete and recreate the tag if it already exists
# --no-push: create tag locally but do not push
# --message "Custom tag message": set a custom tag message
```
Notes

License
-------
MIT

