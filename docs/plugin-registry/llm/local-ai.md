---
title: "Local AI Plugin"
sidebarTitle: "Local AI"
description: "Local AI provider for Milady — self-hosted, OpenAI-compatible local model inference with GGUF models."
---

The Local AI plugin runs language models directly on your machine using GGUF model files. No API key or external service needed.

**Package:** `@elizaos/plugin-local-ai`

## Installation

```bash
milady plugins install local-ai
```

## Configuration

Local AI does not require an API key. Configure it through environment variables or `milady.json`:

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `LOCAL_LARGE_MODEL` | No | `DeepHermes-3-Llama-3-8B-q4.gguf` | Filename of the large model |
| `LOCAL_SMALL_MODEL` | No | `DeepHermes-3-Llama-3-3B-Preview-q4.gguf` | Filename of the small model |
| `LOCAL_EMBEDDING_MODEL` | No | `bge-small-en-v1.5.Q4_K_M.gguf` | Filename of the embedding model |
| `LOCAL_EMBEDDING_DIMENSIONS` | No | `384` | Number of dimensions the embedding model outputs |
| `MODELS_DIR` | No | — | Filesystem path where model files are stored |
| `CACHE_DIR` | No | — | Filesystem path for model asset cache |
| `CUDA_VISIBLE_DEVICES` | No | — | GPU selection for CUDA-enabled inference |

### milady.json Example

```json
{
  "plugins": {
    "allow": ["local-ai"]
  },
  "env": {
    "LOCAL_LARGE_MODEL": "DeepHermes-3-Llama-3-8B-q4.gguf",
    "MODELS_DIR": "/path/to/models"
  }
}
```

## How It Works

Local AI loads GGUF-format models and runs inference entirely on-device. It supports CPU and CUDA GPU acceleration. The plugin provides an OpenAI-compatible interface so the rest of the runtime treats it like any other provider.

Models are downloaded automatically on first use if they are not already present in the configured `MODELS_DIR`.

## When to Use Local AI vs Ollama

| | Local AI | Ollama |
|---|---------|--------|
| External process | No (in-process) | Yes (separate server) |
| Model format | GGUF files | Ollama model registry |
| Setup | Plugin install only | Install Ollama + pull models |
| GPU support | CUDA | CUDA, Metal, ROCm |

Use **Local AI** when you want zero external dependencies and are comfortable with GGUF model files. Use **Ollama** when you want a broader model catalog and a dedicated model server.

## Related

- [Ollama Plugin](/plugin-registry/llm/ollama) — Local models via Ollama server
- [Model Providers](/model-providers) — Compare all providers
- [Local Models Guide](/guides/local-models) — Full guide to running models locally
