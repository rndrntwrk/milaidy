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

All fields can also be set via environment variables:

| Variable | Description |
|----------|-------------|
| `NEXTCLOUD_URL` | Nextcloud server URL |
| `NEXTCLOUD_ENABLED` | Enable or disable the connector |
| `NEXTCLOUD_BOT_SECRET` | Bot secret for webhook authentication (sensitive) |
| `NEXTCLOUD_WEBHOOK_HOST` | Webhook listener host address |
| `NEXTCLOUD_WEBHOOK_PATH` | Webhook endpoint path |
| `NEXTCLOUD_WEBHOOK_PORT` | Webhook listener port |
| `NEXTCLOUD_ALLOWED_ROOMS` | Comma-separated list of room names to monitor |
| `NEXTCLOUD_WEBHOOK_PUBLIC_URL` | Public-facing URL for the webhook endpoint |

## Features

- Room-based messaging
- DM and group conversation support
- Webhook-based message delivery
- Room allowlisting for scoped participation
- Self-hosted collaboration platform integration

## Related

- [Connectors overview](/guides/connectors#nextcloud-talk)
- [Configuration reference](/configuration)
