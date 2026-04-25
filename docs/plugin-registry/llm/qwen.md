---
title: "Qwen Plugin"
sidebarTitle: "Qwen"
description: "Qwen model provider for Milady — access Alibaba Cloud's Qwen language models."
---

<Warning>
This plugin is not yet available in the Milady plugin registry. To use Qwen models today, configure them through the [OpenRouter plugin](/plugin-registry/llm/openrouter) using the appropriate model ID.
</Warning>

The Qwen plugin connects Milady agents to Alibaba Cloud's Qwen (Tongyi Qianwen) language models, providing access to multilingual models with strong Chinese and English capabilities.

**Package:** `@elizaos/plugin-qwen` (not yet published)

> **Availability:** This plugin is not in the bundled registry (`plugins.json`). It is available from the remote elizaOS plugin registry and auto-enables when `QWEN_API_KEY` or `DASHSCOPE_API_KEY` is set.

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
