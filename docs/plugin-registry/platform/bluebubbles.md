---
title: "BlueBubbles Plugin"
sidebarTitle: "BlueBubbles"
description: "BlueBubbles connector for Milady — iMessage integration via a local BlueBubbles server."
---

The BlueBubbles plugin connects Milady agents to iMessage through a self-hosted [BlueBubbles](https://bluebubbles.app) server running on macOS.

**Package:** `@elizaos/plugin-bluebubbles`

## Installation

```bash
milady plugins install bluebubbles
```

## Setup

### 1. Install BlueBubbles Server

Install [BlueBubbles](https://bluebubbles.app) on a Mac with Messages signed in. Start the server and note the URL and password from the BlueBubbles dashboard.

### 2. Configure Milady

```json
{
  "connectors": {
    "bluebubbles": {
      "serverUrl": "http://192.168.1.10:1234",
      "password": "your-bluebubbles-password"
    }
  }
}
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BLUEBUBBLES_SERVER_URL` | Yes | BlueBubbles server URL |
| `BLUEBUBBLES_PASSWORD` | Yes | Server password |
| `BLUEBUBBLES_ENABLED` | No | Enable or disable the connector |
| `BLUEBUBBLES_DM_POLICY` | No | DM policy (e.g., allow, deny, allowlist) |
| `BLUEBUBBLES_ALLOW_FROM` | No | Comma-separated allowed user list |
| `BLUEBUBBLES_GROUP_POLICY` | No | Group message policy |
| `BLUEBUBBLES_WEBHOOK_PATH` | No | Webhook endpoint path |
| `BLUEBUBBLES_GROUP_ALLOW_FROM` | No | Comma-separated allowed group list |
| `BLUEBUBBLES_SEND_READ_RECEIPTS` | No | Send read receipts for received messages |

## Features

- Send and receive iMessage via BlueBubbles HTTP API
- DM and group chat support
- Read receipts
- Webhook-based inbound messages
- Network-accessible (not limited to the Mac running Messages)

## Related

- [BlueBubbles Connector Setup](/connectors/bluebubbles) — Full configuration reference
- [iMessage Plugin](/plugin-registry/platform/imessage) — Native iMessage connector
- [Blooio Plugin](/plugin-registry/platform/blooio) — iMessage/SMS via Blooio cloud
