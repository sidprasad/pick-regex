import * as vscode from 'vscode';
import { logger } from './logger';

/**
 * Manages survey prompt logic for collecting user feedback after N uses
 */
export class SurveyPrompt {
  private static readonly USAGE_COUNT_KEY = 'pick.usageCount';
  private static readonly SURVEY_DISMISSED_KEY = 'pick.surveyDismissed';
  private static readonly SURVEY_RATED_KEY = 'pick.surveyRated';
  private static readonly REMIND_AT_KEY = 'pick.remindAt';
  private static readonly LAST_SHOWN_KEY = 'pick.surveyLastShown';
  private static readonly USAGE_THRESHOLD = 3;
  private static readonly SHOW_COOLDOWN = 3;
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

    // If the user has rated PICK, we never show the prompt again
    const rated = this.context.globalState.get<boolean>(SurveyPrompt.SURVEY_RATED_KEY, false);
    if (rated) {
      logger.info('Survey prompt disabled because user already rated');
      return;
    }

    // Get current usage count
    const usageCount = this.context.globalState.get<number>(SurveyPrompt.USAGE_COUNT_KEY, 0);
    const newCount = usageCount + 1;

    // Update usage count
    await this.context.globalState.update(SurveyPrompt.USAGE_COUNT_KEY, newCount);
    logger.info(`PICK usage count: ${newCount} (threshold: ${SurveyPrompt.USAGE_THRESHOLD})`);

    // Respect any existing "remind me later" scheduling
    const remindAt = this.context.globalState.get<number | undefined>(SurveyPrompt.REMIND_AT_KEY);
    if (remindAt !== undefined && newCount < remindAt) {
      logger.info(`Survey scheduled at ${remindAt}; current count ${newCount} -> not showing yet`);
      return;
    }

    // Enforce cooldown between prompts so we do not show the rate dialog on every run
    const lastShown = this.context.globalState.get<number | undefined>(SurveyPrompt.LAST_SHOWN_KEY);
    if (lastShown !== undefined && newCount < lastShown + SurveyPrompt.SHOW_COOLDOWN) {
      logger.info(`Survey prompt last shown at ${lastShown}; waiting until ${lastShown + SurveyPrompt.SHOW_COOLDOWN} before showing again`);
      return;
    }

    // Show prompt when threshold is reached (at 3rd use or later if not yet shown)
    if (newCount >= SurveyPrompt.USAGE_THRESHOLD) {
      logger.info('Usage threshold reached, showing survey prompt');
      await this.showSurveyPrompt(newCount);
    }
  }

  /**
   * Show the survey prompt to the user using VS Code's modal dialog
   */
  private async showSurveyPrompt(currentUsage?: number): Promise<void> {
    const usage = typeof currentUsage === 'number' ? currentUsage : this.context.globalState.get<number>(SurveyPrompt.USAGE_COUNT_KEY, 0);
    await this.context.globalState.update(SurveyPrompt.LAST_SHOWN_KEY, usage);

    const message = 'PICK is a research tool. It helps us justify it to our funders if we can show some user feedback. Would you help us by completing a very short, quick survey and/or by rating us?';

    const surveyOption = 'Share Feedback';
    const rateOption = 'Rate Extension';
    const remindOption = 'Remind Me Later';
    const dontAskOption = "Don't Ask Again";

    const choice = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      surveyOption,
      rateOption,
      remindOption,
      dontAskOption
    );

    if (choice === surveyOption) {
      // Open survey in browser
      logger.info('User chose to share feedback');
      await vscode.env.openExternal(vscode.Uri.parse(SurveyPrompt.SURVEY_URL));
      // Mark as dismissed so we don't show it again
      await this.context.globalState.update(SurveyPrompt.SURVEY_DISMISSED_KEY, true);
      // Clear any pending remind schedule
      await this.context.globalState.update(SurveyPrompt.REMIND_AT_KEY, undefined);
    } else if (choice === rateOption) {
      // Open marketplace page in browser
      logger.info('User chose to rate on marketplace');
      await vscode.env.openExternal(vscode.Uri.parse(SurveyPrompt.MARKETPLACE_URL));
      // Mark as dismissed so we don't show it again
      await this.context.globalState.update(SurveyPrompt.SURVEY_DISMISSED_KEY, true);
      await this.context.globalState.update(SurveyPrompt.SURVEY_RATED_KEY, true);
      await this.context.globalState.update(SurveyPrompt.REMIND_AT_KEY, undefined);
    } else if (choice === dontAskOption) {
      // Mark as dismissed permanently
      logger.info('User chose not to be asked again');
      await this.context.globalState.update(SurveyPrompt.SURVEY_DISMISSED_KEY, true);
      await this.context.globalState.update(SurveyPrompt.REMIND_AT_KEY, undefined);
    } else if (choice === remindOption) {
      // Schedule to remind later after 5 more uses
      const usage = typeof currentUsage === 'number' ? currentUsage : this.context.globalState.get<number>(SurveyPrompt.USAGE_COUNT_KEY, 0);
      const remindAt = usage + 5;
      logger.info(`User asked to be reminded later. Scheduling survey at usage count ${remindAt}`);
      await this.context.globalState.update(SurveyPrompt.REMIND_AT_KEY, remindAt);
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
    await this.context.globalState.update(SurveyPrompt.SURVEY_RATED_KEY, false);
    await this.context.globalState.update(SurveyPrompt.REMIND_AT_KEY, undefined);
    await this.context.globalState.update(SurveyPrompt.LAST_SHOWN_KEY, undefined);
    logger.info('Reset usage tracking');
  }
}
