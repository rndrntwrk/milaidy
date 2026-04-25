---
title: "DeepSeek Plugin"
sidebarTitle: "DeepSeek"
description: "DeepSeek model provider for Milady — DeepSeek-V3 and DeepSeek-R1 reasoning models."
---

The DeepSeek plugin connects Milady agents to DeepSeek's API, providing access to DeepSeek-V3 (general-purpose) and DeepSeek-R1 (reasoning-focused) models at competitive pricing.

> **Availability:** This plugin is not in the default Milady plugin registry. Install it directly with `milady plugins install deepseek` or `milady plugins install @elizaos/plugin-deepseek`.

**Package:** `@elizaos/plugin-deepseek`

> **Note:** This plugin is an upstream elizaOS provider and is not included in the bundled `plugins.json` registry. It auto-enables when `DEEPSEEK_API_KEY` is set and is installable from the remote elizaOS plugin registry.

## Installation

```bash
milady plugins install deepseek
```

## Auto-Enable

The plugin auto-enables when `DEEPSEEK_API_KEY` is present:

```bash
export DEEPSEEK_API_KEY=sk-...
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key from [platform.deepseek.com](https://platform.deepseek.com) |
| `DEEPSEEK_API_URL` | No | Custom base URL (default: `https://api.deepseek.com`) |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "deepseek",
        "model": "deepseek-chat"
      }
    }
  }
}
```

## Supported Models

| Model | Context | Best For |
|-------|---------|---------|
| `deepseek-chat` | 64k | General-purpose chat (DeepSeek-V3) |
| `deepseek-reasoner` | 64k | Chain-of-thought reasoning (DeepSeek-R1) |

DeepSeek-V3 is a mixture-of-experts model with 671B parameters (37B active). DeepSeek-R1 is a reasoning model trained with reinforcement learning.

## Model Type Mapping

| elizaOS Model Type | DeepSeek Model |
|-------------------|---------------|
| `TEXT_SMALL` | `deepseek-chat` |
| `TEXT_LARGE` | `deepseek-chat` or `deepseek-reasoner` (configure the large slot) |

## Features

- OpenAI-compatible API format
- Streaming responses
- Function calling / tool use
- Multi-turn conversation
- Code generation (DeepSeek-Coder heritage in V3)
- Chain-of-thought reasoning (R1)
- Competitive pricing — significantly cheaper than comparable Western models

## DeepSeek-R1 Reasoning

The `deepseek-reasoner` model produces a `<think>` block containing its reasoning chain before the final answer. Configure the **large** text slot to `deepseek-reasoner`, then use `TEXT_LARGE`:

```typescript
const response = await runtime.useModel("TEXT_LARGE", {
  prompt: "Prove that there are infinitely many prime numbers.",
});
```

## Local DeepSeek via Ollama

DeepSeek models are also available locally through Ollama:

```bash
ollama pull deepseek-r1:7b
ollama pull deepseek-r1:70b
```

Configure with the [Ollama plugin](/plugin-registry/llm/ollama) instead of this plugin when running locally.

## Rate Limits and Pricing

DeepSeek offers competitive per-token pricing. See [platform.deepseek.com/docs/pricing](https://platform.deepseek.com/docs/pricing) for current rates.

DeepSeek-V3 costs a fraction of GPT-4o at comparable quality for most tasks.

## Related

- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Access DeepSeek via OpenRouter
- [Groq Plugin](/plugin-registry/llm/groq) — Fast inference alternative
- [Ollama Plugin](/plugin-registry/llm/ollama) — Run DeepSeek locally
- [Model Providers](/runtime/models) — Compare all providers
