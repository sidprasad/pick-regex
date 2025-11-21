# PICK — Regex builder for VS Code

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

**The first time you use PICK, VS Code will ask you to allow the extension to use Language Models. You must grant this permission for candidate generation.**

1. Install PICK Regex Builder and open its view from the Activity Bar.
2. Describe the pattern for which you want an regex (e.g., "IPv4 octet 0–255", "email local-part").
3. Click Start to generate candidate regexes.
4. Classify the presented example strings:
   - Accept: the string matches the pattern you want
   - Reject: the string does not match the pattern you want
   - Unsure: skip
5. Continue until a single regex remains or you accept one.
6. Copy or insert the final regex.

In our experience, short, precise descriptions produce better LLM results. But if you are too concise, you leave open too many interpretations, so make sure you provide enough detail.

If the examples suggest you need to *refine* your regex, don't start over! Instead, *edit* the existing description. When you do this, PICK will preserve all the classification work you've done and automatically apply it to the new candidate regexes.

---

## How It Works

PICK:

1. sends your description is sent to the selected LLM provider.
2. asks the LLM to generate multiple candidate regexes.
3. runs a structural and semantic deduplication pass to remove equivalent expressions.
4. shows example strings; your classification eliminate incompatible candidates.
5. terminates when one or no candidates remain.

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

## Reporting Problems or Making Suggestions

| Before you report…                      | …please note                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Candidate generation fails              | The LLM permission popup may not yet have been approved.                                     |
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

## License

MIT. See the `LICENSE` file.
