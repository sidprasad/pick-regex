import * as vscode from 'vscode';
import * as os from 'os';
import { logger } from './logger';

/**
 * Opens the GitHub new-issue page and prepares a full issue body.
 *
 * Key behaviors:
 * - Build a structured template with description, steps, logs, and environment info.
 * - Copy that template to the clipboard so the user can paste it directly into GitHub.
 * - Open the plain "new issue" URL (no huge query params), avoiding URL-length errors.
 * - Surface a friendly toast so the user knows to paste after the browser opens.
 */
export async function openIssueReport(): Promise<void> {
  const extension = vscode.extensions.getExtension('SiddharthaPrasad.pick-regex');
  const logs = logger.getLogs(200) || 'No logs captured this session.';

  // Build a markdown issue skeleton that users can paste and tweak.
  // Keep it in the body only; do NOT pack it into the URL to avoid
  // header length or query-size issues in GitHub/new-issue redirects.
  const body = [
    '## Issue Description',
    '(What went wrong? Add screenshots if helpful.)',
    '',
    '## Steps to Reproduce',
    '1. ',
    '2. ',
    '',
    '## Expected Behavior',
    '',
    '## Actual Behavior',
    '',
    '## Logs',
    '```',
    logs,
    '```',
    '',
    '## Environment',
    `- Extension version: ${extension?.packageJSON.version ?? 'unknown'}`,
    `- VS Code version: ${vscode.version}`,
    `- OS: ${os.type()} ${os.release()} (${os.arch()})`,
    `- Remote: ${vscode.env.remoteName ?? 'local'}`
  ].join('\n');

  await vscode.env.clipboard.writeText(body);

  // Use a clean new-issue link; user pastes the clipboard content.
  const issueUrl = 'https://github.com/sidprasad/pick-regex/issues/new';
  await vscode.env.openExternal(vscode.Uri.parse(issueUrl));
  vscode.window.showInformationMessage('Issue template copied to clipboard. Paste it into the GitHub form.');
}
