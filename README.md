# PICK — Pattern Builder for VS Code

PICK is a productivity extension that helps you turn a natural-language description into a precise pattern (regular expression or SQL pattern) through a short interactive workflow.

Instead of guessing a single pattern, PICK generates multiple candidates and asks you to classify example strings to quickly narrow down the correct pattern. It uses automata-based analysis (via @gruhn/regex-utils) for JavaScript regex and custom pattern matching for SQL.

## Supported Languages

- **JavaScript/PCRE Regular Expressions**: Full regex support with formal analysis
- **SQL LIKE Patterns**: Pattern matching with `%` (any characters) and `_` (single character)

Key ideas:
- Generate a set of candidate patterns from an LLM (3–5 candidates).
- Iterate: show two example strings and ask which one is "IN" (matches) or "OUT" (doesn't match). The controller uses these judgments to eliminate candidates.
- Continue until you accept an example for one pattern (we select it), or all candidates are eliminated (then we tell you none matched).
- The extension ensures examples are unique and tries to maximize information gained from each judgment.

Quick start
-----------
1. In VS Code, press F1 and select: "PICK: Start Regex Builder".
2. Configure your target language in settings: `pick.targetLanguage` (javascript or sql).
3. Enter a short description of the pattern you want:
   - For JavaScript regex: "IPv4 octet, from 0–255"
   - For SQL patterns: "email addresses starting with admin"
4. Classify example strings until PICK converges to a final pattern, or the candidates are exhausted.

### SQL Pattern Examples

When using SQL mode, PICK generates SQL LIKE patterns:
- `%@gmail.com` - matches any email ending with @gmail.com
- `admin%` - matches any string starting with "admin"
- `test_user` - matches "test1user", "testauser", etc. (underscore matches single character)
- `%test%` - matches any string containing "test"

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

Configuration
-------------
Settings are under `pick`:
- `pick.eliminationThreshold` — number of negative votes required to eliminate a candidate (default: 2)
- `pick.targetLanguage` — target language for pattern generation: `javascript` (default) or `sql`
- `pick.llm.vendor` — LLM vendor to use for candidate generation (default: `copilot`)
- `pick.llm.family` — LLM model family to prefer (default: `gpt-4o`)

### Language-Specific Behavior

**JavaScript Mode** (`pick.targetLanguage: "javascript"`):
- Generates JavaScript/PCRE regular expressions
- Uses formal automata analysis for pattern equivalence
- Supports full regex syntax (character classes, quantifiers, groups, etc.)

**SQL Mode** (`pick.targetLanguage: "sql"`):
- Generates SQL LIKE patterns
- Uses `%` for matching any sequence of characters
- Uses `_` for matching a single character
- Suitable for SQL WHERE clauses with LIKE operator

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

