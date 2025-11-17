import * as vscode from 'vscode';
import { createRegexAnalyzer, RegexRelationship } from '../regexAnalyzer';

/**
 * Example usage of the RegexAnalyzer class
 * This file demonstrates all three main functionalities:
 * 1. Generating words that match a regex
 * 2. Analyzing relationships between two regexes
 * 3. Generating word pairs (matching and non-matching)
 */

export async function demonstrateRegexAnalyzer() {
  // Create a cancellation token for our operations
  const tokenSource = new vscode.CancellationTokenSource();
  const token = tokenSource.token;

  try {
    // Initialize the analyzer
    const analyzer = await createRegexAnalyzer();
    console.log('RegexAnalyzer initialized successfully');

    // ====================================
    // 1. Generate words matching a regex
    // ====================================
    console.log('\n=== Example 1: Generate words matching a regex ===');
    
    const emailRegex = '[a-z]+@[a-z]+\\.[a-z]+';
    const seenWords: string[] = [];
    
    // Generate first word
    const word1 = await analyzer.generateWord(emailRegex, seenWords, token);
    console.log(`Generated word 1: ${word1.word}`);
    console.log(`Explanation: ${word1.explanation}`);
    seenWords.push(word1.word);
    
    // Generate second word (different from first)
    const word2 = await analyzer.generateWord(emailRegex, seenWords, token);
    console.log(`Generated word 2: ${word2.word}`);
    console.log(`Explanation: ${word2.explanation}`);
    seenWords.push(word2.word);
    
    // Generate multiple words at once
    const phoneRegex = '\\d{3}-\\d{3}-\\d{4}';
    const multipleWords = await analyzer.generateMultipleWords(phoneRegex, 3, token);
    console.log(`\nGenerated phone numbers: ${multipleWords.join(', ')}`);

    // ====================================
    // 2. Analyze regex relationships
    // ====================================
    console.log('\n=== Example 2: Analyze relationships between regexes ===');
    
    // Example 2a: One regex is a subset of another
    const regexA = '[a-z]{3}';  // exactly 3 lowercase letters
    const regexB = '[a-z]+';    // one or more lowercase letters
    
    const relationship1 = await analyzer.analyzeRelationship(regexA, regexB, token);
    console.log(`\nRelationship between '${regexA}' and '${regexB}':`);
    console.log(`Type: ${relationship1.relationship}`);
    console.log(`Explanation: ${relationship1.explanation}`);
    if (relationship1.examples) {
      console.log('Examples:', JSON.stringify(relationship1.examples, null, 2));
    }
    
    // Example 2b: Disjoint regexes
    const regexC = '\\d+';      // one or more digits
    const regexD = '[a-z]+';    // one or more letters
    
    const relationship2 = await analyzer.analyzeRelationship(regexC, regexD, token);
    console.log(`\nRelationship between '${regexC}' and '${regexD}':`);
    console.log(`Type: ${relationship2.relationship}`);
    console.log(`Explanation: ${relationship2.explanation}`);
    
    // Example 2c: Intersecting regexes
    const regexE = '[a-z0-9]+';  // alphanumeric
    const regexF = '[0-9a-f]+';  // hexadecimal
    
    const relationship3 = await analyzer.analyzeRelationship(regexE, regexF, token);
    console.log(`\nRelationship between '${regexE}' and '${regexF}':`);
    console.log(`Type: ${relationship3.relationship}`);
    console.log(`Explanation: ${relationship3.explanation}`);

    // ====================================
    // 3. Generate word pairs (IN and NOT IN)
    // ====================================
    console.log('\n=== Example 3: Generate word pairs (matching and non-matching) ===');
    
    const urlRegex = 'https?://[a-z0-9]+\\.[a-z]{2,}';
    const excludedUrls = ['http://example.com', 'https://test.org'];
    
    const wordPair1 = await analyzer.generateWordPair(urlRegex, excludedUrls, token);
    console.log(`\nRegex: ${urlRegex}`);
    console.log(`Word that MATCHES: ${wordPair1.wordIn}`);
    console.log(`Word that does NOT match: ${wordPair1.wordNotIn}`);
    console.log(`Explanation: ${wordPair1.explanation}`);
    
    // Another example with a simpler regex
    const digitRegex = '\\d{4}';
    const wordPair2 = await analyzer.generateWordPair(digitRegex, [], token);
    console.log(`\nRegex: ${digitRegex}`);
    console.log(`Word that MATCHES: ${wordPair2.wordIn}`);
    console.log(`Word that does NOT match: ${wordPair2.wordNotIn}`);
    
    // Verify the matches using built-in validation
    console.log(`\n=== Verification ===`);
    console.log(`Verifying '${wordPair2.wordIn}' matches '${digitRegex}': ${analyzer.verifyMatch(wordPair2.wordIn, digitRegex)}`);
    console.log(`Verifying '${wordPair2.wordNotIn}' matches '${digitRegex}': ${analyzer.verifyMatch(wordPair2.wordNotIn, digitRegex)}`);

    // ====================================
    // 4. Generate distinguishing words between two regexes
    // ====================================
    console.log('\n=== Example 4: Generate distinguishing words between two regexes ===');
    
    // Example 4a: Distinguishing between similar patterns
    const phoneRegex1 = '\\d{3}-\\d{3}-\\d{4}';  // US phone with dashes
    const phoneRegex2 = '\\d{10}';                // 10 digits no dashes
    
    const distinguishing1 = await analyzer.generateDistinguishingWords(
      phoneRegex1,
      phoneRegex2,
      [],
      token
    );
    console.log(`\nDistinguishing between '${phoneRegex1}' and '${phoneRegex2}':`);
    console.log(`Word 1: ${distinguishing1.word1}`);
    console.log(`Word 2: ${distinguishing1.word2}`);
    console.log(`Explanation: ${distinguishing1.explanation}`);
    if (distinguishing1.distinguishingProperty) {
      console.log(`Property: ${distinguishing1.distinguishingProperty}`);
    }
    
    // Example 4b: Distinguishing between subset/superset
    const strictEmail = '[a-z]+@[a-z]+\\.com';     // only .com emails
    const relaxedEmail = '[a-z]+@[a-z]+\\.[a-z]+'; // any TLD
    
    const distinguishing2 = await analyzer.generateDistinguishingWords(
      strictEmail,
      relaxedEmail,
      ['user@example.com'],
      token
    );
    console.log(`\nDistinguishing between '${strictEmail}' and '${relaxedEmail}':`);
    console.log(`Word 1: ${distinguishing2.word1}`);
    console.log(`Word 2: ${distinguishing2.word2}`);
    console.log(`Explanation: ${distinguishing2.explanation}`);

    // ====================================
    // 5. Generate two distinguishing words from candidates
    // ====================================
    console.log('\n=== Example 5: Generate two distinguishing words from candidate regexes ===');
    
    const candidateRegexes = [
      '\\d+',              // numbers only
      '[a-z]+',            // lowercase letters only
      '[a-zA-Z]+',         // any letters
      '[a-z0-9]+',         // lowercase alphanumeric
      '[a-zA-Z0-9]+'       // any alphanumeric
    ];
    
    const twoWords = await analyzer.generateTwoDistinguishingWords(
      candidateRegexes,
      [],
      token
    );
    console.log(`\nCandidate regexes: ${candidateRegexes.join(', ')}`);
    console.log(`\nTwo most distinguishing words: [${twoWords.words.join(', ')}]`);
    console.log(`Explanation: ${twoWords.explanation}`);
    if (twoWords.properties) {
      console.log(`Properties: ${twoWords.properties.join(', ')}`);
    }
    
    // Show which candidates each word matches
    console.log('\nMatching analysis:');
    twoWords.words.forEach((word, idx) => {
      console.log(`  Word ${idx + 1} (${word}) matches:`);
      candidateRegexes.forEach((regex, regexIdx) => {
        const matches = analyzer.verifyMatch(word, regex);
        console.log(`    Regex ${regexIdx + 1} (${regex}): ${matches ? '✓' : '✗'}`);
      });
    });

  } catch (error) {
    console.error('Error during demonstration:', error);
  } finally {
    tokenSource.dispose();
  }
}

/**
 * Register a VS Code command to run the demonstration
 */
export function registerDemoCommand(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('pick.demonstrateRegexAnalyzer', async () => {
    vscode.window.showInformationMessage('Running RegexAnalyzer demonstration...');
    
    try {
      await demonstrateRegexAnalyzer();
      vscode.window.showInformationMessage('RegexAnalyzer demonstration completed! Check the Debug Console for output.');
    } catch (error) {
      vscode.window.showErrorMessage(`Error: ${error}`);
    }
  });
  
  context.subscriptions.push(command);
}
