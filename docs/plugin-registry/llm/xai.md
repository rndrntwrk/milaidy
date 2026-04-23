---
title: "xAI Plugin"
sidebarTitle: "xAI (Grok)"
description: "xAI model provider for Milady — access Grok models for real-time knowledge, reasoning, and conversational AI."
---

The xAI plugin connects Milady agents to xAI's Grok models, providing access to models with real-time knowledge and strong reasoning capabilities.

**Package:** `@elizaos/plugin-xai`

## Installation

```bash
milady plugins install xai
```

## Auto-Enable

The plugin auto-enables when `XAI_API_KEY` or `GROK_API_KEY` is present:

```bash
export XAI_API_KEY=xai-...
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `XAI_API_KEY` | Yes* | xAI API key for Grok model access from [console.x.ai](https://console.x.ai) |
| `GROK_API_KEY` | Yes* | Alias that also triggers auto-enable |
| `X_API_KEY` | No | X (formerly Twitter) API key for OAuth 1.0a integration |
| `XAI_BASE_URL` | No | Custom base URL for the xAI API |
| `XAI_MODEL` | No | Override the Grok model for text generation (e.g., `grok-3`, `grok-3-mini`) |
| `XAI_SMALL_MODEL` | No | Override the small model identifier |
| `XAI_EMBEDDING_MODEL` | No | Override the embedding model identifier |
| `X_DRY_RUN` | No | When true, all X actions are simulated |
| `X_AUTH_MODE` | No | X auth mode: `env` (API keys), `oauth` (OAuth2 PKCE), or `bearer` |
| `X_ENABLE_POST` | No | Enable autonomous posting on X |
| `X_ENABLE_REPLIES` | No | Enable reply handling on X |
| `X_ENABLE_ACTIONS` | No | Enable timeline actions (like, repost) on X |
| `X_MAX_POST_LENGTH` | No | Maximum post length (up to 4000 for premium) |

\* Either `XAI_API_KEY` or `GROK_API_KEY` activates the plugin. Additional `X_*` variables control the bundled X/Twitter integration.

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "xai",
        "model": "grok-3"
      }
    }
  }
}
```

## Supported Models

| Model | Context | Best For |
|-------|---------|---------|
| `grok-3` | 131k | Most capable, complex reasoning |
| `grok-3-mini` | 131k | Fast reasoning with thinking mode |
| `grok-2` | 131k | General-purpose |
| `grok-2-vision` | 32k | Image understanding |

## Features

- Streaming responses
- Tool use / function calling
- Vision input (Grok 2 Vision)
- Real-time knowledge from X/Twitter
- Compatible with OpenAI SDK format
- Structured JSON output

## Related

- [OpenAI Plugin](/plugin-registry/llm/openai) — GPT-4o models
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Route between xAI and other providers
- [Model Providers](/runtime/models) — Compare all providers
