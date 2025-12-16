import * as vscode from 'vscode';
import { logger } from './logger';

export interface RegexCandidate {
  regex: string;
  explanation: string;
  confidence?: number;
  edgeCases?: string[];
}

export interface RegexGenerationResult {
  candidates: RegexCandidate[];
}

export interface RegexGenerationOptions {
  /**
   * Positive examples that should match the intended regex.
   * Used to provide lightweight grounding context to the LLM.
   */
  positiveExamples?: string[];
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
 * Error thrown when the selected model is not supported by the backend
 */
export class ModelNotSupportedError extends Error {
  constructor(modelName: string) {
    super(`The model "${modelName}" is not currently supported. This could mean:\n\n• The model doesn't exist or has been deprecated\n• The model requires a subscription you don't have\n• The model may require additional workspace permissions or account setup\n\nPlease try selecting a different model from the dropdown.`);
    this.name = 'ModelNotSupportedError';
  }
}

/**
 * Error thrown when a model is listed but not enabled/accessible in this workspace
 */
export class ModelNotEnabledError extends Error {
  constructor(modelName: string, details?: string) {
    super(
      `The model "${modelName}" appears in your list but is not currently enabled for this workspace.\n\n` +
      `${details || 'This may require additional setup or permissions.'}\n\n` +
      `What you can do:\n` +
      `• Check if the model requires workspace-specific permissions\n` +
      `• Verify you're signed in to the correct account\n` +
      `• Try selecting a different model from the dropdown`
    );
    this.name = 'ModelNotEnabledError';
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
    
    // Use a Map to deduplicate by model ID
    const uniqueModels = new Map<string, AvailableChatModel>();
    
    models.forEach(model => {
      if (!uniqueModels.has(model.id)) {
        uniqueModels.set(model.id, {
          id: model.id,
          name: model.name,
          vendor: model.vendor,
          family: model.family
        });
      }
    });
    
    return Array.from(uniqueModels.values());
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

function sanitizeEdgeCases(rawEdgeCases: unknown): string[] {
  if (!Array.isArray(rawEdgeCases)) {
    return [];
  }

  const normalized = rawEdgeCases
    .filter(candidate => typeof candidate === 'string')
    .map(candidate => candidate.trim())
    .filter(candidate => candidate.length > 0);

  const unique = Array.from(new Set(normalized));
  return unique.slice(0, 4);
}

export async function generateRegexFromDescription(
  description: string,
  token: vscode.CancellationToken,
  modelId?: string,
  options: RegexGenerationOptions = {}
): Promise<RegexGenerationResult> {
  logger.info(`User prompt: ${description}`);

  // Get available language models
  const models = await vscode.lm.selectChatModels({});

  if (models.length === 0) {
    throw new NoModelsAvailableError();
  }

  // If a specific model ID is provided, try to use that model
  let model = models[0];
  if (modelId) {
    const selectedModel = models.find(m => m.id === modelId);
    if (selectedModel) {
      model = selectedModel;
    } else {
      logger.warn(`Requested model "${modelId}" not found, using default: ${model.name}`);
    }
  }
  logger.info(`Using model: ${model.name} (vendor: ${model.vendor}, family: ${model.family})`);

  const positiveExamples = (options.positiveExamples ?? [])
    .map(example => example.trim())
    .filter(example => example.length > 0);
  const exampleLines = positiveExamples.length > 0
    ? [
        '',
        'Positive examples that SHOULD match (based on user classifications):',
        ...positiveExamples.map(example => `- ${example}`)
      ]
    : [];

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
      "    // Include optional edge cases per candidate when helpful",
      "    // edgeCases: [\"<tricky example 1>\", \"<tricky example 2>\"]",
      "  ]",
      "}",
      "",
      "Output rules:",
      "- Output must be valid JSON. No backticks, comments, or extra text.",
      "- \"candidates\" must contain 3–5 items.",
      "- Each item must have: regex (pattern body only, no /.../ or flags), explanation, confidence in [0,1].",
      "- When possible, add 2–4 short edge cases (field: edgeCases) per candidate. Edge cases should be borderline, surprising, or common failure points rather than obvious matches.",
      "- Make candidates diverse: different interpretations or specificity levels.",
      "",
      "Regex rules (JavaScript, ECMA-262):",
      "- Allowed: literals, concatenation, ., \\\\w, \\\\d, \\\\s, character classes [...], [^...], groups (...), (?:...), quantifiers *, +, ?, {m}, {m,}, {m,n}, alternation |, anchors ^ and $, lookahead (?=...) and (?!...).",
      "- Disallowed: inline flags (?i, ?m, ?s, etc.), possessive quantifiers (*+, ++, ?+), atomic groups (?>...), word boundaries (\\\\b, \\\\B), lookbehind (?<=..., ?<!...), backreferences (\\\\1, \\\\2, ...), Unicode properties (\\\\p{...}, \\\\P{...}), named groups (?<name>...).",
      "- If a disallowed feature would be ideal, approximate it using only allowed syntax and mention the limitation in the explanation.",
      "",
      `Description: ${description}`,
      ...exampleLines,
    ].join('\n')
    )
  ];

  let response;
  try {
    response = await model.sendRequest(messages, {}, token);
  } catch (error: unknown) {
    logger.info(`Caught error in regexService: ${error?.constructor?.name}, message: ${error instanceof Error ? error.message : String(error)}`);
    
    // Handle VS Code LanguageModelError with specific error codes
    if (error instanceof vscode.LanguageModelError) {
      const errorCode = error.code;
      const errorMsg = error.message.toLowerCase();
      
      logger.error(error, `Language model error - code: ${errorCode}, message: ${error.message}`);
      
      // Check for permission-related errors
      if (errorCode === 'NoPermissions' || 
          errorCode === 'Blocked' ||
          errorMsg.includes('permission') ||
          errorMsg.includes('not allowed')) {
        throw new PermissionRequiredError(
          'You must grant permission for PICK to use language models. ' +
          'A permission dialog should appear - please click "Allow" to continue. ' +
          'If no dialog appears, you may need to sign in to your language model provider.'
        );
      }
      
      // Check for model not available/enabled in workspace
      if (errorMsg.includes('not available') ||
          errorMsg.includes('not enabled') ||
          errorMsg.includes('not accessible') ||
          errorMsg.includes('not active')) {
        throw new ModelNotEnabledError(
          model.name,
          'The model may require additional workspace permissions or account setup.'
        );
      }
      
      // Check for model not found
      if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
        throw new ModelNotSupportedError(model.name);
      }
    }
    
    // Check for model_not_supported error (e.g., backend doesn't support this model)
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.info(`Checking error message for model_not_supported: "${errorMessage.substring(0, 200)}"`);
    
    if (errorMessage.includes('model_not_supported') || 
        errorMessage.toLowerCase().includes('model is not supported') ||
        errorMessage.toLowerCase().includes('requested model is not supported')) {
      logger.error(error, `Model not supported by backend: ${model.name}`);
      logger.info(`About to throw ModelNotSupportedError for model: ${model.name}`);
      throw new ModelNotSupportedError(model.name);
    }
    
    // Re-throw other errors
    logger.error(error, `Unexpected error during model.sendRequest for ${model.name}`);
    throw error;
  }

  let fullText = '';
  try {
    for await (const chunk of response.stream) {
      if (chunk instanceof vscode.LanguageModelTextPart) {
        fullText += chunk.value;
      }
    }
  } catch (error: unknown) {
    logger.info(`Caught error during stream iteration: ${error?.constructor?.name}`);
    
    // Check for model_not_supported error during streaming
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('model_not_supported') || 
        errorMessage.toLowerCase().includes('model is not supported') ||
        errorMessage.toLowerCase().includes('requested model is not supported')) {
      logger.error(error, `Model not supported by backend (during streaming): ${model.name}`);
      throw new ModelNotSupportedError(model.name);
    }
    
    // Check for model not available/enabled
    if (errorMessage.toLowerCase().includes('not available') ||
        errorMessage.toLowerCase().includes('not enabled') ||
        errorMessage.toLowerCase().includes('not accessible') ||
        errorMessage.toLowerCase().includes('not active')) {
      throw new ModelNotEnabledError(
        model.name,
        'The model may require additional workspace permissions or account setup.'
      );
    }
    
    // Re-throw other streaming errors
    logger.error(error, `Unexpected error during stream iteration for ${model.name}`);
    throw error;
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
      confidence: typeof c.confidence === 'number' ? c.confidence : undefined,
      edgeCases: (() => {
        const edgeCases = sanitizeEdgeCases(c.edgeCases);
        return edgeCases.length > 0 ? edgeCases : undefined;
      })()
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
