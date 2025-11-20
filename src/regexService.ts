import * as vscode from 'vscode';
import { logger } from './logger';

export interface RegexCandidate {
  regex: string;
  explanation: string;
  confidence?: number;
}

export interface RegexGenerationResult {
  candidates: RegexCandidate[];
}

/**
 * Attempt to rewrite common invalid regex patterns to valid JavaScript syntax
 * Returns the rewritten pattern and a boolean indicating if rewriting was attempted
 */
function tryRewriteToJavaScript(pattern: string): { rewritten: string; wasRewritten: boolean } {
  let rewritten = pattern;
  let wasRewritten = false;

  // Pattern 1: Inline case-insensitive flag (?i)
  // Example: (?i)hello -> [Hh][Ee][Ll][Ll][Oo]
  const caseInsensitiveMatch = pattern.match(/^\(\?i\)(.+)$/);
  if (caseInsensitiveMatch) {
    const innerPattern = caseInsensitiveMatch[1];
    // For simple patterns, expand to character classes
    // This is a heuristic - only works for simple letter patterns
    if (/^[a-zA-Z+*?{}\[\]()]+$/.test(innerPattern)) {
      rewritten = innerPattern.replace(/[a-zA-Z]/g, char => {
        const lower = char.toLowerCase();
        const upper = char.toUpperCase();
        return lower !== upper ? `[${lower}${upper}]` : char;
      });
      wasRewritten = true;
      logger.info(`Rewrote (?i) pattern: "${pattern}" -> "${rewritten}"`);
    }
  }

  // Pattern 2: Inline multiline flag (?m) - just remove it
  // JavaScript handles multiline via flags, not inline
  if (pattern.startsWith('(?m)')) {
    rewritten = pattern.substring(4);
    wasRewritten = true;
    logger.info(`Rewrote (?m) pattern: "${pattern}" -> "${rewritten}"`);
  }

  // Pattern 3: Inline dotall flag (?s) - just remove it
  if (pattern.startsWith('(?s)')) {
    rewritten = pattern.substring(4);
    wasRewritten = true;
    logger.info(`Rewrote (?s) pattern: "${pattern}" -> "${rewritten}"`);
  }

  // Pattern 4: Possessive quantifiers (not supported in JavaScript)
  // *+, ++, ?+ -> *, +, ?
  if (/[*+?]\+/.test(pattern)) {
    rewritten = pattern.replace(/([*+?])\+/g, '$1');
    wasRewritten = true;
    logger.info(`Rewrote possessive quantifiers: "${pattern}" -> "${rewritten}"`);
  }

  // Pattern 5: Atomic groups (?>) (not supported in JavaScript)
  // Just convert to non-capturing group (?:)
  if (pattern.includes('(?>')) {
    rewritten = pattern.replace(/\(\?>/g, '(?:');
    wasRewritten = true;
    logger.info(`Rewrote atomic groups: "${pattern}" -> "${rewritten}"`);
  }

  return { rewritten, wasRewritten };
}

export async function generateRegexFromDescription(
  description: string,
  token: vscode.CancellationToken
): Promise<RegexGenerationResult> {
  // Read configuration
  const config = vscode.workspace.getConfiguration('pick');
  const vendor = config.get<string>('llm.vendor', 'copilot');
  const family = config.get<string>('llm.family', 'gpt-4o');

  const models = await vscode.lm.selectChatModels({
    vendor: vendor as 'copilot' | 'openai' | 'anthropic',
    family: family
  });

  if (models.length === 0) {
    throw new Error('No language models available via vscode.lm');
  }

  const model = models[0];

  // Build prompt: ask for multiple candidate regexes with explanations and confidence scores
  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(
[
  "You are a regex-generation assistant.",
  "Given a natural-language description, generate 3–5 candidate regular expressions.",
  "Return ONLY a single JSON object in this exact format:",
  "{",
  "  \"candidates\": [",
  "    {\"regex\": \"<REGEX>\", \"explanation\": \"<WHY THIS PATTERN>\", \"confidence\": 0.0}",
  "  ]",
  "}",
  "",
  "Output Requirements:",
  "- Return ONLY valid JSON. No backticks, no comments, no extra text outside the JSON.",
  "- Produce 3–5 diverse candidates (different interpretations or specificity levels).",
  "- Each candidate must include a JavaScript regex string, an explanation, and a confidence value in [0,1].",
  "",
  "JavaScript Regex Rules:",
  "- ALL patterns must use valid JavaScript (ECMA-262) regular expression syntax.",
  "- Focus on simple, classical regular expressions for reliable automata analysis.",
  "",
  "Forbidden (will cause analysis failures):",
  "- Inline flags/modifiers: (?i), (?m), (?s), etc.",
  "- Possessive quantifiers: *+, ++, ?+",
  "- Atomic groups: (?>...)",
  "- Word boundaries: \\b, \\B (use explicit character classes instead)",
  "- Lookbehind assertions: (?<=...), (?<!...)",
  "- Backreferences: \\1, \\2, etc.",
  "- Any syntax not supported by JavaScript regexes.",
  "",
  "Strongly Recommended:",
  "- Standard quantifiers: *, +, ?, {m,n}",
  "- Character classes: [a-z], [0-9], [^abc]",
  "- Escape sequences: \\w, \\W, \\d, \\D, \\s, \\S",
  "- Non-capturing groups: (?:...)",
  "- Anchors: ^, $",
  "",
  "Use sparingly (may slow analysis):",
  "- Lookaheads: (?=...), (?!...)",
  "",
  "Case and Multiline behavior:",
  "- Do NOT embed flags.",
  "- For case-insensitive matching, use explicit classes like [aA].",
  "- Multiline or global behavior is handled by the application; output only the pattern body."
].join('\n')
    )
  ];

  const response = await model.sendRequest(messages, {}, token);

  let fullText = '';
  for await (const chunk of response.stream) {
    if (chunk instanceof vscode.LanguageModelTextPart) {
      fullText += chunk.value;
    }
  }

  // Try to find a JSON object in the response (defensive parsing)
  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Model did not return JSON.');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  
  // Validate the response structure
  if (!Array.isArray(parsed.candidates)) {
    throw new Error('Model JSON missing `candidates` array.');
  }

  // Validate each candidate
  const candidates: RegexCandidate[] = parsed.candidates
    .filter((c: any) => typeof c.regex === 'string')
    .map((c: any) => ({
      regex: c.regex,
      explanation: typeof c.explanation === 'string' ? c.explanation : '',
      confidence: typeof c.confidence === 'number' ? c.confidence : undefined
    }))
    .map((candidate: RegexCandidate) => {
      // Try to rewrite invalid patterns to JavaScript syntax
      const { rewritten, wasRewritten } = tryRewriteToJavaScript(candidate.regex);
      
      if (wasRewritten) {
        // Verify the rewritten pattern is now valid
        try {
          new RegExp(`^${rewritten}$`);
          logger.info(`Successfully rewrote regex: "${candidate.regex}" -> "${rewritten}"`);
          return {
            ...candidate,
            regex: rewritten,
            explanation: `${candidate.explanation} (auto-corrected from invalid syntax)`
          };
        } catch (error) {
          logger.warn(`Rewrite failed for "${candidate.regex}": ${error}`);
          // Return original - will be filtered out later
          return candidate;
        }
      }
      
      return candidate;
    });

  if (candidates.length === 0) {
    throw new Error('No valid regex candidates returned by model.');
  }

  return { candidates };
}
