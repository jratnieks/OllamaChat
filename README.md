# OllamaChat

A simple, local LLM chat interface that connects to Ollama. Search and download models directly from the Ollama library, upload files for analysis, and chat with any model.

## Features

- **100% Local**: Runs entirely on your machine, no cloud services
- **Ollama Integration**: Uses Ollama as the model runtime
- **Model Search**: Search the Ollama library and download models directly from the UI
- **File Upload**: Upload text/code files for the LLM to analyze
- **OpenAI-Compatible API**: Exposes `/v1/chat/completions` and `/v1/models` endpoints
- **Clean Web UI**: Simple interface for chatting with local LLMs

## Requirements

- Python 3.8+
- [Ollama](https://ollama.ai/) installed and running locally

## Quick Start

1. **Install Ollama** (if not already installed):
   - Visit https://ollama.ai/ and follow installation instructions
   - Start Ollama (runs automatically after install)

2. **Clone and setup**:
   ```bash
   git clone https://github.com/jratnieks/OllamaChat.git
   cd OllamaChat
   python -m venv venv
   venv\Scripts\activate  # Windows
   # source venv/bin/activate  # macOS/Linux
   pip install -r requirements.txt
   ```

3. **Run the server**:
   ```bash
   python main.py
   ```
   
   The browser will open automatically to http://127.0.0.1:8000

4. **Download a model** (if you don't have any):
   - Use the search box to find models (e.g., "llama", "phi", "qwen")
   - Click on a model to download it
   - Or enter a model name in the "Pull Model" field

## Usage

### Web UI

1. **Search for models**: Type in the search box to find models from the Ollama library
2. **Select a model**: Choose from your downloaded models in the dropdown
3. **Upload files** (optional): Upload text/code files for the LLM to analyze
4. **Set system prompt** (optional): Customize the assistant's behavior with presets or custom text
5. **Chat**: Type your message and press Enter to send

### Recommended Models

| Model | Size | Best For |
|-------|------|----------|
| `llama3.2:3b` | ~2GB | Fast general chat |
| `llama3.1:8b` | ~4.7GB | General purpose |
| `qwen2.5-coder:7b` | ~4.4GB | Coding tasks |
| `phi3:mini` | ~2.2GB | Fast, lightweight |
| `mistral:7b` | ~4.1GB | General purpose |

Download any model via the UI or command line:
```bash
ollama pull llama3.2:3b
```

## API Endpoints

### `GET /v1/models`
List downloaded models (OpenAI-compatible).

### `POST /v1/chat/completions`
Create a chat completion (OpenAI-compatible). Request body:
```json
{
  "model": "llama3.2:3b",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "stream": true
}
```

### `GET /api/models/search?q=llama`
Search for models in the Ollama library.

### `POST /api/models/pull`
Download a model from Ollama. Request body:
```json
{
  "model": "llama3.2:3b"
}
```

## Project Structure

```
OllamaChat/
├── main.py              # FastAPI server
├── ollama_client.py     # Ollama API client
├── requirements.txt     # Python dependencies
├── README.md
└── static/
    ├── index.html       # Web UI
    ├── app.js           # Frontend JavaScript
    └── styles.css       # Styles
```

## Configuration

- **Ollama URL**: Defaults to `http://localhost:11434` (change in `ollama_client.py`)
- **Server Port**: Defaults to 8000 (change in `main.py` or set `PORT` env var)
- **Auto-open browser**: Set `AUTO_OPEN_BROWSER=0` to disable

## Troubleshooting

- **No models available**: Make sure Ollama is running (`ollama list`)
- **Connection errors**: Verify Ollama is at `http://localhost:11434`
- **Port in use**: Set a different port with `PORT=8001 python main.py`

## License

MIT
