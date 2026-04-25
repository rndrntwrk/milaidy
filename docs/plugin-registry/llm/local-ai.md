---
title: "Local AI Plugin"
sidebarTitle: "Local AI"
description: "Local AI provider for Milady — self-hosted, fully offline GGUF model inference with no API keys or external servers."
---

The Local AI plugin enables Milady agents to run inference against local model files (GGUF format) with no API keys, no network calls, and no external server process required.

**Package:** `@elizaos/plugin-local-ai`

## Installation

```bash
milady plugins install local-ai
```

## Configuration

Local AI does not auto-enable via environment variables. Enable it explicitly in your plugin config or allowlist:

```json5
// ~/.milady/milady.json
{
  plugins: {
    allow: ["local-ai"],
  },
}
```

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `MODELS_DIR` | Yes | Filesystem path to the directory containing your GGUF model files |
| `CACHE_DIR` | No | Path for caching model assets (defaults to system temp) |
| `LOCAL_SMALL_MODEL` | No | Filename of the small/fast model in `MODELS_DIR` |
| `LOCAL_LARGE_MODEL` | No | Filename of the large/capable model in `MODELS_DIR` |
| `LOCAL_EMBEDDING_MODEL` | No | Filename of the embedding model in `MODELS_DIR` |
| `LOCAL_EMBEDDING_DIMENSIONS` | No | Dimension count for the embedding model |
| `CUDA_VISIBLE_DEVICES` | No | GPU selection (e.g., `0` for first GPU) |

### milady.json Example

```json5
{
  env: {
    MODELS_DIR: "/home/user/models",
    LOCAL_SMALL_MODEL: "phi-2.Q5_K_M.gguf",
    LOCAL_LARGE_MODEL: "llama-3.1-8b-instruct.Q5_K_M.gguf",
    LOCAL_EMBEDDING_MODEL: "nomic-embed-text-v1.5.Q5_K_M.gguf",
    LOCAL_EMBEDDING_DIMENSIONS: "768",
  },
  plugins: {
    allow: ["local-ai"],
  },
}
```

## How It Differs from Ollama

| | Local AI | Ollama |
|---|---------|--------|
| Server required | No | Yes (`ollama serve`) |
| Model format | GGUF files in a directory | Ollama-managed model store |
| Auto-enable | Manual (`plugins.allow`) | `OLLAMA_BASE_URL` env var |
| GPU support | CUDA via `CUDA_VISIBLE_DEVICES` | CUDA, Metal, ROCm |
| Model management | Manual file placement | `ollama pull` / `ollama list` |

Use Local AI when you want direct control over model files without an intermediary server. Use Ollama when you want managed model downloads, automatic GPU detection, and an OpenAI-compatible HTTP API.

## Features

- Fully offline — no network calls, no API keys, no external processes
- GGUF model support via node-llama-cpp
- GPU acceleration (NVIDIA CUDA)
- Separate small/large/embedding model slots
- OpenAI-compatible completions interface

## Related

- [Ollama Plugin](/plugin-registry/llm/ollama) — Local inference via Ollama server
- [Model Providers](/model-providers) — Compare all providers
