import * as assert from 'assert';
import * as vscode from 'vscode';
import { SurveyPrompt } from '../surveyPrompt';

suite('SurveyPrompt Test Suite', () => {
  let mockContext: vscode.ExtensionContext;
  let mockGlobalState: Map<string, any>;

  setup(() => {
    // Create a mock global state
    mockGlobalState = new Map<string, any>();
    
    mockContext = {
      globalState: {
        get: <T>(key: string, defaultValue?: T): T => {
          return mockGlobalState.has(key) ? mockGlobalState.get(key) : defaultValue!;
        },
        update: async (key: string, value: any): Promise<void> => {
          mockGlobalState.set(key, value);
        },
        keys: () => Array.from(mockGlobalState.keys())
      }
    } as any;
  });

  test('incrementUsageAndCheckPrompt increments usage count and returns false before threshold', async () => {
    const surveyPrompt = new SurveyPrompt(mockContext);
    
    // Initial count should be 0
    assert.strictEqual(mockGlobalState.get('pick.usageCount'), undefined);
    
    // Increment once - should return false (not at threshold)
    let result = await surveyPrompt.incrementUsageAndCheckPrompt();
    assert.strictEqual(mockGlobalState.get('pick.usageCount'), 1);
    assert.strictEqual(result, false);
    
    // Increment again - should return false
    result = await surveyPrompt.incrementUsageAndCheckPrompt();
    assert.strictEqual(mockGlobalState.get('pick.usageCount'), 2);
    assert.strictEqual(result, false);
  });

  test('incrementUsageAndCheckPrompt returns true at threshold', async () => {
    const surveyPrompt = new SurveyPrompt(mockContext);
    
    // Increment to threshold
    await surveyPrompt.incrementUsageAndCheckPrompt(); // 1
    await surveyPrompt.incrementUsageAndCheckPrompt(); // 2
    const result = await surveyPrompt.incrementUsageAndCheckPrompt(); // 3
    
    assert.strictEqual(mockGlobalState.get('pick.usageCount'), 3);
    assert.strictEqual(result, true);
  });

  test('resetUsageTracking clears state', async () => {
    const surveyPrompt = new SurveyPrompt(mockContext);
    
    // Set some values
    await mockContext.globalState.update('pick.usageCount', 5);
    await mockContext.globalState.update('pick.surveyDismissed', true);
    
    // Reset
    await surveyPrompt.resetUsageTracking();
    
    assert.strictEqual(mockGlobalState.get('pick.usageCount'), 0);
    assert.strictEqual(mockGlobalState.get('pick.surveyDismissed'), false);
  });

  test('survey not shown if dismissed', async () => {
    const surveyPrompt = new SurveyPrompt(mockContext);
    
    // Mark as dismissed
    await mockContext.globalState.update('pick.surveyDismissed', true);
    
    // Increment 3 times - should return false (dismissed)
    let result1 = await surveyPrompt.incrementUsageAndCheckPrompt();
    let result2 = await surveyPrompt.incrementUsageAndCheckPrompt();
    let result3 = await surveyPrompt.incrementUsageAndCheckPrompt();
    
    assert.strictEqual(result1, false);
    assert.strictEqual(result2, false);
    assert.strictEqual(result3, false);
  });

  test('getSurveyUrls returns correct URLs', () => {
    const surveyPrompt = new SurveyPrompt(mockContext);
    const urls = surveyPrompt.getSurveyUrls();
    
    assert.ok(urls.surveyUrl);
    assert.ok(urls.marketplaceUrl);
    assert.ok(urls.surveyUrl.includes('http'));
    assert.ok(urls.marketplaceUrl.includes('marketplace'));
  });

  test('dismissSurvey marks as dismissed', async () => {
    const surveyPrompt = new SurveyPrompt(mockContext);
    
    await surveyPrompt.dismissSurvey();
    
    assert.strictEqual(mockGlobalState.get('pick.surveyDismissed'), true);
  });

  test('shouldShowSurvey returns correct value', async () => {
    const surveyPrompt = new SurveyPrompt(mockContext);
    
    // Initially should be false
    assert.strictEqual(surveyPrompt.shouldShowSurvey(), false);
    
    // After reaching threshold, should be true
    await mockContext.globalState.update('pick.usageCount', 3);
    assert.strictEqual(surveyPrompt.shouldShowSurvey(), true);
    
    // After dismissing, should be false
    await surveyPrompt.dismissSurvey();
    assert.strictEqual(surveyPrompt.shouldShowSurvey(), false);
  });
});
