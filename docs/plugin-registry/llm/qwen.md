---
title: "Qwen Plugin"
sidebarTitle: "Qwen"
description: "Qwen model provider for Milady — access Alibaba Cloud's Qwen language models."
---

> **Not in plugin registry.** `@elizaos/plugin-qwen` is not registered in `plugins.json`. This plugin may not be installable via `milady plugins install`. Access Qwen models via [OpenRouter](/plugin-registry/llm/openrouter) or [Ollama](/plugin-registry/llm/ollama) instead.

The Qwen plugin connects Milady agents to Alibaba Cloud's Qwen (Tongyi Qianwen) language models, providing access to multilingual models with strong Chinese and English capabilities.

> **Availability:** This plugin is not in the default Milady plugin registry. Install it directly with `milady plugins install qwen` or `milady plugins install @elizaos/plugin-qwen`.

**Package:** `@elizaos/plugin-qwen`

> **Note:** This plugin is an upstream elizaOS provider and is not included in the bundled `plugins.json` registry. It must be explicitly enabled in your config and is installable from the remote elizaOS plugin registry.

## Installation

```bash
milady plugins install qwen
```

## Configuration

Qwen does not have an env-var auto-enable trigger. Enable it explicitly in your config:

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "qwen"
      }
    }
  },
  "plugins": {
    "allow": ["@elizaos/plugin-qwen"]
  }
}
```

## Features

- Multilingual support (strong Chinese and English)
- Streaming responses
- Tool use / function calling

## Related

- [DeepSeek Plugin](/plugin-registry/llm/deepseek) — DeepSeek models
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Route between multiple providers
- [Model Providers](/runtime/models) — Compare all providers
