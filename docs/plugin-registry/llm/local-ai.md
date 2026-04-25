---
title: "Local AI Plugin"
sidebarTitle: "Local AI"
description: "Self-hosted, OpenAI-compatible local model inference for Milady — run GGUF models entirely on-device without an API key."
---

The Local AI plugin provides fully on-device inference using GGUF model files. No API keys, no external calls — models run directly on your hardware via `node-llama-cpp`.

**Package:** `@elizaos/plugin-local-ai`

## Installation

```bash
milady plugins install local-ai
```

Or add to your `milady.json`:

```json
{
  "plugins": ["@elizaos/plugin-local-ai"]
}
```

## Configuration

All settings are optional. The plugin ships with sensible defaults and auto-downloads models on first use.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOCAL_LARGE_MODEL` | No | `DeepHermes-3-Llama-3-8B-q4.gguf` | Filename of the large local AI model |
| `LOCAL_SMALL_MODEL` | No | `DeepHermes-3-Llama-3-3B-Preview-q4.gguf` | Filename of the small local AI model |
| `LOCAL_EMBEDDING_MODEL` | No | `bge-small-en-v1.5.Q4_K_M.gguf` | Filename of the embedding model for vector embeddings |
| `LOCAL_EMBEDDING_DIMENSIONS` | No | `384` | Number of dimensions the embedding model outputs |
| `MODELS_DIR` | No | — | Filesystem path where AI models are stored |
| `CACHE_DIR` | No | — | Filesystem path for model asset cache |
| `CUDA_VISIBLE_DEVICES` | No | — | Detect available CUDA-enabled GPUs for hardware acceleration |

### GPU Acceleration

If you have an NVIDIA GPU, set `CUDA_VISIBLE_DEVICES` to enable GPU-accelerated inference:

```bash
CUDA_VISIBLE_DEVICES=0 milady start
```

### Custom Models

Point to your own GGUF model files:

```json
{
  "plugins": ["@elizaos/plugin-local-ai"],
  "settings": {
    "LOCAL_LARGE_MODEL": "my-custom-model-q8.gguf",
    "LOCAL_SMALL_MODEL": "my-custom-small-q4.gguf",
    "MODELS_DIR": "/path/to/models"
  }
}
```

## When to Use

- **Offline / air-gapped deployments** — no network required after model download
- **Privacy-sensitive workloads** — all data stays on your machine
- **Development and testing** — iterate without API costs
- **Edge devices** — run on machines without internet access

For hosted local model inference via an HTTP API, see [Ollama](/plugin-registry/llm/ollama) instead.
