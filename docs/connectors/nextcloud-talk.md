---
title: Nextcloud Talk Connector
sidebarTitle: Nextcloud Talk
description: Connect your agent to Nextcloud Talk using the @elizaos/plugin-nextcloud-talk package.
---

Connect your agent to Nextcloud Talk for self-hosted collaboration messaging.

## Overview

The Nextcloud Talk connector is an elizaOS plugin that bridges your agent to Nextcloud Talk rooms. It supports DM and group conversations on self-hosted Nextcloud instances. This connector is available from the plugin registry and must be installed before use.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-nextcloud-talk` |
| Config key | `connectors.nextcloud-talk` |
| Install | `milady plugins install nextcloud-talk` |

## Setup Requirements

- A Nextcloud instance with Talk enabled
- A bot secret for webhook authentication (generated in Nextcloud admin)
- A publicly reachable URL for the webhook endpoint (or a tunnel like ngrok for local development)

## Configuration

In `~/.milady/milady.json`:

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true,
      "url": "https://your-nextcloud.example.com",
      "botSecret": "YOUR_BOT_SECRET",
      "webhookPath": "/nextcloud-talk",
      "allowedRooms": "room1,room2"
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
| `NEXTCLOUD_ALLOWED_ROOMS` | No | Comma-separated list of allowed room/conversation IDs |
| `NEXTCLOUD_WEBHOOK_PUBLIC_URL` | No | Public-facing webhook URL |

## Features

- Room-based messaging with Talk conversations
- DM and group conversation support
- Webhook-based message delivery
- Room allowlisting for scoped participation
- Self-hosted collaboration platform integration

## Related

- [Connectors overview](/guides/connectors#nextcloud-talk)
- [Configuration reference](/configuration)
