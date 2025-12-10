# PICK — Regex Builder

[![CI](https://github.com/sidprasad/pick-regex/actions/workflows/ci.yml/badge.svg)](https://github.com/sidprasad/pick-regex/actions/workflows/ci.yml) 
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/SiddharthaPrasad.pick-regex?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=SiddharthaPrasad.pick-regex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# What it is

PICK (Pairwise Iterative-Choice Knockout) is an algorithm that enables you to make smart use of generative AI (GenAI) to generate regular expressions.

---

# How it works

PICK:

1. Asks GenAI to generate a handful of regexes, corresponding to different ways your prompt might be interpreted. (E.g.: want “dates”? Would that be in ISO format, US format, or some other format? In English or some other language? Gregorian or some other calendar?)
2. Shows you *concrete examples* of strings generated from the regexes.
3. Asks you to upvote/downvote on each string. In the process, you are actually making decisions on each of the regexes.
4. Lets you *revise* your prompt at any time; when you do, it retains all your previous classifications so you don't have to redo that work.
5. Terminates when there is only one regex left (yay!) or you've run out of them (oops!). Of course, you can always stop at any time you are satisfied.

PICKs builds on both formal language theory and cognitive science theory, but we skip the details here.

---

# Disclaimers

PICK is new software. We've done our best to make it robust and usable, but PICK contains both new ideas and fiddly engineering, so please be patient with us! We welcome both problem reports and code contributions; please see below.

PICK is offered on an as-is basis, without warranty, express or implied.
You agree to use PICK at your own risk.

The correct functioning of PICK is dependent on many tools
beyond our control: the quality of your prompt, the correctness of your
choices, the training of the LLM, the correctness of the regex engine,
and so on. Therefore, you should manually review all outputs before
using them.

---

# Settings

All settings appear under the `pick` section in VS Code Settings.

- `pick.eliminationThreshold` (number, default: 2)  
  Number of negative votes required to eliminate a candidate.

- `pick.surveyPromptEnabled` (boolean, default: true)  
  Enable or disable the feedback survey prompt that appears after using PICK multiple times.

---

# Prerequisites

PICK requires a language model extension to be installed and enabled in VS Code. We recommend:

- **GitHub Copilot**: Install from the VS Code Marketplace and sign in with your GitHub account.

When you first use PICK, VS Code will prompt you to grant permission for the extension to use Language Models. **You must click "Allow" for PICK to work.** If you accidentally dismiss this prompt, PICK will show a clear error message explaining how to proceed.

---

# Reporting Problems or Making Suggestions

| Before you report…                      | …please note                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| No language models available            | Install a language model extension like GitHub Copilot and ensure you are signed in.          |
| Permission required error               | Click "Allow" when VS Code prompts you to grant PICK access to Language Models.              |
| Candidate generation fails              | Check if you have an active internet connection and the LLM service is available.            |
| Timeouts                                | Extremely complex regexes may exceed analysis limits; simplify the prompt.                   |
| Cancel does not stop a task             | Cancellation is iffy. Please reload the PICK view or restart the Extension Development Host. |

If you run into other issues, or have suggestions, please use our issue tracker: https://github.com/sidprasad/pick-regex/issues

---

# Logs

1. Open View → Output (Ctrl/Cmd + Shift + U).
2. Select "PICK Regex Builder" in the Output dropdown.
3. The log stream includes timestamps and categorized messages (INFO, WARN, ERROR).

---

# Privacy and Data

PICK sends your prompt to the configured LLM provider solely for candidate generation.  
The extension performs no storage of prompts or results.  
LLM providers may log requests according to their own policies.  
Avoid placing sensitive information in prompts if this is a concern.

---

# Contributing

Pull requests are welcome, but *please* do **not** spam us with poorly-tested, AI-generated PRs. Please first thoroughly test any changes, and convince us that you have done so. You can make a PR at https://github.com/sidprasad/pick-regex

Development workflow:

1. `npm install && npm run compile`
2. `npm run watch` for incremental builds
3. Launch the Extension Development Host from VS Code

---

# Credits

PICK is a collaboration between Siddhartha Prasad, Skyler Austen, Kathi Fisler, and Shriram Krishnamurthi. Siddhartha is the primary author of this version of the tool.

---

# License

MIT. See the `LICENSE` file.
