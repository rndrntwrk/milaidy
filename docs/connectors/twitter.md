# Twitter/X Connector

Connect your agent to Twitter/X for social media engagement using the `@elizaos/plugin-twitter` package.

> **Status:** The `@elizaos/plugin-twitter` package is not currently available in the plugin registry. This page documents the planned connector interface. Check the [plugin registry](/plugins/registry) for availability updates.

## Overview

The Twitter connector is an external elizaOS plugin that bridges your agent to Twitter/X. When available, it will be auto-enabled by the runtime when a valid token is detected in your connector configuration.

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| API key | Yes | Twitter/X API key (consumer key), set via `connectors.twitter.apiKey` |
| API secret key | Yes | API secret key (consumer secret), set via `connectors.twitter.apiSecretKey` |
| Access token | Yes | OAuth access token, set via `connectors.twitter.accessToken` |
| Access token secret | Yes | OAuth access token secret, set via `connectors.twitter.accessTokenSecret` |

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

1. Apply for a [Twitter Developer account](https://developer.twitter.com/) with API access.
2. Create a project and app in the Twitter Developer Portal.
3. Generate API key, API secret key, access token, and access token secret.
4. Add the credentials to `connectors.twitter` in your config as shown below.
5. Start your agent -- the Twitter connector will auto-enable.

## Features

- Automated posting at configurable intervals
- Mention monitoring and auto-response
- Action processing (like, retweet, quote)
- Keyword search monitoring
- DM policy configuration
- Dry run mode for testing
- Configurable timeline algorithm (weighted or latest)

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

- [Twitter plugin reference](/plugin-registry/platform/twitter)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
