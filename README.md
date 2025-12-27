# Local LLM Coding Assistant

A local coding assistant backend + UI that connects to Ollama and provides OpenAI-compatible endpoints for use with Cursor or other tools.

## Features

- **100% Local**: Runs entirely on your machine, no cloud services
- **Ollama Integration**: Uses Ollama as the model runtime
- **OpenAI-Compatible API**: Exposes `/v1/chat/completions` and `/v1/models` endpoints
- **Project-Aware Context**: Automatically injects README.md, directory tree, and selected source files
- **Minimal Web UI**: Simple interface for model selection, system prompt editing, file selection, and chat

## Requirements

- Python 3.8+
- [Ollama](https://ollama.ai/) installed and running locally
- At least one model pulled in Ollama (e.g., `qwen2.5-coder:7b`)

## Setup

1. **Install Ollama** (if not already installed):
   - Visit https://ollama.ai/ and follow installation instructions
   - Start Ollama service (usually runs automatically)

2. **Pull a coding model** (if not already done):
   
   **Recommended coding models** (best to good):
   ```bash
   # Top tier - best for coding tasks
   ollama pull qwen2.5-coder:7b          # Excellent code generation, fast
   ollama pull qwen2.5-coder:32b         # Larger, more capable version
   ollama pull deepseek-coder:6.7b       # Strong code understanding and generation
   ollama pull deepseek-coder:33b        # Most capable coding model
   
   # Good alternatives
   ollama pull codellama:7b              # Meta's coding model, well-tested
   ollama pull codellama:13b             # Larger version
   ollama pull codellama:34b             # Largest version
   ollama pull starcoder2:15b            # BigCode's model, good for code completion
   ollama pull wizardcoder:7b            # Fine-tuned for coding tasks
   
   # General models that are also good at coding
   ollama pull mistral:7b                # Fast, general-purpose, good at code
   ollama pull llama3.1:8b               # Meta's general model, decent coding
   ollama pull llama3.1:70b              # Larger, more capable
   ```
   
   **Quick start** (recommended for most users):
   ```bash
   ollama pull qwen2.5-coder:7b
   ```
   
   Note: Larger models (32b, 33b, 34b, 70b) require more RAM but provide better code quality. Start with 7b models if you have limited resources.

3. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Running

1. **Start the FastAPI server**:
   ```bash
   python main.py
   ```
   
   Or using uvicorn directly:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

2. **Open the web UI**:
   - Navigate to http://127.0.0.1:8000 or http://localhost:8000 in your browser

3. **Use with Cursor** (optional):
   - Configure Cursor to use `http://localhost:8000/v1` as the OpenAI API endpoint
   - The assistant will automatically inject project context when available

## Usage

### Web UI

1. **Select a model** from the dropdown (models are loaded from Ollama)
2. **Configure context**:
   - Toggle "Include README.md" and "Include directory tree" checkboxes
   - Add files to the context by entering file paths and clicking "Add File"
3. **Set system prompt** (optional): Enter a custom system prompt in the textarea
4. **Chat**: Type your message and click "Send" or press Ctrl+Enter

### API Endpoints

#### `GET /v1/models`
List available models from Ollama.

#### `POST /v1/chat/completions`
Create a chat completion. Request body:
```json
{
  "model": "qwen2.5-coder:7b",
  "messages": [
    {"role": "user", "content": "What does this code do?"}
  ],
  "selected_files": ["src/main.py"],
  "include_readme": true,
  "include_tree": true,
  "system_prompt": "You are a helpful coding assistant."
}
```

#### `POST /api/context/files`
Get contents of multiple files. Request body:
```json
{
  "files": ["src/main.py", "README.md"]
}
```

#### `GET /api/context/tree`
Get directory tree representation.

#### `GET /api/context/readme`
Get README.md contents.

## Project Structure

```
.
├── main.py              # FastAPI server with OpenAI-compatible endpoints
├── ollama_client.py     # Ollama API client wrapper
├── context_builder.py   # Project context injection logic
├── requirements.txt     # Python dependencies
├── README.md           # This file
└── static/             # Frontend files
    ├── index.html      # Main UI
    ├── app.js          # Frontend JavaScript
    └── styles.css      # Styles
```

## Configuration

- **Ollama URL**: Defaults to `http://localhost:11434`. Can be changed in `ollama_client.py`
- **Project Root**: Defaults to current working directory. Can be changed in `main.py` when initializing `ContextBuilder`
- **Server Port**: Defaults to 8000. Change in `main.py` or via uvicorn command

## Notes

- The context builder automatically ignores common directories like `.git`, `__pycache__`, `node_modules`, etc.
- Large files (>100KB) are skipped to prevent context overflow
- Directory tree depth is limited to 3 levels by default
- No authentication is implemented - this is intended for local use only

## Troubleshooting

- **No models available**: Make sure Ollama is running (`ollama list` should show models)
- **Connection errors**: Verify Ollama is accessible at `http://localhost:11434`
- **File not found**: Ensure file paths are relative to the project root directory
- **Port already in use**: Change the port in `main.py` or use `--port` with uvicorn

