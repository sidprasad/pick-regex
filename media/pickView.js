/**
 * PICK Regex Builder - Webview JavaScript
 * 
 * This file contains all the client-side logic for the PICK webview interface.
 * It must be initialized with the VS Code API object from the webview context.
 */

(function() {
    'use strict';

    /**
     * Initialize the PICK webview interface
     * @param {object} vscodeApi - The VS Code API object from acquireVsCodeApi()
     */
    window.initializePickView = function(vscodeApi) {
        const vscode = vscodeApi;

        // UI Elements
        const promptSection = document.getElementById('promptSection');
        const votingSection = document.getElementById('votingSection');
        const finalSection = document.getElementById('finalSection');
        const statusBar = document.getElementById('statusBar');
        const statusMessage = document.getElementById('statusMessage');
        const statusCancelBtn = document.getElementById('statusCancelBtn');
        const inlineCancelBtn = document.getElementById('inlineCancelBtn');
        const errorSection = document.getElementById('errorSection');
        const literalToggle = document.getElementById('literalToggle');
        const showCandidatesToggle = document.getElementById('showCandidatesToggle');
        const displayOptionsBtn = document.getElementById('displayOptionsBtn');
        const displayOptionsMenu = document.getElementById('displayOptionsMenu');
        const currentPromptDisplay = document.getElementById('currentPromptDisplay');
        const finalPromptDisplay = document.getElementById('finalPromptDisplay');
        const reportIssueBtn = document.getElementById('reportIssueBtn');
        const diffToggle = document.getElementById('diffToggle');
        const recentPromptsBtn = document.getElementById('recentPromptsBtn');
        const recentPromptsMenu = document.getElementById('recentPromptsMenu');
        const recentPromptList = document.getElementById('recentPromptList');

        // Model selector elements
        const modelSelect = document.getElementById('modelSelect');
        const modelSelectorRow = document.getElementById('modelSelectorRow');

        // Splash screen elements
        const splashScreen = document.getElementById('splashScreen');
        const splashStartBtn = document.getElementById('splashStartBtn');
        const splashDismissBtn = document.getElementById('splashDismissBtn');

        // Additional UI Elements
        const promptInput = document.getElementById('promptInput');
        const generateBtn = document.getElementById('generateBtn');
        const resetBtn = document.getElementById('resetBtn');
        const startFreshBtn = document.getElementById('startFreshBtn');
        const cancelBtn = inlineCancelBtn;

        // Persisted webview state (used to avoid repeatedly showing the splash)
        let viewState = vscode.getState() || {};
        const hasAcknowledgedSplash = Boolean(viewState.splashAcknowledged);
        let promptHistory = Array.isArray(viewState.promptHistory)
            ? viewState.promptHistory.slice(0, 5)
            : [];
        
        // Random placeholder rotation
        const placeholders = [
            'e.g., January birthdays',
            'e.g., T Shirt Sizes',
            'e.g., Countries in North America'
        ];
        
        // Set a random placeholder on load
        if (promptInput) {
            const randomIndex = Math.floor(Math.random() * placeholders.length);
            promptInput.placeholder = placeholders[randomIndex];
        }
        
        // Track available models
        let availableModels = [];
        let selectedModelId = '';
        let previousModelId = '';

        function hideSplash() {
            if (splashScreen) {
                splashScreen.classList.add('hidden');
                splashScreen.setAttribute('aria-hidden', 'true');
            }

            viewState = { ...viewState, splashAcknowledged: true };
            vscode.setState(viewState);

            if (promptInput) {
                promptInput.focus();
            }
        }

        if (splashScreen && !hasAcknowledgedSplash) {
            splashScreen.classList.remove('hidden');
            splashScreen.setAttribute('aria-hidden', 'false');
        }

        if (splashStartBtn) {
            splashStartBtn.addEventListener('click', hideSplash);
        }

        if (splashDismissBtn) {
            splashDismissBtn.addEventListener('click', hideSplash);
        }

        if (statusCancelBtn) {
            statusCancelBtn.addEventListener('click', function() {
                vscode.postMessage({ type: 'cancel' });
            });
        }
        if (reportIssueBtn) {
            reportIssueBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'reportIssue' });
            });
        }
        
        // Handle model selection change
        if (modelSelect) {
            modelSelect.addEventListener('change', function() {
                selectedModelId = modelSelect.value;
            });
        }
        
        const wordPair = document.getElementById('wordPair');
        const candidatesList = document.getElementById('candidatesList');
        const wordHistory = document.getElementById('wordHistory');
        const historyItems = document.getElementById('historyItems');
        const finalRegex = document.getElementById('finalRegex');
        const wordsIn = document.getElementById('wordsIn');
        const wordsOut = document.getElementById('wordsOut');

        // Track literal mode state
        let literalMode = true;
        // Track diff view state (off by default)
        let diffMode = false;

        // Keep last shown pair/status for re-rendering when toggles change
        let lastPair = null;
        let lastStatus = null;

        // Track classified words
        const classifiedWords = new Set();

        // Initialize body data attributes
        document.body.setAttribute('data-literal-mode', literalMode.toString());
        document.body.setAttribute('data-diff-mode', diffMode.toString());

        function persistViewState() {
            viewState = { ...viewState, promptHistory: promptHistory.slice(0, 5) };
            vscode.setState(viewState);
        }

        function addPromptToHistory(prompt) {
            const trimmed = (prompt || '').trim();
            if (!trimmed) {
                return;
            }

            const deduped = promptHistory.filter(p => p !== trimmed);
            deduped.unshift(trimmed);
            promptHistory = deduped.slice(0, 5);
            persistViewState();
        }

        function renderPromptHistory() {
            if (!recentPromptList) {
                return;
            }

            recentPromptList.innerHTML = '';

            if (promptHistory.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'history-empty';
                empty.textContent = 'No recent prompts yet.';
                recentPromptList.appendChild(empty);
                return;
            }

            promptHistory.forEach(function(prompt) {
                const button = document.createElement('button');
                button.className = 'history-item-btn';
                button.type = 'button';
                const truncated = prompt.length > 140 ? prompt.slice(0, 137) + '…' : prompt;
                button.textContent = truncated;
                button.title = prompt;
                button.addEventListener('click', function() {
                    if (promptInput) {
                        promptInput.value = prompt;
                        promptInput.focus();
                    }
                    updatePromptDisplay(prompt);
                    toggleHistoryMenu(false);
                });
                recentPromptList.appendChild(button);
            });
        }

        function toggleHistoryMenu(forceOpen) {
            if (!recentPromptsMenu || !recentPromptsBtn) {
                return;
            }

            const isHidden = recentPromptsMenu.classList.contains('hidden');
            const shouldOpen = forceOpen ?? isHidden;

            if (shouldOpen) {
                renderPromptHistory();
                recentPromptsMenu.classList.remove('hidden');
                recentPromptsBtn.setAttribute('aria-expanded', 'true');
                const firstItem = recentPromptList ? recentPromptList.querySelector('.history-item-btn') : null;
                if (firstItem) {
                    setTimeout(() => firstItem.focus(), 0);
                }
            } else {
                recentPromptsMenu.classList.add('hidden');
                recentPromptsBtn.setAttribute('aria-expanded', 'false');
            }
        }

        /**
         * Update the model selector dropdown with available models
         */
        function updateModelSelector(models) {
            availableModels = models;
            if (!modelSelect) {
                return;
            }
            
            modelSelect.innerHTML = '';
            
            if (models.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No models available';
                modelSelect.appendChild(option);
                modelSelect.disabled = true;
                return;
            }
            
            modelSelect.disabled = false;
            models.forEach(function(model, index) {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                if (index === 0) {
                    option.selected = true;
                    selectedModelId = model.id;
                }
                modelSelect.appendChild(option);
            });
        }

        // Helper function to update prompt display
        function updatePromptDisplay(prompt) {
            const html = '<div class="prompt-label">Your Description</div>' +
                '<div class="prompt-text" style="display: flex; justify-content: space-between; align-items: center;">' +
                '<span>' + prompt + '</span>' +
                '<button onclick="editPrompt()" class="icon-btn" style="padding: 4px 8px; font-size: 11px; margin-left: 10px;" title="Revise and refine prompt">' +
                '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 21v-3l12-12 3 3L6 21H3zM19.5 7.5l-3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                '<span class="btn-label">Revise</span>' +
                '</button>' +
                '</div>';
            if (currentPromptDisplay) {
                currentPromptDisplay.innerHTML = html;
            }
            if (finalPromptDisplay) {
                finalPromptDisplay.innerHTML = html;
            }
        }

        function editPrompt() {
            const currentPrompt = promptInput.value;
            
            // Build model selector options
            let modelOptions = '';
            availableModels.forEach(function(model) {
                const selected = model.id === selectedModelId ? ' selected' : '';
                modelOptions += '<option value="' + model.id + '"' + selected + '>' + model.name + '</option>';
            });
            
            const editHtml = '<div class="prompt-label">Revise Your Description</div>' +
                '<div style="display: flex; flex-direction: column; gap: 8px;">' +
                '<div style="display: flex; gap: 8px; align-items: center;">' +
                '<input type="text" id="editPromptInput" value="' + currentPrompt + '" ' +
                'style="flex: 1; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 2px;" ' +
                'placeholder="Enter a refined description..." />' +
                '</div>' +
                '<div style="display: flex; gap: 8px; align-items: center;">' +
                '<select id="editModelSelect" ' +
                'style="flex: 1; padding: 6px 8px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; font-size: 13px;">' +
                modelOptions +
                '</select>' +
                '<button onclick="submitEditedPrompt()" style="padding: 6px 12px; min-width: auto;" title="Generate new candidates with revised prompt and model">' +
                '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="12" height="12">' +
                '<path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>' +
                '</button>' +
                '<button onclick="cancelEditPrompt()" style="padding: 6px 12px; min-width: auto; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);" title="Cancel">Cancel</button>' +
                '</div>' +
                '</div>';

            const isFinalVisible = !finalSection.classList.contains('hidden');
            const targetDisplay = isFinalVisible && finalPromptDisplay ? finalPromptDisplay : currentPromptDisplay;

            if (targetDisplay) {
                targetDisplay.innerHTML = editHtml;
                setTimeout(function() {
                    const input = document.getElementById('editPromptInput');
                    if (input) {
                        input.focus();
                        input.addEventListener('keypress', function(e) {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                submitEditedPrompt();
                            }
                        });
                    }
                }, 10);
            }

            // Keep both displays in sync so the revised view is reflected when switching sections
            if (targetDisplay === finalPromptDisplay && currentPromptDisplay) {
                currentPromptDisplay.innerHTML = editHtml;
            } else if (targetDisplay === currentPromptDisplay && finalPromptDisplay) {
                finalPromptDisplay.innerHTML = editHtml;
            }
        }

        function submitEditedPrompt() {
            const editInput = document.getElementById('editPromptInput');
            const editModelSelect = document.getElementById('editModelSelect');
            const newPrompt = editInput.value.trim();
            const newModelId = editModelSelect ? editModelSelect.value : selectedModelId;

            if (newPrompt) {
                promptInput.value = newPrompt;
                addPromptToHistory(newPrompt);
                updatePromptDisplay(newPrompt);
                const modelChanged = previousModelId && previousModelId !== newModelId;
                vscode.postMessage({
                    type: 'refineCandidates',
                    prompt: newPrompt,
                    modelId: newModelId,
                    modelChanged: modelChanged,
                    previousModelId: previousModelId
                });
                selectedModelId = newModelId;
                previousModelId = newModelId;
                showSection('loading');
            }
        }

        function cancelEditPrompt() {
            const currentPrompt = promptInput.value;
            updatePromptDisplay(currentPrompt);
        }

        function copyRegex(pattern) {
            try {
                vscode.postMessage({ type: 'copy', regex: pattern });
            } catch (e) {
                showError('Unable to copy.');
            }
        }

        function toLiteralString(str) {
            return str
                .replace(/\n/g, '¶')
                .replace(/\r/g, '¶')
                .replace(/\t/g, '→')
                .replace(/ /g, '␣')
                .replace(/\u00A0/g, '⍽')
                .replace(/\f/g, '↡')
                .replace(/\v/g, '↓')
                .replace(/\0/g, '␀')
                .replace(/\\/g, '⧹')
                .replace(/"/g, '"')
                .replace(/'/g, "'");
        }

        // Literal-safe display for a single character (used in diff rendering)
        function toLiteralChar(ch) {
            return toLiteralString(ch);
        }

        // Escape for inline onclick usage
        function escapeForOnclick(str) {
            return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
        }

        /**
         * Escape HTML special characters to prevent XSS
         */
        function escapeHtml(text) {
            if (!text) {
                return '';
            }
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        /**
         * Compute a simple LCS-based diff between two words.
         * Returns a list of ops: { type: 'equal' | 'delete' | 'insert', charA?, charB? }
         */
        function diffWords(a, b) {
            const n = a.length;
            const m = b.length;
            const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

            for (let i = n - 1; i >= 0; i--) {
                for (let j = m - 1; j >= 0; j--) {
                    if (a[i] === b[j]) {
                        dp[i][j] = dp[i + 1][j + 1] + 1;
                    } else {
                        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
                    }
                }
            }

            const ops = [];
            let i = 0;
            let j = 0;
            while (i < n && j < m) {
                if (a[i] === b[j]) {
                    ops.push({ type: 'equal', charA: a[i], charB: b[j] });
                    i++; j++;
                } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                    ops.push({ type: 'delete', charA: a[i] });
                    i++;
                } else {
                    ops.push({ type: 'insert', charB: b[j] });
                    j++;
                }
            }
            while (i < n) {
                ops.push({ type: 'delete', charA: a[i] });
                i++;
            }
            while (j < m) {
                ops.push({ type: 'insert', charB: b[j] });
                j++;
            }
            return ops;
        }

        /**
         * Render a word with diff highlighting based on ops.
         * side: 'a' or 'b'
         */
        function renderWordWithDiff(ops, side, literalMode) {
            const spans = [];
            for (const op of ops) {
                const char = side === 'a' ? op.charA : op.charB;
                if (char === undefined) {
                    continue;
                }
                const isDiff = op.type !== 'equal';
                const displayChar = literalMode ? toLiteralChar(char) : char;
                spans.push(
                    `<span class="${isDiff ? 'diff-chunk' : 'same-chunk'}">${escapeHtml(displayChar) || '&nbsp;'}</span>`
                );
            }
            return spans.join('');
        }

        function highlightRegex(pattern) {
            if (!pattern) {
                return '';
            }

            pattern = pattern.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            let result = '';
            let i = 0;

            while (i < pattern.length) {
                const char = pattern[i];

                if ('^$*+?|{}[]()\\'.includes(char)) {
                    if (char === '\\' && i + 1 < pattern.length) {
                        const nextChar = pattern[i + 1];
                        result += '<span class="regex-escape">\\' + nextChar + '</span>';
                        i += 2;
                    } else if (char === '[' && pattern.substr(i).match(/^\[.*?\]/)) {
                        const match = pattern.substr(i).match(/^\[.*?\]/)[0];
                        result += '<span class="regex-class">' + match + '</span>';
                        i += match.length;
                    } else if (char === '(' && pattern.substr(i).match(/^\([^)]*\)/)) {
                        const match = pattern.substr(i).match(/^\([^)]*\)/)[0];
                        result += '<span class="regex-group">' + match + '</span>';
                        i += match.length;
                    } else if ('*+?{'.includes(char)) {
                        result += '<span class="regex-quantifier">' + char + '</span>';
                        i++;
                    } else {
                        result += '<span class="regex-meta">' + char + '</span>';
                        i++;
                    }
                } else {
                    result += '<span class="regex-literal">' + char + '</span>';
                    i++;
                }
            }

            return '<span class="regex-syntax">' + result + '</span>';
        }

        function createEquivalentSection(equivalents) {
            if (!equivalents || equivalents.length === 0) {
                return null;
            }

            const list = document.createElement('div');
            list.className = 'equivalent-list hidden';

            equivalents.forEach(function(eq) {
                const item = document.createElement('div');
                item.className = 'equivalent-pattern';
                
                const patternSpan = document.createElement('span');
                patternSpan.className = 'equivalent-pattern-text';
                patternSpan.innerHTML = highlightRegex(eq);
                
                const copyBtn = document.createElement('button');
                copyBtn.className = 'btn copy';
                copyBtn.setAttribute('data-pattern', encodeURIComponent(eq));
                copyBtn.setAttribute('title', 'Copy alternative regex');
                copyBtn.onclick = function() { copyRegex(decodeURIComponent(this.getAttribute('data-pattern'))); };
                copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                    '<path d="M16 1H4a2 2 0 0 0-2 2v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '<rect x="8" y="5" width="12" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/>' +
                    '</svg>';
                
                item.appendChild(patternSpan);
                item.appendChild(copyBtn);
                list.appendChild(item);
            });

            const toggle = document.createElement('button');
            toggle.className = 'icon-btn small equivalent-toggle';
            toggle.type = 'button';
            toggle.setAttribute('aria-expanded', 'false');

            const labelForCount = equivalents.length === 1 ? 'alternative' : 'alternatives';

            function renderToggle(expanded) {
                const icon = expanded
                    ? '<path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
                    : '<path d="M12 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '<path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

                toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                    icon +
                    '</svg>' +
                    '<span class="equivalent-count">' + equivalents.length + ' ' + labelForCount + '</span>';
            }

            toggle.setAttribute('title', 'Show ' + equivalents.length + ' ' + labelForCount);
            renderToggle(false);

            toggle.onclick = function() {
                const hidden = list.classList.toggle('hidden');
                const expanded = !hidden;
                toggle.setAttribute('aria-expanded', expanded.toString());
                toggle.setAttribute('title', (hidden ? 'Show ' : 'Hide ') + equivalents.length + ' ' + labelForCount);
                toggle.classList.toggle('expanded', expanded);
                renderToggle(expanded);
            };

            return { toggle: toggle, list: list };
        }

        // Event Listeners
        generateBtn.addEventListener('click', function() {
            const prompt = promptInput.value.trim();
            if (prompt) {
                addPromptToHistory(prompt);
                updatePromptDisplay(prompt);
                vscode.postMessage({ type: 'generateCandidates', prompt: prompt, modelId: selectedModelId });
                previousModelId = selectedModelId;
                showSection('loading');
            }
        });

        promptInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                generateBtn.click();
            }
        });

        resetBtn.addEventListener('click', function() {
            vscode.postMessage({ type: 'reset', preserveClassifications: false });
        });

        startFreshBtn.addEventListener('click', function() {
            vscode.postMessage({ type: 'reset', preserveClassifications: false });
        });

        cancelBtn.addEventListener('click', function() {
            vscode.postMessage({ type: 'cancel' });
        });

        if (literalToggle) {
            literalToggle.addEventListener('change', function() {
                literalMode = literalToggle.checked;
                document.body.setAttribute('data-literal-mode', literalMode.toString());
                const menuRow = document.getElementById('literalMenuRow');
                if (menuRow) {
                    menuRow.setAttribute('aria-checked', literalMode ? 'true' : 'false');
                }
                // Re-render current pair if one exists
                if (lastPair && lastStatus) {
                    showWordPair(lastPair, lastStatus);
                }
            });
        }

        if (showCandidatesToggle) {
            if (!showCandidatesToggle.checked) {
                candidatesList.classList.add('hidden');
            }
            showCandidatesToggle.addEventListener('change', function() {
                const show = showCandidatesToggle.checked;
                if (show) {
                    candidatesList.classList.remove('hidden');
                } else {
                    candidatesList.classList.add('hidden');
                }
                const menuRow = document.getElementById('showCandidatesMenuRow');
                if (menuRow) {
                    menuRow.setAttribute('aria-checked', show ? 'true' : 'false');
                }
                // Re-render current pair if one exists
                if (lastPair && lastStatus) {
                    showWordPair(lastPair, lastStatus);
                }
            });
        }

        if (diffToggle) {
            // ensure UI reflects default
            if (!diffToggle.checked) {
                // nothing needed; default is off
            }
            diffToggle.addEventListener('change', function() {
                diffMode = diffToggle.checked;
                document.body.setAttribute('data-diff-mode', diffMode.toString());
                const menuRow = document.getElementById('diffMenuRow');
                if (menuRow) {
                    menuRow.setAttribute('aria-checked', diffMode ? 'true' : 'false');
                }
                // Re-render current pair if one exists
                if (lastPair && lastStatus) {
                    showWordPair(lastPair, lastStatus);
                }
            });
        }

        if (recentPromptsBtn) {
            recentPromptsBtn.addEventListener('click', function(e) {
                toggleHistoryMenu();
                e.stopPropagation();
            });
        }

        if (displayOptionsBtn && displayOptionsMenu) {
            displayOptionsBtn.addEventListener('click', function(e) {
                const isOpen = !displayOptionsMenu.classList.contains('hidden');
                if (isOpen) {
                    displayOptionsMenu.classList.add('hidden');
                    displayOptionsBtn.setAttribute('aria-expanded', 'false');
                } else {
                    displayOptionsMenu.classList.remove('hidden');
                    displayOptionsBtn.setAttribute('aria-expanded', 'true');
                    const cb = displayOptionsMenu.querySelector('input[type="checkbox"]');
                    if (cb) {
                        cb.focus();
                    }
                }
                e.stopPropagation();
            });

            window.addEventListener('click', function(ev) {
                const target = ev.target;

                if (!displayOptionsMenu.classList.contains('hidden') &&
                    !displayOptionsMenu.contains(target) &&
                    target !== displayOptionsBtn) {
                    displayOptionsMenu.classList.add('hidden');
                    displayOptionsBtn.setAttribute('aria-expanded', 'false');
                }

                if (recentPromptsMenu && !recentPromptsMenu.classList.contains('hidden') &&
                    !recentPromptsMenu.contains(target) &&
                    target !== recentPromptsBtn) {
                    toggleHistoryMenu(false);
                }
            });

            window.addEventListener('keydown', function(ev) {
                if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'h') {
                    ev.preventDefault();
                    toggleHistoryMenu(true);
                    return;
                }

                if (ev.key === 'Escape') {
                    if (!displayOptionsMenu.classList.contains('hidden')) {
                        displayOptionsMenu.classList.add('hidden');
                        displayOptionsBtn.setAttribute('aria-expanded', 'false');
                        displayOptionsBtn.focus();
                        return;
                    }
                    if (recentPromptsMenu && !recentPromptsMenu.classList.contains('hidden')) {
                        toggleHistoryMenu(false);
                        if (recentPromptsBtn) {
                            recentPromptsBtn.focus();
                        }
                        return;
                    }
                    const candidatesModal = document.getElementById('candidatesHelpModal');
                    if (candidatesModal && !candidatesModal.classList.contains('hidden')) {
                        candidatesModal.classList.add('hidden');
                        displayOptionsBtn.focus();
                    }
                }
            });
        }

        // Handle messages from extension
        window.addEventListener('message', function(event) {
            const message = event.data;
            console.log('[PICK Webview] Received message: type="' + message.type + '"', message);

            switch (message.type) {
                case 'status':
                    showStatus(message.message);
                    break;
                case 'error':
                    showError(message.message);
                    break;
                case 'warning':
                    showWarning(message.message);
                    break;
                case 'permissionRequired':
                    showPermissionRequired(message.message);
                    break;
                case 'noModelsAvailable':
                    showNoModelsAvailable(message.message);
                    updateModelSelector([]);
                    break;
                case 'modelsAvailable':
                    // Clear any previous model availability errors and populate selector
                    errorSection.classList.add('hidden');
                    updateModelSelector(message.models);
                    break;
                case 'candidatesGenerated':
                    inlineCancelBtn.classList.add('hidden');
                    statusCancelBtn.classList.add('hidden');
                    generateBtn.classList.remove('hidden');
                    statusBar.classList.add('hidden');
                    updateCandidates(message.candidates, 2);
                    break;
                case 'candidatesRefined':
                    inlineCancelBtn.classList.add('hidden');
                    statusCancelBtn.classList.add('hidden');
                    generateBtn.classList.remove('hidden');
                    statusBar.classList.add('hidden');
                    updateCandidates(message.candidates, 2);
                    break;
                case 'newPair':
                    classifiedWords.clear();
                    showWordPair(message.pair, message.status);
                    break;
                case 'wordClassified':
                    updateStatus(message.status);
                    if (message.bothClassified) {
                        classifiedWords.clear();
                    }
                    break;
                case 'classificationUpdated':
                    updateStatus(message.status);
                    break;
                case 'voteProcessed':
                    updateStatus(message.status);
                    break;
                case 'finalResult':
                    showFinalResultWithContext(message.regex, message.wordsIn, message.wordsOut, message.status);
                    break;
                case 'copied':
                    showStatusWithoutCancel('Copied to clipboard');
                    setTimeout(function() {
                        statusBar.classList.add('hidden');
                    }, 2000);
                    break;
                case 'noRegexFound':
                    showNoRegexFound(message.message, message.candidateDetails, message.wordsIn, message.wordsOut);
                    break;
                case 'insufficientWords':
                    showInsufficientWords(message.candidates, message.status);
                    break;
                case 'reset':
                    resetUI(message.preserveClassifications);
                    break;
                case 'cancelled':
                    handleCancelled(message.message);
                    break;
            }
        });

        function showSection(section) {
            promptSection.classList.add('hidden');
            votingSection.classList.add('hidden');
            finalSection.classList.add('hidden');
            errorSection.classList.add('hidden');
            inlineCancelBtn.classList.add('hidden');
            generateBtn.classList.remove('hidden');
            statusBar.classList.add('hidden');

            if (section === 'prompt') {
                promptSection.classList.remove('hidden');
            } else if (section === 'voting') {
                votingSection.classList.remove('hidden');
            } else if (section === 'final') {
                finalSection.classList.remove('hidden');
            } else if (section === 'loading') {
                statusBar.classList.remove('hidden');
                inlineCancelBtn.classList.remove('hidden');
                statusCancelBtn.classList.remove('hidden');
                generateBtn.classList.add('hidden');
            }
        }

        function showStatus(message) {
            if (statusMessage) {
                statusMessage.innerHTML = '<span class="loading-spinner"></span><span>' + message + '</span>';
            }
            statusBar.classList.remove('hidden');
            inlineCancelBtn.classList.remove('hidden');
            statusCancelBtn.classList.remove('hidden');
            generateBtn.classList.add('hidden');
        }

        function showStatusWithoutCancel(message) {
            if (statusMessage) {
                statusMessage.innerHTML = '<span>' + message + '</span>';
            }
            statusBar.classList.remove('hidden');
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');
        }

        function showError(message) {
            // Stop the spinner and clear status message
            if (statusMessage) {
                statusMessage.innerHTML = '';
            }
            // Reset to prompt section
            showSection('prompt');
            // statusCancelBtn needs explicit hiding since showSection doesn't manage it
            statusCancelBtn.classList.add('hidden');
            
            // Show the error message
            errorSection.textContent = message;
            errorSection.classList.remove('hidden');
        }

        function showPermissionRequired(message) {
            showSection('prompt');
            statusBar.classList.add('hidden');
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');
            generateBtn.classList.remove('hidden');
            
            // Show a prominent permission required message (escape message to prevent XSS)
            errorSection.innerHTML = '<div style="display: flex; flex-direction: column; gap: 12px;">' +
                '<div style="display: flex; align-items: center; gap: 8px;">' +
                '<span style="font-size: 24px;">🔐</span>' +
                '<strong>Permission Required</strong>' +
                '</div>' +
                '<p style="margin: 0;">' + escapeHtml(message) + '</p>' +
                '<p style="margin: 0; font-size: 12px; opacity: 0.8;">' +
                'When you click the generate button again, a permission dialog should appear. ' +
                'Please click "Allow" to grant PICK access to language models.' +
                '</p>' +
                '</div>';
            errorSection.classList.remove('hidden');
        }

        function showNoModelsAvailable(message) {
            showSection('prompt');
            statusBar.classList.add('hidden');
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');
            generateBtn.classList.remove('hidden');
            
            // Show a prominent no models message (escape message to prevent XSS)
            errorSection.innerHTML = '<div style="display: flex; flex-direction: column; gap: 12px;">' +
                '<div style="display: flex; align-items: center; gap: 8px;">' +
                '<span style="font-size: 24px;">⚠️</span>' +
                '<strong>No Language Models Available</strong>' +
                '</div>' +
                '<p style="margin: 0;">' + escapeHtml(message) + '</p>' +
                '<p style="margin: 0; font-size: 12px; opacity: 0.8;">' +
                'To use PICK, you need a language model extension installed and enabled. ' +
                'We recommend installing the GitHub Copilot extension.' +
                '</p>' +
                '</div>';
            errorSection.classList.remove('hidden');
        }

        function showWarning(message) {
            if (statusMessage) {
                statusMessage.innerHTML = '<strong>Warning:</strong> ' + message;
            }
            statusBar.classList.remove('hidden');
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');
        }

        function showInsufficientWords(candidates, status) {
            // Clear any existing error messages first
            errorSection.classList.add('hidden');
            statusBar.classList.add('hidden');
            
            showSection('voting');
            updateCandidates(candidates, status.threshold);
            updateWordHistory(status.wordHistory);

            wordPair.innerHTML = '<div style="text-align: center; padding: 20px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); border-radius: 4px;">' +
                '<h3>Unable to generate more words</h3>' +
                '<p>The system ran out of distinguishing words to generate.</p>' +
                '<p>Here are the remaining candidates. You can copy any candidate you prefer, or click "Build a New Regex" below to start fresh.</p>' +
                '</div>';
        }

        function updateCandidates(candidates, threshold) {
            candidatesList.innerHTML = '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">' +
                '<h4 style="margin:0">Regex Candidates</h4>' +
                '<button id="candidatesHelpBtn" class="icon-btn" title="Where do these candidates come from?" aria-haspopup="dialog" aria-controls="candidatesHelpModal">?</button>' +
                '</div>';
            
            const helpBtn = document.getElementById('candidatesHelpBtn');
            if (helpBtn) {
                helpBtn.onclick = function() {
                    const modal = document.getElementById('candidatesHelpModal');
                    const overlay = document.getElementById('candidatesHelpOverlay');
                    const closeBtn = document.getElementById('candidatesHelpClose');
                    if (modal) {
                        modal.classList.remove('hidden');
                    }
                    if (closeBtn) {
                        closeBtn.focus();
                    }
                    if (overlay) {
                        overlay.onclick = function() { modal.classList.add('hidden'); };
                    }
                    if (closeBtn) {
                        closeBtn.onclick = function() { modal.classList.add('hidden'); };
                    }
                };
            }

            if (threshold !== undefined) {
                const thresholdDiv = document.createElement('div');
                thresholdDiv.className = 'threshold-info';
                thresholdDiv.textContent = 'Rejection threshold: ' + threshold + ' negative votes';
                candidatesList.appendChild(thresholdDiv);
            }

            candidates.forEach(function(c) {
                const div = document.createElement('div');
                div.className = 'candidate-item ' + (c.eliminated ? 'eliminated' : 'active');

                const header = document.createElement('div');
                header.className = 'candidate-header';

                const patternSpan = document.createElement('span');
                patternSpan.className = 'candidate-pattern';
                patternSpan.innerHTML = highlightRegex(c.pattern);

                const votesContainer = document.createElement('div');
                votesContainer.className = 'candidate-votes';
                votesContainer.style.cssText = 'display:flex; gap:8px; align-items:center;';

                const copyBtn = document.createElement('button');
                copyBtn.className = 'btn copy';
                copyBtn.setAttribute('data-pattern', encodeURIComponent(c.pattern));
                copyBtn.setAttribute('title', 'Copy regex');
                copyBtn.onclick = function() { copyRegex(decodeURIComponent(this.getAttribute('data-pattern'))); };
                copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                    '<path d="M16 1H4a2 2 0 0 0-2 2v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '<rect x="8" y="5" width="12" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/>' +
                    '</svg>';

                const posBadge = document.createElement('span');
                posBadge.className = 'badge';
                posBadge.style.background = '#4caf50';
                posBadge.textContent = '✓ ' + c.positiveVotes;

                const negBadge = document.createElement('span');
                negBadge.className = 'badge';
                negBadge.style.background = '#f44336';
                negBadge.textContent = '✗ ' + c.negativeVotes;

                votesContainer.appendChild(copyBtn);
                votesContainer.appendChild(posBadge);
                votesContainer.appendChild(negBadge);

                header.appendChild(patternSpan);
                header.appendChild(votesContainer);
                div.appendChild(header);

                const equivalents = createEquivalentSection(c.equivalents);
                if (equivalents) {
                    votesContainer.appendChild(equivalents.toggle);
                    div.appendChild(equivalents.list);
                }

                candidatesList.appendChild(div);
            });
        }

        function updateCandidatesWithWinner(candidates, threshold, winnerRegex) {
            candidatesList.innerHTML = '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">' +
                '<h4 style="margin:0">Regex Candidates</h4>' +
                '<button id="candidatesHelpBtn" class="icon-btn" title="Where do these candidates come from?" aria-haspopup="dialog" aria-controls="candidatesHelpModal">?</button>' +
                '</div>';
            
            const helpBtn = document.getElementById('candidatesHelpBtn');
            if (helpBtn) {
                helpBtn.onclick = function() {
                    const modal = document.getElementById('candidatesHelpModal');
                    const overlay = document.getElementById('candidatesHelpOverlay');
                    const closeBtn = document.getElementById('candidatesHelpClose');
                    if (modal) {
                        modal.classList.remove('hidden');
                    }
                    if (closeBtn) {
                        closeBtn.focus();
                    }
                    if (overlay) {
                        overlay.onclick = function() { modal.classList.add('hidden'); };
                    }
                    if (closeBtn) {
                        closeBtn.onclick = function() { modal.classList.add('hidden'); };
                    }
                };
            }

            if (threshold !== undefined) {
                const thresholdDiv = document.createElement('div');
                thresholdDiv.className = 'threshold-info';
                thresholdDiv.textContent = 'Rejection threshold: ' + threshold + ' negative votes';
                candidatesList.appendChild(thresholdDiv);
            }

            candidates.forEach(function(c) {
                const isWinner = c.pattern === winnerRegex;
                const div = document.createElement('div');
                div.className = 'candidate-item ' + (c.eliminated ? 'eliminated' : 'active');

                if (isWinner) {
                    div.style.cssText = 'border: 2px solid var(--pick-accept-color); background: var(--vscode-list-activeSelectionBackground);';
                }

                const header = document.createElement('div');
                header.className = 'candidate-header';

                const patternSpan = document.createElement('span');
                patternSpan.className = 'candidate-pattern';
                patternSpan.innerHTML = highlightRegex(c.pattern);

                const votesDiv = document.createElement('div');
                votesDiv.className = 'candidate-votes';
                votesDiv.style.cssText = 'display:flex; gap:8px; align-items:center;';

                const copyBtn = document.createElement('button');
                copyBtn.className = 'btn copy';
                copyBtn.setAttribute('data-pattern', encodeURIComponent(c.pattern));
                copyBtn.setAttribute('title', 'Copy regex');
                copyBtn.onclick = function() { copyRegex(decodeURIComponent(this.getAttribute('data-pattern'))); };
                if (isWinner) {
                    copyBtn.style.border = '1px solid var(--pick-accept-color)';
                }
                copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                    '<path d="M16 1H4a2 2 0 0 0-2 2v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '<rect x="8" y="5" width="12" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/>' +
                    '</svg>';
                
                const posVoteBadge = document.createElement('span');
                posVoteBadge.className = 'badge';
                posVoteBadge.style.background = '#4caf50';
                posVoteBadge.textContent = '✓ ' + c.positiveVotes;
                
                const negVoteBadge = document.createElement('span');
                negVoteBadge.className = 'badge';
                negVoteBadge.style.background = '#f44336';
                negVoteBadge.textContent = '✗ ' + c.negativeVotes;

                votesDiv.appendChild(copyBtn);
                votesDiv.appendChild(posVoteBadge);
                votesDiv.appendChild(negVoteBadge);

                header.appendChild(patternSpan);
                header.appendChild(votesDiv);
                div.appendChild(header);

                const equivalents = createEquivalentSection(c.equivalents);
                if (equivalents) {
                    votesDiv.appendChild(equivalents.toggle);
                    div.appendChild(equivalents.list);
                }
                candidatesList.appendChild(div);
            });
        }

        function updateStatus(status) {
            updateCandidates(status.candidateDetails, status.threshold);
            updateWordHistory(status.wordHistory);
            showStatusWithoutCancel('Active: ' + status.activeCandidates + '/' + status.totalCandidates + ' | Words classified: ' + status.wordHistory.length);
        }

        function classifyWord(word, classification) {
            console.log('[PICK Webview] classifyWord called: word="' + word + '" (length: ' + word.length + '), classification="' + classification + '"');
            classifiedWords.add(word);
            vscode.postMessage({
                type: 'classifyWord',
                word: word,
                classification: classification
            });
            console.log('[PICK Webview] Sent classifyWord message to extension');

            const wordCards = document.querySelectorAll('.word-card');
            wordCards.forEach(function(card) {
                const cardWord = card.getAttribute('data-word');
                if (cardWord === word) {
                    card.classList.add('classified', 'classified-' + classification);
                    const buttons = card.querySelectorAll('button');
                    buttons.forEach(function(btn) { btn.disabled = true; });
                }
            });
        }

        function showWordPair(pair, status) {
            console.log('[PICK Webview] showWordPair called: word1="' + pair.word1 + '" (length: ' + pair.word1.length + '), word2="' + pair.word2 + '" (length: ' + pair.word2.length + ')');
            // cache for re-render when toggles change
            lastPair = pair;
            lastStatus = status;

            showSection('voting');
            updateCandidates(status.candidateDetails, status.threshold);
            updateWordHistory(status.wordHistory);
            showStatusWithoutCancel('Active: ' + status.activeCandidates + '/' + status.totalCandidates + ' | Words classified: ' + status.wordHistory.length);

            const diffOps = diffMode ? diffWords(pair.word1, pair.word2) : null;

            function renderWordCard(word, side) {
                let readable, literal;
                if (diffOps) {
                    readable = renderWordWithDiff(diffOps, side, false);
                    literal = renderWordWithDiff(diffOps, side, true);
                } else {
                    readable = escapeHtml(word);
                    literal = toLiteralString(word);
                }
                const dataWord = escapeHtml(word);
                const clickWord = escapeForOnclick(word);

                return `
                <div class="word-card" data-word="${dataWord}">
                    <div class="word-display">
                        <span class="word-readable">${readable}</span>
                        <span class="word-literal">${literal}</span>
                    </div>
                    <div class="word-actions">
                        <button class="btn accept" onclick="classifyWord('${clickWord}', 'accept')" title="Upvote">
                        <svg viewBox="0 0 24 24" width="var(--pick-icon-size)" height="var(--pick-icon-size)" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 19V7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M5 12l7-7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        </button>
                        <button class="btn reject" onclick="classifyWord('${clickWord}', 'reject')" title="Downvote">
                        <svg viewBox="0 0 24 24" width="var(--pick-icon-size)" height="var(--pick-icon-size)" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 5v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M19 12l-7 7-7-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        </button>
                        <button class="btn unsure" onclick="classifyWord('${clickWord}', 'unsure')" title="Skip">
                        <svg viewBox="0 0 24 24" width="var(--pick-icon-size)" height="var(--pick-icon-size)" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/>
                        <path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        </button>
                    </div>
                </div>`;
            }

            wordPair.innerHTML = renderWordCard(pair.word1, 'a') + renderWordCard(pair.word2, 'b');
        }

        function updateWordHistory(history) {
            if (!history || history.length === 0) {
                historyItems.innerHTML = '<p style="color: var(--vscode-descriptionForeground); font-style: italic;">No words classified yet.</p>';
                return;
            }

            historyItems.innerHTML = '';
            history.forEach(function(item, index) {
                const div = document.createElement('div');
                div.className = 'history-item';
                div.innerHTML = '<div>' +
                    '<div class="word-display">' +
                    '<span class="word-readable history-word" data-word="' + item.word.replace(/"/g, '&quot;') + '">' + item.word + '</span>' +
                    '<span class="word-literal history-word" data-word="' + item.word.replace(/"/g, '&quot;') + '">' + toLiteralString(item.word) + '</span>' +
                    '</div>' +
                    '<div class="history-matches">' + item.matchingRegexes.length + ' regex(es) match this word</div>' +
                    '</div>' +
                    '<div class="history-classification">' +
                    '<select onchange="updateClassification(' + index + ', this.value)">' +
                    '<option value="accept"' + (item.classification === 'accept' ? ' selected' : '') + '>Accept</option>' +
                    '<option value="reject"' + (item.classification === 'reject' ? ' selected' : '') + '>Reject</option>' +
                    '<option value="unsure"' + (item.classification === 'unsure' ? ' selected' : '') + '>Unsure</option>' +
                    '</select>' +
                    '</div>';
                historyItems.appendChild(div);
            });
        }

        function updateClassification(index, newClassification) {
            vscode.postMessage({
                type: 'updateClassification',
                index: index,
                classification: newClassification
            });
        }

        function vote(word) {
            vscode.postMessage({ type: 'vote', acceptedWord: word });
        }

        function showFinalResultWithContext(regex, inWords, outWords, status) {
            showSection('voting');
            statusBar.classList.add('hidden');
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');

            wordPair.innerHTML = '<div style="text-align: center; padding: 20px; background: var(--vscode-editor-background); border: 2px solid var(--pick-accept-color); border-radius: 8px;">' +
                '<h2 style="margin: 0 0 10px 0; color: var(--pick-accept-color);">Final Regex Selected</h2>' +
                '<p style="margin: 0; color: var(--vscode-descriptionForeground);">' +
                'The selected regex is highlighted below. You can copy any candidate you prefer.' +
                '</p>' +
                '</div>';

            if (status) {
                updateCandidatesWithWinner(status.candidateDetails, status.threshold, regex);
                updateWordHistory(status.wordHistory);
            }

            showStatusWithoutCancel('Classification complete! Selected regex highlighted below.');
        }

        function showNoRegexFound(message, candidateDetails, inWords, outWords) {
            showSection('final');
            statusBar.classList.add('hidden');
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');

            // Display the current prompt with revise button
            const currentPrompt = promptInput.value;
            if (currentPrompt) {
                updatePromptDisplay(currentPrompt);
            }

            const container = document.createElement('div');
            container.style.cssText = 'padding:10px; background:var(--vscode-inputValidation-errorBackground); color:var(--vscode-errorForeground); border-radius:4px; margin-bottom:10px; max-width:100%; box-sizing:border-box;';

            const p = document.createElement('p');
            p.style.cssText = 'margin:8px 0 0 0; font-size:0.9em; white-space:normal; word-break:break-word; overflow-wrap:anywhere; hyphens:auto;';
            p.textContent = message; // use textContent to avoid injecting HTML

            container.appendChild(p);
            finalRegex.innerHTML = '';
            finalRegex.appendChild(container);

            const detailsHtml = candidateDetails.map(function(c) {
                return '<div class="candidate-item eliminated" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin: 6px 0; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px;">' +
                    '<span class="candidate-pattern" style="flex: 1; overflow-x: auto; white-space: nowrap; margin-right: 10px; font-family: monospace;">' + highlightRegex(c.pattern) + '</span>' +
                    '<div class="candidate-votes" style="display:flex; gap:8px; align-items:center;">' +
                    '<button class="btn copy" data-pattern="' + encodeURIComponent(c.pattern) + '" onclick="copyRegex(decodeURIComponent(this.getAttribute(\'data-pattern\')))" title="Copy regex">' +
                    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                    '<path d="M16 1H4a2 2 0 0 0-2 2v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '<rect x="8" y="5" width="12" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/>' +
                    '</svg>' +
                    '</button>' +
                    '<span class="badge" style="background: #4caf50;">✓ ' + c.positiveVotes + '</span>' +
                    '<span class="badge" style="background: #f44336;">✗ ' + c.negativeVotes + '</span>' +
                    '</div>' +
                    '</div>';
            }).join('');

            wordsIn.innerHTML = (inWords && inWords.length > 0) 
                ? inWords.map(function(w) {
                    return '<div class="word-display">' +
                        '<span class="word-readable example-item" data-word="' + w.replace(/"/g, '&quot;') + '">' + w + '</span>' +
                        '<span class="word-literal example-item" data-word="' + w.replace(/"/g, '&quot;') + '">' + toLiteralString(w) + '</span>' +
                        '</div>';
                }).join('')
                : '<div class="example-item" style="opacity: 0.6; font-style: italic;">No words classified as IN</div>';

            wordsOut.innerHTML = (outWords && outWords.length > 0)
                ? outWords.map(function(w) {
                    return '<div class="word-display">' +
                        '<span class="word-readable example-item" data-word="' + w.replace(/"/g, '&quot;') + '">' + w + '</span>' +
                        '<span class="word-literal example-item" data-word="' + w.replace(/"/g, '&quot;') + '">' + toLiteralString(w) + '</span>' +
                        '</div>';
                }).join('')
                : '<div class="example-item" style="opacity: 0.6; font-style: italic;">No words classified as OUT</div>';

            if (candidateDetails && candidateDetails.length > 0) {
                const candidatesNote = document.createElement('div');
                candidatesNote.style.cssText = 'margin-top: 20px; padding: 10px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px;';
                candidatesNote.innerHTML = '<div style="font-size: 12px; opacity: 0.8; margin-bottom: 8px;">' +
                    '<strong>All candidates were eliminated:</strong>' +
                    '</div>' +
                    detailsHtml;
                const examplesGrid = document.querySelector('.examples');
                if (examplesGrid && examplesGrid.parentNode) {
                    examplesGrid.parentNode.insertBefore(candidatesNote, examplesGrid.nextSibling);
                }
            }
        }

        function resetUI(preserveClassifications) {
            if (!preserveClassifications) {
                promptInput.value = '';
                if (currentPromptDisplay) {
                    currentPromptDisplay.innerHTML = '';
                }
                if (finalPromptDisplay) {
                    finalPromptDisplay.innerHTML = '';
                }
            }
            classifiedWords.clear();
            showSection('prompt');
            if (statusMessage) {
                statusMessage.innerHTML = '';
            }
            statusBar.classList.add('hidden');
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');
        }

        function handleCancelled(message) {
            if (statusMessage) {
                statusMessage.innerHTML = '<span>' + (message || 'Operation cancelled') + '</span>';
            }
            statusBar.classList.remove('hidden');
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');
            setTimeout(function() {
                resetUI(true);
            }, 2000);
        }

        // Make functions available globally for inline onclick handlers
        window.classifyWord = classifyWord;
        window.updateClassification = updateClassification;
        window.vote = vote;
        window.editPrompt = editPrompt;
        window.submitEditedPrompt = submitEditedPrompt;
        window.cancelEditPrompt = cancelEditPrompt;
        window.copyRegex = copyRegex;
        window.toLiteralString = toLiteralString;
        window.highlightRegex = highlightRegex;
    };
})();
