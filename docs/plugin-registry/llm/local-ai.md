---
title: "Local AI Plugin"
sidebarTitle: "Local AI"
description: "LocalAI self-hosted model provider for Milady — OpenAI-compatible local model inference without external API dependencies."
---

The Local AI plugin provides self-hosted, OpenAI-compatible local model inference for Milady agents. Unlike Ollama, which manages model downloads and serving, Local AI works directly with GGUF model files on disk.

**Package:** `@elizaos/plugin-local-ai`

## Installation

```bash
milady plugins install local-ai
```

## Setup

### 1. Prepare Model Files

Download GGUF model files to a local directory:

```bash
mkdir -p ~/.milady/models
# Download your preferred models in GGUF format
```

Default models (if not overridden):
- **Large model:** `DeepHermes-3-Llama-3-8B-q4.gguf`
- **Small model:** `DeepHermes-3-Llama-3-3B-Preview-q4.gguf`
- **Embedding model:** `bge-small-en-v1.5.Q4_K_M.gguf`

### 2. Configure Environment

```bash
export LOCAL_LARGE_MODEL=DeepHermes-3-Llama-3-8B-q4.gguf
export LOCAL_SMALL_MODEL=DeepHermes-3-Llama-3-3B-Preview-q4.gguf
export LOCAL_EMBEDDING_MODEL=bge-small-en-v1.5.Q4_K_M.gguf
```

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `LOCAL_LARGE_MODEL` | No | `DeepHermes-3-Llama-3-8B-q4.gguf` | Filename of the large model |
| `LOCAL_SMALL_MODEL` | No | `DeepHermes-3-Llama-3-3B-Preview-q4.gguf` | Filename of the small model |
| `LOCAL_EMBEDDING_MODEL` | No | `bge-small-en-v1.5.Q4_K_M.gguf` | Filename of the embedding model |
| `LOCAL_EMBEDDING_DIMENSIONS` | No | `384` | Embedding output dimensions |
| `MODELS_DIR` | No | — | Directory where model files are stored |
| `CACHE_DIR` | No | — | Cache directory for model assets |
| `CUDA_VISIBLE_DEVICES` | No | — | GPU device IDs for CUDA acceleration |

## Features

- Fully local — no API keys, no network calls
- Works with standard GGUF model files
- GPU acceleration when CUDA is available
- Embedding generation for semantic search
- No external service dependency

## Differences from Ollama

| Feature | Local AI | Ollama |
|---------|----------|--------|
| Model management | Manual GGUF files | Built-in pull/serve |
| Setup | Place model files in directory | `ollama pull <model>` |
| Dependencies | None (self-contained) | Ollama server process |
| API format | OpenAI-compatible | OpenAI-compatible + native |
| Package | `@elizaos/plugin-local-ai` | `@elizaos/plugin-ollama` |

## Related

- [Ollama Plugin](/plugin-registry/llm/ollama) — Managed local model serving
- [Model Providers](/runtime/models) — Compare all providers
