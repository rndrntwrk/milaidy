---
title: "Local AI Plugin"
sidebarTitle: "Local AI"
description: "Self-hosted local model inference for Milady — run GGUF models directly without an external API."
---

The Local AI plugin provides self-hosted, OpenAI-compatible local model inference using GGUF quantized models. Unlike Ollama (which requires a separate server process), Local AI loads models directly in-process.

**Package:** `@elizaos/plugin-local-ai`

## Installation

```bash
milady plugins install local-ai
```

## Configuration

No API key is required. Configure model paths and preferences via environment variables or `milady.json`:

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `LOCAL_LARGE_MODEL` | No | `DeepHermes-3-Llama-3-8B-q4.gguf` | Filename of the large model |
| `LOCAL_SMALL_MODEL` | No | `DeepHermes-3-Llama-3-3B-Preview-q4.gguf` | Filename of the small model |
| `LOCAL_EMBEDDING_MODEL` | No | `bge-small-en-v1.5.Q4_K_M.gguf` | Filename of the embedding model |
| `LOCAL_EMBEDDING_DIMENSIONS` | No | `384` | Embedding vector dimensions |
| `MODELS_DIR` | No | — | Directory where model files are stored |
| `CACHE_DIR` | No | — | Cache directory for model assets |
| `CUDA_VISIBLE_DEVICES` | No | — | GPU device selection for CUDA acceleration |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "local-ai"
      }
    }
  }
}
```

## Model Type Mapping

| elizaOS Model Type | Default Model |
|-------------------|---------------|
| `TEXT_SMALL` | `DeepHermes-3-Llama-3-3B-Preview-q4.gguf` |
| `TEXT_LARGE` | `DeepHermes-3-Llama-3-8B-q4.gguf` |
| `TEXT_EMBEDDING` | `bge-small-en-v1.5.Q4_K_M.gguf` |

## Features

- In-process GGUF model inference (no external server required)
- GPU acceleration via CUDA when available
- Configurable model paths and cache directories
- Small and large model selection
- Local embedding generation

## When to Use Local AI vs Ollama

| | Local AI | Ollama |
|---|---------|--------|
| External server | Not required | Requires running `ollama serve` |
| Model format | GGUF files | Ollama model library |
| Setup | Download GGUF files to `MODELS_DIR` | `ollama pull <model>` |
| GPU support | CUDA | CUDA, Metal, ROCm |
| Best for | Minimal-dependency local inference | Broader model selection and management |

## Related

- [Ollama Plugin](/plugin-registry/llm/ollama) — Local models via Ollama server
- [Model Providers](/model-providers) — Compare all providers
- [Local Models Guide](/guides/local-models) — Running models locally
