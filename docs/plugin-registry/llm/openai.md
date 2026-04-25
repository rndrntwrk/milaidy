---
title: "OpenAI Plugin"
sidebarTitle: "OpenAI"
description: "OpenAI model provider for Milady — GPT-4o, o1, o3, embeddings, image generation, and speech."
---

The OpenAI plugin connects Milady agents to OpenAI's API, providing access to GPT-4o, the o1/o3 reasoning model families, DALL-E image generation, and Whisper speech-to-text.

**Package:** `@elizaos/plugin-openai`

## Installation

```bash
milady plugins install openai
```

Or add to `milady.json`:

```json
{
  "plugins": {
    "allow": ["openai"]
  }
}
```

## Auto-Enable

The plugin auto-enables when `OPENAI_API_KEY` is present in the environment:

```bash
export OPENAI_API_KEY=sk-...
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key from [platform.openai.com](https://platform.openai.com) |
| `OPENAI_BASE_URL` | No | Custom base URL (for Azure OpenAI or compatible APIs) |
| `OPENAI_SMALL_MODEL` | No | Override small model (default: `gpt-4o-mini`) |
| `OPENAI_LARGE_MODEL` | No | Override large model (default: `gpt-4o`) |
| `OPENAI_EMBEDDING_MODEL` | No | Embedding model (default: `text-embedding-3-small`) |
| `OPENAI_EMBEDDING_URL` | No | Custom embedding endpoint URL |
| `OPENAI_EMBEDDING_API_KEY` | No | Separate API key for embeddings |
| `OPENAI_EMBEDDING_DIMENSIONS` | No | Embedding vector dimensions |
| `OPENAI_IMAGE_DESCRIPTION_MODEL` | No | Vision model for image analysis (default: `gpt-4o`) |
| `OPENAI_IMAGE_DESCRIPTION_MAX_TOKENS` | No | Max tokens for image descriptions |
| `OPENAI_TTS_MODEL` | No | TTS model (default: `tts-1`) |
| `OPENAI_TTS_VOICE` | No | TTS voice (default: `alloy`) |
| `OPENAI_TTS_INSTRUCTIONS` | No | Custom TTS instructions |
| `OPENAI_EXPERIMENTAL_TELEMETRY` | No | Enable experimental telemetry |
| `OPENAI_BROWSER_BASE_URL` | No | Browser-only proxy endpoint base URL |
| `OPENAI_BROWSER_EMBEDDING_URL` | No | Browser-only embedding endpoint URL |

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "openai",
        "model": "gpt-4o"
      }
    }
  }
}
```

## Supported Models

### Text Generation

| Model | Context | Best For |
|-------|---------|---------|
| `gpt-4o` | 128k | Multimodal reasoning, default |
| `gpt-4o-mini` | 128k | Fast, cost-efficient tasks |
| `gpt-4-turbo` | 128k | High-quality generation |
| `gpt-3.5-turbo` | 16k | Simple tasks at low cost |

### Reasoning Models

| Model | Context | Best For |
|-------|---------|---------|
| `o1` | 200k | Deep reasoning tasks |
| `o1-mini` | 128k | Fast reasoning |
| `o3` | 200k | State-of-the-art reasoning |
| `o3-mini` | 200k | Efficient reasoning |
| `o4-mini` | 200k | Latest efficient reasoning |

### Other Capabilities

| Capability | Model |
|-----------|-------|
| Embeddings | `text-embedding-3-small`, `text-embedding-3-large` |
| Image generation | `dall-e-3`, `dall-e-2` |
| Speech-to-text | `whisper-1` |
| Text-to-speech | `tts-1`, `tts-1-hd` |
| Vision | `gpt-4o` (multimodal) |

## Model Type Mapping

| elizaOS Model Type | OpenAI Model |
|-------------------|-------------|
| `TEXT_SMALL` | `gpt-4o-mini` |
| `TEXT_LARGE` | `gpt-4o` |
| `TEXT_EMBEDDING` | `text-embedding-3-small` |
| `IMAGE` | `dall-e-3` |
| `TRANSCRIPTION` | `whisper-1` |
| `TEXT_TO_SPEECH` | `tts-1` |

## Features

- Streaming responses
- Function/tool calling
- Vision (image input with `gpt-4o`)
- Structured JSON output (`response_format: { type: "json_object" }`)
- Batch API support
- Token usage tracking

## Usage Example

```typescript
// In a plugin or action handler:
const response = await runtime.useModel("TEXT_LARGE", {
  prompt: "Explain quantum entanglement in simple terms.",
  maxTokens: 500,
  temperature: 0.7,
});
```

## Rate Limits and Pricing

Rate limits depend on your OpenAI usage tier. See [platform.openai.com/docs/guides/rate-limits](https://platform.openai.com/docs/guides/rate-limits) for current limits by tier.

Pricing: [openai.com/pricing](https://openai.com/pricing)

## Related

- [Anthropic Plugin](/plugin-registry/llm/anthropic) — Claude model family
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Route between providers
- [Model Providers](/runtime/models) — Compare all providers
