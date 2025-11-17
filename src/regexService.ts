import * as vscode from 'vscode';

export interface RegexGenerationResult {
  regex: string;
  explanation: string;
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

  // 2. Build prompt: ask for strict JSON to keep parsing simple.
  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(
      [
        'You are a regex generator.',
        'Given a natural-language description, return JSON:',
        '{"regex": "<REGEX>", "explanation": "<BRIEF EXPLANATION>"}',
        '',
        'Requirements:',
        '- Only one regex.',
        '- No backticks, comments, or extra text.',
        '- Regex should be compatible with most PCRE/JS engines unless otherwise specified.',
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
  if (typeof parsed.regex !== 'string') {
    throw new Error('Model JSON missing `regex` string.');
  }

  return {
    regex: parsed.regex,
    explanation: typeof parsed.explanation === 'string'
      ? parsed.explanation
      : ''
  };
}
