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
| Install | `milady plugins install @elizaos/plugin-bluebubbles` |
| Auto-enable trigger | Once installed, auto-enables when `password` or `serverUrl` is set in connector config |

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

| Variable | Source | Description |
|----------|--------|-------------|
| `BLUEBUBBLES_SERVER_URL` | `serverUrl` | BlueBubbles server URL |
| `BLUEBUBBLES_PASSWORD` | `password` | Server password (required) |

## Full Configuration Reference

All fields are defined under `connectors.bluebubbles` in `milady.json`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `serverUrl` | string | — | BlueBubbles server URL (required) |
| `password` | string | — | Server password (required) |
| `enabled` | boolean | — | Explicitly enable/disable |
| `dmPolicy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy |
| `allowFrom` | string[] | — | User IDs allowed to DM |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group message policy |
| `groupAllowFrom` | string[] | — | Allowed group IDs |
| `webhookPath` | string | — | Webhook path for inbound messages |
| `sendReadReceipts` | boolean | — | Send read receipts for incoming messages |

## Setup Steps

1. Install [BlueBubbles](https://bluebubbles.app) on a Mac with Messages signed in.
2. Start the BlueBubbles server and note the server URL and password.
3. Install the plugin: `milady plugins install @elizaos/plugin-bluebubbles`
4. Add the server URL and password to `connectors.bluebubbles` in your config.
5. Start your agent — the BlueBubbles connector will auto-enable from config.

## Features

- iMessage send and receive via BlueBubbles server
- DM and group chat support
- Read receipt support
- Webhook-based inbound message handling
- DM and group access policies

## Related

- [iMessage Connector](/connectors/imessage) — Direct iMessage integration (macOS only)
- [Connectors overview](/guides/connectors)
