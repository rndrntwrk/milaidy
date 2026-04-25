---
title: "MiniMax Plugin"
sidebarTitle: "MiniMax"
description: "MiniMax model provider for Milady — access MiniMax's language and multimodal models."
---

<Warning>
This plugin is not yet available in the Milady plugin registry. To use MiniMax models today, configure them through the [OpenRouter plugin](/plugin-registry/llm/openrouter) using the appropriate model ID.
</Warning>

The MiniMax plugin connects Milady agents to MiniMax's language models, providing access to their text generation and multimodal capabilities.

<Info>
This plugin is available from the upstream elizaOS registry. It is **not bundled** in `plugins.json` and must be installed explicitly.
</Info>

**Package:** `@elizaos/plugin-minimax`

## Installation

```bash
milady plugins install @elizaos/plugin-minimax
```

## Configuration

MiniMax does not have an env-var auto-enable trigger. Enable it explicitly in your config:

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "minimax"
      }
    }
  },
  "plugins": {
    "allow": ["@elizaos/plugin-minimax"]
  }
}
```

Set your MiniMax API credentials:

```bash
export MINIMAX_API_KEY=your-minimax-api-key
export MINIMAX_GROUP_ID=your-group-id
```

## Supported Models

| Model | Description |
|-------|-------------|
| `abab6.5s-chat` | Standard chat model |
| `abab6.5-chat` | Enhanced chat model |
| `abab5.5-chat` | Lighter, faster model |

## Features

- Text generation
- Multimodal capabilities (text + image understanding)
- Streaming responses
- Tool use / function calling

## Related

- [OpenAI Plugin](/plugin-registry/llm/openai) — GPT-4o models
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Route between multiple providers
- [Model Providers](/runtime/models) — Compare all providers
