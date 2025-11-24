import * as vscode from 'vscode';
import { PickViewProvider } from './pickViewProvider';
import { initializeLogging, logger } from './logger';
import { openIssueReport } from './issueReporter';

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
		await openIssueReport();
	});

	context.subscriptions.push(reportIssueCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {
	logger.dispose();
}
