import * as vscode from 'vscode';

export interface RegexCandidate {
  regex: string;
  explanation: string;
  confidence?: number;
}

export interface RegexGenerationResult {
  candidates: RegexCandidate[];
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
        'You are a regex generator.',
        'Given a natural-language description, generate 3-5 candidate regular expressions.',
        'Return JSON in this format:',
        '{',
        '  "candidates": [',
        '    {"regex": "<REGEX>", "explanation": "<WHY THIS PATTERN>", "confidence": 0.9},',
        '    {"regex": "<REGEX>", "explanation": "<WHY THIS PATTERN>", "confidence": 0.7}',
        '  ]',
        '}',
        '',
        'Requirements:',
        '- Generate 3-5 diverse candidates (from most specific to more general, or different interpretations).',
        '- Confidence score between 0 and 1 (how well it matches the description).',
        '- No backticks, comments, or extra text outside the JSON.',
        '- Regexes should be compatible with JavaScript/PCRE engines.',
        '- Each candidate should have a clear explanation of what it matches and why.',
        '',
        `Description: ${description}`
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
    }));

  if (candidates.length === 0) {
    throw new Error('No valid regex candidates returned by model.');
  }

  return { candidates };
}
