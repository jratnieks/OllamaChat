"""
Ollama client wrapper for interacting with local Ollama instance.
Handles model listing and chat completion requests.
"""
import httpx
from typing import List, Dict, Any, Optional, AsyncIterator
import json


class OllamaClient:
    """Client for interacting with Ollama API."""
    
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=300.0)  # Long timeout for model responses
    
    async def list_models(self) -> List[Dict[str, Any]]:
        """
        List available models from Ollama.
        Returns list of model dictionaries compatible with OpenAI format.
        """
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            data = response.json()
            
            # Transform Ollama format to OpenAI-compatible format
            models = []
            for model in data.get("models", []):
                models.append({
                    "id": model.get("name", "unknown"),
                    "object": "model",
                    "created": model.get("modified_at", 0),
                    "owned_by": "ollama"
                })
            return models
        except Exception as e:
            # If Ollama is not available, return empty list
            print(f"Warning: Could not fetch models from Ollama: {e}")
            return []
    
    async def chat_completion(
        self,
        model: str,
        messages: List[Dict[str, str]],
        stream: bool = False,
        temperature: float = 0.7,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Create a chat completion using Ollama.
        
        Args:
            model: Model name (e.g., "qwen2.5-coder:7b")
            messages: List of message dicts with "role" and "content"
            stream: Whether to stream the response
            temperature: Sampling temperature
        
        Returns:
            OpenAI-compatible response dict
        """
        # Transform messages to Ollama format
        ollama_messages = []
        for msg in messages:
            ollama_messages.append({
                "role": msg["role"],
                "content": msg["content"]
            })
        
        payload = {
            "model": model,
            "messages": ollama_messages,
            "stream": stream,
            "options": {
                "temperature": temperature
            }
        }
        
        try:
            if stream:
                # For streaming, use httpx stream context
                # Return an async generator that yields lines
                async def stream_response():
                    async with self.client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            yield line
                return stream_response()
            else:
                response = await self.client.post(
                    f"{self.base_url}/api/chat",
                    json=payload
                )
                response.raise_for_status()
                # Transform Ollama response to OpenAI format
                data = response.json()
                return {
                    "id": f"chatcmpl-{hash(str(messages))}",
                    "object": "chat.completion",
                    "created": data.get("created_at", 0),
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "message": {
                            "role": data["message"]["role"],
                            "content": data["message"]["content"]
                        },
                        "finish_reason": "stop"
                    }],
                    "usage": {
                        "prompt_tokens": data.get("prompt_eval_count", 0),
                        "completion_tokens": data.get("eval_count", 0),
                        "total_tokens": data.get("prompt_eval_count", 0) + data.get("eval_count", 0)
                    }
                }
        except httpx.HTTPStatusError as e:
            error_text = "Unknown error"
            try:
                error_text = e.response.text
            except:
                pass
            raise Exception(f"Ollama API error (HTTP {e.response.status_code}): {error_text}")
        except httpx.RequestError as e:
            raise Exception(f"Failed to connect to Ollama at {self.base_url}. Is Ollama running? Error: {str(e)}")
        except Exception as e:
            raise Exception(f"Failed to get completion from Ollama: {str(e)}")
    
    async def pull_model(self, model: str) -> AsyncIterator[Dict[str, Any]]:
        """
        Pull/download a model from Ollama with progress updates.
        
        Args:
            model: Model name to pull (e.g., "qwen2.5-coder:7b")
        
        Yields:
            Progress updates as dictionaries with status, progress info
        """
        # Create a client with longer timeout for downloads
        download_client = httpx.AsyncClient(timeout=3600.0)  # 1 hour timeout
        try:
            response = await download_client.post(
                f"{self.base_url}/api/pull",
                json={"name": model},
                stream=True
            )
            response.raise_for_status()
            
            async for line in response.aiter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        yield data
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            yield {"error": str(e), "status": "error"}
        finally:
            await download_client.aclose()
    
    async def check_model_exists(self, model: str) -> bool:
        """
        Check if a model is already downloaded.
        
        Args:
            model: Model name to check
        
        Returns:
            True if model exists, False otherwise
        """
        try:
            models = await self.list_models()
            # Check for exact match or match without tag (e.g., "qwen:7b" matches "qwen:7b" or "qwen")
            model_base = model.split(':')[0] if ':' in model else model
            for m in models:
                if m["id"] == model:
                    return True
                # Also check if base name matches (for cases like model:latest)
                m_base = m["id"].split(':')[0] if ':' in m["id"] else m["id"]
                if m_base == model_base and ':' not in model:
                    return True
            return False
        except Exception:
            return False
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

