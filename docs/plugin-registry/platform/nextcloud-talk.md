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

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  }
}
```

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
