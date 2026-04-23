---
title: "Local AI Plugin"
sidebarTitle: "Local AI"
description: "Self-hosted GGUF model inference for Milady — run models locally via node-llama-cpp with optional GPU acceleration."
---

The Local AI plugin runs GGUF models directly on your machine using `node-llama-cpp`. No API key required, no external server needed — models are downloaded and run in-process.

**Package:** `@elizaos/plugin-local-ai`

## Installation

```bash
milady plugins install local-ai
```

Or add to `milady.json`:

```json
{
  "plugins": {
    "allow": ["local-ai"]
  }
}
```

## Auto-Enable

The Local AI plugin does not auto-enable via an environment variable. Enable it explicitly through the plugin allow list or by installing it.

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `LOCAL_LARGE_MODEL` | No | `DeepHermes-3-Llama-3-8B-q4.gguf` | Filename of the large model |
| `LOCAL_SMALL_MODEL` | No | `DeepHermes-3-Llama-3-3B-Preview-q4.gguf` | Filename of the small model |
| `LOCAL_EMBEDDING_MODEL` | No | `bge-small-en-v1.5.Q4_K_M.gguf` | Filename of the embedding model |
| `LOCAL_EMBEDDING_DIMENSIONS` | No | `384` | Embedding vector dimensions |
| `MODELS_DIR` | No | (auto) | Directory where models are stored |
| `CACHE_DIR` | No | (auto) | Cache directory for model assets |
| `CUDA_VISIBLE_DEVICES` | No | (auto) | GPU device selection for CUDA acceleration |

### milady.json Example

```json
{
  "plugins": {
    "allow": ["local-ai"],
    "entries": {
      "local-ai": { "enabled": true }
    }
  },
  "env": {
    "LOCAL_LARGE_MODEL": "DeepHermes-3-Llama-3-8B-q4.gguf",
    "LOCAL_SMALL_MODEL": "DeepHermes-3-Llama-3-3B-Preview-q4.gguf"
  }
}
```

## Default Models

| Model Type | Default Model | Size |
|-----------|--------------|------|
| Large | `DeepHermes-3-Llama-3-8B-q4.gguf` | ~5 GB |
| Small | `DeepHermes-3-Llama-3-3B-Preview-q4.gguf` | ~2 GB |
| Embedding | `bge-small-en-v1.5.Q4_K_M.gguf` | ~100 MB |

Models are downloaded automatically on first use if not already present in the models directory.

## Features

- Fully local — no API keys, no network calls after model download
- GGUF format (quantized models for efficient inference)
- GPU acceleration with CUDA (NVIDIA GPUs)
- CPU fallback when no GPU is available
- Local embedding generation
- Streaming responses

## Local AI vs Ollama

| Feature | Local AI | Ollama |
|---------|---------|--------|
| Server required | No (in-process) | Yes (`ollama serve`) |
| Model format | GGUF | GGUF (via Modelfile) |
| Model management | Manual (env vars) | `ollama pull/list` |
| GPU support | CUDA | CUDA, Metal, ROCm |
| API compatibility | elizaOS native | OpenAI-compatible |
| Setup complexity | Lower (just enable) | Higher (install + serve) |

Use **Local AI** when you want zero-dependency local inference. Use **Ollama** when you want a model management CLI, Apple Silicon Metal support, or the OpenAI-compatible API.

## Hardware Requirements

| Model Size | RAM Required | GPU VRAM |
|-----------|-------------|---------|
| 3B (q4) | 4 GB | 3 GB |
| 8B (q4) | 8 GB | 6 GB |
| Embedding | 1 GB | — |

Models run on CPU if insufficient VRAM is available, but with reduced speed.

## Related

- [Ollama Plugin](/plugin-registry/llm/ollama) — Local models via the Ollama server
- [Model Providers](/model-providers) — Compare all providers
