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
 * Represents an available LLM chat model
 */
export interface AvailableChatModel {
  id: string;
  name: string;
  vendor: string;
  family: string;
}

/**
 * Error thrown when user has not granted permission to use language models
 */
export class PermissionRequiredError extends Error {
  constructor(message: string = 'Permission required to use language models. Please approve the permission request when prompted.') {
    super(message);
    this.name = 'PermissionRequiredError';
  }
}

/**
 * Error thrown when no language models are available
 */
export class NoModelsAvailableError extends Error {
  constructor(message: string = 'No language models available. Please ensure you have a language model extension installed (e.g., GitHub Copilot).') {
    super(message);
    this.name = 'NoModelsAvailableError';
  }
}

/**
 * Get all available chat models from VS Code
 * @returns Array of available chat models
 */
export async function getAvailableChatModels(): Promise<AvailableChatModel[]> {
  try {
    // Get all available chat models without filtering
    const models = await vscode.lm.selectChatModels({});
    
    return models.map(model => ({
      id: model.id,
      name: model.name,
      vendor: model.vendor,
      family: model.family
    }));
  } catch (error) {
    logger.warn(`Failed to get available chat models: ${error}`);
    return [];
  }
}

/**
 * Get unique vendors from available models
 * @returns Array of unique vendor names
 */
export async function getAvailableVendors(): Promise<string[]> {
  const models = await getAvailableChatModels();
  const vendors = new Set(models.map(m => m.vendor));
  return Array.from(vendors).sort();
}

/**
 * Get unique model families from available models, optionally filtered by vendor
 * @param vendor Optional vendor to filter by
 * @returns Array of unique family names
 */
export async function getAvailableFamilies(vendor?: string): Promise<string[]> {
  const models = await getAvailableChatModels();
  const filtered = vendor ? models.filter(m => m.vendor === vendor) : models;
  const families = new Set(filtered.map(m => m.family));
  return Array.from(families).sort();
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

  // First, try to get models with specific vendor and family
  let models = await vscode.lm.selectChatModels({
    vendor: vendor,
    family: family
  });

  // If no models found with specific configuration, try with just vendor
  if (models.length === 0 && vendor) {
    logger.info(`No models found for vendor="${vendor}" and family="${family}", trying vendor only...`);
    models = await vscode.lm.selectChatModels({
      vendor: vendor
    });
  }

  // If still no models, try to get any available model
  if (models.length === 0) {
    logger.info('No models found with configured vendor, getting any available model...');
    models = await vscode.lm.selectChatModels({});
  }

  if (models.length === 0) {
    throw new NoModelsAvailableError();
  }

  const model = models[0];
  logger.info(`Using model: ${model.name} (vendor: ${model.vendor}, family: ${model.family})`);

  // Log if we're using a different model than configured
  if (model.vendor !== vendor || model.family !== family) {
    logger.warn(`Configured model (vendor: ${vendor}, family: ${family}) not available. Using: ${model.name} instead.`);
  }

  // Build prompt: ask for multiple candidate regexes with explanations and confidence scores
  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(
    [
      "You are a regex-generation assistant for JavaScript.",
      "Given a natural-language description of a text pattern, generate 3–5 candidate regular expressions.",
      "Return ONLY a single JSON object with this shape:",
      "{",
      "  \"candidates\": [",
      "    {\"regex\": \"<REGEX>\", \"explanation\": \"<WHY THIS PATTERN>\", \"confidence\": 0.0}",
      "  ]",
      "}",
      "",
      "Output rules:",
      "- Output must be valid JSON. No backticks, comments, or extra text.",
      "- \"candidates\" must contain 3–5 items.",
      "- Each item must have: regex (pattern body only, no /.../ or flags), explanation, confidence in [0,1].",
      "- Make candidates diverse: different interpretations or specificity levels.",
      "",
      "Regex rules (JavaScript, ECMA-262):",
      "- Allowed: literals, concatenation, ., \\\\w, \\\\d, \\\\s, character classes [...], [^...], groups (...), (?:...), quantifiers *, +, ?, {m}, {m,}, {m,n}, alternation |, anchors ^ and $, lookahead (?=...) and (?!...).",
      "- Disallowed: inline flags (?i, ?m, ?s, etc.), possessive quantifiers (*+, ++, ?+), atomic groups (?>...), word boundaries (\\\\b, \\\\B), lookbehind (?<=..., ?<!...), backreferences (\\\\1, \\\\2, ...), Unicode properties (\\\\p{...}, \\\\P{...}), named groups (?<name>...).",
      "- If a disallowed feature would be ideal, approximate it using only allowed syntax and mention the limitation in the explanation.",
      "",
      `Description: ${description}`,
    ].join('\n')
    )
  ];

  let response;
  try {
    response = await model.sendRequest(messages, {}, token);
  } catch (error: unknown) {
    // Handle permission/authorization errors
    if (error instanceof vscode.LanguageModelError) {
      const errorCode = error.code;
      // Check for permission-related errors
      // Common error codes: 'NoPermissions', 'Blocked', etc.
      if (errorCode === 'NoPermissions' || 
          errorCode === vscode.LanguageModelError.NoPermissions.toString() ||
          error.message.toLowerCase().includes('permission') ||
          error.message.toLowerCase().includes('not allowed')) {
        logger.error(error, 'Permission denied for language model access');
        throw new PermissionRequiredError(
          'You must grant permission for PICK to use language models. ' +
          'A permission dialog should appear - please click "Allow" to continue. ' +
          'If no dialog appears, you may need to sign in to your language model provider.'
        );
      }
    }
    // Re-throw other errors
    throw error;
  }

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
