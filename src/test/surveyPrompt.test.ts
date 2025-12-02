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

  test('incrementUsageAndCheckPrompt increments usage count', async () => {
    const surveyPrompt = new SurveyPrompt(mockContext);
    
    // Initial count should be 0
    assert.strictEqual(mockGlobalState.get('pick.usageCount'), undefined);
    
    // Increment once
    await surveyPrompt.incrementUsageAndCheckPrompt();
    assert.strictEqual(mockGlobalState.get('pick.usageCount'), 1);
    
    // Increment again
    await surveyPrompt.incrementUsageAndCheckPrompt();
    assert.strictEqual(mockGlobalState.get('pick.usageCount'), 2);
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
    
    // Increment 3 times - should not show prompt
    await surveyPrompt.incrementUsageAndCheckPrompt();
    await surveyPrompt.incrementUsageAndCheckPrompt();
    await surveyPrompt.incrementUsageAndCheckPrompt();
    
    // Count should still be 3
    assert.strictEqual(mockGlobalState.get('pick.usageCount'), 3);
  });
});
