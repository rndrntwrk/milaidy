---
title: BlueBubbles Connector
sidebarTitle: BlueBubbles
description: Connect your agent to iMessage and SMS via a local BlueBubbles server using the @elizaos/plugin-bluebubbles package.
---

Connect your agent to iMessage and SMS messaging via a local BlueBubbles server.

## Overview

The BlueBubbles connector bridges your agent to iMessage through a self-hosted [BlueBubbles](https://bluebubbles.app) server running on macOS. Unlike the direct iMessage connector (which requires CLI tools), BlueBubbles exposes a REST API and webhook interface, making it accessible from any machine on your network — not just the Mac running iMessage.

It is auto-enabled by the runtime when a valid `password` is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluebubbles` |
| Config key | `connectors.bluebubbles` |
| Auto-enable trigger | `password` is truthy in connector config |

## Prerequisites

1. A Mac with iMessage signed in
2. [BlueBubbles server](https://bluebubbles.app) installed and running on that Mac
3. The server password and URL reachable from the machine running Milady

## Minimal Configuration

In `~/.milady/milady.json`:

```json
{
  "connectors": {
    "bluebubbles": {
      "password": "YOUR_BLUEBUBBLES_PASSWORD"
    }
  }
}
```

If the BlueBubbles server is not on `localhost`, specify the URL:

```json
{
  "connectors": {
    "bluebubbles": {
      "password": "YOUR_BLUEBUBBLES_PASSWORD",
      "serverUrl": "http://192.168.1.50:1234"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when a password is present:

```json
{
  "connectors": {
    "bluebubbles": {
      "password": "YOUR_BLUEBUBBLES_PASSWORD",
      "enabled": false
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BLUEBUBBLES_PASSWORD` | BlueBubbles server password |
| `BLUEBUBBLES_SERVER_URL` | Server URL (default: local) |
| `BLUEBUBBLES_ENABLED` | Explicitly enable/disable |
| `BLUEBUBBLES_DM_POLICY` | DM policy (`allow`, `deny`, `allowlist`) |
| `BLUEBUBBLES_ALLOW_FROM` | Comma-separated allowed user list |
| `BLUEBUBBLES_GROUP_POLICY` | Group message policy |
| `BLUEBUBBLES_GROUP_ALLOW_FROM` | Comma-separated allowed group list |
| `BLUEBUBBLES_WEBHOOK_PATH` | Custom webhook endpoint path |
| `BLUEBUBBLES_SEND_READ_RECEIPTS` | Send read receipts (`true`/`false`) |

## Full Configuration Reference

All fields are nested under `connectors.bluebubbles` in `milady.json`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `password` | string | — | BlueBubbles server password (required) |
| `serverUrl` | string | — | BlueBubbles server URL |
| `enabled` | boolean | — | Explicitly enable/disable |
| `dmPolicy` | string | `"pairing"` | DM access policy |
| `allowFrom` | string[] | — | Allowed user list for DMs |
| `groupPolicy` | string | `"allowlist"` | Group message policy |
| `groupAllowFrom` | string[] | — | Allowed group list |
| `webhookPath` | string | — | Custom webhook path |
| `sendReadReceipts` | boolean | `false` | Send read receipts |

## Features

- Send and receive iMessages and SMS through a local BlueBubbles server
- Tapback reactions (add and remove)
- Reply to specific messages in threads
- Edit and unsend sent messages (macOS version dependent)
- Send attachments (images, files) with captions
- iMessage effects (balloons, confetti, etc.)
- Group chat participant management
- Read receipt support
- Webhook-based inbound message handling

## BlueBubbles vs iMessage Connector

| | BlueBubbles | iMessage (direct) |
|--|-------------|-------------------|
| **Requires macOS on agent machine** | No (just network access to the BB server) | Yes |
| **Setup complexity** | Install BB server on a Mac, configure password | Install CLI tool, grant Accessibility permissions |
| **Rich actions** | Reactions, edit, unsend, effects, attachments | Basic send/receive |
| **Multi-machine** | Yes (any device on the network) | No (same machine only) |

## Related

- [iMessage connector](/connectors/imessage) — direct iMessage integration (macOS only)
- [Blooio connector](/connectors/blooio) — cloud-based iMessage/SMS bridge
- [Connectors overview](/guides/connectors)
