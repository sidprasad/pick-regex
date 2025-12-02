import * as vscode from 'vscode';
import { logger } from './logger';

/**
 * Manages survey prompt logic for collecting user feedback after N uses
 */
export class SurveyPrompt {
  private static readonly USAGE_COUNT_KEY = 'pick.usageCount';
  private static readonly SURVEY_DISMISSED_KEY = 'pick.surveyDismissed';
  private static readonly USAGE_THRESHOLD = 3;
  private static readonly SURVEY_URL = 'https://brown.co1.qualtrics.com/jfe/form/SV_a90QURkTTwI9eHY';
  private static readonly MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=SiddharthaPrasad.pick-regex&ssr=false#review-details';
  
  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Increment usage count and potentially show survey prompt
   */
  async incrementUsageAndCheckPrompt(): Promise<void> {
    // Check if survey prompt is enabled in configuration
    const config = vscode.workspace.getConfiguration('pick');
    const surveyEnabled = config.get<boolean>('surveyPromptEnabled', true);
    
    if (!surveyEnabled) {
      logger.info('Survey prompt is disabled in configuration');
      return;
    }

    // Check if user has already dismissed the survey
    const dismissed = this.context.globalState.get<boolean>(SurveyPrompt.SURVEY_DISMISSED_KEY, false);
    if (dismissed) {
      logger.info('Survey prompt already dismissed');
      return;
    }

    // Get current usage count
    const usageCount = this.context.globalState.get<number>(SurveyPrompt.USAGE_COUNT_KEY, 0);
    const newCount = usageCount + 1;
    
    // Update usage count
    await this.context.globalState.update(SurveyPrompt.USAGE_COUNT_KEY, newCount);
    logger.info(`PICK usage count: ${newCount} (threshold: ${SurveyPrompt.USAGE_THRESHOLD})`);

    // Show prompt when threshold is reached (at 3rd use or later if not yet shown)
    if (newCount >= SurveyPrompt.USAGE_THRESHOLD) {
      logger.info('Usage threshold reached, showing survey prompt');
      await this.showSurveyPrompt();
    }
  }

  /**
   * Show the survey prompt to the user using VS Code's modal dialog
   */
  private async showSurveyPrompt(): Promise<void> {
    const message = 'PICK is a research tool. It helps us justify it to our funders if we can show some user feedback. Would you help us by completing a very short, quick survey and/or by rating us?';
    
    const surveyOption = 'Share Feedback';
    const rateOption = 'Rate Extension';
    const dontAskOption = "Don't Ask Again";

    const choice = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      surveyOption,
      rateOption,
      dontAskOption
    );

    if (choice === surveyOption) {
      // Open survey in browser
      logger.info('User chose to share feedback');
      await vscode.env.openExternal(vscode.Uri.parse(SurveyPrompt.SURVEY_URL));
      // Mark as dismissed so we don't show it again
      await this.context.globalState.update(SurveyPrompt.SURVEY_DISMISSED_KEY, true);
    } else if (choice === rateOption) {
      // Open marketplace page in browser
      logger.info('User chose to rate on marketplace');
      await vscode.env.openExternal(vscode.Uri.parse(SurveyPrompt.MARKETPLACE_URL));
      // Mark as dismissed so we don't show it again
      await this.context.globalState.update(SurveyPrompt.SURVEY_DISMISSED_KEY, true);
    } else if (choice === dontAskOption) {
      // Mark as dismissed permanently
      logger.info('User chose not to be asked again');
      await this.context.globalState.update(SurveyPrompt.SURVEY_DISMISSED_KEY, true);
    } else {
      // User dismissed or clicked Dismiss - we can ask again later
      logger.info('User dismissed survey prompt');
    }
  }

  /**
   * Reset usage tracking (for testing purposes)
   */
  async resetUsageTracking(): Promise<void> {
    await this.context.globalState.update(SurveyPrompt.USAGE_COUNT_KEY, 0);
    await this.context.globalState.update(SurveyPrompt.SURVEY_DISMISSED_KEY, false);
    logger.info('Reset usage tracking');
  }
}
