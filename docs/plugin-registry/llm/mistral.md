---
title: "Mistral Plugin"
sidebarTitle: "Mistral"
description: "Mistral AI model provider for Milady — open-weight and commercial models with strong multilingual and coding capabilities."
---

> **Not in plugin registry.** `@elizaos/plugin-mistral` is not registered in `plugins.json`. This plugin may not be installable via `milady plugins install`. Access Mistral models via [OpenRouter](/plugin-registry/llm/openrouter) or [Ollama](/plugin-registry/llm/ollama) instead.

The Mistral plugin connects Milady agents to Mistral AI models, offering both open-weight and commercial models with competitive performance, especially for European languages and code generation.

> **Availability:** This plugin is not in the default Milady plugin registry. Install it directly with `milady plugins install mistral` or `milady plugins install @elizaos/plugin-mistral`.

**Package:** `@elizaos/plugin-mistral`

> **Note:** This plugin is an upstream elizaOS provider and is not included in the bundled `plugins.json` registry. It auto-enables when `MISTRAL_API_KEY` is set and is installable from the remote elizaOS plugin registry.

## Installation

```bash
milady plugins install mistral
```

## Auto-Enable

The plugin auto-enables when `MISTRAL_API_KEY` is present:

```bash
export MISTRAL_API_KEY=your-mistral-api-key
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `MISTRAL_API_KEY` | Yes | Mistral AI API key from [console.mistral.ai](https://console.mistral.ai) |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "mistral",
        "model": "mistral-large-latest"
      }
    }
  }
}
```

## Supported Models

| Model | Context | Best For |
|-------|---------|---------|
| `mistral-large-latest` | 128k | Complex reasoning, multilingual |
| `mistral-medium-latest` | 32k | Balanced performance |
| `mistral-small-latest` | 32k | Fast, cost-efficient tasks |
| `open-mistral-nemo` | 128k | Long-context, open-weight |
| `codestral-latest` | 32k | Code generation and completion |
| `mistral-embed` | 8k | Text embeddings |

## Features

- Streaming responses
- Tool use / function calling
- Strong multilingual performance (especially European languages)
- Code generation (Codestral)
- Embeddings for semantic search
- Structured JSON output
- Guardrail-friendly moderation endpoint

## Related

- [Groq Plugin](/plugin-registry/llm/groq) — Fast inference for open-weight models
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Route between Mistral and other providers
- [Model Providers](/runtime/models) — Compare all providers
