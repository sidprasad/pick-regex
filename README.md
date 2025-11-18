# PICK — Regex Builder for VS Code

PICK is a productivity extension that helps you turn a natural-language description into a precise regular expression through a short interactive workflow.

Instead of guessing a single regex, PICK generates multiple candidate patterns and asks you to classify example strings to quickly narrow down the correct regex. It uses automata-based analysis (via @gruhn/regex-utils) for formally correct set operations and `randexp` for example generation.

Key ideas:
- Generate a set of candidate regexes from an LLM (3–5 candidates).
- Iterate: show two example strings and ask which one is "IN" (matches) or "OUT" (doesn't match). The controller uses these judgments to eliminate candidates.
- Continue until you accept an example for one regex (we select it), or all candidates are eliminated (then we tell you none matched).
- The extension ensures examples are unique and tries to maximize information gained from each judgment.
- **Session Management**: Refine your prompt while preserving your existing classifications, or start fresh with a new prompt.

Quick start
-----------
1. In VS Code, press F1 and select: "PICK: Start Regex Builder".
2. Enter a short description of the regex you want (e.g., "IPv4 octet, from 0–255").
3. Classify example strings until PICK converges to a final regex, or the candidates are exhausted.
4. **Refine Your Prompt**: If you want to iterate on your prompt without losing your work, click "Refine Prompt" to generate new candidates while preserving your existing classifications.
5. **Start Fresh**: If you want to begin a completely new regex task, click "Start Fresh" to clear all state and begin anew.

Developer workflow / Try it locally
------------------
Requirements
------------
- Node.js: v20.18.1 or newer (the extension uses `vsce`/`undici` which require Node 20+)

Check your Node version with:

```bash
node -v
```

If Node is older than v20.x, use `nvm` or your OS package manager to install Node 20:

```bash
# Using nvm
nvm install 20
nvm use 20
```

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
If you edit `package.json` and it adds/removes dependencies, make sure to update the lock file with:

```bash
# Ensure you're on Node v20 (see above)
npm install
git add package-lock.json
git commit -m "chore: update lockfile"
git push
```

If `npm ci` fails with a message like "package.json and package-lock.json are not in sync" or missing modules, run `npm install` to regenerate the lockfile and commit it. CI uses `npm ci` to install from lockfile for deterministic builds.

# Use "Extensions: Install from VSIX..." in VS Code to install the generated .vsix
```

Session Management
------------------
PICK now supports session management to help you iteratively refine your regex without losing your work:

- **Refine Prompt**: Click "Refine Prompt" during the classification phase or after getting a final result. This allows you to:
  - Update your natural language description
  - Generate new candidate regexes based on the refined prompt
  - **Preserve all your existing word classifications** (Accept/Reject/Unsure)
  - Apply those classifications to the new candidates automatically
  - Continue from where you left off with better candidates

- **Start Fresh**: Click "Start Fresh" to completely reset the session:
  - Clears all candidates and classifications
  - Returns to the initial prompt screen
  - Use this when you want to work on a completely different regex task

This two-level reset system allows you to iterate efficiently on your regex without repetitive work, while still providing a clean slate when needed.

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

