// Local LLM Coding Assistant Frontend
let selectedFiles = [];
let currentModel = '';
let projectRoot = '';
let allProjectFiles = [];
let recommendedModels = [];
let downloadedModels = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadRecommendedModels();
    await loadModels();
    setupEventListeners();
    updateDebugPanel();
    
    // Setup refresh models button (delegated event listener)
    document.addEventListener('click', async (e) => {
        if (e.target && e.target.id === 'refresh-models') {
            e.preventDefault();
            await loadModels();
        }
    });
});

// Load recommended coding models
async function loadRecommendedModels() {
    try {
        const response = await fetch('/api/models/recommended');
        const data = await response.json();
        recommendedModels = data.models || [];
    } catch (error) {
        console.error('Failed to load recommended models:', error);
    }
}

// Load available models from Ollama
async function loadModels() {
    try {
        const response = await fetch('/v1/models');
        const data = await response.json();
        const modelSelect = document.getElementById('model-select');
        const noModelsMsg = document.getElementById('no-models-message');
        const modelHint = document.getElementById('model-hint');
        
        downloadedModels = (data.data || []).map(m => m.id);
        
        // Clear and rebuild dropdown
        modelSelect.innerHTML = '<option value="">Select a model...</option>';
        
        // Add recommended models (always show these)
        recommendedModels.forEach(recModel => {
            const option = document.createElement('option');
            option.value = recModel.id;
            const isDownloaded = downloadedModels.includes(recModel.id);
            const status = isDownloaded ? ' ✓' : ' (not downloaded)';
            option.textContent = `${recModel.name}${status}`;
            option.dataset.recommended = 'true';
            option.dataset.downloaded = isDownloaded;
            if (!isDownloaded) {
                option.style.color = '#888';
            }
            modelSelect.appendChild(option);
        });
        
        // Add separator if we have both recommended and other models
        if (recommendedModels.length > 0 && data.data && data.data.length > 0) {
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '────────── Other Models ──────────';
            modelSelect.appendChild(separator);
        }
        
        // Add other downloaded models (not in recommended list)
        if (data.data && data.data.length > 0) {
            const otherModels = data.data.filter(m => 
                !recommendedModels.some(rm => rm.id === m.id)
            );
            otherModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.id + ' ✓';
                modelSelect.appendChild(option);
            });
        }
        
        // Hide/show messages
        if (downloadedModels.length > 0) {
            noModelsMsg.style.display = 'none';
            modelHint.style.display = 'block';
            // Auto-select first downloaded recommended model
            const firstDownloaded = recommendedModels.find(m => downloadedModels.includes(m.id));
            if (firstDownloaded) {
                currentModel = firstDownloaded.id;
                modelSelect.value = currentModel;
            } else if (downloadedModels.length > 0) {
                currentModel = downloadedModels[0];
                modelSelect.value = currentModel;
            }
        } else {
            noModelsMsg.style.display = 'block';
            modelHint.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load models:', error);
        const modelSelect = document.getElementById('model-select');
        const noModelsMsg = document.getElementById('no-models-message');
        modelSelect.innerHTML = '<option value="">Error loading models</option>';
        noModelsMsg.style.display = 'block';
        noModelsMsg.innerHTML = '<strong>Error loading models.</strong> Make sure Ollama is running at http://localhost:11434';
    }
}


// Setup event listeners
function setupEventListeners() {
    document.getElementById('model-select').addEventListener('change', async (e) => {
        const selectedValue = e.target.value;
        const selectedOption = e.target.options[e.target.selectedIndex];
        const isDownloaded = selectedOption.dataset.downloaded === 'true';
        
        if (!selectedValue) return;
        
        // If model is not downloaded, trigger download
        if (!isDownloaded && selectedOption.dataset.recommended === 'true') {
            const confirmed = confirm(
                `Model "${selectedOption.textContent.replace(' (not downloaded)', '')}" is not downloaded.\n\n` +
                `Would you like to download it now? This may take several minutes.`
            );
            
            if (confirmed) {
                await downloadModel(selectedValue);
            } else {
                // Reset to previous selection
                e.target.value = currentModel || '';
                return;
            }
        }
        
        currentModel = selectedValue;
        updateDebugPanel();
    });
    
    const folderInput = document.getElementById('project-folder');
    const browseBtn = document.getElementById('browse-folder-btn');
    const folderPicker = document.getElementById('folder-picker');
    
    // Handle manual folder path input
    folderInput.addEventListener('input', (e) => {
        const newPath = e.target.value.trim();
        if (newPath && newPath !== projectRoot) {
            projectRoot = newPath;
            scanProjectFolder();
            updateDebugPanel();
        }
    });
    
    folderInput.addEventListener('blur', (e) => {
        const newPath = e.target.value.trim();
        if (newPath && newPath !== projectRoot) {
            projectRoot = newPath;
            scanProjectFolder();
            updateDebugPanel();
        }
    });
    
    // Setup folder picker button
    browseBtn.addEventListener('click', () => {
        // Try to use the file input with directory attribute (works in Chrome/Edge)
        if (folderPicker) {
            folderPicker.click();
        } else {
            // Fallback: prompt for folder path
            const currentPath = folderInput.value || '';
            const fullPath = prompt('Enter the full path to your project folder:', currentPath);
            if (fullPath) {
                folderInput.value = fullPath;
                projectRoot = fullPath.trim();
                scanProjectFolder();
                updateDebugPanel();
            }
        }
    });
    
    // Handle folder picker selection
    if (folderPicker) {
        folderPicker.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                // webkitdirectory gives us relative paths, but we need the full path
                // Unfortunately, browsers don't expose the full folder path for security
                const firstFile = e.target.files[0];
                let fullPath = '';
                
                if (firstFile.webkitRelativePath) {
                    // Extract folder name from relative path
                    const parts = firstFile.webkitRelativePath.split('/');
                    const folderName = parts[0];
                    // Prompt user to confirm or enter the full path
                    fullPath = prompt(
                        `Selected folder: "${folderName}"\n\nPlease enter the FULL path to this folder\n(e.g., C:\\Users\\YourName\\Projects\\${folderName}):`,
                        folderInput.value || ''
                    );
                } else if (firstFile.path) {
                    // Firefox/Edge sometimes provide path property
                    fullPath = firstFile.path.substring(0, firstFile.path.lastIndexOf('\\'));
                }
                
                if (fullPath) {
                    folderInput.value = fullPath;
                    projectRoot = fullPath.trim();
                    scanProjectFolder();
                    updateDebugPanel();
                }
                
                // Reset the file input so it can be used again
                e.target.value = '';
            }
        });
    }
    
    // Allow Enter key to submit folder path
    folderInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            projectRoot = folderInput.value.trim();
            scanProjectFolder();
            updateDebugPanel();
        }
    });
    
    document.getElementById('include-all-files').addEventListener('change', (e) => {
        const fileInput = document.getElementById('file-input');
        const addFileBtn = document.getElementById('add-file-btn');
        
        if (e.target.checked) {
            // Disable manual file selection when "include all" is checked
            fileInput.disabled = true;
            addFileBtn.disabled = true;
            selectedFiles = []; // Clear manually selected files
            updateSelectedFilesList();
        } else {
            // Re-enable manual file selection
            fileInput.disabled = false;
            addFileBtn.disabled = false;
        }
        updateDebugPanel();
    });
    
    document.getElementById('include-readme').addEventListener('change', updateDebugPanel);
    document.getElementById('include-tree').addEventListener('change', updateDebugPanel);
    document.getElementById('system-prompt').addEventListener('input', updateDebugPanel);
    
    document.getElementById('add-file-btn').addEventListener('click', addFile);
    
    document.getElementById('file-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addFile();
        }
    });
    
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        // Enter to send, Shift+Enter for new line
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    document.getElementById('toggle-debug').addEventListener('click', () => {
        const content = document.getElementById('debug-content');
        const btn = document.getElementById('toggle-debug');
        if (content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            btn.textContent = 'Hide';
        } else {
            content.classList.add('collapsed');
            btn.textContent = 'Show';
        }
    });
}

// Scan project folder to get all files
async function scanProjectFolder() {
    if (!projectRoot) {
        allProjectFiles = [];
        updateDebugPanel();
        return;
    }
    
    try {
        // Show loading indicator
        const folderInput = document.getElementById('project-folder');
        const originalPlaceholder = folderInput.placeholder;
        folderInput.placeholder = 'Scanning folder...';
        folderInput.style.borderColor = '#007acc';
        
        // Verify the folder exists by trying to get the tree
        const treeResponse = await fetch(`/api/context/tree?project_root=${encodeURIComponent(projectRoot)}`);
        
        if (!treeResponse.ok) {
            throw new Error(`Failed to access folder: ${treeResponse.status}`);
        }
        
        const treeData = await treeResponse.json();
        
        // The backend will handle file scanning when "include all files" is checked
        // For now, we just verify the folder is accessible
        folderInput.placeholder = originalPlaceholder;
        folderInput.style.borderColor = '#555';
        
        // Show success feedback - find hint in parent control-group
        const controlGroup = folderInput.closest('.control-group');
        const hint = controlGroup ? controlGroup.querySelector('.hint') : null;
        if (hint) {
            hint.textContent = `✓ Folder selected: ${projectRoot.split('\\').pop() || projectRoot.split('/').pop()}`;
            hint.style.color = '#4ec9b0';
        }
        
        updateDebugPanel();
    } catch (error) {
        console.error('Error scanning project folder:', error);
        const folderInput = document.getElementById('project-folder');
        folderInput.style.borderColor = '#f48771';
        folderInput.placeholder = 'Error: Folder not accessible';
        
        const controlGroup = folderInput.closest('.control-group');
        const hint = controlGroup ? controlGroup.querySelector('.hint') : null;
        if (hint) {
            hint.textContent = `✗ Error: ${error.message}`;
            hint.style.color = '#f48771';
        }
        
        // Reset after 3 seconds
        setTimeout(() => {
            folderInput.placeholder = 'Enter project folder path (e.g., C:\\Projects\\MyApp)';
            folderInput.style.borderColor = '#555';
            if (hint) {
                hint.textContent = 'Leave empty to use current directory. Click Browse to select a folder, or paste the path directly.';
                hint.style.color = '#888';
            }
        }, 3000);
    }
}

// Add file to selected files list
function addFile() {
    const fileInput = document.getElementById('file-input');
    const filePath = fileInput.value.trim();
    
    if (filePath && !selectedFiles.includes(filePath)) {
        selectedFiles.push(filePath);
        updateSelectedFilesList();
        fileInput.value = '';
        updateDebugPanel();
    }
}

// Remove file from selected files list
function removeFile(filePath) {
    selectedFiles = selectedFiles.filter(f => f !== filePath);
    updateSelectedFilesList();
    updateDebugPanel();
}

// Update the selected files display
function updateSelectedFilesList() {
    const list = document.getElementById('selected-files-list');
    list.innerHTML = '';
    
    selectedFiles.forEach(filePath => {
        const tag = document.createElement('div');
        tag.className = 'file-tag';
        tag.innerHTML = `
            <span>${filePath}</span>
            <span class="remove" onclick="removeFile('${filePath}')">×</span>
        `;
        list.appendChild(tag);
    });
}

// Send chat message with streaming
async function sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    
    if (!message) return;
    if (!currentModel) {
        alert('Please select a model first');
        return;
    }
    
    // Add user message to chat
    addMessageToChat('user', message);
    chatInput.value = '';
    
    // Disable send button
    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;
    
    // Get settings
    const systemPrompt = document.getElementById('system-prompt').value.trim();
    const includeReadme = document.getElementById('include-readme').checked;
    const includeTree = document.getElementById('include-tree').checked;
    const includeAllFiles = document.getElementById('include-all-files').checked;
    
    // Build messages array
    const messages = [
        { role: 'user', content: message }
    ];
    
    // Prepare request with streaming enabled
    const requestBody = {
        model: currentModel,
        messages: messages,
        stream: true,  // Enable streaming
        temperature: 0.7,
        project_root: projectRoot || null,
        selected_files: includeAllFiles ? null : (selectedFiles.length > 0 ? selectedFiles : null),
        include_readme: includeReadme,
        include_tree: includeTree,
        include_all_files: includeAllFiles,
        system_prompt: systemPrompt || null
    };
    
    // Update debug panel before sending
    updateDebugPanel(requestBody);
    
    // Create empty assistant message that we'll stream into
    const messageId = addMessageToChat('assistant', '', true);
    const messageDiv = document.getElementById(messageId);
    const contentDiv = messageDiv.querySelector('.content');
    let fullContent = '';
    
    try {
        const response = await fetch('/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            // Try to get error details from response
            let errorDetail = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.detail) {
                    errorDetail = errorData.detail;
                }
            } catch (e) {
                // Couldn't parse error response
            }
            throw new Error(errorDetail);
        }
        
        // Read the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (!line.trim() || !line.startsWith('data: ')) continue;
                
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                    // Stream complete
                    messageDiv.classList.remove('loading');
                    continue;
                }
                
                try {
                    const parsed = JSON.parse(data);
                    
                    if (parsed.error) {
                        throw new Error(parsed.error);
                    }
                    
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                        const chunk = parsed.choices[0].delta.content;
                        fullContent += chunk;
                        contentDiv.textContent = fullContent;
                        
                        // Auto-scroll to bottom
                        const chatMessages = document.getElementById('chat-messages');
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                } catch (e) {
                    // Skip invalid JSON
                    if (data !== '[DONE]') {
                        console.warn('Failed to parse stream data:', data);
                    }
                }
            }
        }
        
        // Final update - remove loading state
        messageDiv.classList.remove('loading');
        if (!fullContent) {
            contentDiv.textContent = 'Error: Received empty response from model';
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        messageDiv.classList.remove('loading');
        contentDiv.textContent = `Error: ${error.message}`;
    } finally {
        sendBtn.disabled = false;
    }
}

// Add message to chat display
function addMessageToChat(role, content, isLoading = false) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    const messageId = 'msg-' + Date.now() + '-' + Math.random();
    messageDiv.id = messageId;
    messageDiv.className = `message ${role} ${isLoading ? 'loading' : ''}`;
    
    messageDiv.innerHTML = `
        <div class="role">${role === 'user' ? 'You' : 'Assistant'}</div>
        <div class="content">${escapeHtml(content)}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageId;
}

// Remove message from chat
function removeMessage(messageId) {
    const message = document.getElementById(messageId);
    if (message) {
        message.remove();
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update debug panel
function updateDebugPanel(requestBody = null) {
    const systemPrompt = document.getElementById('system-prompt').value.trim();
    const includeReadme = document.getElementById('include-readme').checked;
    const includeTree = document.getElementById('include-tree').checked;
    const includeAllFiles = document.getElementById('include-all-files').checked;
    
    // Update project root with visual indicator
    const debugProjectRoot = document.getElementById('debug-project-root');
    if (projectRoot) {
        debugProjectRoot.textContent = projectRoot;
        debugProjectRoot.style.color = '#4ec9b0';
    } else {
        debugProjectRoot.textContent = '(current directory)';
        debugProjectRoot.style.color = '#888';
    }
    
    // Update included items
    const included = [];
    if (includeTree) included.push('Directory Tree');
    if (includeReadme) included.push('README.md');
    if (includeAllFiles && projectRoot) {
        included.push('All files in project folder');
    } else if (selectedFiles.length > 0) {
        included.push(`${selectedFiles.length} selected file(s): ${selectedFiles.slice(0, 3).join(', ')}${selectedFiles.length > 3 ? '...' : ''}`);
    }
    document.getElementById('debug-included').textContent = included.length > 0 ? included.join(', ') : 'None';
    
    // Update system prompt preview
    document.getElementById('debug-system-prompt').textContent = systemPrompt || '(none)';
    
    // Estimate context length (rough)
    let estimatedLength = systemPrompt.length;
    if (includeTree) estimatedLength += 1000; // rough estimate
    if (includeReadme) estimatedLength += 500; // rough estimate
    if (includeAllFiles && projectRoot) {
        estimatedLength += 50000; // rough estimate for all files
    } else {
        estimatedLength += selectedFiles.length * 2000; // rough estimate per file
    }
    document.getElementById('debug-context-length').textContent = estimatedLength.toLocaleString() + ' chars (estimated)';
    
    // Update context preview (simplified)
    let preview = '';
    if (includeTree) preview += '[Directory Tree]\n';
    if (includeReadme) preview += '[README.md]\n';
    if (includeAllFiles && projectRoot) {
        preview += '[All project files will be included]\n';
    } else if (selectedFiles.length > 0) {
        preview += 'Selected files:\n' + selectedFiles.map(f => `  - ${f}`).join('\n') + '\n';
    }
    if (systemPrompt) {
        preview += '\nSystem Prompt:\n' + systemPrompt.substring(0, 200) + (systemPrompt.length > 200 ? '...' : '');
    }
    document.getElementById('debug-context-preview').textContent = preview || '(no context)';
}

// Update debug panel from API response
function updateDebugPanelFromResponse(contextInfo) {
    if (contextInfo.project_root) {
        document.getElementById('debug-project-root').textContent = contextInfo.project_root;
    }
    if (contextInfo.included_items) {
        document.getElementById('debug-included').textContent = contextInfo.included_items.join(', ');
    }
    if (contextInfo.context_length) {
        document.getElementById('debug-context-length').textContent = contextInfo.context_length.toLocaleString() + ' chars';
    }
}

// Download a model with progress tracking
async function downloadModel(modelName) {
    const modelSelect = document.getElementById('model-select');
    const debugContent = document.getElementById('debug-content');
    
    // Disable model select during download
    modelSelect.disabled = true;
    
    // Create progress display in debug panel
    const progressDiv = document.createElement('div');
    progressDiv.id = 'download-progress';
    progressDiv.className = 'download-progress';
    progressDiv.innerHTML = `
        <div class="download-header">
            <strong>Downloading: ${modelName}</strong>
            <button id="cancel-download" style="padding: 2px 8px; font-size: 11px; margin-left: 10px;">Cancel</button>
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar" id="progress-bar"></div>
        </div>
        <div class="progress-text" id="progress-text">Initializing...</div>
        <div class="progress-details" id="progress-details"></div>
    `;
    
    // Insert at the top of debug content
    debugContent.insertBefore(progressDiv, debugContent.firstChild);
    
    // Show debug panel if collapsed
    if (debugContent.classList.contains('collapsed')) {
        debugContent.classList.remove('collapsed');
        document.getElementById('toggle-debug').textContent = 'Hide';
    }
    
    let cancelled = false;
    document.getElementById('cancel-download').addEventListener('click', () => {
        cancelled = true;
    });
    
    try {
        progressDiv.querySelector('#progress-text').textContent = 'Connecting to server...';
        
        const response = await fetch('/api/models/pull', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model: modelName })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Pull request failed:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText || 'Unknown error'}`);
        }
        
        if (!response.body) {
            throw new Error('No response body received from server');
        }
        
        progressDiv.querySelector('#progress-text').textContent = 'Starting download...';
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let buffer = '';
        
        while (true) {
            if (cancelled) {
                progressDiv.querySelector('#progress-text').textContent = 'Download cancelled';
                progressDiv.querySelector('#progress-text').style.color = '#f48771';
                break;
            }
            
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                // Handle Server-Sent Events format (data: {...}) or direct JSON
                let jsonStr = line.trim();
                if (jsonStr.startsWith('data: ')) {
                    jsonStr = jsonStr.slice(6).trim();
                    if (jsonStr === '[DONE]') {
                        progressDiv.querySelector('#progress-text').textContent = 'Download complete!';
                        progressDiv.querySelector('#progress-bar').style.width = '100%';
                        setTimeout(() => {
                            progressDiv.remove();
                            modelSelect.disabled = false;
                            loadModels(); // Refresh model list
                        }, 2000);
                        return;
                    }
                }
                
                try {
                    const progress = JSON.parse(jsonStr);
                    
                    if (progress.error) {
                        throw new Error(progress.error);
                    }
                    
                    // Handle different status types from Ollama
                    if (progress.status === 'pulling manifest') {
                        progressDiv.querySelector('#progress-text').textContent = 'Downloading manifest...';
                        progressDiv.querySelector('#progress-bar').style.width = '5%';
                    } else if (progress.status === 'pulling') {
                        // Ollama uses "pulling" status with digest, total, and completed
                        const digest = progress.digest || '';
                        const completed = progress.completed || 0;
                        const total = progress.total || 0;
                        
                        if (total > 0 && completed > 0) {
                            const percent = Math.min(Math.round((completed / total) * 100), 99);
                            progressDiv.querySelector('#progress-bar').style.width = percent + '%';
                            progressDiv.querySelector('#progress-text').textContent = 
                                `Downloading: ${percent}% (${formatBytes(completed)} / ${formatBytes(total)})`;
                            
                            if (digest) {
                                progressDiv.querySelector('#progress-details').textContent = 
                                    `Layer: ${digest.substring(0, 12)}...`;
                            }
                        } else if (total > 0) {
                            progressDiv.querySelector('#progress-text').textContent = 
                                `Preparing download... (${formatBytes(total)} total)`;
                            progressDiv.querySelector('#progress-bar').style.width = '10%';
                        }
                    } else if (progress.status === 'success' || progress.status === 'complete') {
                        progressDiv.querySelector('#progress-text').textContent = 'Download complete!';
                        progressDiv.querySelector('#progress-bar').style.width = '100%';
                        setTimeout(() => {
                            progressDiv.remove();
                            modelSelect.disabled = false;
                            loadModels(); // Refresh model list
                        }, 2000);
                        return;
                    }
                } catch (e) {
                    // Skip invalid JSON lines, but log for debugging
                    if (jsonStr && !jsonStr.includes('[DONE]')) {
                        console.warn('Failed to parse progress line:', jsonStr, e);
                    }
                }
            }
        }
        
        // If we exit the loop without success, check if download completed
        const progressBar = progressDiv.querySelector('#progress-bar');
        if (progressBar.style.width === '100%' || progressBar.style.width === '') {
            // Download might have completed, refresh models
            setTimeout(() => {
                progressDiv.remove();
                modelSelect.disabled = false;
                loadModels();
            }, 1000);
        }
    } catch (error) {
        console.error('Download error:', error);
        progressDiv.querySelector('#progress-text').textContent = `Error: ${error.message}`;
        progressDiv.querySelector('#progress-text').style.color = '#f48771';
        progressDiv.querySelector('#progress-details').textContent = 'Check console for details';
        modelSelect.disabled = false;
    }
}

// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}


