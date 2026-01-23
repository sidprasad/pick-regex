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
        const statusWarnings = document.getElementById('statusWarnings');
        const statusCancelBtn = document.getElementById('statusCancelBtn');
        const inlineCancelBtn = document.getElementById('inlineCancelBtn');
        const errorSection = document.getElementById('errorSection');
        const literalToggle = document.getElementById('literalToggle');
        const literalIndicator = document.getElementById('literalIndicator');
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
        const diffIndicator = document.getElementById('diffIndicator');
        const candidatesIndicator = document.getElementById('candidatesIndicator');

        // Model selector elements
        const modelSelect = document.getElementById('modelSelect');
        const modelSelectorRow = document.getElementById('modelSelectorRow');
        const refreshModelsBtn = document.getElementById('refreshModelsBtn');

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

        function updateSelectedModel(modelId) {
            selectedModelId = modelId || '';
            if (selectedModelId) {
                vscode.postMessage({ type: 'modelSelected', modelId: selectedModelId });
            }
        }

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

        if (statusWarnings) {
            statusWarnings.addEventListener('click', function(ev) {
                if (ev.target && ev.target.closest('.status-warning-dismiss')) {
                    clearWarnings();
                }
            });
        }
        
        // Handle model selection change
        if (modelSelect) {
            modelSelect.addEventListener('change', function() {
                updateSelectedModel(modelSelect.value);
            });
        }
        
        // Handle refresh models button
        if (refreshModelsBtn) {
            refreshModelsBtn.addEventListener('click', refreshModels);
        }

        const wordPair = document.getElementById('wordPair');
        const candidatesList = document.getElementById('candidatesList');
        const wordHistory = document.getElementById('wordHistory');
        const historyItems = document.getElementById('historyItems');
        const copyHistoryBtn = document.getElementById('copyHistoryBtn');
        const loadSessionBtn = document.getElementById('loadSessionBtn');
        const loadSessionFile = document.getElementById('loadSessionFile');
        const loadSessionBtnPrompt = document.getElementById('loadSessionBtnPrompt');
        const loadSessionFilePrompt = document.getElementById('loadSessionFilePrompt');
        const loadSessionStatus = document.getElementById('loadSessionStatus');
        const historyCopyStatus = document.getElementById('historyCopyStatus');
        const finalRegex = document.getElementById('finalRegex');
        const wordsIn = document.getElementById('wordsIn');
        const wordsOut = document.getElementById('wordsOut');
        const wordEditHint = document.getElementById('wordEditHint');
        const customExamples = document.getElementById('customExamples');
        const customExamplesToggle = document.getElementById('customExamplesToggle');
        const customExamplesPanel = document.getElementById('customExamplesPanel');
        const customExamplesInput = document.getElementById('customExamplesInput');
        const customExamplesVoteUp = document.getElementById('customExamplesVoteUp');
        const customExamplesVoteDown = document.getElementById('customExamplesVoteDown');
        const customExamplesCancel = document.getElementById('customExamplesCancel');
        const customExamplesStatus = document.getElementById('customExamplesStatus');

        if (customExamplesToggle) {
            customExamplesToggle.addEventListener('click', function() {
                if (customExamplesPanel && customExamplesPanel.classList.contains('hidden')) {
                    setExamplesStatus('');
                }
                toggleExamplesPanel();
            });
        }

        if (copyHistoryBtn) {
            copyHistoryBtn.addEventListener('click', copyHistoryToClipboard);
        }

        if (loadSessionBtn && loadSessionFile) {
            loadSessionBtn.addEventListener('click', function() {
                loadSessionFile.click();
            });
            
            loadSessionFile.addEventListener('change', function(event) {
                handleSessionFileLoad(event.target.files[0], setHistoryCopyStatus, loadSessionFile);
            });
        }

        if (customExamplesCancel) {
            customExamplesCancel.addEventListener('click', function() {
                toggleExamplesPanel(false);
            });
        }

        // Helper function to handle session file loading
        function handleSessionFileLoad(file, statusCallback, fileInputElement) {
            if (!file) {
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const content = e.target.result;
                    const data = JSON.parse(content);
                    
                    // Validate the format
                    if (!data.candidates || !Array.isArray(data.candidates)) {
                        statusCallback('Invalid format: missing candidates array', 'error');
                        return;
                    }
                    
                    if (!data.classifications || !Array.isArray(data.classifications)) {
                        statusCallback('Invalid format: missing classifications array', 'error');
                        return;
                    }
                    
                    // Send to backend
                    vscode.postMessage({
                        type: 'loadSession',
                        data: data
                    });
                    
                    statusCallback('Loading session...');
                } catch (error) {
                    console.error('Failed to parse session file', error);
                    statusCallback('Failed to parse JSON file', 'error');
                } finally {
                    // Reset file input so the same file can be loaded again
                    if (fileInputElement) {
                        fileInputElement.value = '';
                    }
                }
            };
            
            reader.onerror = function() {
                statusCallback('Failed to read file', 'error');
                if (fileInputElement) {
                    fileInputElement.value = '';
                }
            };
            
            reader.readAsText(file);
        }

        // Status callback for prompt screen load button
        function setLoadSessionStatus(message, type) {
            if (!loadSessionStatus) {
                return;
            }
            
            loadSessionStatus.textContent = message || '';
            loadSessionStatus.style.color = type === 'error' 
                ? 'var(--vscode-errorForeground)' 
                : '';
            
            if (message) {
                setTimeout(function() {
                    loadSessionStatus.textContent = '';
                    loadSessionStatus.style.color = '';
                }, 3000);
            }
        }

        // Wire up prompt screen load button
        if (loadSessionBtnPrompt && loadSessionFilePrompt) {
            loadSessionBtnPrompt.addEventListener('click', function() {
                loadSessionFilePrompt.click();
            });
            
            loadSessionFilePrompt.addEventListener('change', function(event) {
                handleSessionFileLoad(event.target.files[0], setLoadSessionStatus, loadSessionFilePrompt);
            });
        }

        function submitSingleExample(classification) {
            if (!customExamplesInput) {
                return;
            }
            const word = (customExamplesInput.value || '').trim();
            if (!word) {
                setExamplesStatus('Enter an example first.', 'error');
                toggleExamplesPanel(true);
                customExamplesInput.focus();
                return;
            }

            setExamplesStatus('Applying your example...', 'muted');
            setExampleButtonsDisabled(true);

            vscode.postMessage({
                type: 'submitExamples',
                acceptWords: classification === 'accept' ? [word] : [],
                rejectWords: classification === 'reject' ? [word] : []
            });
        }

        if (customExamplesVoteUp) {
            customExamplesVoteUp.addEventListener('click', function() {
                submitSingleExample('accept');
            });
        }

        if (customExamplesVoteDown) {
            customExamplesVoteDown.addEventListener('click', function() {
                submitSingleExample('reject');
            });
        }

        if (wordEditHint) {
            wordEditHint.setAttribute('role', 'note');
        }

        // Track literal mode state (persisted; default off)
        const savedLiteralMode = typeof viewState.literalMode === 'boolean'
            ? viewState.literalMode
            : (literalToggle ? literalToggle.checked : false);
        let literalMode = savedLiteralMode;
        // Track diff view state (off by default)
        let diffMode = diffToggle ? diffToggle.checked : false;
        let latestWordHistory = Array.isArray(viewState.wordHistory) ? viewState.wordHistory : [];
        let latestCandidates = [];
        let latestActivePrompt = '';
        let latestActiveModelId = '';
        let historyStatusTimeout = null;

        // Keep last shown pair/status for re-rendering when toggles change
        let lastPair = null;
        let lastStatus = null;
        let lastPairMatches = null;
        let lastWarning = '';
        let statusActive = false;

        // Track classified words
        const classifiedWords = new Set();

        // Initialize body data attributes
        document.body.setAttribute('data-literal-mode', literalMode.toString());
        document.body.setAttribute('data-diff-mode', diffMode.toString());

        function updateLiteralModeUI() {
            document.body.setAttribute('data-literal-mode', literalMode.toString());
            if (literalToggle) {
                literalToggle.checked = literalMode;
            }
            const menuRow = document.getElementById('literalMenuRow');
            if (menuRow) {
                menuRow.setAttribute('aria-checked', literalMode ? 'true' : 'false');
            }
            if (literalIndicator) {
                if (literalMode) {
                    literalIndicator.classList.remove('hidden');
                    literalIndicator.setAttribute('aria-hidden', 'false');
                } else {
                    literalIndicator.classList.add('hidden');
                    literalIndicator.setAttribute('aria-hidden', 'true');
                }
            }
            viewState = { ...viewState, literalMode };
            vscode.setState(viewState);
        }

        function updateDiffModeUI() {
            document.body.setAttribute('data-diff-mode', diffMode.toString());
            const menuRow = document.getElementById('diffMenuRow');
            if (menuRow) {
                menuRow.setAttribute('aria-checked', diffMode ? 'true' : 'false');
            }
            if (diffIndicator) {
                if (diffMode) {
                    diffIndicator.classList.remove('hidden');
                    diffIndicator.setAttribute('aria-hidden', 'false');
                } else {
                    diffIndicator.classList.add('hidden');
                    diffIndicator.setAttribute('aria-hidden', 'true');
                }
            }
        }

        function updateCandidatesUI(showCandidates) {
            const show = typeof showCandidates === 'boolean' ? showCandidates : (showCandidatesToggle ? showCandidatesToggle.checked : true);
            if (showCandidatesToggle) {
                showCandidatesToggle.checked = show;
            }
            if (candidatesList) {
                if (show) {
                    candidatesList.classList.remove('hidden');
                } else {
                    candidatesList.classList.add('hidden');
                }
            }
            const menuRow = document.getElementById('showCandidatesMenuRow');
            if (menuRow) {
                menuRow.setAttribute('aria-checked', show ? 'true' : 'false');
            }
            if (candidatesIndicator) {
                if (show) {
                    candidatesIndicator.classList.add('hidden');
                    candidatesIndicator.setAttribute('aria-hidden', 'true');
                } else {
                    candidatesIndicator.classList.remove('hidden');
                    candidatesIndicator.setAttribute('aria-hidden', 'false');
                }
            }
        }

        updateLiteralModeUI();
        updateDiffModeUI();
        updateCandidatesUI();

        function toggleExamplesPanel(forceOpen) {
            if (!customExamplesPanel || !customExamplesToggle) {
                return;
            }
            const shouldOpen = typeof forceOpen === 'boolean'
                ? forceOpen
                : customExamplesPanel.classList.contains('hidden');
            customExamplesPanel.classList.toggle('hidden', !shouldOpen);
            customExamplesToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
            if (shouldOpen && customExamplesInput) {
                customExamplesInput.focus();
            }
        }

        function setExamplesStatus(message, tone) {
            if (!customExamplesStatus) {
                return;
            }
            customExamplesStatus.textContent = message || '';
            customExamplesStatus.setAttribute('data-tone', tone || 'muted');
        }

        function clearExamplesForm(preserveStatus) {
            if (customExamplesInput) {
                customExamplesInput.value = '';
            }
            if (!preserveStatus) {
                setExamplesStatus('');
            }
            setExampleButtonsDisabled(false);
        }

        function setExampleButtonsDisabled(disabled) {
            if (customExamplesVoteUp) {
                customExamplesVoteUp.disabled = disabled;
            }
            if (customExamplesVoteDown) {
                customExamplesVoteDown.disabled = disabled;
            }
        }

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
        function updateModelSelector(models, preferredModelId) {
            availableModels = models;
            if (!modelSelect) {
                return;
            }

            const previousSelection = selectedModelId;
            modelSelect.innerHTML = '';

            if (models.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No models available';
                modelSelect.appendChild(option);
                modelSelect.disabled = true;
                selectedModelId = '';
                return;
            }

            modelSelect.disabled = false;
            const preferredAvailable = preferredModelId && models.some(model => model.id === preferredModelId);
            const currentAvailable = selectedModelId && models.some(model => model.id === selectedModelId);
            const modelToSelect = preferredAvailable
                ? preferredModelId
                : (currentAvailable ? selectedModelId : models[0].id);

            models.forEach(function(model) {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                if (model.id === modelToSelect) {
                    option.selected = true;
                }
                modelSelect.appendChild(option);
            });

            if (modelToSelect) {
                if (modelToSelect !== previousSelection) {
                    updateSelectedModel(modelToSelect);
                } else {
                    selectedModelId = modelToSelect;
                }
            }
        }

        /**
         * Request the extension to refresh the model list
         */
        function refreshModels() {
            if (!refreshModelsBtn) {
                return;
            }
            
            // Disable button and show loading state
            refreshModelsBtn.disabled = true;
            const originalTitle = refreshModelsBtn.title;
            refreshModelsBtn.title = 'Refreshing...';
            
            // Update dropdown to show loading state
            if (modelSelect) {
                modelSelect.innerHTML = '<option value="">Refreshing models...</option>';
                modelSelect.disabled = true;
            }
            
            // Request model refresh from extension
            vscode.postMessage({ type: 'checkModels' });
            
            // Re-enable button after a short delay
            setTimeout(function() {
                refreshModelsBtn.disabled = false;
                refreshModelsBtn.title = originalTitle;
            }, 1000);
        }


        // Helper function to update prompt display
        function updatePromptDisplay(prompt) {
            // Create DOM elements instead of HTML string
            const container = document.createElement('div');
            
            const label = document.createElement('div');
            label.className = 'prompt-label';
            label.textContent = 'Your Description';
            
            const textDiv = document.createElement('div');
            textDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;';
            textDiv.className = 'prompt-text';
            
            const span = document.createElement('span');
            span.className = 'prompt-value';
            span.textContent = prompt;
            
            const button = document.createElement('button');
            button.className = 'icon-btn';
            button.style.cssText = 'padding: 4px 8px; font-size: 11px; margin-left: 10px;';
            button.title = 'Revise and refine prompt';
            button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 21v-3l12-12 3 3L6 21H3zM19.5 7.5l-3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                '<span class="btn-label">Revise</span>';
            button.addEventListener('click', editPrompt);
            
            textDiv.appendChild(span);
            textDiv.appendChild(button);
            
            container.appendChild(label);
            container.appendChild(textDiv);
            
            if (currentPromptDisplay) {
                currentPromptDisplay.innerHTML = '';
                const clone1 = container.cloneNode(true);
                const btn1 = clone1.querySelector('.icon-btn');
                if (btn1) {
                    btn1.addEventListener('click', editPrompt);
                }
                currentPromptDisplay.appendChild(clone1);
            }
            if (finalPromptDisplay) {
                finalPromptDisplay.innerHTML = '';
                const clone2 = container.cloneNode(true);
                const btn2 = clone2.querySelector('.icon-btn');
                if (btn2) {
                    btn2.addEventListener('click', editPrompt);
                }
                finalPromptDisplay.appendChild(clone2);
            }
        }

        function editPrompt() {
            const currentPrompt = promptInput.value;
            
            // Create DOM elements for edit interface
            const container = document.createElement('div');
            
            const label = document.createElement('div');
            label.className = 'prompt-label';
            label.textContent = 'Revise Your Description';
            
            const flexCol = document.createElement('div');
            flexCol.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
            
            // Input row
            const inputRow = document.createElement('div');
            inputRow.style.cssText = 'display: flex; gap: 8px; align-items: flex-start;';
            
            const input = document.createElement('textarea');
            input.className = 'prompt-input editPromptInput'; // Use class instead of ID to avoid duplicates
            input.rows = 2;
            input.value = currentPrompt;
            input.style.cssText = 'flex: 1;';
            input.placeholder = 'Enter a refined description...';
            
            inputRow.appendChild(input);
            
            // Select row
            const selectRow = document.createElement('div');
            selectRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';
            
            const select = document.createElement('select');
            select.className = 'editModelSelect'; // Use class instead of ID to avoid duplicates
            select.style.cssText = 'flex: 1; padding: 6px 8px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; font-size: 13px;';
            
            availableModels.forEach(function(model) {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                if (model.id === selectedModelId) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            
            // Create submit handler that captures the values from this specific input/select
            const handleSubmit = function() {
                const newPrompt = input.value.trim();
                const newModelId = select.value || selectedModelId;

                if (newPrompt) {
                    promptInput.value = newPrompt;
                    addPromptToHistory(newPrompt);
                    updatePromptDisplay(newPrompt);
                    latestActivePrompt = newPrompt;
                    latestActiveModelId = newModelId;
                    const modelChanged = previousModelId && previousModelId !== newModelId;
                    vscode.postMessage({
                        type: 'refineCandidates',
                        prompt: newPrompt,
                        modelId: newModelId,
                        modelChanged: modelChanged,
                        previousModelId: previousModelId
                    });
                    updateSelectedModel(newModelId);
                    previousModelId = newModelId;
                    showSection('loading');
                }
            };
            
            const submitBtn = document.createElement('button');
            submitBtn.style.cssText = 'padding: 6px 12px; min-width: auto;';
            submitBtn.title = 'Generate new candidates with revised prompt and model';
            submitBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="12" height="12">' +
                '<path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>';
            submitBtn.addEventListener('click', handleSubmit);
            
            const cancelBtn = document.createElement('button');
            cancelBtn.style.cssText = 'padding: 6px 12px; min-width: auto; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);';
            cancelBtn.title = 'Cancel';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', cancelEditPrompt);
            
            selectRow.appendChild(select);
            selectRow.appendChild(submitBtn);
            selectRow.appendChild(cancelBtn);
            
            flexCol.appendChild(inputRow);
            flexCol.appendChild(selectRow);
            
            container.appendChild(label);
            container.appendChild(flexCol);

            const isFinalVisible = !finalSection.classList.contains('hidden');
            const targetDisplay = isFinalVisible && finalPromptDisplay ? finalPromptDisplay : currentPromptDisplay;

            if (targetDisplay) {
                targetDisplay.innerHTML = '';
                targetDisplay.appendChild(container);
                setTimeout(function() {
                    input.focus();
                    input.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleSubmit();
                        }
                    });
                }, 10);
            }

            // Keep both displays in sync - create a clone with its own submit handler
            if (targetDisplay === finalPromptDisplay && currentPromptDisplay) {
                const clone = container.cloneNode(true);
                const cloneInput = clone.querySelector('.editPromptInput');
                const cloneSelect = clone.querySelector('.editModelSelect');
                const cloneSubmitBtn = clone.querySelector('button[title="Generate new candidates with revised prompt and model"]');
                const cloneCancelBtn = clone.querySelector('button[title="Cancel"]');
                
                // Create a separate handler for the clone that uses its own input/select
                const cloneHandleSubmit = function() {
                    const newPrompt = cloneInput.value.trim();
                    const newModelId = cloneSelect.value || selectedModelId;

                    if (newPrompt) {
                        promptInput.value = newPrompt;
                        addPromptToHistory(newPrompt);
                        updatePromptDisplay(newPrompt);
                        latestActivePrompt = newPrompt;
                        latestActiveModelId = newModelId;
                        const modelChanged = previousModelId && previousModelId !== newModelId;
                        vscode.postMessage({
                            type: 'refineCandidates',
                            prompt: newPrompt,
                            modelId: newModelId,
                            modelChanged: modelChanged,
                            previousModelId: previousModelId
                        });
                        updateSelectedModel(newModelId);
                        previousModelId = newModelId;
                        showSection('loading');
                    }
                };
                
                if (cloneSubmitBtn) {
                    cloneSubmitBtn.addEventListener('click', cloneHandleSubmit);
                }
                if (cloneCancelBtn) {
                    cloneCancelBtn.addEventListener('click', cancelEditPrompt);
                }
                if (cloneInput) {
                    cloneInput.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            cloneHandleSubmit();
                        }
                    });
                }
                
                currentPromptDisplay.innerHTML = '';
                currentPromptDisplay.appendChild(clone);
            } else if (targetDisplay === currentPromptDisplay && finalPromptDisplay) {
                const clone = container.cloneNode(true);
                const cloneInput = clone.querySelector('.editPromptInput');
                const cloneSelect = clone.querySelector('.editModelSelect');
                const cloneSubmitBtn = clone.querySelector('button[title="Generate new candidates with revised prompt and model"]');
                const cloneCancelBtn = clone.querySelector('button[title="Cancel"]');
                
                // Create a separate handler for the clone that uses its own input/select
                const cloneHandleSubmit = function() {
                    const newPrompt = cloneInput.value.trim();
                    const newModelId = cloneSelect.value || selectedModelId;

                    if (newPrompt) {
                        promptInput.value = newPrompt;
                        addPromptToHistory(newPrompt);
                        updatePromptDisplay(newPrompt);
                        latestActivePrompt = newPrompt;
                        latestActiveModelId = newModelId;
                        const modelChanged = previousModelId && previousModelId !== newModelId;
                        vscode.postMessage({
                            type: 'refineCandidates',
                            prompt: newPrompt,
                            modelId: newModelId,
                            modelChanged: modelChanged,
                            previousModelId: previousModelId
                        });
                        updateSelectedModel(newModelId);
                        previousModelId = newModelId;
                        showSection('loading');
                    }
                };
                
                if (cloneSubmitBtn){
                     cloneSubmitBtn.addEventListener('click', cloneHandleSubmit);
                }
                if (cloneCancelBtn) {
                    cloneCancelBtn.addEventListener('click', cancelEditPrompt);
                }
                if (cloneInput) {
                    cloneInput.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            cloneHandleSubmit();
                        }
                    });
                }
                
                finalPromptDisplay.innerHTML = '';
                finalPromptDisplay.appendChild(clone);
            }
        }

        function submitEditedPrompt() {
            // This function is no longer needed as submit handlers are created inline
            // Keeping for backwards compatibility in case it's called elsewhere
            const editInput = document.querySelector('.editPromptInput');
            const editModelSelect = document.querySelector('.editModelSelect');
            if (!editInput) {
                return;
            }
            const newPrompt = editInput.value.trim();
            const newModelId = editModelSelect ? editModelSelect.value : selectedModelId;

            if (newPrompt) {
                promptInput.value = newPrompt;
                addPromptToHistory(newPrompt);
                updatePromptDisplay(newPrompt);
                latestActivePrompt = newPrompt;
                latestActiveModelId = newModelId;
                const modelChanged = previousModelId && previousModelId !== newModelId;
                vscode.postMessage({
                    type: 'refineCandidates',
                    prompt: newPrompt,
                    modelId: newModelId,
                    modelChanged: modelChanged,
                    previousModelId: previousModelId
                });
                updateSelectedModel(newModelId);
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
            const normalized = String(str ?? '').replace(/\r\n/g, '\n');
            return normalized
                .replace(/\r/g, '↵')
                .replace(/\n/g, '↵')
                .replace(/\t/g, '→')
                .replace(/ /g, '·')
                .replace(/\u00A0/g, '⍽')
                .replace(/\f/g, '␌')
                .replace(/\v/g, '␋')
                .replace(/\0/g, '␀')
                .replace(/\\/g, '⧹')
                .replace(/"/g, '"')
                .replace(/'/g, "'");
        }

        // Literal-safe display for a single character (used in diff rendering)
        function toLiteralChar(ch) {
            return toLiteralString(ch);
        }

        /**
         * Log to backend logger via message passing
         */
        function log(level, message) {
            vscode.postMessage({
                type: 'log',
                level: level,
                message: message
            });
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

            if (window.Prism && Prism.languages && Prism.languages.regex) {
                try {
                    const highlighted = Prism.highlight(pattern, Prism.languages.regex, 'regex');
                    return '<code class="regex-syntax language-regex">' + highlighted + '</code>';
                } catch (err) {
                    log('warn', 'Prism highlight failed: ' + String(err));
                }
            }

            // Fallback: simple escaped text if Prism isn't available
            return '<code class="regex-syntax">' + escapeHtml(pattern) + '</code>';
        }

        /**
         * Find the most recent history record for a word.
         */
        function getHistoryRecordForWord(word, history) {
            if (!word || !Array.isArray(history)) {
                return null;
            }

            for (let i = history.length - 1; i >= 0; i--) {
                const record = history[i];
                if (record && record.word === word) {
                    return record;
                }
            }

            return null;
        }

        /**
         * Build a small popover listing regexes that matched a word.
         */
        function buildMatchPopover(matches, headingText) {
            const popover = document.createElement('div');
            popover.className = 'match-popover hidden';

            const heading = document.createElement('div');
            heading.className = 'match-popover__title';
            heading.textContent = headingText || 'Matching regexes';
            popover.appendChild(heading);

            const body = document.createElement('div');
            body.className = 'match-popover__body';

            const matchList = Array.isArray(matches) ? matches : [];
            if (matchList.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'match-popover__empty';
                empty.textContent = 'No candidates matched this word.';
                body.appendChild(empty);
            } else {
                const list = document.createElement('ul');
                list.className = 'match-popover__list';
                matchList.forEach(pattern => {
                    const li = document.createElement('li');
                    const code = document.createElement('code');
                    code.textContent = pattern;
                    li.appendChild(code);
                    list.appendChild(li);
                });
                body.appendChild(list);
            }

            popover.appendChild(body);
            return popover;
        }

        /**
         * Close all open match popovers and reset their toggle buttons.
         */
        function closeMatchPopovers() {
            document.querySelectorAll('.match-popover').forEach(pop => pop.classList.add('hidden'));
            document.querySelectorAll('.match-info-btn').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
        }

        /**
         * Create a (?)-style toggle button and popover for match info.
         */
        function createMatchInfoControls(matches, headingText, extraButtonClass) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'match-info-btn' + (extraButtonClass ? ' ' + extraButtonClass : '');
            button.setAttribute('aria-expanded', 'false');
            button.title = 'Show which regexes match this word';
            button.innerHTML = '?';

            const popover = buildMatchPopover(matches, headingText);

            button.addEventListener('click', function(ev) {
                ev.stopPropagation();
                const willOpen = popover.classList.contains('hidden');
                closeMatchPopovers();
                if (willOpen) {
                    popover.classList.remove('hidden');
                    button.setAttribute('aria-expanded', 'true');
                } else {
                    popover.classList.add('hidden');
                    button.setAttribute('aria-expanded', 'false');
                }
            });

            return { button, popover };
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
                latestActivePrompt = prompt;
                latestActiveModelId = selectedModelId;
                vscode.postMessage({ type: 'generateCandidates', prompt: prompt, modelId: selectedModelId });
                previousModelId = selectedModelId;
                showSection('loading');
            }
        });

        promptInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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
                updateLiteralModeUI();
                // Re-render current pair if one exists
                if (lastPair && lastStatus) {
                    showWordPair(lastPair, lastStatus);
                }
            });
        }

        if (showCandidatesToggle) {
            showCandidatesToggle.addEventListener('change', function() {
                const show = showCandidatesToggle.checked;
                updateCandidatesUI(show);
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
                updateDiffModeUI();
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

        const displayButtons = displayOptionsBtn ? [displayOptionsBtn] : [];

        function setDisplayMenuState(open) {
            if (!displayOptionsMenu) {
                return;
            }
            if (open) {
                displayOptionsMenu.classList.remove('hidden');
            } else {
                displayOptionsMenu.classList.add('hidden');
            }
            displayButtons.forEach(btn => btn.setAttribute('aria-expanded', open ? 'true' : 'false'));
            if (open) {
                const cb = displayOptionsMenu.querySelector('input[type="checkbox"]');
                if (cb) {
                    cb.focus();
                }
            }
        }

        if (displayButtons.length && displayOptionsMenu) {
            displayButtons.forEach(btn => {
                btn.addEventListener('click', function(e) {
                    const isOpen = !displayOptionsMenu.classList.contains('hidden');
                    setDisplayMenuState(!isOpen);
                    e.stopPropagation();
                });
            });

            window.addEventListener('click', function(ev) {
                const target = ev.target;

                if (!displayOptionsMenu.classList.contains('hidden') &&
                    !displayOptionsMenu.contains(target) &&
                    !displayButtons.some(btn => btn.contains(target))) {
                    setDisplayMenuState(false);
                }

                if (recentPromptsMenu && !recentPromptsMenu.classList.contains('hidden') &&
                    !recentPromptsMenu.contains(target) &&
                    target !== recentPromptsBtn) {
                    toggleHistoryMenu(false);
                }

                if (!target.closest('.match-popover') && !target.closest('.match-info-btn')) {
                    closeMatchPopovers();
                }
            });

            window.addEventListener('keydown', function(ev) {
                if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'h') {
                    ev.preventDefault();
                    toggleHistoryMenu(true);
                    return;
                }

                if (ev.key === 'Escape') {
                    const anyPopoverOpen = document.querySelector('.match-popover:not(.hidden)');
                    if (anyPopoverOpen) {
                        closeMatchPopovers();
                        return;
                    }
                    if (!displayOptionsMenu.classList.contains('hidden')) {
                        setDisplayMenuState(false);
                        const focusTarget = displayButtons[0];
                        if (focusTarget) {
                            focusTarget.focus();
                        }
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
            log('info', 'Received message: type="' + message.type + '"');

            switch (message.type) {
                case 'status':
                    showStatus(message.message);
                    break;
                case 'error':
                    showError(message.message);
                    break;
                case 'clearWarnings':
                    clearWarnings();
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
                    updateModelSelector(message.models, message.preferredModelId);
                    break;
                case 'candidatesGenerated':
                    inlineCancelBtn.classList.add('hidden');
                    statusCancelBtn.classList.add('hidden');
                    generateBtn.classList.remove('hidden');
                    clearStatusMessage();
                    latestCandidates = Array.isArray(message.candidates) ? message.candidates.slice() : [];
                    updateCandidates(message.candidates, 2);
                    break;
                case 'candidatesRefined':
                    inlineCancelBtn.classList.add('hidden');
                    statusCancelBtn.classList.add('hidden');
                    generateBtn.classList.remove('hidden');
                    clearStatusMessage();
                    latestCandidates = Array.isArray(message.candidates) ? message.candidates.slice() : [];
                    updateCandidates(message.candidates, 2);
                    break;
                case 'newPair':
                    classifiedWords.clear();
                    showWordPair(message.pair, message.status, message.matches);
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
                case 'examplesApplied':
                    updateStatus(message.status);
                    handleExamplesApplied(message);
                    break;
                case 'examplesRejected':
                    handleExamplesRejected(message.message);
                    break;
                case 'voteProcessed':
                    updateStatus(message.status);
                    break;
                case 'finalResult':
                    if (message.status && Array.isArray(message.status.candidateDetails)) {
                        latestCandidates = message.status.candidateDetails.slice();
                    }
                    showFinalResultWithContext(message.regex, message.wordsIn, message.wordsOut, message.status);
                    break;
                case 'copied':
                    showStatusWithoutCancel('Copied to clipboard');
                    setTimeout(function() {
                        clearStatusMessage();
                    }, 2000);
                    break;
                case 'noRegexFound':
                    if (Array.isArray(message.candidateDetails)) {
                        latestCandidates = message.candidateDetails.slice();
                    }
                    showNoRegexFound(message.message, message.candidateDetails, message.wordsIn, message.wordsOut, message.wordHistory);
                    break;
                case 'insufficientWords':
                    showInsufficientWords(message.candidates, message.status);
                    break;
                case 'reset':
                    resetUI(message.preserveClassifications);
                    break;
                case 'resetLocalState':
                    clearLocalState();
                    break;
                case 'cancelled':
                    handleCancelled(message.message);
                    break;
                case 'sessionLoaded':
                    handleSessionLoaded(message);
                    break;
                case 'showVoting':
                    showSection('voting');
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
            statusActive = false;
            if (statusMessage) {
                statusMessage.innerHTML = '';
            }
            statusCancelBtn.classList.add('hidden');
            updateStatusBarVisibility();

            if (section === 'prompt') {
                promptSection.classList.remove('hidden');
            } else if (section === 'voting') {
                votingSection.classList.remove('hidden');
            } else if (section === 'final') {
                finalSection.classList.remove('hidden');
            } else if (section === 'loading') {
                statusActive = true;
                statusBar.classList.remove('hidden');
                inlineCancelBtn.classList.remove('hidden');
                statusCancelBtn.classList.remove('hidden');
                generateBtn.classList.add('hidden');
                updateStatusBarVisibility();
            }
        }

        function clearLocalState() {
            // Reset in-memory and persisted state
            promptHistory = [];
            viewState = {};
            vscode.setState(viewState);

            // Reset recent prompts UI
            renderPromptHistory();
            if (recentPromptsMenu) {
                recentPromptsMenu.classList.add('hidden');
                if (recentPromptsBtn) {
                    recentPromptsBtn.setAttribute('aria-expanded', 'false');
                }
            }

            if (customExamplesPanel) {
                customExamplesPanel.classList.add('hidden');
            }
            if (customExamplesToggle) {
                customExamplesToggle.setAttribute('aria-expanded', 'false');
            }
            clearExamplesForm();
            
            // Show the splash again
            if (splashScreen) {
                splashScreen.classList.remove('hidden');
                splashScreen.setAttribute('aria-hidden', 'false');
            }
        }

        function showStatus(message) {
            if (statusMessage) {
                statusMessage.innerHTML = '<span class="loading-spinner"></span><span>' + message + '</span>';
            }
            statusActive = true;
            statusBar.classList.remove('hidden');
            inlineCancelBtn.classList.remove('hidden');
            statusCancelBtn.classList.remove('hidden');
            generateBtn.classList.add('hidden');
            updateStatusBarVisibility();
        }

        function showStatusWithoutCancel(message) {
            if (statusMessage) {
                statusMessage.innerHTML = '<span>' + message + '</span>';
            }
            statusActive = true;
            statusBar.classList.remove('hidden');
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');
            updateStatusBarVisibility();
        }

        function showError(message) {
            // Stop the spinner and clear status message
            if (statusMessage) {
                statusMessage.innerHTML = '';
            }
            setExampleButtonsDisabled(false);
            // Reset to prompt section
            showSection('prompt');
            // statusCancelBtn needs explicit hiding since showSection doesn't manage it
            statusCancelBtn.classList.add('hidden');
            
            // Show the error message with better formatting
            // Check if message has multiple lines or paragraphs
            const formattedMessage = message
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => `<p style="margin: 8px 0;">${escapeHtml(line)}</p>`)
                .join('');
            
            errorSection.innerHTML = formattedMessage || escapeHtml(message);
            errorSection.classList.remove('hidden');
        }

        function showPermissionRequired(message) {
            showSection('prompt');
            clearStatusMessage();

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
            clearStatusMessage();

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

        function updateStatusBarVisibility() {
            if (!statusBar) {
                return;
            }
            const shouldShow = statusActive || Boolean(lastWarning);
            statusBar.classList.toggle('hidden', !shouldShow);
        }

        function clearStatusMessage() {
            if (statusMessage) {
                statusMessage.innerHTML = '';
            }
            statusActive = false;
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');
            generateBtn.classList.remove('hidden');
            updateStatusBarVisibility();
        }

        function renderWarnings() {
            if (!statusWarnings) {
                return;
            }

            if (!lastWarning) {
                statusWarnings.classList.add('hidden');
                statusWarnings.setAttribute('aria-hidden', 'true');
                statusWarnings.innerHTML = '';
                updateStatusBarVisibility();
                return;
            }

            // Convert newlines to <br> tags for proper formatting
            const formattedWarning = escapeHtml(lastWarning).replace(/\\n/g, '<br>');
            
            statusWarnings.innerHTML = '<span class="status-warning-icon" aria-hidden="true">⚠️</span>' +
                '<span class="status-warning-text">' + formattedWarning + '</span>' +
                '<button class="icon-btn subtle status-warning-dismiss" type="button" title="Dismiss warning" aria-label="Dismiss warning">' +
                '&#10005;' +
                '</button>';
            statusWarnings.classList.remove('hidden');
            statusWarnings.setAttribute('aria-hidden', 'false');
            updateStatusBarVisibility();
        }

        function clearWarnings() {
            lastWarning = '';
            renderWarnings();
        }

        function showWarning(message) {
            lastWarning = message || '';
            renderWarnings();
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');
        }

        function showInsufficientWords(candidates, status) {
            // Clear any existing error messages first
            errorSection.classList.add('hidden');
            clearStatusMessage();
            
            showSection('voting');
            updateCandidates(candidates, status.threshold);
            updateWordHistory(status.wordHistory);

            wordPair.innerHTML = '<div style="text-align: center; padding: 20px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); border-radius: 4px;">' +
                '<h3>Unable to generate more words</h3>' +
                '<p>The system ran out of distinguishing words to generate.</p>' +
                '<p>Here are the remaining candidates. You can copy any candidate you prefer, or click "Build a New Regex" below to start fresh.</p>' +
                '</div>';
        }

        function formatConfidence(confidence) {
            if (!Number.isFinite(confidence)) {
                return null;
            }

            if (confidence > 1) {
                return confidence.toFixed(2);
            }

            return Math.round(confidence * 100) + '%';
        }

        function createCandidateInfo(candidate) {
            if (!candidate || (!candidate.explanation && candidate.confidence === undefined)) {
                return null;
            }

            const infoBtn = document.createElement('button');
            infoBtn.type = 'button';
            infoBtn.className = 'icon-btn candidate-info-btn';
            infoBtn.title = 'Show LLM-provided explanation and confidence';
            infoBtn.textContent = '?';
            infoBtn.setAttribute('aria-expanded', 'false');

            const infoPanel = document.createElement('div');
            infoPanel.className = 'candidate-info hidden';
            infoPanel.setAttribute('role', 'note');

            const infoSource = document.createElement('div');
            infoSource.className = 'candidate-info-source';
            infoSource.textContent = 'Model-generated (LLM) notes — may be inaccurate.';
            infoPanel.appendChild(infoSource);

            const explanationRow = document.createElement('div');
            explanationRow.className = 'candidate-info-row';
            const explanationLabel = document.createElement('strong');
            explanationLabel.textContent = 'LLM explanation: ';
            const explanationText = document.createElement('span');
            explanationText.textContent = candidate.explanation || 'No explanation provided by the model.';
            explanationRow.appendChild(explanationLabel);
            explanationRow.appendChild(explanationText);
            infoPanel.appendChild(explanationRow);

            const confidenceText = formatConfidence(candidate.confidence);
            if (confidenceText) {
                const confidenceRow = document.createElement('div');
                confidenceRow.className = 'candidate-info-row';
                const confidenceLabel = document.createElement('strong');
                confidenceLabel.textContent = 'LLM confidence: ';
                const confidenceValue = document.createElement('span');
                confidenceValue.textContent = confidenceText;
                confidenceRow.appendChild(confidenceLabel);
                confidenceRow.appendChild(confidenceValue);
                infoPanel.appendChild(confidenceRow);
            }

            infoBtn.onclick = function() {
                const isHidden = infoPanel.classList.contains('hidden');
                infoPanel.classList.toggle('hidden');
                infoBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
                if (!isHidden) {
                    infoBtn.focus();
                }
            };

            return { button: infoBtn, panel: infoPanel };
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
                thresholdDiv.textContent = 'Rejection threshold: ' + threshold + ' negative vote(s)';
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

                const info = createCandidateInfo(c);

                const posBadge = document.createElement('span');
                posBadge.className = 'badge positive';
                posBadge.textContent = '✓ ' + c.positiveVotes;

                const negBadge = document.createElement('span');
                negBadge.className = 'badge negative';
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

                if (info) {
                    votesContainer.appendChild(info.button);
                    div.appendChild(info.panel);
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
                thresholdDiv.textContent = 'Rejection threshold: ' + threshold + ' negative vote(s)';
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

                const info = createCandidateInfo(c);

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
                posVoteBadge.className = 'badge positive';
                posVoteBadge.textContent = '✓ ' + c.positiveVotes;
                
                const negVoteBadge = document.createElement('span');
                negVoteBadge.className = 'badge negative';
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
                if (info) {
                    votesDiv.appendChild(info.button);
                    div.appendChild(info.panel);
                }
                candidatesList.appendChild(div);
            });
        }

        function updateStatus(status) {
            lastStatus = status;
            if (status.activeCandidates > 0) {
                clearHistoryNotice();
            }
            updateCandidates(status.candidateDetails, status.threshold);
            updateWordHistory(status.wordHistory);
            const fallbackMatches = lastPairMatches && lastPair
                ? new Map([
                    [lastPair.word1, Array.isArray(lastPairMatches.word1) ? lastPairMatches.word1 : []],
                    [lastPair.word2, Array.isArray(lastPairMatches.word2) ? lastPairMatches.word2 : []]
                  ])
                : undefined;
            decorateWordCardsWithMatches(status.wordHistory, fallbackMatches);
            showStatusWithoutCancel('Active: ' + status.activeCandidates + '/' + status.totalCandidates + ' | Words classified: ' + status.wordHistory.length);
        }

        function handleExamplesApplied(message) {
            setExampleButtonsDisabled(false);

            const parts = [];
            if (message && message.acceptCount) {
                parts.push(`${message.acceptCount} should match`);
            }
            if (message && message.rejectCount) {
                parts.push(`${message.rejectCount} should not match`);
            }
            if (message && typeof message.truncated === 'number' && message.truncated > 0) {
                parts.push(`Ignored ${message.truncated} extra entr${message.truncated === 1 ? 'y' : 'ies'}`);
            }

            const summary = parts.length > 0 ? `Added ${parts.join(', ')}.` : 'Examples applied.';
            clearExamplesForm(true);
            setExamplesStatus(summary, 'success');
        }

        function handleExamplesRejected(errorMessage) {
            setExampleButtonsDisabled(false);
            toggleExamplesPanel(true);
            setExamplesStatus(errorMessage || 'Unable to use those examples.', 'error');
        }

        function classifyWord(word, classification) {
            log('info', 'classifyWord called: word="' + word + '" (length: ' + word.length + '), classification="' + classification + '"');
            classifiedWords.add(word);
            vscode.postMessage({
                type: 'classifyWord',
                word: word,
                classification: classification
            });
            log('info', 'Sent classifyWord message to extension');

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

        function showWordPair(pair, status, pairMatches) {
            log('info', 'showWordPair called: word1="' + pair.word1 + '" (length: ' + pair.word1.length + '), word2="' + pair.word2 + '" (length: ' + pair.word2.length + ')');
            // cache for re-render when toggles change
            lastPair = pair;
            lastStatus = status;
            lastPairMatches = pairMatches || null;
            clearHistoryNotice();
            closeMatchPopovers();

            showSection('voting');
            updateCandidates(status.candidateDetails, status.threshold);
            updateWordHistory(status.wordHistory);
            showStatusWithoutCancel('Active: ' + status.activeCandidates + '/' + status.totalCandidates + ' | Words classified: ' + status.wordHistory.length);

            const diffOps = diffMode ? diffWords(pair.word1, pair.word2) : null;

            /**
             * Create a word card element programmatically (DOM-based, not string-based)
             * This avoids escaping issues with inline onclick handlers
             */
            function createWordCard(word, side) {
                let readable, literal;
                if (diffOps) {
                    readable = renderWordWithDiff(diffOps, side, false);
                    literal = renderWordWithDiff(diffOps, side, true);
                } else {
                    readable = escapeHtml(word);
                    literal = toLiteralString(word);
                }

                // Create card container
                const card = document.createElement('div');
                card.className = 'word-card';
                card.setAttribute('data-word', word);
                card.setAttribute('data-original-word', word);

                // Create display section
                const display = document.createElement('div');
                display.className = 'word-display editable-word-display';
                
                const readableSpan = document.createElement('span');
                readableSpan.className = 'word-readable';
                readableSpan.contentEditable = 'true';
                readableSpan.spellcheck = false;
                if (diffOps) {
                    readableSpan.innerHTML = readable;
                } else {
                    readableSpan.textContent = word;
                }
                readableSpan.title = 'Click to edit this word';
                
                const literalSpan = document.createElement('span');
                literalSpan.className = 'word-literal';
                // Render HTML when diff mode is active (literal contains span markup), otherwise use textContent
                if (diffOps) {
                    literalSpan.innerHTML = literal;
                } else {
                    literalSpan.textContent = literal;
                }
                
                // Handle editing events
                let currentWord = word;
                readableSpan.addEventListener('blur', function() {
                    const newWord = this.textContent.trim();
                    
                    // Validate the edited word
                    if (newWord.length === 0) {
                        // Restore original if empty
                        const originalWord = card.getAttribute('data-original-word');
                        this.textContent = originalWord;
                        currentWord = originalWord;
                        literalSpan.textContent = toLiteralString(originalWord);
                        return;
                    }
                    
                    // Check for reasonable length (max 1000 chars to prevent abuse)
                    if (newWord.length > 1000) {
                        log('warn', 'Edited word too long, reverting to original');
                        const originalWord = card.getAttribute('data-original-word');
                        this.textContent = originalWord;
                        currentWord = originalWord;
                        literalSpan.textContent = toLiteralString(originalWord);
                        return;
                    }
                    
                    if (newWord !== currentWord) {
                        const previousWord = currentWord;
                        currentWord = newWord;
                        card.setAttribute('data-word', newWord);
                        literalSpan.textContent = toLiteralString(newWord);
                        log('info', 'Word edited from "' + card.getAttribute('data-original-word') + '" to "' + newWord + '"');
                        
                        // Notify backend about the word edit
                        vscode.postMessage({
                            type: 'wordEdited',
                            originalWord: previousWord,
                            newWord: newWord
                        });
                    }
                });
                
                readableSpan.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.blur();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        const originalWord = card.getAttribute('data-original-word');
                        this.textContent = originalWord;
                        currentWord = originalWord;
                        literalSpan.textContent = toLiteralString(originalWord);
                        this.blur();
                    }
                });
                
                // Update literal display as user types
                readableSpan.addEventListener('input', function() {
                    literalSpan.textContent = toLiteralString(this.textContent);
                });
                
                display.appendChild(readableSpan);
                display.appendChild(literalSpan);

                // Create actions section
                const actions = document.createElement('div');
                actions.className = 'word-actions';

                // Create accept button - use current word from card attribute
                const acceptBtn = createButton('accept', 'Upvote', card);
                acceptBtn.innerHTML = '<span style="font-size: 20px; line-height: 1;">▲</span>';

                // Create reject button - use current word from card attribute
                const rejectBtn = createButton('reject', 'Downvote', card);
                rejectBtn.innerHTML = '<span style="font-size: 20px; line-height: 1;">▼</span>';

                // Create unsure button - use current word from card attribute
                const unsureBtn = createButton('unsure', 'Unsure', card);
                unsureBtn.innerHTML = '<svg viewBox="0 0 24 24" width="var(--pick-icon-size)" height="var(--pick-icon-size)" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/>' +
                    '<path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '</svg>';

                actions.appendChild(acceptBtn);
                actions.appendChild(rejectBtn);
                actions.appendChild(unsureBtn);

                card.appendChild(display);
                card.appendChild(actions);

                return card;
            }

            /**
             * Helper function to create a classification button with proper event listener
             * @param {string} classification - The classification type
             * @param {string} title - The button title
             * @param {HTMLElement} card - The word card element
             */
            function createButton(classification, title, card) {
                const button = document.createElement('button');
                button.className = 'btn ' + classification;
                button.title = title;
                // Attach event listener directly - get word from card data attribute at click time
                button.addEventListener('click', function() {
                    const currentWord = card.getAttribute('data-word');
                    classifyWord(currentWord, classification);
                });
                return button;
            }

            // Clear and rebuild word pair container
            wordPair.innerHTML = '';
            wordPair.appendChild(createWordCard(pair.word1, 'a'));
            wordPair.appendChild(createWordCard(pair.word2, 'b'));
            const fallbackMatches = pairMatches
                ? new Map([
                    [pair.word1, Array.isArray(pairMatches.word1) ? pairMatches.word1 : []],
                    [pair.word2, Array.isArray(pairMatches.word2) ? pairMatches.word2 : []]
                  ])
                : undefined;
            decorateWordCardsWithMatches(status.wordHistory, fallbackMatches);
        }

        function setHistoryCopyStatus(message, type) {
            if (!historyCopyStatus) {
                return;
            }

            if (historyStatusTimeout) {
                clearTimeout(historyStatusTimeout);
            }

            historyCopyStatus.textContent = message || '';
            
            // Apply styling based on type
            historyCopyStatus.className = 'history-copy-status';
            if (type === 'error') {
                historyCopyStatus.style.color = 'var(--vscode-errorForeground)';
            } else if (type === 'muted') {
                historyCopyStatus.style.color = 'var(--vscode-descriptionForeground)';
            } else {
                historyCopyStatus.style.color = '';
            }

            if (message) {
                historyStatusTimeout = setTimeout(function() {
                    historyCopyStatus.textContent = '';
                    historyCopyStatus.style.color = '';
                    historyStatusTimeout = null;
                }, 3000);
            }
        }

        function normalizeClassificationForExport(classification) {
            const normalized = (classification || '').toLowerCase();
            if (normalized === 'accept') {
                return 'in';
            }
            if (normalized === 'reject') {
                return 'out';
            }
            return 'unsure';
        }

        function copyHistoryToClipboard() {
            if (!Array.isArray(latestWordHistory) || latestWordHistory.length === 0) {
                setHistoryCopyStatus('No classifications to export yet.');
                return;
            }

            // Build the full export structure
            const exportData = {
                prompt: latestActivePrompt || null,
                modelId: latestActiveModelId || null,
                candidates: latestCandidates.map(function(candidate) {
                    const candidateInfo = {
                        regex: candidate.pattern,
                        explanation: candidate.explanation || null,
                        confidence: candidate.confidence !== undefined ? candidate.confidence : null
                    };
                    // Only include equivalents if they exist and are non-empty
                    if (Array.isArray(candidate.equivalents) && candidate.equivalents.length > 0) {
                        candidateInfo.equivalents = candidate.equivalents;
                    }
                    return candidateInfo;
                }),
                classifications: latestWordHistory.map(function(item) {
                    return {
                        word: item.word,
                        classification: normalizeClassificationForExport(item.classification),
                        matchingRegexes: Array.isArray(item.matchingRegexes) ? item.matchingRegexes : []
                    };
                })
            };
            const payload = JSON.stringify(exportData, null, 2);

            const fallbackCopy = function() {
                try {
                    const textarea = document.createElement('textarea');
                    textarea.value = payload;
                    textarea.setAttribute('aria-hidden', 'true');
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();

                    const successful = document.execCommand('copy');
                    document.body.removeChild(textarea);

                    if (successful) {
                        setHistoryCopyStatus('Copied history to clipboard.');
                    } else {
                        setHistoryCopyStatus('Unable to copy history.');
                    }
                } catch (error) {
                    console.error('Failed to copy history', error);
                    setHistoryCopyStatus('Unable to copy history.');
                }
            };

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(payload)
                    .then(function() { setHistoryCopyStatus('Copied history to clipboard.'); })
                    .catch(function() { fallbackCopy(); });
            } else {
                fallbackCopy();
            }
        }

        function updateWordHistory(history) {
            closeMatchPopovers();

            latestWordHistory = Array.isArray(history) ? history.slice() : [];
            setHistoryCopyStatus('');

            if (!history || history.length === 0) {
                historyItems.innerHTML = '<p style="color: var(--vscode-descriptionForeground); font-style: italic;">No words classified yet.</p>';
                return;
            }

            historyItems.innerHTML = '';

            const applyHistoryTone = function(element, classification) {
                element.classList.remove('history-item--accept', 'history-item--reject', 'history-item--unsure');
                element.classList.add('history-item--' + classification);
            };

            history.forEach(function(item, index) {
                // Create history item container
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                historyItem.setAttribute('data-word', item.word);
                applyHistoryTone(historyItem, item.classification);

                // Quick match info toggle in the top-left corner
                const matchInfo = createMatchInfoControls(
                    item.matchingRegexes,
                    `Matching regexes for "${item.word}"`,
                    'history-info-btn'
                );
                matchInfo.popover.classList.add('history-match-popover');
                historyItem.appendChild(matchInfo.button);
                historyItem.appendChild(matchInfo.popover);

                // Create word display section
                const contentDiv = document.createElement('div');
                contentDiv.className = 'history-item__content';
                
                const wordDisplay = document.createElement('div');
                wordDisplay.className = 'word-display';
                
                const readableSpan = document.createElement('span');
                readableSpan.className = 'word-readable history-word';
                readableSpan.setAttribute('data-word', item.word);
                readableSpan.textContent = item.word;
                
                const literalSpan = document.createElement('span');
                literalSpan.className = 'word-literal history-word';
                literalSpan.setAttribute('data-word', item.word);
                literalSpan.textContent = toLiteralString(item.word);
                
                wordDisplay.appendChild(readableSpan);
                wordDisplay.appendChild(literalSpan);
                
                const matchesDiv = document.createElement('div');
                matchesDiv.className = 'history-matches';

                const matchesHeader = document.createElement('div');
                matchesHeader.className = 'history-matches__header';

                const matchCount = item.matchingRegexes.length;

                if (matchCount > 0) {
                    const toggleButton = document.createElement('button');
                    toggleButton.type = 'button';
                    toggleButton.className = 'secondary match-toggle-btn';
                    toggleButton.textContent = `Show the ${matchCount} matching candidate${matchCount === 1 ? '' : 's'}`;
                    toggleButton.setAttribute('aria-expanded', 'false');

                    const details = document.createElement('div');
                    details.className = 'match-details hidden';

                    const list = document.createElement('ul');
                    list.className = 'match-list';

                    item.matchingRegexes.forEach(pattern => {
                        const listItem = document.createElement('li');
                        const code = document.createElement('code');
                        code.textContent = pattern;
                        listItem.appendChild(code);
                        list.appendChild(listItem);
                    });

                    details.appendChild(list);

                    toggleButton.addEventListener('click', function() {
                        const willShow = details.classList.contains('hidden');
                        if (willShow) {
                            details.classList.remove('hidden');
                            toggleButton.textContent = 'Hide matching candidates';
                            toggleButton.setAttribute('aria-expanded', 'true');
                        } else {
                            details.classList.add('hidden');
                            toggleButton.textContent = `Show the ${matchCount} matching candidate${matchCount === 1 ? '' : 's'}`;
                            toggleButton.setAttribute('aria-expanded', 'false');
                        }
                    });

                    matchesHeader.appendChild(toggleButton);
                    matchesDiv.appendChild(matchesHeader);
                    matchesDiv.appendChild(details);
                } else {
                    const matchesSummary = document.createElement('span');
                    matchesSummary.textContent = 'No candidates matched this word';
                    matchesHeader.appendChild(matchesSummary);
                    matchesDiv.appendChild(matchesHeader);
                }

                contentDiv.appendChild(wordDisplay);
                contentDiv.appendChild(matchesDiv);

                // Create classification selector
                const classificationDiv = document.createElement('div');
                classificationDiv.className = 'history-classification';

                let currentClassification = item.classification;

                const setActiveButton = function(selectedClassification) {
                    const buttons = classificationDiv.querySelectorAll('button');
                    buttons.forEach(btn => {
                        const isActive = btn.getAttribute('data-classification') === selectedClassification;
                        btn.classList.toggle('active', isActive);
                        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                    });
                };

                const createHistoryButton = function(classification, label, iconHtml) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'btn ' + classification + ' history-classification__btn';
                    button.setAttribute('data-classification', classification);
                    button.title = label;
                    button.setAttribute('aria-label', label);
                    button.innerHTML = iconHtml;
                    button.addEventListener('click', function() {
                        if (currentClassification === classification) {
                            return;
                        }
                        currentClassification = classification;
                        applyHistoryTone(historyItem, classification);
                        setActiveButton(classification);
                        updateClassification(index, classification);
                    });
                    return button;
                };

                const acceptBtn = createHistoryButton(
                    'accept',
                    'Upvote (this should match)',
                    '<span aria-hidden="true" style="font-size: 18px; line-height: 1;">▲</span>'
                );
                const rejectBtn = createHistoryButton(
                    'reject',
                    'Downvote (this should NOT match)',
                    '<span aria-hidden="true" style="font-size: 18px; line-height: 1;">▼</span>'
                );
                const unsureBtn = createHistoryButton(
                    'unsure',
                    'Unsure / skip',
                    '<svg viewBox="0 0 24 24" width="var(--pick-icon-size)" height="var(--pick-icon-size)" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                        '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/>' +
                        '<path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '</svg>'
                );

                classificationDiv.appendChild(acceptBtn);
                classificationDiv.appendChild(rejectBtn);
                classificationDiv.appendChild(unsureBtn);

                setActiveButton(currentClassification);

                // Assemble the history item
                historyItem.appendChild(contentDiv);
                historyItem.appendChild(classificationDiv);
                
                historyItems.appendChild(historyItem);
            });
        }

        /**
         * Add match info buttons to the currently displayed word cards when we have history data.
         */
        function decorateWordCardsWithMatches(history, fallbackMatches) {
            const hasHistory = Array.isArray(history) && history.length > 0;
            const cards = document.querySelectorAll('.word-card');
            cards.forEach(function(card) {
                const word = card.getAttribute('data-word');
                const record = hasHistory ? getHistoryRecordForWord(word, history) : null;
                const hasFallback = fallbackMatches && fallbackMatches.has(word);

                // Remove existing controls if we don't have data for this word
                if (!record && !hasFallback) {
                    const existingBtn = card.querySelector('.word-info-btn');
                    const existingPopover = card.querySelector('.word-match-popover');
                    if (existingBtn) {
                        existingBtn.remove();
                    }
                    if (existingPopover) {
                        existingPopover.remove();
                    }
                    return;
                }

                const matches = record
                    ? (Array.isArray(record.matchingRegexes) ? record.matchingRegexes : [])
                    : (fallbackMatches?.get(word) ?? []);

                const existingBtn = card.querySelector('.word-info-btn');
                const existingPopover = card.querySelector('.word-match-popover');
                if (existingBtn) {
                    existingBtn.remove();
                }
                if (existingPopover) {
                    existingPopover.remove();
                }

                const info = createMatchInfoControls(matches, `Matching regexes for "${word}"`, 'word-info-btn');
                info.popover.classList.add('word-match-popover');
                card.appendChild(info.button);
                card.appendChild(info.popover);
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

        function clearHistoryNotice() {
            if (!wordHistory) {
                return;
            }
            const existingNotice = wordHistory.querySelector('.history-note');
            if (existingNotice) {
                existingNotice.remove();
            }
        }

        function addHistoryNotice(message) {
            if (!wordHistory || !historyItems) {
                return;
            }
            clearHistoryNotice();

            const notice = document.createElement('div');
            notice.className = 'history-note';
            notice.style.cssText = 'margin: 8px 0 12px 0; padding: 10px; border-radius: 6px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-errorForeground);';
            notice.textContent = message;

            wordHistory.insertBefore(notice, historyItems);
        }

        function showFinalResultWithContext(regex, inWords, outWords, status) {
            // Defensive check: if regex is null/undefined, treat as noRegexFound
            if (!regex) {
                console.warn('showFinalResultWithContext called with null/undefined regex, redirecting to showNoRegexFound');
                showNoRegexFound(
                    'No candidate regexes match your requirements.',
                    status ? status.candidateDetails : [],
                    inWords,
                    outWords,
                    status ? status.wordHistory : null
                );
                return;
            }

            showSection('voting');
            clearStatusMessage();

            clearHistoryNotice();

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

        function showNoRegexFound(message, candidateDetails, inWords, outWords, wordHistory) {
            // Keep the classification history visible so users can re-classify and iterate
            showSection('voting');
            if (statusMessage) {
                statusMessage.innerHTML = '';
            }
            clearStatusMessage();

            const container = document.createElement('div');
            container.style.cssText = 'padding:10px; background:var(--vscode-inputValidation-errorBackground); color:var(--vscode-errorForeground); border-radius:4px; margin-bottom:10px; max-width:100%; box-sizing:border-box;';

            const p = document.createElement('p');
            p.style.cssText = 'margin:8px 0 0 0; font-size:0.9em; white-space:normal; word-break:break-word; overflow-wrap:anywhere; hyphens:auto;';
            p.textContent = message; // use textContent to avoid injecting HTML

            const guidance = document.createElement('p');
            guidance.style.cssText = 'margin:8px 0 0 0; font-size:0.9em; color: var(--vscode-descriptionForeground);';
            guidance.textContent = 'Revise your description to generate new candidates. Revising keeps all of your current classifications and examples.';

            const actionRow = document.createElement('div');
            actionRow.style.cssText = 'margin-top:10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;';

            const reviseBtn = document.createElement('button');
            reviseBtn.className = 'icon-btn subtle';
            reviseBtn.title = 'Revise your description (keeps classifications)';
            reviseBtn.type = 'button';
            reviseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 21v-3l12-12 3 3L6 21H3zM19.5 7.5l-3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                '<span class="btn-label">Revise description</span>';
            reviseBtn.addEventListener('click', editPrompt);

            actionRow.appendChild(reviseBtn);

            container.appendChild(p);
            container.appendChild(guidance);
            container.appendChild(actionRow);
            wordPair.innerHTML = '';
            wordPair.appendChild(container);

            // Refresh candidates and word history so users can keep iterating
            updateCandidates(candidateDetails || [], lastStatus ? lastStatus.threshold : undefined);

            // Use the provided wordHistory if available, otherwise fall back to constructing from inWords/outWords
            const history = (wordHistory && Array.isArray(wordHistory))
                ? wordHistory
                : (lastStatus && Array.isArray(lastStatus.wordHistory))
                ? lastStatus.wordHistory
                : [
                    ...(Array.isArray(inWords) ? inWords.map(word => ({
                        word,
                        classification: 'accept',
                        matchingRegexes: []
                    })) : []),
                    ...(Array.isArray(outWords) ? outWords.map(word => ({
                        word,
                        classification: 'reject',
                        matchingRegexes: []
                    })) : [])
                ];

            updateWordHistory(history);
            addHistoryNotice('No regex survived. Revise your description to generate new candidates — your existing classifications are preserved below.');

            if (wordHistory && typeof wordHistory.scrollIntoView === 'function') {
                wordHistory.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            showStatusWithoutCancel('All candidates were eliminated. Revise your description to generate new candidates (your classifications stay).');
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
            
            // Remove any candidates note elements from previous sessions
            const existingCandidatesNote = document.querySelector('.candidates-eliminated-note');
            if (existingCandidatesNote) {
                existingCandidatesNote.remove();
            }

            clearHistoryNotice();

            showSection('prompt');
            clearWarnings();
            clearStatusMessage();
        }

        function handleCancelled(message) {
            if (statusMessage) {
                statusMessage.innerHTML = '<span>' + (message || 'Operation cancelled') + '</span>';
            }
            statusActive = true;
            statusBar.classList.remove('hidden');
            inlineCancelBtn.classList.add('hidden');
            statusCancelBtn.classList.add('hidden');
            updateStatusBarVisibility();
            setTimeout(function() {
                resetUI(true);
            }, 2000);
        }

        function handleSessionLoaded(message) {
            clearStatusMessage();
            
            // Update UI with loaded session data
            if (message.status) {
                latestCandidates = Array.isArray(message.status.candidateDetails) 
                    ? message.status.candidateDetails.slice() 
                    : [];
                updateStatus(message.status);
            }
            
            // Populate the prompt if one was loaded, or clear it for legacy sessions
            if (message.prompt) {
                if (promptInput) {
                    promptInput.value = message.prompt;
                }
                latestActivePrompt = message.prompt;
                addPromptToHistory(message.prompt);
                updatePromptDisplay(message.prompt);
            } else {
                // Clear prompt state for legacy sessions without a prompt
                // to avoid cross-session contamination
                latestActivePrompt = '';
                if (promptInput) {
                    promptInput.value = '';
                }
            }
            
            // Set the model if one was loaded and is available, or clear it for legacy sessions
            if (message.modelId) {
                latestActiveModelId = message.modelId;
                // Check if the model is available and update selection
                const modelAvailable = availableModels.some(function(m) { return m.id === message.modelId; });
                if (modelAvailable && modelSelect) {
                    modelSelect.value = message.modelId;
                    updateSelectedModel(message.modelId);
                }
            } else {
                // Clear model state for legacy sessions without a modelId
                latestActiveModelId = '';
                // Reset model select to the first available model (or leave unchanged if none)
                if (modelSelect && availableModels.length > 0) {
                    modelSelect.value = availableModels[0].id;
                    updateSelectedModel(availableModels[0].id);
                }
            }
            
            // Show success message
            const candidateText = message.candidateCount === 1 ? 'candidate' : 'candidates';
            const classificationText = message.classificationCount === 1 ? 'classification' : 'classifications';
            const successMsg = 'Loaded ' + message.candidateCount + ' ' + candidateText + 
                              ' and ' + message.classificationCount + ' ' + classificationText + '.';
            setHistoryCopyStatus(successMsg);
            
            log('info', 'Session loaded: ' + message.candidateCount + ' candidates, ' + 
                message.classificationCount + ' classifications' + 
                (message.prompt ? ', prompt: "' + message.prompt.substring(0, 50) + '"' : ''));
        }

        // Functions no longer need to be global since we use addEventListener instead of inline handlers
        // Keeping for backwards compatibility or debugging if needed
        window.copyRegex = copyRegex;
        window.toLiteralString = toLiteralString;
        window.highlightRegex = highlightRegex;
        
        // Notify the extension that the webview is ready
        vscode.postMessage({ type: 'webviewReady' });
    };
})();
