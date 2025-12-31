// OllamaChat Frontend
let currentModel = '';
let uploadedFiles = [];
let downloadedModels = [];
let searchTimeout = null;

const promptPresets = {
    general: `You are a helpful, friendly assistant. Be direct and practical. 
Provide clear explanations and examples when useful.`,
    coding: `You are a helpful coding assistant. 

When answering questions:
- Provide clear, working code examples
- Explain your reasoning
- Reference any uploaded files when relevant

If files are provided, you can analyze and reference them.`,
    creative: `You are a creative writing assistant. Help with brainstorming, storytelling, 
and crafting engaging content. Be imaginative and suggest alternatives.`
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Page loaded, initializing...');
    try {
        await loadModels();
        setupEventListeners();
        updateDebugPanel();
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

// Load available models from Ollama
async function loadModels() {
    const modelSelect = document.getElementById('model-select');
    const noModelsMsg = document.getElementById('no-models-message');
    
    try {
        modelSelect.innerHTML = '<option value="">Loading models...</option>';
        modelSelect.disabled = true;
        
        const response = await fetch('/v1/models');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        downloadedModels = (data.data || []).map(m => m.id);
        
        modelSelect.disabled = false;
        modelSelect.innerHTML = '<option value="">Select a model...</option>';
        
        downloadedModels.forEach(modelId => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = `${modelId} ✓`;
            modelSelect.appendChild(option);
        });
        
        if (downloadedModels.length > 0) {
            noModelsMsg.style.display = 'none';
            // Auto-select first model
            currentModel = downloadedModels[0];
            modelSelect.value = currentModel;
        } else {
            noModelsMsg.style.display = 'block';
        }
        
        updateDebugPanel();
    } catch (error) {
        console.error('Failed to load models:', error);
        modelSelect.innerHTML = '<option value="">Error loading models</option>';
        modelSelect.disabled = false;
        noModelsMsg.style.display = 'block';
        noModelsMsg.innerHTML = '<strong>Error loading models.</strong> Make sure Ollama is running at http://localhost:11434';
    }
}

// Search models from Ollama library
async function searchModels(query) {
    const resultsDiv = document.getElementById('model-search-results');
    
    if (!query.trim()) {
        resultsDiv.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`/api/models/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const results = data.results || [];
        
        if (results.length === 0) {
            resultsDiv.innerHTML = `<div class="search-result-item no-results">No models found. Try "<strong>${query}</strong>" with Pull button.</div>`;
            resultsDiv.style.display = 'block';
            return;
        }
        
        resultsDiv.innerHTML = results.map(model => {
            const downloadedBadge = model.downloaded ? '<span class="badge downloaded">✓ Downloaded</span>' : '<span class="badge">Pull to download</span>';
            const categoryBadge = model.category ? `<span class="badge category">${model.category}</span>` : '';
            return `
                <div class="search-result-item ${model.downloaded ? 'downloaded' : ''}" data-model-id="${model.id}">
                    <div class="model-info">
                        <strong>${model.name || model.id}</strong>
                        <span class="model-size">${model.size || ''}</span>
                    </div>
                    <div class="model-badges">
                        ${categoryBadge}
                        ${downloadedBadge}
                    </div>
                </div>
            `;
        }).join('');
        
        resultsDiv.style.display = 'block';
        
        // Add click handlers
        resultsDiv.querySelectorAll('.search-result-item[data-model-id]').forEach(item => {
            item.addEventListener('click', () => selectSearchResult(item.dataset.modelId));
        });
    } catch (error) {
        console.error('Search failed:', error);
        resultsDiv.innerHTML = '<div class="search-result-item no-results">Search failed. Check console for details.</div>';
        resultsDiv.style.display = 'block';
    }
}

// Select a model from search results
async function selectSearchResult(modelId) {
    const resultsDiv = document.getElementById('model-search-results');
    const searchInput = document.getElementById('model-search');
    
    // Check if model is downloaded
    if (downloadedModels.includes(modelId)) {
        // Select it
        currentModel = modelId;
        document.getElementById('model-select').value = modelId;
        resultsDiv.style.display = 'none';
        searchInput.value = '';
        updateDebugPanel();
    } else {
        // Offer to download
        const confirmed = confirm(`Model "${modelId}" is not downloaded.\n\nWould you like to download it now? This may take several minutes.`);
        if (confirmed) {
            resultsDiv.style.display = 'none';
            searchInput.value = '';
            await downloadModel(modelId);
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    // Model select
    document.getElementById('model-select').addEventListener('change', (e) => {
        currentModel = e.target.value;
        updateDebugPanel();
    });
    
    // Model search with debounce
    const searchInput = document.getElementById('model-search');
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => searchModels(e.target.value), 300);
    });
    
    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        const resultsDiv = document.getElementById('model-search-results');
        if (!e.target.closest('#model-search') && !e.target.closest('#model-search-results')) {
            resultsDiv.style.display = 'none';
        }
    });
    
    // Refresh models
    document.addEventListener('click', async (e) => {
        if (e.target && e.target.id === 'refresh-models') {
            e.preventDefault();
            await loadModels();
        }
    });
    
    // Model pull
    const pullBtn = document.getElementById('model-pull-btn');
    const pullInput = document.getElementById('model-pull-input');
    pullBtn.addEventListener('click', async () => {
        const modelName = pullInput.value.trim();
        if (modelName) await downloadModel(modelName);
    });
    pullInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const modelName = pullInput.value.trim();
            if (modelName) await downloadModel(modelName);
        }
    });
    
    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => applyPromptPreset(btn.dataset.preset));
    });
    
    // System prompt
    document.getElementById('system-prompt').addEventListener('input', () => {
        updatePresetButtons(null);
        updateDebugPanel();
    });
    
    // File upload
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);
    
    // Send button
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    
    // Chat input - Enter to send
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Debug toggle
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

// Handle file upload
async function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    const maxSize = 100 * 1024; // 100KB
    
    for (const file of files) {
        if (file.size > maxSize) {
            alert(`File "${file.name}" is too large (max 100KB). Skipping.`);
            continue;
        }
        
        try {
            const content = await readFileContent(file);
            uploadedFiles.push({
                filename: file.name,
                content: content,
                size: file.size
            });
        } catch (error) {
            console.error(`Failed to read ${file.name}:`, error);
            alert(`Failed to read "${file.name}". Make sure it's a text file.`);
        }
    }
    
    updateUploadedFilesList();
    updateDebugPanel();
    e.target.value = ''; // Reset file input
}

// Read file content as text
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Update uploaded files list
function updateUploadedFilesList() {
    const list = document.getElementById('uploaded-files-list');
    
    if (uploadedFiles.length === 0) {
        list.innerHTML = '';
        return;
    }
    
    list.innerHTML = uploadedFiles.map((file, index) => `
        <div class="file-tag">
            <span>${file.filename} (${formatBytes(file.size)})</span>
            <span class="remove" onclick="removeUploadedFile(${index})">×</span>
        </div>
    `).join('');
}

// Remove uploaded file
function removeUploadedFile(index) {
    uploadedFiles.splice(index, 1);
    updateUploadedFilesList();
    updateDebugPanel();
}

// Apply prompt preset
function applyPromptPreset(key) {
    const systemPrompt = document.getElementById('system-prompt');
    if (key === 'clear') {
        systemPrompt.value = '';
    } else if (promptPresets[key]) {
        systemPrompt.value = promptPresets[key];
    }
    updatePresetButtons(key);
    updateDebugPanel();
}

function updatePresetButtons(activeKey) {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        if (btn.dataset.preset === activeKey && activeKey !== 'clear') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Send chat message
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
    
    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;
    
    const systemPrompt = document.getElementById('system-prompt').value.trim();
    
    // Prepare request
    const requestBody = {
        model: currentModel,
        messages: [{ role: 'user', content: message }],
        stream: true,
        temperature: 0.7,
        system_prompt: systemPrompt || null,
        uploaded_files: uploadedFiles.length > 0 ? uploadedFiles.map(f => ({
            filename: f.filename,
            content: f.content
        })) : null
    };
    
    // Create empty assistant message for streaming
    const messageId = addMessageToChat('assistant', '', true);
    const messageDiv = document.getElementById(messageId);
    const contentDiv = messageDiv.querySelector('.content');
    let fullContent = '';
    
    try {
        const response = await fetch('/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            let errorDetail = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.detail) errorDetail = errorData.detail;
            } catch (e) {}
            throw new Error(errorDetail);
        }
        
        // Stream the response
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
                    messageDiv.classList.remove('loading');
                    continue;
                }
                
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) throw new Error(parsed.error);
                    
                    if (parsed.choices?.[0]?.delta?.content) {
                        fullContent += parsed.choices[0].delta.content;
                        contentDiv.textContent = fullContent;
                        
                        // Auto-scroll
                        const chatMessages = document.getElementById('chat-messages');
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                } catch (e) {
                    if (data !== '[DONE]') console.warn('Parse error:', data);
                }
            }
        }
        
        messageDiv.classList.remove('loading');
        if (!fullContent) contentDiv.textContent = 'Error: Empty response from model';
        
    } catch (error) {
        console.error('Error sending message:', error);
        messageDiv.classList.remove('loading');
        contentDiv.textContent = `Error: ${error.message}`;
    } finally {
        sendBtn.disabled = false;
    }
}

// Add message to chat
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

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update debug panel
function updateDebugPanel() {
    const systemPrompt = document.getElementById('system-prompt').value.trim();
    
    document.getElementById('debug-model').textContent = currentModel || '(none)';
    document.getElementById('debug-files').textContent = uploadedFiles.length > 0 
        ? uploadedFiles.map(f => f.filename).join(', ')
        : '(none)';
    
    const contextLength = uploadedFiles.reduce((sum, f) => sum + f.content.length, 0);
    document.getElementById('debug-context-length').textContent = contextLength.toLocaleString() + ' chars';
    document.getElementById('debug-system-prompt').textContent = systemPrompt || '(default)';
}

// Download model
async function downloadModel(modelName) {
    const modelSelect = document.getElementById('model-select');
    const debugContent = document.getElementById('debug-content');
    
    modelSelect.disabled = true;
    
    // Create progress UI
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
    `;
    
    debugContent.insertBefore(progressDiv, debugContent.firstChild);
    
    if (debugContent.classList.contains('collapsed')) {
        debugContent.classList.remove('collapsed');
        document.getElementById('toggle-debug').textContent = 'Hide';
    }
    
    let cancelled = false;
    document.getElementById('cancel-download').addEventListener('click', () => { cancelled = true; });
    
    try {
        const response = await fetch('/api/models/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelName })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        progressDiv.querySelector('#progress-text').textContent = 'Starting download...';
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            if (cancelled) {
                progressDiv.querySelector('#progress-text').textContent = 'Cancelled';
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
                
                let jsonStr = line.startsWith('data: ') ? line.slice(6).trim() : line.trim();
                if (jsonStr === '[DONE]') {
                    progressDiv.querySelector('#progress-text').textContent = 'Download complete!';
                    progressDiv.querySelector('#progress-bar').style.width = '100%';
                    setTimeout(() => {
                        progressDiv.remove();
                        modelSelect.disabled = false;
                        loadModels();
                    }, 1500);
                    return;
                }
                
                try {
                    const progress = JSON.parse(jsonStr);
                    if (progress.error) throw new Error(progress.error);
                    
                    if (progress.status === 'pulling manifest') {
                        progressDiv.querySelector('#progress-text').textContent = 'Downloading manifest...';
                        progressDiv.querySelector('#progress-bar').style.width = '5%';
                    } else if (progress.status === 'pulling') {
                        const completed = progress.completed || 0;
                        const total = progress.total || 0;
                        if (total > 0) {
                            const percent = Math.min(Math.round((completed / total) * 100), 99);
                            progressDiv.querySelector('#progress-bar').style.width = percent + '%';
                            progressDiv.querySelector('#progress-text').textContent = 
                                `Downloading: ${percent}% (${formatBytes(completed)} / ${formatBytes(total)})`;
                        }
                    } else if (progress.status === 'success') {
                        progressDiv.querySelector('#progress-text').textContent = 'Download complete!';
                        progressDiv.querySelector('#progress-bar').style.width = '100%';
                        setTimeout(() => {
                            progressDiv.remove();
                            modelSelect.disabled = false;
                            loadModels();
                        }, 1500);
                        return;
                    }
                } catch (e) {}
            }
        }
        
        setTimeout(() => {
            progressDiv.remove();
            modelSelect.disabled = false;
            loadModels();
        }, 1000);
        
    } catch (error) {
        console.error('Download error:', error);
        progressDiv.querySelector('#progress-text').textContent = `Error: ${error.message}`;
        progressDiv.querySelector('#progress-text').style.color = '#f48771';
        modelSelect.disabled = false;
    }
}

// Format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
