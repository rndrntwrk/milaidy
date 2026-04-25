# LINE Connector

Connect your agent to LINE for bot messaging and customer conversations using the `@elizaos/plugin-line` package.

## Prerequisites

- A LINE Messaging API channel created at [developers.line.biz](https://developers.line.biz)
- Channel access token and channel secret from the LINE Developer Console

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `LINE_CHANNEL_ACCESS_TOKEN` | Yes | Channel access token from LINE Developer Console |
| `LINE_CHANNEL_SECRET` | No | Channel secret for webhook verification |
| `LINE_ENABLED` | No | Enable or disable the connector |
| `LINE_DM_POLICY` | No | DM policy (e.g., `allow`, `deny`, `allowlist`) |
| `LINE_ALLOW_FROM` | No | Comma-separated allowed user list |
| `LINE_GROUP_POLICY` | No | Group message policy (e.g., `allow`, `deny`) |
| `LINE_WEBHOOK_PATH` | No | Webhook endpoint path |

Install the plugin from the registry:

```bash
milady plugins install line
```

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "line": {
      "enabled": true
    }
  }
}
```

## Setup

| Variable | Required | Description |
|----------|----------|-------------|
| `LINE_CHANNEL_ACCESS_TOKEN` | Yes | Channel access token from LINE Developer Console |
| `LINE_CHANNEL_SECRET` | No | Channel secret for webhook verification |
| `LINE_ENABLED` | No | Set to `true` to enable |
| `LINE_DM_POLICY` | No | DM policy (e.g., `allow`, `deny`, `allowlist`) |
| `LINE_ALLOW_FROM` | No | Comma-separated allowed user list |
| `LINE_GROUP_POLICY` | No | Group message policy (e.g., `allow`, `deny`) |
| `LINE_WEBHOOK_PATH` | No | Webhook endpoint path |

## Features

- Bot messaging and customer conversations
- Rich message types (text, sticker, image, video)
- Group chat support
- DM and group message policies
- Webhook-based event handling

## Related

- [Connectors overview](/guides/connectors#line)
