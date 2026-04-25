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
| Install | `milady plugins install @elizaos/plugin-nextcloud-talk` |

## Setup Requirements

- Nextcloud server URL
- Nextcloud Talk bot secret (from Nextcloud admin settings)

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
| `NEXTCLOUD_URL` | Yes | Nextcloud server URL |
| `NEXTCLOUD_BOT_SECRET` | Yes | Bot secret for authentication |
| `NEXTCLOUD_WEBHOOK_HOST` | No | Host address for webhook listener |
| `NEXTCLOUD_WEBHOOK_PORT` | No | Port for webhook listener |
| `NEXTCLOUD_WEBHOOK_PATH` | No | Webhook endpoint path |
| `NEXTCLOUD_WEBHOOK_PUBLIC_URL` | No | Public-facing webhook URL |
| `NEXTCLOUD_ALLOWED_ROOMS` | No | Comma-separated list of allowed room IDs |

## Features

- Room-based messaging with Talk conversations
- DM and group conversation support
- Webhook-based message delivery
- Room allowlisting for scoped participation
- Self-hosted collaboration platform integration
- Webhook-based event handling
- Room allowlisting

## Related

- [Connectors overview](/guides/connectors#nextcloud-talk)
- [Configuration reference](/configuration)
