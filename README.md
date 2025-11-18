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
----------
We use GitHub Actions to build (CI) and publish the extension. To publish to the Visual Studio Marketplace:
1. Update `publisher` in `package.json` to your Visual Studio Marketplace publisher id.
2. Create a Personal Access Token with the "Manage Extensions" permission and add it to GitHub repo secrets as `VSCE_TOKEN`.
3. Create a GitHub Release (add a semver tag) or push a tag matching the pattern `v*` (e.g., `v1.2.0`); the GitHub Action will run on release or tag push and publish the extension.

Alternative: You can also trigger the workflow manually from the GitHub Actions UI using the "Run workflow" button for the publish workflow.

Notes
-----
- Formal regex relationships (subset, equivalence, disjoint) are computed using automata operations from `@gruhn/regex-utils` — these provide exact guarantees, not approximations.
- The extension is safe to use without network access, but LLM-based candidate generation requires a model provider configured in VS Code.

License
-------
MIT

