"""
FastAPI server providing OpenAI-compatible endpoints for OllamaChat.
Connects to Ollama and supports project-aware context injection.
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
import json
import os
import threading
import time
import webbrowser

from ollama_client import OllamaClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup
    yield
    # Shutdown
    await ollama_client.close()


app = FastAPI(title="OllamaChat", lifespan=lifespan)

# CORS middleware to allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize clients
ollama_client = OllamaClient()

# Mount static files (frontend)
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


# Request/Response models (OpenAI-compatible)
class ChatMessage(BaseModel):
    role: str
    content: str


class UploadedFile(BaseModel):
    filename: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    stream: Optional[bool] = False
    temperature: Optional[float] = 0.7
    system_prompt: Optional[str] = None
    # Files uploaded by user (filename + content)
    uploaded_files: Optional[List[UploadedFile]] = None


@app.get("/favicon.ico")
async def favicon():
    """Handle favicon requests to avoid 404 errors."""
    from fastapi.responses import Response
    return Response(status_code=204)  # No Content


@app.get("/.well-known/appspecific/com.chrome.devtools.json")
async def chrome_devtools():
    """Handle Chrome DevTools requests to avoid 404 errors."""
    from fastapi.responses import Response
    return Response(status_code=204)  # No Content


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the frontend UI."""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>OllamaChat</h1><p>Frontend not found. Please check static/index.html</p>")


@app.get("/v1/models")
async def list_models():
    """
    List available models (OpenAI-compatible endpoint).
    """
    try:
        models = await ollama_client.list_models()
        return {
            "object": "list",
            "data": models
        }
    except Exception as e:
        print(f"Error listing models: {e}")
        # Return empty list instead of failing
        return {
            "object": "list",
            "data": []
        }


@app.get("/api/models/recommended")
async def get_recommended_models():
    """
    Get list of popular models from Ollama library.
    """
    return {
        "models": [
            # Chat / General
            {"id": "llama3.2:3b", "name": "Llama 3.2 3B", "size": "~2GB", "category": "chat"},
            {"id": "llama3.2:1b", "name": "Llama 3.2 1B", "size": "~1.3GB", "category": "chat"},
            {"id": "llama3.1:8b", "name": "Llama 3.1 8B", "size": "~4.7GB", "category": "chat"},
            {"id": "llama3.1:70b", "name": "Llama 3.1 70B", "size": "~40GB", "category": "chat"},
            {"id": "gemma2:9b", "name": "Gemma 2 9B", "size": "~5.4GB", "category": "chat"},
            {"id": "gemma2:27b", "name": "Gemma 2 27B", "size": "~16GB", "category": "chat"},
            {"id": "mistral:7b", "name": "Mistral 7B", "size": "~4.1GB", "category": "chat"},
            {"id": "mixtral:8x7b", "name": "Mixtral 8x7B", "size": "~26GB", "category": "chat"},
            {"id": "phi3:mini", "name": "Phi-3 Mini", "size": "~2.2GB", "category": "chat"},
            {"id": "phi3:medium", "name": "Phi-3 Medium", "size": "~7.9GB", "category": "chat"},
            {"id": "qwen2.5:7b", "name": "Qwen 2.5 7B", "size": "~4.4GB", "category": "chat"},
            {"id": "qwen2.5:14b", "name": "Qwen 2.5 14B", "size": "~8.9GB", "category": "chat"},
            {"id": "qwen2.5:32b", "name": "Qwen 2.5 32B", "size": "~19GB", "category": "chat"},
            # Coding
            {"id": "qwen2.5-coder:7b", "name": "Qwen 2.5 Coder 7B", "size": "~4.4GB", "category": "code"},
            {"id": "qwen2.5-coder:14b", "name": "Qwen 2.5 Coder 14B", "size": "~8.9GB", "category": "code"},
            {"id": "qwen2.5-coder:32b", "name": "Qwen 2.5 Coder 32B", "size": "~19GB", "category": "code"},
            {"id": "deepseek-coder-v2:16b", "name": "DeepSeek Coder V2 16B", "size": "~8.9GB", "category": "code"},
            {"id": "codellama:7b", "name": "CodeLlama 7B", "size": "~3.8GB", "category": "code"},
            {"id": "codellama:13b", "name": "CodeLlama 13B", "size": "~7.3GB", "category": "code"},
            {"id": "starcoder2:7b", "name": "StarCoder2 7B", "size": "~4GB", "category": "code"},
            # Vision
            {"id": "llava:7b", "name": "LLaVA 7B", "size": "~4.7GB", "category": "vision"},
            {"id": "llava:13b", "name": "LLaVA 13B", "size": "~8GB", "category": "vision"},
            {"id": "llava-llama3:8b", "name": "LLaVA Llama3 8B", "size": "~5GB", "category": "vision"},
            # Embedding
            {"id": "nomic-embed-text", "name": "Nomic Embed Text", "size": "~274MB", "category": "embedding"},
            {"id": "mxbai-embed-large", "name": "MXBai Embed Large", "size": "~670MB", "category": "embedding"},
        ]
    }


@app.get("/api/models/search")
async def search_models(q: str = ""):
    """
    Search through available models (local + library).
    """
    query = q.lower().strip()
    
    # Get local models
    local_models = await ollama_client.list_models()
    local_ids = {m["id"] for m in local_models}
    
    # Get recommended/library models
    recommended = (await get_recommended_models())["models"]
    
    results = []
    
    # Add matching local models first
    for model in local_models:
        if not query or query in model["id"].lower():
            results.append({
                "id": model["id"],
                "name": model["id"],
                "size": "",
                "category": "local",
                "downloaded": True
            })
    
    # Add matching library models (not already local)
    for model in recommended:
        if model["id"] not in local_ids:
            if not query or query in model["id"].lower() or query in model["name"].lower():
                results.append({
                    "id": model["id"],
                    "name": model["name"],
                    "size": model["size"],
                    "category": model["category"],
                    "downloaded": False
                })
    
    return {"results": results[:20], "query": q}


class PullModelRequest(BaseModel):
    model: str

@app.post("/api/models/pull")
async def pull_model(request: PullModelRequest):
    """
    Pull/download a model from Ollama.
    Returns streaming progress updates.
    """
    async def generate():
        try:
            async for progress in ollama_client.pull_model(request.model):
                # Yield progress as Server-Sent Events format
                yield f"data: {json.dumps(progress)}\n\n"
            # Send completion marker
            yield "data: [DONE]\n\n"
        except Exception as e:
            # Send error as JSON
            yield f"data: {json.dumps({'error': str(e), 'status': 'error'})}\n\n"
    
    return StreamingResponse(
        generate(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/api/models/check/{model:path}")
async def check_model(model: str):
    """
    Check if a model is downloaded.
    """
    exists = await ollama_client.check_model_exists(model)
    return {"exists": exists, "model": model}


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """
    Create a chat completion (OpenAI-compatible endpoint).
    Supports file uploads for context.
    """
    import traceback
    
    try:
        # Validate model is provided
        if not request.model or not request.model.strip():
            raise HTTPException(status_code=400, detail="Model is required")
        
        # Validate messages
        if not request.messages or len(request.messages) == 0:
            raise HTTPException(status_code=400, detail="At least one message is required")
        
        # Build file context from uploaded files
        context_parts = []
        context_info = {"included_files": []}
        
        if request.uploaded_files:
            file_context = "## Uploaded Files\n"
            for uploaded_file in request.uploaded_files:
                # Detect language from extension
                ext = uploaded_file.filename.split('.')[-1].lower() if '.' in uploaded_file.filename else ''
                lang_map = {
                    "py": "python", "js": "javascript", "ts": "typescript",
                    "html": "html", "css": "css", "json": "json", "md": "markdown",
                    "rs": "rust", "go": "go", "java": "java", "cpp": "cpp",
                    "c": "c", "sh": "bash", "yaml": "yaml", "yml": "yaml",
                    "xml": "xml", "sql": "sql", "txt": ""
                }
                lang = lang_map.get(ext, "")
                lang_prefix = lang + "\n" if lang else ""
                file_context += f"### {uploaded_file.filename}\n```{lang_prefix}{uploaded_file.content}\n```\n\n"
                context_info["included_files"].append(uploaded_file.filename)
            context_parts.append(file_context)
        
        # Prepare messages
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

        # Default system prompt
        default_system_prompt = """You are a helpful assistant. 

When answering questions:
- Be clear and concise
- Provide working code examples when relevant
- Explain your reasoning

If files are provided below, you can reference and analyze them."""

        # Build system prompt
        if request.system_prompt:
            system_content = request.system_prompt
        else:
            system_content = default_system_prompt

        if context_parts:
            system_content += "\n\n" + "\n".join(context_parts)

        messages.insert(0, {"role": "system", "content": system_content})

        # Store context info for debugging
        context_info["context_length"] = sum(len(part) for part in context_parts)
        context_info["message_count"] = len(messages)
        temperature = request.temperature if request.temperature is not None else 0.7

        # Handle streaming vs non-streaming
        if request.stream:
            stream_gen = await ollama_client.chat_completion(
                model=request.model,
                messages=messages,
                stream=True,
                temperature=temperature
            )
            
            async def generate():
                try:
                    async for line in stream_gen:
                        if line:
                            try:
                                data = json.loads(line)
                                # Transform Ollama streaming format to OpenAI format
                                if "message" in data:
                                    content = data["message"].get("content", "")
                                    if content:
                                        chunk = {
                                            "id": f"chatcmpl-{hash(str(messages))}",
                                            "object": "chat.completion.chunk",
                                            "created": data.get("created_at", 0),
                                            "model": request.model,
                                            "choices": [{
                                                "index": 0,
                                                "delta": {"content": content},
                                                "finish_reason": None
                                            }]
                                        }
                                        yield f"data: {json.dumps(chunk)}\n\n"

                                if data.get("done", False):
                                    # Send final chunk
                                    final_chunk = {
                                        "id": f"chatcmpl-{hash(str(messages))}",
                                        "object": "chat.completion.chunk",
                                        "created": data.get("created_at", 0),
                                        "model": request.model,
                                        "choices": [{
                                            "index": 0,
                                            "delta": {},
                                            "finish_reason": "stop"
                                        }]
                                    }
                                    yield f"data: {json.dumps(final_chunk)}\n\n"
                                    yield "data: [DONE]\n\n"
                            except json.JSONDecodeError:
                                continue
                except Exception as e:
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"

            return StreamingResponse(generate(), media_type="text/event-stream")
        else:
            response = await ollama_client.chat_completion(
                model=request.model,
                messages=messages,
                stream=False,
                temperature=temperature
            )

            if isinstance(response, dict):
                response["context_info"] = context_info

            return response
            
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Error in chat_completions: {e}")
        print(error_trace)
        error_msg = str(e)
        if "connect" in error_msg.lower() or "connection" in error_msg.lower():
            error_msg = f"Could not connect to Ollama. Make sure Ollama is running at http://localhost:11434. Original error: {error_msg}"
        elif "model" in error_msg.lower() and ("not found" in error_msg.lower() or "does not exist" in error_msg.lower()):
            error_msg = f"Model '{request.model}' not found. Make sure the model is downloaded in Ollama. Original error: {error_msg}"
        raise HTTPException(status_code=500, detail=error_msg)


if __name__ == "__main__":
    import uvicorn
    host = "127.0.0.1"
    port = int(os.getenv("PORT", "8000"))
    auto_open = os.getenv("AUTO_OPEN_BROWSER", "1").lower() not in ("0", "false", "no")

    if auto_open:
        def open_browser():
            cache_bust = int(time.time())
            webbrowser.open_new(f"http://{host}:{port}/?t={cache_bust}")

        threading.Timer(1.0, open_browser).start()

    uvicorn.run(app, host=host, port=port)
