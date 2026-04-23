# Mattermost Connector

Connect your agent to a self-hosted Mattermost server for channel and DM conversations using the `@elizaos/plugin-mattermost` package.

## Prerequisites

- A Mattermost server with bot account support enabled
- A bot token from the Mattermost System Console

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `MATTERMOST_BOT_TOKEN` | Yes | Bot token from Mattermost System Console |
| `MATTERMOST_SERVER_URL` | No | Server URL for the Mattermost instance |
| `MATTERMOST_ENABLED` | No | Enable or disable the connector |
| `MATTERMOST_TEAM_ID` | No | Team/tenant ID to restrict the bot to |
| `MATTERMOST_DM_POLICY` | No | DM policy (e.g., `allow`, `deny`, `allowlist`) |
| `MATTERMOST_GROUP_POLICY` | No | Group message policy (e.g., `allow`, `deny`) |
| `MATTERMOST_ALLOWED_USERS` | No | Comma-separated allowed user list |
| `MATTERMOST_ALLOWED_CHANNELS` | No | Comma-separated allowed channel list |
| `MATTERMOST_REQUIRE_MENTION` | No | Only respond when @mentioned |
| `MATTERMOST_IGNORE_BOT_MESSAGES` | No | Ignore messages from other bots |

The connector auto-enables when `botToken` is truthy in the connector config and `enabled` is not explicitly `false`.

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "mattermost": {
      "botToken": "YOUR_BOT_TOKEN",
      "baseUrl": "https://chat.example.com"
    }
  }
}
```

To disable:

```json
{
  "connectors": {
    "mattermost": {
      "botToken": "YOUR_BOT_TOKEN",
      "baseUrl": "https://chat.example.com",
      "enabled": false
    }
  }
}
```

## Setup

1. In Mattermost System Console, create a bot account and note the bot token.
2. Add the bot token and server URL to `connectors.mattermost` in your config.
3. Start your agent -- the Mattermost connector will auto-enable.

## Features

- Channel and DM messaging
- Mention-based response filtering
- Chat mode selection (`dm-only`, `channel-only`, or `all`)
- Bot message filtering
- Custom command prefix support
- Self-hosted server support

## Related

- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
