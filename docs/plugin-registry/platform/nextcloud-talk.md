---
title: "Nextcloud Talk Plugin"
sidebarTitle: "Nextcloud Talk"
description: "Nextcloud Talk connector for Milady — bot integration with Nextcloud Talk chat."
---

The Nextcloud Talk plugin connects Milady agents to Nextcloud Talk, enabling message handling in Nextcloud Talk conversations.

**Package:** `@elizaos/plugin-nextcloud-talk`

## Installation

```bash
milady plugins install nextcloud-talk
```

## Setup

### 1. Configure Your Nextcloud Instance

1. Ensure Nextcloud Talk is installed and enabled on your Nextcloud instance
2. Create a bot user or use an existing account for the agent
3. Note the Nextcloud server URL and credentials

### 2. Configure Milady

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTCLOUD_URL` | No | Nextcloud server URL |
| `NEXTCLOUD_ENABLED` | No | Enable or disable the plugin |
| `NEXTCLOUD_BOT_SECRET` | No | Bot secret for authentication |
| `NEXTCLOUD_WEBHOOK_HOST` | No | Webhook listener host address |
| `NEXTCLOUD_WEBHOOK_PATH` | No | Webhook endpoint path |
| `NEXTCLOUD_WEBHOOK_PORT` | No | Webhook listener port |
| `NEXTCLOUD_ALLOWED_ROOMS` | No | Comma-separated list of allowed room IDs |
| `NEXTCLOUD_WEBHOOK_PUBLIC_URL` | No | Public-facing webhook URL |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTCLOUD_URL` | Yes | Nextcloud server URL |
| `NEXTCLOUD_ENABLED` | No | Enable or disable the connector |
| `NEXTCLOUD_BOT_SECRET` | No | Bot secret key for webhook verification |
| `NEXTCLOUD_WEBHOOK_HOST` | No | Webhook listener hostname |
| `NEXTCLOUD_WEBHOOK_PATH` | No | Webhook endpoint path |
| `NEXTCLOUD_WEBHOOK_PORT` | No | Webhook listener port |
| `NEXTCLOUD_ALLOWED_ROOMS` | No | Comma-separated allowed room tokens |
| `NEXTCLOUD_WEBHOOK_PUBLIC_URL` | No | Public URL for webhook callbacks |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTCLOUD_URL` | No | Nextcloud server URL |
| `NEXTCLOUD_BOT_SECRET` | No | Bot secret for authentication |
| `NEXTCLOUD_WEBHOOK_HOST` | No | Host address for webhook listener |
| `NEXTCLOUD_WEBHOOK_PORT` | No | Port for webhook listener |
| `NEXTCLOUD_WEBHOOK_PATH` | No | Webhook endpoint path |
| `NEXTCLOUD_WEBHOOK_PUBLIC_URL` | No | Public-facing webhook URL |
| `NEXTCLOUD_ALLOWED_ROOMS` | No | Comma-separated list of allowed room IDs |
| `NEXTCLOUD_ENABLED` | No | Set to `true` to enable |

## Features

- Room-based messaging
- DM and group conversation support
- Self-hosted collaboration platform integration
- Webhook-based message delivery
- Configurable room allowlists

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTCLOUD_URL` | Yes | Base URL of your Nextcloud instance (e.g., `https://cloud.example.com`) |
| `NEXTCLOUD_BOT_SECRET` | Yes | Bot secret for webhook signature verification |
| `NEXTCLOUD_WEBHOOK_HOST` | No | Host address for the webhook listener |
| `NEXTCLOUD_WEBHOOK_PORT` | No | Port for the webhook listener |
| `NEXTCLOUD_WEBHOOK_PATH` | No | Path for the webhook endpoint |
| `NEXTCLOUD_WEBHOOK_PUBLIC_URL` | No | Full public URL for the webhook (overrides host/port/path) |
| `NEXTCLOUD_ALLOWED_ROOMS` | No | Comma-separated list of room/channel IDs to participate in |
| `NEXTCLOUD_ENABLED` | No | Set to `true` to enable (alternative to config) |

## Full Example

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  },
  "env": {
    "NEXTCLOUD_URL": "https://cloud.example.com",
    "NEXTCLOUD_BOT_SECRET": "YOUR_BOT_SECRET",
    "NEXTCLOUD_WEBHOOK_PUBLIC_URL": "https://your-agent.example.com/hooks/nextcloud",
    "NEXTCLOUD_ALLOWED_ROOMS": "general,support"
  }
}
```

## Related

- [Nextcloud Talk Connector](/connectors/nextcloud-talk) — Full connector documentation
- [Connectors Guide](/guides/connectors) — General connector documentation
