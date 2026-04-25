# Twitch Connector

Connect your agent to Twitch for live chat monitoring, channel events, and audience interactions using the `@elizaos/plugin-twitch` package.

## Prerequisites

- A Twitch application registered at the [Twitch Developer Console](https://dev.twitch.tv/console/apps)
- A Client ID and OAuth access token with chat scopes

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `TWITCH_ACCESS_TOKEN` | Yes | Twitch OAuth access token with chat scopes |
| `TWITCH_CLIENT_ID` | No | Twitch application Client ID |
| `TWITCH_CLIENT_SECRET` | No | Twitch client secret |
| `TWITCH_REFRESH_TOKEN` | No | Refresh token for automatic token renewal |
| `TWITCH_USERNAME` | No | Twitch username for the bot |
| `TWITCH_CHANNEL` | No | Primary channel name to join |
| `TWITCH_CHANNELS` | No | Comma-separated list of additional channel names to join |
| `TWITCH_ALLOWED_ROLES` | No | Comma-separated list of allowed roles |
| `TWITCH_REQUIRE_MENTION` | No | Only respond when mentioned |

The connector auto-enables when `accessToken`, `clientId`, or `enabled: true` is set in the connector config.

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "twitch": {
      "clientId": "YOUR_CLIENT_ID",
      "accessToken": "YOUR_ACCESS_TOKEN"
    }
  }
}
```

To disable:

```json
{
  "connectors": {
    "twitch": {
      "clientId": "YOUR_CLIENT_ID",
      "accessToken": "YOUR_ACCESS_TOKEN",
      "enabled": false
    }
  }
}
```

## Setup

1. Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and create a new application.
2. Note the **Client ID** and generate an **Access Token** with the required chat scopes.
3. Optionally generate a **Client Secret** and **Refresh Token** for automatic token renewal.
4. Add the credentials to `connectors.twitch` in your config or set the environment variables.
5. Start your agent -- the Twitch connector will auto-enable.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWITCH_ACCESS_TOKEN` | Yes | Twitch OAuth access token with chat scopes |
| `TWITCH_CLIENT_ID` | No | Twitch application Client ID |
| `TWITCH_CLIENT_SECRET` | No | Twitch client secret |
| `TWITCH_REFRESH_TOKEN` | No | Refresh token for automatic token renewal |
| `TWITCH_USERNAME` | No | Twitch username for the bot |
| `TWITCH_CHANNEL` | No | Primary channel name to join |
| `TWITCH_CHANNELS` | No | Comma-separated additional channel names |
| `TWITCH_ALLOWED_ROLES` | No | Comma-separated allowed roles |
| `TWITCH_REQUIRE_MENTION` | No | Only respond when mentioned |

## Setup Steps

1. Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and create a new application
2. Note the **Client ID** and generate an **Access Token** with the required chat scopes
3. Add the credentials to `connectors.twitch` in your config or set the environment variables
4. Start your agent — the Twitch connector will auto-enable

## Full Configuration Reference

All fields are defined under `connectors.twitch` in `milady.json`.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `clientId` | string | — | Twitch application Client ID |
| `accessToken` | string | — | OAuth access token with chat scopes |
| `clientSecret` | string | — | Twitch client secret |
| `refreshToken` | string | — | Refresh token for token renewal |
| `username` | string | — | Twitch username for the bot |
| `channel` | string | — | Primary channel name to join |
| `channels` | string[] | — | Additional channel names to join |
| `requireMention` | boolean | — | Only respond when mentioned |
| `allowedRoles` | string[] | — | Comma-separated allowed roles |
| `enabled` | boolean | — | Explicitly enable/disable |

### Features

- Live chat monitoring and response
- Channel event handling
- Audience interaction management
- Multi-channel support
- Role-based access filtering
- Mention-based response filtering

## Related

- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
