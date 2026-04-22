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
| `OPENAI_API_KEY` | Yes | API key from [platform.openai.com](https://platform.openai.com) |
| `OPENAI_BASE_URL` | No | Custom base URL (for Azure OpenAI or compatible APIs) |
| `OPENAI_SMALL_MODEL` | No | Override the small model identifier (overrides `SMALL_MODEL`; default: `gpt-4o-mini`) |
| `SMALL_MODEL` | No | Fallback small model identifier if `OPENAI_SMALL_MODEL` is not set |
| `OPENAI_LARGE_MODEL` | No | Override the large model identifier (overrides `LARGE_MODEL`; default: `gpt-4o`) |
| `LARGE_MODEL` | No | Fallback large model identifier if `OPENAI_LARGE_MODEL` is not set |
| `OPENAI_EMBEDDING_MODEL` | No | Override the embedding model (default: `text-embedding-3-small`) |
| `OPENAI_EMBEDDING_URL` | No | Custom base URL for the embeddings endpoint |
| `OPENAI_EMBEDDING_API_KEY` | No | Custom API key for the embeddings endpoint |
| `OPENAI_EMBEDDING_DIMENSIONS` | No | Number of dimensions for returned embedding vectors |
| `OPENAI_IMAGE_DESCRIPTION_MODEL` | No | Model used for describing/analyzing images |
| `OPENAI_IMAGE_DESCRIPTION_MAX_TOKENS` | No | Max tokens for the image-description model response |
| `OPENAI_TTS_MODEL` | No | Override the text-to-speech model |
| `OPENAI_TTS_VOICE` | No | Voice profile for text-to-speech output |
| `OPENAI_TTS_INSTRUCTIONS` | No | Instructions to control TTS style or behavior |
| `OPENAI_EXPERIMENTAL_TELEMETRY` | No | Enable experimental telemetry for debugging and usage analytics |
| `OPENAI_BROWSER_BASE_URL` | No | Browser-only proxy endpoint base URL for OpenAI requests (no secrets in the client) |
| `OPENAI_BROWSER_EMBEDDING_URL` | No | Browser-only proxy endpoint base URL for OpenAI embeddings |

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
