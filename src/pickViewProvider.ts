import * as vscode from 'vscode';
import { PickController, PickState, WordPair } from './pickController';
import { generateRegexFromDescription } from './regexService';

export class PickViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'pick.pickView';
  private view?: vscode.WebviewView;
  private controller: PickController;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.controller = new PickController();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'generateCandidates':
          await this.handleGenerateCandidates(data.prompt);
          break;
        case 'vote':
          this.handleVote(data.acceptedWord);
          break;
        case 'reset':
          this.handleReset();
          break;
        case 'requestNextPair':
          this.handleRequestNextPair();
          break;
      }
    });
  }

  private async handleGenerateCandidates(prompt: string) {
    try {
      this.sendMessage({ type: 'status', message: 'Generating candidate regexes...' });

      // Generate ~4 candidate regexes using LLM
      const candidates: string[] = [];
      const tokenSource = new vscode.CancellationTokenSource();
      
      for (let i = 0; i < 4; i++) {
        try {
          const result = await generateRegexFromDescription(prompt, tokenSource.token);
          candidates.push(result.regex);
        } catch (error) {
          console.error(`Failed to generate candidate ${i}:`, error);
        }
      }

      if (candidates.length < 2) {
        this.sendMessage({ 
          type: 'error', 
          message: 'Could not generate enough candidate regexes. Please try again.' 
        });
        return;
      }

      // Initialize controller with candidates
      await this.controller.generateCandidates(prompt, candidates);
      
      this.sendMessage({
        type: 'candidatesGenerated',
        candidates: this.controller.getStatus().candidateDetails
      });

      // Generate first word pair
      this.handleRequestNextPair();
      
    } catch (error) {
      this.sendMessage({ 
        type: 'error', 
        message: `Error: ${error}` 
      });
    }
  }

  private handleRequestNextPair() {
    try {
      const activeCount = this.controller.getActiveCandidateCount();
      
      if (activeCount <= 1) {
        // We're done! Show final result
        this.handleFinalResult();
        return;
      }

      const pair = this.controller.generateNextPair();
      const status = this.controller.getStatus();
      
      this.sendMessage({
        type: 'newPair',
        pair,
        status
      });
    } catch (error) {
      this.sendMessage({ 
        type: 'error', 
        message: `Error generating pair: ${error}` 
      });
    }
  }

  private handleVote(acceptedWord: string) {
    try {
      this.controller.processVote(acceptedWord);
      
      const state = this.controller.getState();
      const status = this.controller.getStatus();
      
      if (state === PickState.FINAL_RESULT) {
        this.handleFinalResult();
      } else {
        // Send updated status
        this.sendMessage({
          type: 'voteProcessed',
          status
        });
        
        // Generate next pair
        this.handleRequestNextPair();
      }
    } catch (error) {
      this.sendMessage({ 
        type: 'error', 
        message: `Error processing vote: ${error}` 
      });
    }
  }

  private handleFinalResult() {
    try {
      const finalRegex = this.controller.getFinalRegex();
      if (!finalRegex) {
        throw new Error('No final regex available');
      }

      const examples = this.controller.generateFinalExamples(5);
      
      this.sendMessage({
        type: 'finalResult',
        regex: finalRegex,
        wordsIn: examples.wordsIn,
        wordsOut: examples.wordsOut
      });
    } catch (error) {
      this.sendMessage({ 
        type: 'error', 
        message: `Error showing results: ${error}` 
      });
    }
  }

  private handleReset() {
    this.controller.reset();
    this.sendMessage({ type: 'reset' });
  }

  private sendMessage(message: any) {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PICK - Regex Learner</title>
  <style>
    body {
      padding: 10px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      font-size: var(--vscode-font-size);
    }
    
    .container {
      max-width: 100%;
    }
    
    .section {
      margin-bottom: 20px;
      padding: 15px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
    }
    
    h2 {
      margin-top: 0;
      color: var(--vscode-titleBar-activeForeground);
      font-size: 1.2em;
    }
    
    input[type="text"] {
      width: 100%;
      padding: 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      box-sizing: border-box;
      margin-bottom: 10px;
    }
    
    button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 13px;
      margin-right: 8px;
      margin-bottom: 8px;
    }
    
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    
    .word-pair {
      display: flex;
      gap: 10px;
      margin: 15px 0;
    }
    
    .word-card {
      flex: 1;
      padding: 20px;
      background: var(--vscode-editor-background);
      border: 2px solid var(--vscode-input-border);
      border-radius: 4px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .word-card:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }
    
    .word-card .word {
      font-size: 1.5em;
      font-weight: bold;
      margin-bottom: 10px;
      color: var(--vscode-editor-foreground);
      font-family: monospace;
    }
    
    .status-bar {
      padding: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 4px;
      margin-bottom: 15px;
      font-size: 0.9em;
    }
    
    .candidates-list {
      margin-top: 10px;
    }
    
    .candidate-item {
      padding: 8px;
      margin: 4px 0;
      background: var(--vscode-list-inactiveSelectionBackground);
      border-radius: 2px;
      font-family: monospace;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .candidate-item.eliminated {
      opacity: 0.5;
      text-decoration: line-through;
    }
    
    .candidate-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      border-left: 3px solid var(--vscode-focusBorder);
    }
    
    .badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 0.85em;
    }
    
    .final-result {
      text-align: center;
    }
    
    .regex-display {
      font-size: 1.5em;
      font-family: monospace;
      padding: 15px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      margin: 15px 0;
      word-break: break-all;
    }
    
    .examples {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-top: 15px;
    }
    
    .example-box {
      padding: 10px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
    }
    
    .example-box h3 {
      margin-top: 0;
      font-size: 1em;
    }
    
    .example-box.in {
      border-left: 3px solid #4caf50;
    }
    
    .example-box.out {
      border-left: 3px solid #f44336;
    }
    
    .example-item {
      font-family: monospace;
      padding: 4px 8px;
      margin: 4px 0;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 2px;
    }
    
    .hidden {
      display: none;
    }
    
    .loading {
      text-align: center;
      padding: 20px;
      color: var(--vscode-descriptionForeground);
    }
    
    .error {
      padding: 10px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
      border-radius: 4px;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Initial Prompt -->
    <div id="promptSection" class="section">
      <h2>🎯 PICK: Interactive Regex Learner</h2>
      <p>Describe the pattern you want to match:</p>
      <input type="text" id="promptInput" placeholder="e.g., email addresses, phone numbers, dates..." />
      <button id="generateBtn">Generate Candidates</button>
    </div>

    <!-- Status Bar -->
    <div id="statusBar" class="status-bar hidden"></div>

    <!-- Voting Section -->
    <div id="votingSection" class="section hidden">
      <h2>Choose the word that better matches your intent:</h2>
      <div class="word-pair" id="wordPair"></div>
      <div class="candidates-list" id="candidatesList"></div>
    </div>

    <!-- Final Result -->
    <div id="finalSection" class="section hidden">
      <div class="final-result">
        <h2>🎉 Final Regex</h2>
        <div class="regex-display" id="finalRegex"></div>
        <div class="examples">
          <div class="example-box in">
            <h3>✅ Words IN</h3>
            <div id="wordsIn"></div>
          </div>
          <div class="example-box out">
            <h3>❌ Words OUT</h3>
            <div id="wordsOut"></div>
          </div>
        </div>
        <button id="resetBtn">Start Over</button>
      </div>
    </div>

    <!-- Error Display -->
    <div id="errorSection" class="error hidden"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    // UI Elements
    const promptSection = document.getElementById('promptSection');
    const votingSection = document.getElementById('votingSection');
    const finalSection = document.getElementById('finalSection');
    const statusBar = document.getElementById('statusBar');
    const errorSection = document.getElementById('errorSection');
    const generateBtn = document.getElementById('generateBtn');
    const promptInput = document.getElementById('promptInput');
    const wordPair = document.getElementById('wordPair');
    const candidatesList = document.getElementById('candidatesList');
    const finalRegex = document.getElementById('finalRegex');
    const wordsIn = document.getElementById('wordsIn');
    const wordsOut = document.getElementById('wordsOut');
    const resetBtn = document.getElementById('resetBtn');

    // Event Listeners
    generateBtn.addEventListener('click', () => {
      const prompt = promptInput.value.trim();
      if (prompt) {
        vscode.postMessage({ type: 'generateCandidates', prompt });
        showSection('loading');
      }
    });

    resetBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'reset' });
    });

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.type) {
        case 'status':
          showStatus(message.message);
          break;
        case 'error':
          showError(message.message);
          break;
        case 'candidatesGenerated':
          updateCandidates(message.candidates);
          break;
        case 'newPair':
          showWordPair(message.pair, message.status);
          break;
        case 'voteProcessed':
          updateCandidates(message.status.candidateDetails);
          showStatus(\`Active candidates: \${message.status.activeCandidates}\`);
          break;
        case 'finalResult':
          showFinalResult(message.regex, message.wordsIn, message.wordsOut);
          break;
        case 'reset':
          resetUI();
          break;
      }
    });

    function showSection(section) {
      promptSection.classList.add('hidden');
      votingSection.classList.add('hidden');
      finalSection.classList.add('hidden');
      errorSection.classList.add('hidden');
      
      if (section === 'prompt') {
        promptSection.classList.remove('hidden');
      } else if (section === 'voting') {
        votingSection.classList.remove('hidden');
        statusBar.classList.remove('hidden');
      } else if (section === 'final') {
        finalSection.classList.remove('hidden');
      } else if (section === 'loading') {
        statusBar.classList.remove('hidden');
      }
    }

    function showStatus(message) {
      statusBar.textContent = message;
      statusBar.classList.remove('hidden');
    }

    function showError(message) {
      errorSection.textContent = message;
      errorSection.classList.remove('hidden');
    }

    function updateCandidates(candidates) {
      candidatesList.innerHTML = '<h3>Candidates:</h3>';
      candidates.forEach(c => {
        const div = document.createElement('div');
        div.className = \`candidate-item \${c.eliminated ? 'eliminated' : 'active'}\`;
        div.innerHTML = \`
          <span>\${c.pattern}</span>
          <span class="badge">❌ \${c.votes}</span>
        \`;
        candidatesList.appendChild(div);
      });
    }

    function showWordPair(pair, status) {
      showSection('voting');
      updateCandidates(status.candidateDetails);
      showStatus(\`Active: \${status.activeCandidates}/\${status.totalCandidates} | Words used: \${status.usedWords}\`);
      
      wordPair.innerHTML = \`
        <div class="word-card" onclick="vote('\${pair.word1}')">
          <div class="word">\${pair.word1}</div>
          <button>Select This</button>
        </div>
        <div class="word-card" onclick="vote('\${pair.word2}')">
          <div class="word">\${pair.word2}</div>
          <button>Select This</button>
        </div>
      \`;
    }

    function vote(word) {
      vscode.postMessage({ type: 'vote', acceptedWord: word });
    }

    function showFinalResult(regex, inWords, outWords) {
      showSection('final');
      finalRegex.textContent = regex;
      
      wordsIn.innerHTML = inWords.map(w => 
        \`<div class="example-item">\${w}</div>\`
      ).join('');
      
      wordsOut.innerHTML = outWords.map(w => 
        \`<div class="example-item">\${w}</div>\`
      ).join('');
    }

    function resetUI() {
      promptInput.value = '';
      showSection('prompt');
      statusBar.classList.add('hidden');
    }
  </script>
</body>
</html>`;
  }
}
