import * as vscode from 'vscode';
import { PickViewProvider } from './pickViewProvider';
import { initializeLogging, logger } from './logger';
import { openIssueReport } from './issueReporter';
import { SurveyPrompt } from './surveyPrompt';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const log = initializeLogging(context);
	log.info('PICK: Regex Builder is now active!');

	// Initialize survey prompt manager
	const surveyPrompt = new SurveyPrompt(context);

	// Register the PICK webview provider
        const provider = new PickViewProvider(context.extensionUri, surveyPrompt, context.globalState);
        context.subscriptions.push(
                vscode.window.registerWebviewViewProvider(PickViewProvider.viewType, provider, {
                        webviewOptions: {
                                retainContextWhenHidden: true
                        }
                })
        );

	const reportIssueCommand = vscode.commands.registerCommand('pick.reportIssue', async () => {
		await openIssueReport();
	});

        const resetSurveyCommand = vscode.commands.registerCommand('pick.resetSurveyState', async () => {
                await surveyPrompt.resetUsageTracking();
                await provider.resetLocalWebviewState();
                vscode.window.showInformationMessage('PICK local storage, history, and splash preference have been cleared.');
        });

	context.subscriptions.push(reportIssueCommand, resetSurveyCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {
	logger.dispose();
}
