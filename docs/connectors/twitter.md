---
title: Twitter/X Connector
sidebarTitle: Twitter/X
description: The @elizaos/plugin-twitter package is not currently available in the Milady plugin registry.
---

<Warning>
**Not currently available.** The `@elizaos/plugin-twitter` package is not present in the Milady plugin registry. The documentation below is retained for reference in case the plugin is restored in a future release. Do not attempt to configure this connector — it will not load.
</Warning>

> **Registry status:** This connector is referenced in the runtime auto-enable map but is not included in the `plugins.json` registry. You may need to install it manually with `npm install @elizaos/plugin-twitter` before it can be loaded.

## Overview

The Twitter connector was an external elizaOS plugin that bridged your agent to Twitter/X.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-twitter` (upstream, not bundled) |
| Config key | `connectors.twitter` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Minimal Configuration

In `~/.milady/milady.json`:

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

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.twitter` in your config. If any of the fields `botToken`, `token`, or `apiKey` is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-twitter`.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Environment Variables

Unlike Discord, Telegram, and Slack, the Twitter connector does **not** inject secrets into `process.env` via the runtime's `CHANNEL_ENV_MAP`. Twitter credentials are read directly from the `connectors.twitter` config object by the plugin.

## Full Configuration Reference

All fields are nested under `connectors.twitter` in `milady.json`.

Note: Twitter does **not** support multi-account configuration or the `accounts` array pattern used by some other connectors. Only a single Twitter account can be configured per agent.

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

- [Twitter plugin reference](/plugin-registry/platform/twitter)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
