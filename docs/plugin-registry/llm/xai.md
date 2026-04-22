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
| `X_API_KEY` | Yes* | xAI API key from [console.x.ai](https://console.x.ai) (primary `envKey` in `plugins.json`) |
| `XAI_API_KEY` | Yes* | Alias for `X_API_KEY` (also triggers auto-enable via `AUTH_PROVIDER_PLUGINS`) |
| `GROK_API_KEY` | Yes* | Alias (also triggers auto-enable) |
| `XAI_BASE_URL` | No | Custom base URL |
| `XAI_MODEL` | No | Override the default model |
| `XAI_SMALL_MODEL` | No | Small model slot |
| `XAI_EMBEDDING_MODEL` | No | Embedding model slot |
| `X_AUTH_MODE` | No | Auth mode: `api_key` (default) or `oauth` |
| `X_CLIENT_ID` | No | OAuth client ID |
| `X_BEARER_TOKEN` | No | Bearer token for API access |
| `X_API_SECRET` | No | API secret (for OAuth) |
| `X_ACCESS_TOKEN` | No | OAuth access token |
| `X_ACCESS_TOKEN_SECRET` | No | OAuth access token secret |
| `X_REDIRECT_URI` | No | OAuth redirect URI |
| `X_ENABLE_POST` | No | Enable autonomous posting to X |
| `X_ENABLE_REPLIES` | No | Enable reply behavior |
| `X_ENABLE_ACTIONS` | No | Enable X actions |
| `X_MAX_POST_LENGTH` | No | Max post character length |
| `X_DRY_RUN` | No | Test without posting |

\* At least one of `X_API_KEY`, `XAI_API_KEY`, or `GROK_API_KEY` activates the plugin.

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
