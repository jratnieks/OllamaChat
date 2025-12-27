"""
FastAPI server providing OpenAI-compatible endpoints for local LLM coding assistant.
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

from ollama_client import OllamaClient
from context_builder import ContextBuilder


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup
    yield
    # Shutdown
    await ollama_client.close()


app = FastAPI(title="Local LLM Coding Assistant", lifespan=lifespan)

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
context_builder = ContextBuilder()

# Mount static files (frontend)
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


# Request/Response models (OpenAI-compatible)
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    stream: Optional[bool] = False
    temperature: Optional[float] = 0.7
    # Custom fields for context injection
    project_root: Optional[str] = None
    selected_files: Optional[List[str]] = None
    include_readme: Optional[bool] = True
    include_tree: Optional[bool] = True
    include_all_files: Optional[bool] = False
    system_prompt: Optional[str] = None


class FileListRequest(BaseModel):
    files: List[str]


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the frontend UI."""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>Local LLM Coding Assistant</h1><p>Frontend not found. Please check static/index.html</p>")


@app.get("/v1/models")
async def list_models():
    """
    List available models (OpenAI-compatible endpoint).
    """
    models = await ollama_client.list_models()
    return {
        "object": "list",
        "data": models
    }


@app.get("/api/models/recommended")
async def get_recommended_models():
    """
    Get list of recommended coding models.
    """
    return {
        "models": [
            {"id": "qwen2.5-coder:7b", "name": "Qwen2.5 Coder 7B", "size": "~4.4GB", "recommended": True},
            {"id": "qwen2.5-coder:32b", "name": "Qwen2.5 Coder 32B", "size": "~18GB", "recommended": False},
            {"id": "deepseek-coder:6.7b", "name": "DeepSeek Coder 6.7B", "size": "~3.8GB", "recommended": True},
            {"id": "deepseek-coder:33b", "name": "DeepSeek Coder 33B", "size": "~18GB", "recommended": False},
            {"id": "codellama:7b", "name": "CodeLlama 7B", "size": "~3.8GB", "recommended": True},
            {"id": "codellama:13b", "name": "CodeLlama 13B", "size": "~7.3GB", "recommended": False},
            {"id": "codellama:34b", "name": "CodeLlama 34B", "size": "~19GB", "recommended": False},
            {"id": "starcoder2:15b", "name": "StarCoder2 15B", "size": "~8.5GB", "recommended": False},
            {"id": "wizardcoder:7b", "name": "WizardCoder 7B", "size": "~3.8GB", "recommended": True},
        ]
    }


class PullModelRequest(BaseModel):
    model: str

@app.post("/api/models/pull")
async def pull_model(request: PullModelRequest):
    """
    Pull/download a model from Ollama.
    Returns streaming progress updates.
    """
    from fastapi.responses import StreamingResponse
    
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


@app.get("/api/models/check/{model}")
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
    Supports project context injection via project_root, selected_files, include_readme, include_tree.
    """
    import traceback
    
    try:
        # Validate model is provided
        if not request.model or not request.model.strip():
            raise HTTPException(status_code=400, detail="Model is required")
        
        # Validate messages
        if not request.messages or len(request.messages) == 0:
            raise HTTPException(status_code=400, detail="At least one message is required")
        
        # Use provided project root or default
        try:
            if request.project_root:
                # Create a new context builder with the specified project root
                builder = ContextBuilder(project_root=request.project_root)
            else:
                builder = context_builder
        except Exception as e:
            print(f"Error creating context builder: {e}")
            print(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Error setting up context builder: {str(e)}")
        
        # Build context if files are selected or context options enabled
        context_parts = []
        context_info = {
            "project_root": str(builder.project_root),
            "included_items": []
        }
        
        try:
            if request.include_tree or request.include_readme or request.selected_files or request.include_all_files:
                context = builder.build_context(
                    selected_files=request.selected_files or [],
                    include_readme=request.include_readme,
                    include_tree=request.include_tree,
                    include_all_files=request.include_all_files
                )
                if context:
                    context_parts.append(context)
                    if request.include_tree:
                        context_info["included_items"].append("directory_tree")
                    if request.include_readme:
                        context_info["included_items"].append("README.md")
                    if request.include_all_files:
                        try:
                            all_files = builder.get_all_files(text_only=True)
                            context_info["included_items"].append(f"all_files ({len(all_files)} text files)")
                        except Exception as e:
                            print(f"Warning: Could not get all files: {e}")
                            context_info["included_items"].append("all_files (scan failed)")
                    elif request.selected_files:
                        context_info["included_items"].extend(request.selected_files)
        except Exception as e:
            # Log context building errors but don't fail the request
            print(f"Warning: Error building context: {e}")
            # Continue without context rather than failing
        
        # Prepare messages
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
        
        # Default system prompt for coding assistance
        default_system_prompt = """You are a helpful coding assistant. You have access to the user's project files and context provided below. 

When answering questions:
- Reference specific files and line numbers when relevant
- Provide clear, working code examples
- Explain your reasoning
- If you see project files in the context, use them to give specific answers

Do NOT say you cannot access files - the file contents are provided to you in the context below."""
        
        # Inject system prompt
        if request.system_prompt:
            system_content = request.system_prompt
        else:
            system_content = default_system_prompt
        
        if context_parts:
            system_content += "\n\n## Project Context\n" + "\n".join(context_parts)
        
        messages.insert(0, {"role": "system", "content": system_content})
        
        # Store context info for debugging (will be returned in response)
        context_info["context_length"] = sum(len(part) for part in context_parts)
        context_info["message_count"] = len(messages)
        
        # Call Ollama
        if request.stream:
            # Streaming response
            stream_gen = await ollama_client.chat_completion(
                model=request.model,
                messages=messages,
                stream=True,
                temperature=request.temperature
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
                    # Send error in stream
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
            return StreamingResponse(generate(), media_type="text/event-stream")
        else:
            # Non-streaming response
            response = await ollama_client.chat_completion(
                model=request.model,
                messages=messages,
                stream=False,
                temperature=request.temperature
            )
            # Add context info to response for debugging
            if isinstance(response, dict):
                response["context_info"] = context_info
            return response
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Error in chat_completions: {e}")
        print(error_trace)
        # Return a more helpful error message
        error_msg = str(e)
        if "connect" in error_msg.lower() or "connection" in error_msg.lower():
            error_msg = f"Could not connect to Ollama. Make sure Ollama is running at http://localhost:11434. Original error: {error_msg}"
        elif "model" in error_msg.lower() and ("not found" in error_msg.lower() or "does not exist" in error_msg.lower()):
            error_msg = f"Model '{request.model}' not found. Make sure the model is downloaded in Ollama. Original error: {error_msg}"
        raise HTTPException(status_code=500, detail=error_msg)


@app.post("/api/context/files")
async def get_file_contents(request: FileListRequest, project_root: Optional[str] = None):
    """
    Get contents of multiple files.
    Used by frontend to preview files before adding to context.
    """
    builder = ContextBuilder(project_root=project_root) if project_root else context_builder
    results = {}
    for file_path in request.files:
        content = builder.read_file(file_path)
        results[file_path] = content
    return results


@app.get("/api/context/tree")
async def get_directory_tree(project_root: Optional[str] = None):
    """Get directory tree representation."""
    builder = ContextBuilder(project_root=project_root) if project_root else context_builder
    return {"tree": builder.get_directory_tree()}


@app.get("/api/context/readme")
async def get_readme(project_root: Optional[str] = None):
    """Get README.md contents."""
    builder = ContextBuilder(project_root=project_root) if project_root else context_builder
    readme = builder.get_readme()
    return {"readme": readme}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

