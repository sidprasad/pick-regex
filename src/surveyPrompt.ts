import * as vscode from 'vscode';
import { logger } from './logger';

/**
 * Manages survey prompt logic for collecting user feedback after N uses
 */
export class SurveyPrompt {
  private static readonly USAGE_COUNT_KEY = 'pick.usageCount';
  private static readonly SURVEY_DISMISSED_KEY = 'pick.surveyDismissed';
  private static readonly USAGE_THRESHOLD = 3;
  // TODO: Replace with actual survey URL when available
  // For now, we'll use the GitHub repository as a fallback
  private static readonly SURVEY_URL = 'https://brown.co1.qualtrics.com/jfe/form/SV_a90QURkTTwI9eHY';
  private static readonly MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=SiddharthaPrasad.pick-regex&ssr=false#review-details';
  
  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Increment usage count and check if survey should be shown
   * Returns true if survey should be displayed
   */
  async incrementUsageAndCheckPrompt(): Promise<boolean> {
    // Check if survey prompt is enabled in configuration
    const config = vscode.workspace.getConfiguration('pick');
    const surveyEnabled = config.get<boolean>('surveyPromptEnabled', true);
    
    if (!surveyEnabled) {
      logger.info('Survey prompt is disabled in configuration');
      return false;
    }

    // Check if user has already dismissed the survey
    const dismissed = this.context.globalState.get<boolean>(SurveyPrompt.SURVEY_DISMISSED_KEY, false);
    if (dismissed) {
      return false;
    }

    // Get current usage count
    const usageCount = this.context.globalState.get<number>(SurveyPrompt.USAGE_COUNT_KEY, 0);
    const newCount = usageCount + 1;
    
    // Update usage count
    await this.context.globalState.update(SurveyPrompt.USAGE_COUNT_KEY, newCount);
    logger.info(`PICK usage count: ${newCount}`);

    // Check if we should show the survey
    if (newCount >= SurveyPrompt.USAGE_THRESHOLD) {
      return true;
    }
    
    return false;
  }

  /**
   * Get survey and marketplace URLs
   */
  getSurveyUrls(): { surveyUrl: string; marketplaceUrl: string } {
    return {
      surveyUrl: SurveyPrompt.SURVEY_URL,
      marketplaceUrl: SurveyPrompt.MARKETPLACE_URL
    };
  }

  /**
   * Mark survey as dismissed
   */
  async dismissSurvey(): Promise<void> {
    await this.context.globalState.update(SurveyPrompt.SURVEY_DISMISSED_KEY, true);
    logger.info('Survey dismissed permanently');
  }

  /**
   * Check if survey should be shown (without incrementing)
   */
  shouldShowSurvey(): boolean {
    const config = vscode.workspace.getConfiguration('pick');
    const surveyEnabled = config.get<boolean>('surveyPromptEnabled', true);
    
    if (!surveyEnabled) {
      return false;
    }

    const dismissed = this.context.globalState.get<boolean>(SurveyPrompt.SURVEY_DISMISSED_KEY, false);
    if (dismissed) {
      return false;
    }

    const usageCount = this.context.globalState.get<number>(SurveyPrompt.USAGE_COUNT_KEY, 0);
    return usageCount >= SurveyPrompt.USAGE_THRESHOLD;
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
