import * as vscode from 'vscode';
import { PickViewProvider } from './pickViewProvider';
import { initializeLogging, logger } from './logger';
import * as os from 'os';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const log = initializeLogging(context);
	log.info('PICK: Regex Builder is now active!');

	// Register the PICK webview provider
	const provider = new PickViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(PickViewProvider.viewType, provider)
	);

	const reportIssueCommand = vscode.commands.registerCommand('pick.reportIssue', async () => {
		const extension = vscode.extensions.getExtension('SiddharthaPrasad.pick-regex');
		const logs = logger.getLogs(200) || 'No logs captured this session.';

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

		const params = new URLSearchParams({
			title: 'Bug: ',
			body
		});

		const issueUrl = `https://github.com/sidprasad/pick-regex/issues/new?${params.toString()}`;
		await vscode.env.openExternal(vscode.Uri.parse(issueUrl));
		vscode.window.showInformationMessage('Opening GitHub issue with logs attached to the body.');
	});

	context.subscriptions.push(reportIssueCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {
	logger.dispose();
}
