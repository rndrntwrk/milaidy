---
title: "BlueBubbles Plugin"
sidebarTitle: "BlueBubbles"
description: "BlueBubbles connector for Milady — iMessage integration through a local BlueBubbles server."
---

The BlueBubbles plugin connects Milady agents to iMessage by communicating with a self-hosted [BlueBubbles](https://bluebubbles.app/) server running on macOS.

**Package:** `@elizaos/plugin-bluebubbles`

## Installation

```bash
milady plugins install bluebubbles
```

## Setup

### 1. Set Up a BlueBubbles Server

1. Install [BlueBubbles Server](https://bluebubbles.app/) on a macOS machine with iMessage configured
2. Start the server and note the server URL and password

### 2. Configure Milady

```json
{
  "connectors": {
    "bluebubbles": {
      "enabled": true,
      "serverUrl": "http://your-mac:1234",
      "password": "YOUR_SERVER_PASSWORD"
    }
  }
}
```

Or via environment variables:

```bash
export BLUEBUBBLES_PASSWORD=YOUR_SERVER_PASSWORD
export BLUEBUBBLES_SERVER_URL=http://your-mac:1234
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `password` | Yes | BlueBubbles server password |
| `serverUrl` | No | Server URL (defaults to localhost) |
| `enabled` | No | Set `false` to disable (default: `true`) |
| `dmPolicy` | No | DM access policy (`allow`, `deny`, `allowlist`) |
| `groupPolicy` | No | Group message policy (`allow`, `deny`) |
| `webhookPath` | No | Webhook path for inbound messages |
| `sendReadReceipts` | No | Send read receipts |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BLUEBUBBLES_PASSWORD` | Yes | BlueBubbles server password |
| `BLUEBUBBLES_SERVER_URL` | No | Server URL |
| `BLUEBUBBLES_ENABLED` | No | Enable or disable the connector |
| `BLUEBUBBLES_DM_POLICY` | No | DM access policy |
| `BLUEBUBBLES_GROUP_POLICY` | No | Group message policy |
| `BLUEBUBBLES_WEBHOOK_PATH` | No | Webhook path |
| `BLUEBUBBLES_SEND_READ_RECEIPTS` | No | Send read receipts |

## Related

- [iMessage Connector](/connectors/imessage) — Direct iMessage integration (macOS only)
- [Connectors Guide](/guides/connectors) — General connector documentation
