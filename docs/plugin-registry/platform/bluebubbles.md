---
title: "BlueBubbles Plugin"
sidebarTitle: "BlueBubbles"
description: "BlueBubbles connector for sending and receiving iMessage through a local BlueBubbles server."
---

The BlueBubbles plugin connects Milady agents to iMessage via a self-hosted [BlueBubbles](https://bluebubbles.app) server on macOS, enabling DM and group messaging through a REST API and webhook-based approach.

**Package:** `@elizaos/plugin-bluebubbles`

## Installation

```bash
milady plugins install bluebubbles
```

## Setup

1. Install the [BlueBubbles Server](https://bluebubbles.app) on a Mac with iMessage configured
2. Set a server password in BlueBubbles Server settings
3. Configure the connector in `milady.json`

```json
{
  "connectors": {
    "bluebubbles": {
      "enabled": true,
      "apiKey": "YOUR_BLUEBUBBLES_PASSWORD"
    }
  }
}
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | BlueBubbles server password |
| `enabled` | No | Set `false` to disable (default: auto-enabled when `apiKey` is set) |

## Environment Variables

```bash
export BLUEBUBBLES_PASSWORD=YOUR_BLUEBUBBLES_PASSWORD
export BLUEBUBBLES_SERVER_URL=http://localhost:1234
```

## Features

- **iMessage and SMS** — Send and receive iMessage and SMS messages
- **DMs** — One-to-one conversations
- **Group chats** — Group message support
- **Read receipts** — Configurable read receipt sending
- **Webhook-based** — Reliable inbound message handling via webhooks
- **Self-hosted** — All data stays on your Mac

## Auto-Enable

The plugin auto-enables when the `connectors.bluebubbles` block contains an `apiKey`, `token`, or `botToken`.

## Related

- [BlueBubbles connector reference](/connectors/bluebubbles) — Full configuration reference
- [iMessage connector](/connectors/imessage) — Direct iMessage connector
- [Connectors Guide](/guides/connectors) — General connector documentation
