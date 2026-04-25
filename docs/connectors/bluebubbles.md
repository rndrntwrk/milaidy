---
title: BlueBubbles Connector
sidebarTitle: BlueBubbles
description: Connect your agent to iMessage through a local BlueBubbles server using the @elizaos/plugin-bluebubbles package.
---

Connect your agent to iMessage and SMS messaging through a self-hosted BlueBubbles server.

## Overview

The BlueBubbles connector is an elizaOS plugin that bridges your agent to iMessage via a local [BlueBubbles](https://bluebubbles.app/) server running on macOS. Unlike the direct iMessage connector, BlueBubbles provides a REST API and webhook interface, making it suitable for remote or headless setups. This connector is **auto-enabled** when its configuration is present in `milady.json`.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluebubbles` |
| Config key | `connectors.bluebubbles` |
| Category | Auto-enabled connector |

## Setup Requirements

- A Mac running [BlueBubbles Server](https://bluebubbles.app/) with iMessage configured
- BlueBubbles server password
- Network access to the BlueBubbles server from the machine running Milady

## Configuration

```json
{
  "connectors": {
    "bluebubbles": {
      "enabled": true,
      "serverUrl": "http://localhost:1234",
      "password": "YOUR_BLUEBUBBLES_PASSWORD",
      "dmPolicy": "pairing"
    }
  }
}
```

## Environment Variables

| Variable | Required | Sensitive | Description |
|----------|----------|-----------|-------------|
| `BLUEBUBBLES_SERVER_URL` | No | No | BlueBubbles server URL (e.g., `http://localhost:1234`) |
| `BLUEBUBBLES_PASSWORD` | Yes | Yes | Server password |
| `BLUEBUBBLES_ENABLED` | No | No | Enable or disable the connector |
| `BLUEBUBBLES_DM_POLICY` | No | No | DM policy: `pairing`, `open`, or `closed` |
| `BLUEBUBBLES_ALLOW_FROM` | No | No | Comma-separated list of allowed sender IDs |
| `BLUEBUBBLES_GROUP_POLICY` | No | No | Group message policy: `allowlist` or `open` |
| `BLUEBUBBLES_GROUP_ALLOW_FROM` | No | No | Comma-separated list of allowed group IDs |
| `BLUEBUBBLES_WEBHOOK_PATH` | No | No | Custom webhook path for inbound messages |
| `BLUEBUBBLES_SEND_READ_RECEIPTS` | No | No | Send read receipts for received messages |

## Features

- iMessage and SMS messaging via BlueBubbles bridge
- DM and group chat support
- Webhook-based inbound message handling
- Read receipt support
- DM and group access policies

## Related

- [iMessage Connector](/connectors/imessage) (direct macOS CLI approach)
- [Connectors overview](/guides/connectors)
