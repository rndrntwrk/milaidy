---
title: "MiniMax Plugin"
sidebarTitle: "MiniMax"
description: "MiniMax model provider for Milady — access MiniMax's language and multimodal models."
---

> **Not in plugin registry.** `@elizaos/plugin-minimax` is not registered in `plugins.json`. This plugin may not be installable via `milady plugins install`.

The MiniMax plugin connects Milady agents to MiniMax's language models, providing access to their text generation and multimodal capabilities.

> **Availability:** This plugin is not in the default Milady plugin registry. Install it directly with `milady plugins install minimax` or `milady plugins install @elizaos/plugin-minimax`.

**Package:** `@elizaos/plugin-minimax`

> **Note:** This plugin is an upstream elizaOS provider and is not included in the bundled `plugins.json` registry. It must be explicitly enabled in your config and is installable from the remote elizaOS plugin registry.

## Installation

```bash
milady plugins install minimax
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

## Features

- Text generation
- Multimodal capabilities
- Streaming responses

## Related

- [OpenAI Plugin](/plugin-registry/llm/openai) — GPT-4o models
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Route between multiple providers
- [Model Providers](/runtime/models) — Compare all providers
