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

- A running Nextcloud instance with the Talk app enabled
- A bot secret for webhook authentication (configured in Nextcloud Talk admin settings)
- A publicly reachable URL for the webhook endpoint (so Nextcloud can deliver message events)

## Configuration

In `~/.milady/milady.json`:

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
| `NEXTCLOUD_URL` | Yes | Base URL of your Nextcloud instance (e.g., `https://cloud.example.com`) |
| `NEXTCLOUD_BOT_SECRET` | Yes | Bot secret for webhook signature verification |
| `NEXTCLOUD_WEBHOOK_HOST` | No | Host address for the webhook listener |
| `NEXTCLOUD_WEBHOOK_PORT` | No | Port for the webhook listener |
| `NEXTCLOUD_WEBHOOK_PATH` | No | Path for the webhook endpoint |
| `NEXTCLOUD_WEBHOOK_PUBLIC_URL` | No | Full public URL for the webhook (overrides host/port/path) |
| `NEXTCLOUD_ALLOWED_ROOMS` | No | Comma-separated list of room/channel IDs to participate in |
| `NEXTCLOUD_ENABLED` | No | Set to `true` to enable (alternative to config) |

## Full Configuration Example

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

## Features

- Room-based messaging with Talk conversations
- DM and group conversation support
- Webhook-based message delivery with signature verification
- Room allowlisting for controlling which conversations the agent joins
- Self-hosted — all data stays on your Nextcloud instance

## Related

- [Connectors overview](/guides/connectors#nextcloud-talk)
- [Configuration reference](/configuration)
