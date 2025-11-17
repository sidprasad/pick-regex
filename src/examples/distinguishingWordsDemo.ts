import { createRegexAnalyzer } from '../regexAnalyzer';

/**
 * Simple demonstration of the distinguishing words functionality
 * Mirrors the Python LTL logic for generating distinguishing words
 */

/**
 * Generate (maximally) distinguishing words between two regexes
 * Similar to: generate_distinguishing_words(formula1_str, formula2_str, exclude)
 * 
 * @param regex1 First regex pattern
 * @param regex2 Second regex pattern
 * @param excludedWords Optional list of words to exclude
 * @returns Tuple of two distinguishing words [word1, word2]
 */
export function generateDistinguishingWords(
  regex1: string,
  regex2: string,
  excludedWords: string[] = []
): [string, string] {
  try {
    const analyzer = createRegexAnalyzer();
    const result = analyzer.generateDistinguishingWords(
      regex1,
      regex2,
      excludedWords
    );
    
    return [result.word1, result.word2];
  } catch (error) {
    console.error('Error generating distinguishing words:', error);
    return ["", ""];
  }
}

/**
 * Generate two distinguishing words from a set of candidate regexes
 * Similar to: generate_two_distinguishing_words(candidates_in_play, excluded_words)
 * 
 * @param candidatesInPlay Array of regex patterns to distinguish between
 * @param excludedWords Optional list of words to exclude
 * @returns Array of two distinguishing words
 */
export function generateTwoDistinguishingWords(
  candidatesInPlay: string[],
  excludedWords: string[] = []
): [string, string] {
  try {
    const analyzer = createRegexAnalyzer();
    const result = analyzer.generateTwoDistinguishingWords(
      candidatesInPlay,
      excludedWords
    );
    
    return result.words;
  } catch (error) {
    console.error('Error generating two distinguishing words:', error);
    return ["", ""];
  }
}

/**
 * Demo: Run both distinguishing word functions
 */
export function runDistinguishingWordsDemo() {
  console.log('=== Distinguishing Words Demo ===\n');
  
  // Demo 1: Distinguishing between two specific regexes
  console.log('Demo 1: Distinguishing between two regexes');
  const regex1 = '[0-9]+';
  const regex2 = '[0-9a-f]+';
  console.log(`  Regex 1: ${regex1}`);
  console.log(`  Regex 2: ${regex2}`);
  
  const [word1, word2] = generateDistinguishingWords(regex1, regex2);
  console.log(`  Result: ["${word1}", "${word2}"]\n`);
  
  // Demo 2: Distinguishing among multiple candidates
  console.log('Demo 2: Distinguishing among candidate regexes');
  const candidates = [
    '\\d{3}',           // exactly 3 digits
    '\\d{4}',           // exactly 4 digits
    '[a-z]{3}',         // exactly 3 lowercase letters
    '[A-Z]{3}',         // exactly 3 uppercase letters
    '[a-zA-Z]{3}'       // exactly 3 letters (any case)
  ];
  console.log(`  Candidates: ${candidates.join(', ')}`);
  
  const [dist1, dist2] = generateTwoDistinguishingWords(candidates);
  console.log(`  Result: ["${dist1}", "${dist2}"]\n`);
  
  // Demo 3: With exclusions
  console.log('Demo 3: With excluded words');
  const excluded = ['123', 'abc', 'ABC'];
  console.log(`  Excluded: ${excluded.join(', ')}`);
  
  const [word3, word4] = generateTwoDistinguishingWords(
    ['\\d+', '[a-z]+', '[A-Z]+'],
    excluded
  );
  console.log(`  Result: ["${word3}", "${word4}"]\n`);
}

/**
 * Register a command to run the demo
 */
export function registerDistinguishingWordsDemo(context: any) {
  const command = /* vscode.commands.registerCommand */(
    'pick.runDistinguishingWordsDemo',
    () => {
      console.log('Running Distinguishing Words Demo...');
      
      try {
        runDistinguishingWordsDemo();
        console.log('Demo completed!');
      } catch (error) {
        console.error(`Error: ${error}`);
      }
    }
  );
  
  // context.subscriptions.push(command);
}
