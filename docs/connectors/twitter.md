---
title: Twitter/X Connector
sidebarTitle: Twitter/X
description: Connect your agent to Twitter/X via the xAI plugin (@elizaos/plugin-xai).
---

> **Registry note:** `@elizaos/plugin-twitter` is not currently listed in the Milady plugin registry (`plugins.json`). The package may be available from npm or a separate elizaOS plugin repository. Verify availability before configuring.

Connect your agent to Twitter/X for social media engagement.

## Overview

Twitter/X integration is bundled with the **xAI provider plugin** (`@elizaos/plugin-xai`). There is no separate `@elizaos/plugin-twitter` — the xAI plugin handles both Grok model access and X platform connectivity. The connector is auto-enabled when X/Twitter OAuth credentials are detected in your connector configuration or environment variables.

## Configuration

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-xai` |
| Config key | `connectors.twitter` |
| Auto-enable trigger | `apiKey`, `token`, or X OAuth env vars (`X_API_KEY`, etc.) |

> **Note:** Twitter credentials are read directly from the `connectors.twitter` config object by the plugin, not from environment variables.

The connector auto-enables when `botToken`, `token`, or `apiKey` is truthy in the connector config and `enabled` is not explicitly `false`.

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "twitter": {
      "apiKey": "your-twitter-api-key"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when a token is present:

```json
{
  "connectors": {
    "twitter": {
      "apiKey": "your-twitter-api-key",
      "enabled": false
    }
  }
}
```

## Setup

The xAI plugin auto-enables when any of the following are set:
- `connectors.twitter.apiKey`, `connectors.twitter.token`, or `connectors.twitter.accessToken` in your config
- `X_API_KEY`, `XAI_API_KEY`, or `GROK_API_KEY` environment variables
- `enabled` is not explicitly `false`

## Environment Variables

The xAI plugin reads Twitter credentials from both environment variables (`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`) and the `connectors.twitter` config object. You can use either approach.

| Variable | Description |
|----------|-------------|
| `X_API_KEY` | Twitter consumer API key |
| `X_API_SECRET` | Twitter consumer API secret |
| `X_ACCESS_TOKEN` | OAuth access token |
| `X_ACCESS_TOKEN_SECRET` | OAuth access token secret |
| `X_AUTH_MODE` | `api_key` (default) or `oauth` |
| `X_ENABLE_POST` | Enable autonomous posting |
| `X_ENABLE_REPLIES` | Enable mention replies |
| `X_ENABLE_ACTIONS` | Enable like/retweet/quote |

## Full Configuration Reference

All fields are nested under `connectors.twitter` in `milady.json`.

Note: Twitter does **not** support multi-account configuration. Only a single Twitter account can be configured per agent.

### Authentication

| Field | Type | Description |
|-------|------|-------------|
| `apiKey` | string | Twitter/X API key (consumer key) |
| `apiSecretKey` | string | API secret key (consumer secret) |
| `accessToken` | string | OAuth access token |
| `accessTokenSecret` | string | OAuth access token secret |
| `enabled` | boolean | Explicitly enable/disable the connector |

### Posting Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `postEnable` | boolean | `true` | Enable automated posting |
| `postImmediately` | boolean | `false` | Post immediately on startup (skip initial delay) |
| `postIntervalMin` | integer > 0 | `90` | Minimum minutes between automated posts |
| `postIntervalMax` | integer > 0 | `180` | Maximum minutes between automated posts |
| `postIntervalVariance` | number 0–1 | `0.1` | Randomization factor applied to the interval |
| `maxTweetLength` | integer > 0 | `4000` | Maximum tweet character length |

The posting interval is calculated as a random value between `postIntervalMin` and `postIntervalMax`, with additional variance applied by the `postIntervalVariance` factor.

### Interaction Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `searchEnable` | boolean | `false` | Enable keyword search monitoring |
| `autoRespondMentions` | boolean | `true` | Automatically respond to @mentions |
| `enableActionProcessing` | boolean | `true` | Process actions (like, retweet, quote) |
| `timelineAlgorithm` | `"weighted"` \| `"latest"` | `"weighted"` | Timeline processing algorithm |
| `pollInterval` | integer > 0 | `120` | Seconds between polling for new mentions/interactions |

### DM Policy

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dmPolicy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy |

### Safety and Testing

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dryRun` | boolean | `false` | When `true`, the agent generates posts but does not actually publish them. Useful for testing |
| `retryLimit` | integer > 0 | `3` | Max retry attempts for failed API calls |
| `configWrites` | boolean | — | Allow config writes from Twitter events |

### Example: Full Configuration

```json
{
  "connectors": {
    "twitter": {
      "apiKey": "your-consumer-key",
      "apiSecretKey": "your-consumer-secret",
      "accessToken": "your-access-token",
      "accessTokenSecret": "your-access-token-secret",
      "postEnable": true,
      "postIntervalMin": 60,
      "postIntervalMax": 120,
      "searchEnable": true,
      "autoRespondMentions": true,
      "timelineAlgorithm": "weighted",
      "dryRun": false
    }
  }
}
```

## Related

- [xAI plugin reference](/plugin-registry/llm/xai)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
