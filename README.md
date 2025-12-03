# PICK — Regex builder for VS Code

<!-- [![CI](https://github.com/sidprasad/pick-regex/actions/workflows/ci.yml/badge.svg)](https://github.com/sidprasad/pick-regex/actions/workflows/ci.yml) -->
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/SiddharthaPrasad.pick-regex?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=SiddharthaPrasad.pick-regex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

PICK (Pairwise Iterative-Choice Knockout) is an algorithm that enables you to make smart use of generative AI (GenAI) to generate regular expressions.

Normally, a programmer asks GenAI to generate a regex, maybe stares hard at the output, and then, left without much of a choice, pastes it into code. The regex generated may be what makes most sense based on the GenAI's training set, but may not match your specific needs. How would you know?

PICK differs in several ways:

1. It asks GenAI to generate a handful of regexes, corresponding to different ways your prompt might be interpreted. (E.g.: want “dates”? Would that be in ISO format, US format, or some other format? In English or some other language?)
2. It then shows you *concrete examples* of strings generated from the regexes.
3. You get to upvote/downvote on each string. In the process, you are actually making decisions on each of the regexes.
4. The process ends when there is only one regex left, you've ruled out all regexes (in which case it would have been dangerous to use any of them!), or when you are satisfied.

Of course, the more examples you see, the more bored, tired, and annoyed you will get. It's therefore critical to show you as few as possible, and make each one you see count for as much as possible. PICK uses a combination of automata theory and cognitive science to address this problem.

In short: You will be shown a pair of strings. For each one, you vote (or mark yourself unsure). As you vote, you will see the effect on the candidate regexes. Your past classifications are at the bottom, in case you change your mind. As you hit thresholds, candidates either get removed from contention or become the final answer. (In the configuration, you can change the thresholds of vote counts at which you accept or reject a candidate regex.)

---

## Quick Start

PICK is currently implemented as an extension to Visual Studio Code (VSC).

1. Install the “PICK: Regex Builder” extension from the VSC Marketplace.
2. Ensure you have a language model extension installed (e.g., GitHub Copilot) and are signed in.
3. Go to the Activity Bar and choose the extension's View.
4. The first time you use PICK, VS Code will ask you to allow the extension to use Language Models. **You must click "Allow" for PICK to work.** If no models are detected, PICK will show a helpful message explaining what to do.
5. Describe the pattern for which you want an regex (e.g., “IPv4 addresses”). In our experience, short, precise descriptions produce better LLM results than long, complicated ones. But if you are too concise, you leave open too many interpretations, so make sure you provide enough detail.
6. Click the button to generate candidate regexes.
7. Classify the presented example strings:
   - Upvote: the string matches the pattern you want
   - Downvote: the string does not match the pattern you want
   - Unsure: skip
8. Continue until PICK terminates or you are satisfied with the regex(es).
9. Copy or insert the final regex, if any. Otherwise refine your query. If you find yourself in this situation, don't start over! Instead, *revise* the existing description. When you do this, PICK will preserve all the classification work you've done and automatically apply it to the new candidate regexes.

---

## How It Works

PICK:

1. sends your description is sent to the selected LLM provider.
2. asks the LLM to generate multiple candidate regexes.
3. runs a structural and semantic deduplication pass to remove equivalent expressions.
4. shows example strings; your classification eliminate incompatible candidates.
5. terminates when one or no candidates remain.


---

## Settings

All settings appear under the `pick` section in VS Code Settings.

- `pick.eliminationThreshold` (number, default: 2)  
  Number of negative votes required to eliminate a candidate.

- `pick.surveyPromptEnabled` (boolean, default: true)  
  Enable or disable the feedback survey prompt that appears after using PICK multiple times.

---

## Disclaimer

PICK is offered on an as-is basis, without warranty, express or implied.
You agree to use PICK at your own risk.

Note that the correct functioning of PICK is dependent on many tools
beyond our control: the quality of your prompt, the correctness of your
choices, the training of the LLM, the correctness of the regex engine,
and so on. Therefore, you should manually review all outputs before
using them.

---

## Prerequisites

PICK requires a language model extension to be installed and enabled in VS Code. We recommend:

- **GitHub Copilot**: Install from the VS Code Marketplace and sign in with your GitHub account.

When you first use PICK, VS Code will prompt you to grant permission for the extension to use Language Models. **You must click "Allow" for PICK to work.** If you accidentally dismiss this prompt, PICK will show a clear error message explaining how to proceed.

---

## Reporting Problems or Making Suggestions

| Before you report…                      | …please note                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| No language models available            | Install a language model extension like GitHub Copilot and ensure you are signed in.          |
| Permission required error               | Click "Allow" when VS Code prompts you to grant PICK access to Language Models.              |
| Candidate generation fails              | Check if you have an active internet connection and the LLM service is available.            |
| Timeouts                                | Extremely complex regexes may exceed analysis limits; simplify the prompt.                   |
| Cancel does not stop a task             | Cancellation is iffy. Please reload the PICK view or restart the Extension Development Host. |

If you run into other issues, or have suggestions, please use our issue tracker: https://github.com/sidprasad/pick-regex/issues

---

## Logs

1. Open View → Output (Ctrl/Cmd + Shift + U).
2. Select "PICK Regex Builder" in the Output dropdown.
3. The log stream includes timestamps and categorized messages (INFO, WARN, ERROR).

---

## Privacy and Data

PICK sends your prompt to the configured LLM provider solely for candidate generation.  
The extension performs no storage of prompts or results.  
LLM providers may log requests according to their own policies.  
Avoid placing sensitive information in prompts if this is a concern.

---

## Contributing

Pull requests are welcome, but *please* do **not** spam us with poorly-tested, AI-generated PRs. Please first thoroughly test any changes, and convince us that you have done so. You can make a PR at https://github.com/sidprasad/pick-regex

Development workflow:

1. `npm install && npm run compile`
2. `npm run watch` for incremental builds
3. Launch the Extension Development Host from VS Code

---

## Credits

PICK is a collaboration between Siddhartha Prasad, Skyler Austen, Kathi Fisler, and Shriram Krishnamurthi. Siddhartha is the primary author of this version of the tool.

---

## License

MIT. See the `LICENSE` file.
