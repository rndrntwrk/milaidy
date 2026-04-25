---
title: BlueBubbles Connector
sidebarTitle: BlueBubbles
description: Connect your agent to iMessage via a local BlueBubbles server using the @elizaos/plugin-bluebubbles package.
---

Connect your agent to iMessage through a self-hosted BlueBubbles server.

## Overview

The BlueBubbles connector is an elizaOS plugin that bridges your agent to iMessage by communicating with a local [BlueBubbles](https://bluebubbles.app/) server running on macOS. This is an alternative to the direct iMessage connector that does not require the agent to run on macOS itself.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluebubbles` |
| Config key | `connectors.bluebubbles` |
| Install | `milady plugins install bluebubbles` |

## Setup Requirements

- A macOS machine running [BlueBubbles Server](https://bluebubbles.app/)
- The BlueBubbles server password
- Network access from the agent to the BlueBubbles server URL

## Configuration

```json
{
  "connectors": {
    "bluebubbles": {
      "enabled": true,
      "serverUrl": "http://localhost:1234",
      "password": "YOUR_BLUEBUBBLES_PASSWORD"
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BLUEBUBBLES_PASSWORD` | Yes | BlueBubbles server password |
| `BLUEBUBBLES_SERVER_URL` | No | BlueBubbles server URL |
| `BLUEBUBBLES_ENABLED` | No | Enable or disable the connector |
| `BLUEBUBBLES_DM_POLICY` | No | DM policy (`allow`, `deny`, `allowlist`) |
| `BLUEBUBBLES_ALLOW_FROM` | No | Comma-separated allowed user list |
| `BLUEBUBBLES_GROUP_POLICY` | No | Group message policy (`allow`, `deny`) |
| `BLUEBUBBLES_GROUP_ALLOW_FROM` | No | Comma-separated allowed group list |
| `BLUEBUBBLES_WEBHOOK_PATH` | No | Webhook path for receiving messages |
| `BLUEBUBBLES_SEND_READ_RECEIPTS` | No | Send read receipts (`true`/`false`) |

## Features

- iMessage send and receive via BlueBubbles server
- DM and group chat support
- Read receipt support
- Webhook-based inbound message handling
- DM and group access policies

## Related

- [iMessage Connector](/connectors/imessage) — Direct iMessage integration (macOS only)
- [Connectors overview](/guides/connectors)
