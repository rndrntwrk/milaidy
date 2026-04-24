---
title: Nextcloud Talk Connector
sidebarTitle: Nextcloud Talk
description: Connect your agent to Nextcloud Talk using the @elizaos/plugin-nextcloud-talk package.
---

Connect your agent to Nextcloud Talk for self-hosted collaboration messaging.

## Overview

The Nextcloud Talk connector is an elizaOS plugin that bridges your agent to Nextcloud Talk rooms. It supports DM and group conversations on self-hosted Nextcloud instances. This connector is available from the plugin registry.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-nextcloud-talk` |
| Config key | `connectors.nextcloud-talk` |
| Install | `milady plugins install nextcloud-talk` |

## Setup

### 1. Configure Your Nextcloud Instance

1. Ensure Nextcloud Talk is installed and enabled on your Nextcloud instance
2. Create a bot user or use an existing account for the agent
3. Note the Nextcloud server URL and bot credentials

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

Set credentials via environment variables:

```bash
export NEXTCLOUD_URL=https://your-nextcloud-instance.example.com
export NEXTCLOUD_BOT_SECRET=YOUR_BOT_SECRET
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTCLOUD_URL` | Yes | Nextcloud server URL |
| `NEXTCLOUD_BOT_SECRET` | Yes | Bot secret for authentication |
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

## Related

- [Nextcloud Talk Plugin Reference](/plugin-registry/platform/nextcloud-talk)
- [Connectors overview](/guides/connectors#nextcloud-talk)
