# Nextcloud Talk Connector

Connect your agent to Nextcloud Talk for self-hosted collaboration messaging using the `@elizaos/plugin-nextcloud-talk` package.

## Prerequisites

- A Nextcloud server with Talk enabled
- Bot secret or credentials for authentication

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `NEXTCLOUD_URL` | No | Nextcloud server URL |
| `NEXTCLOUD_BOT_SECRET` | No | Bot secret for authentication |
| `NEXTCLOUD_ENABLED` | No | Enable or disable the connector |
| `NEXTCLOUD_WEBHOOK_HOST` | No | Host address for webhook listener |
| `NEXTCLOUD_WEBHOOK_PORT` | No | Port for webhook listener |
| `NEXTCLOUD_WEBHOOK_PATH` | No | Webhook endpoint path |
| `NEXTCLOUD_WEBHOOK_PUBLIC_URL` | No | Public-facing webhook URL |
| `NEXTCLOUD_ALLOWED_ROOMS` | No | Comma-separated list of allowed room IDs |

Install the plugin from the registry:

```bash
milady plugins install nextcloud-talk
```

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  }
}
```

## Setup

1. Ensure your Nextcloud server has Talk enabled.
2. Create a bot or obtain credentials for the Nextcloud instance.
3. Install the plugin: `milady plugins install nextcloud-talk`.
4. Set the `NEXTCLOUD_URL` and `NEXTCLOUD_BOT_SECRET` environment variables or configure them inline.
5. Start your agent.

## Features

- Room-based messaging
- DM and group conversation support
- Self-hosted collaboration platform integration
- Webhook-based message delivery
- Room allowlisting

## Related

- [Connectors overview](/guides/connectors#nextcloud-talk)
