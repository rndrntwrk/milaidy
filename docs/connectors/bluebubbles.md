---
title: BlueBubbles Connector
sidebarTitle: BlueBubbles
description: Connect your agent to iMessage via a local BlueBubbles server using the @elizaos/plugin-bluebubbles package.
---

Connect your agent to iMessage through a self-hosted BlueBubbles server.

## Overview

The BlueBubbles connector is an external elizaOS plugin that bridges your agent to iMessage via a self-hosted BlueBubbles server. Unlike the native iMessage connector (which reads the local Messages database directly), BlueBubbles works over HTTP and can be accessed from any machine on the same network. It requires a BlueBubbles server running on a Mac with Messages signed in. It is auto-enabled by the runtime when a valid password or server URL is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluebubbles` |
| Config key | `connectors.bluebubbles` |
| Install | `milady plugins install bluebubbles` |
| Activation trigger | Once installed, activates when `password` or `serverUrl` is truthy in connector config, or `accounts` with at least one enabled entry |

Once installed, the connector activates when `password` or `serverUrl` is set in connector config, or `accounts` has at least one enabled entry.

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
| `BLUEBUBBLES_PASSWORD` | Yes | Server password |
| `BLUEBUBBLES_SERVER_URL` | No | BlueBubbles server URL |
| `BLUEBUBBLES_ENABLED` | No | Enable or disable the connector |
| `BLUEBUBBLES_DM_POLICY` | No | DM policy (e.g., `allow`, `deny`, `allowlist`) |
| `BLUEBUBBLES_ALLOW_FROM` | No | Comma-separated allowed user list |
| `BLUEBUBBLES_GROUP_POLICY` | No | Group message policy (e.g., `allow`, `deny`) |
| `BLUEBUBBLES_GROUP_ALLOW_FROM` | No | Comma-separated allowed group list |
| `BLUEBUBBLES_WEBHOOK_PATH` | No | Webhook endpoint path |
| `BLUEBUBBLES_SEND_READ_RECEIPTS` | No | Send read receipts for incoming messages |

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
3. Install the plugin: `milady plugins install bluebubbles`
4. Add the server URL and password to `connectors.bluebubbles` in your config.
5. Start your agent — the BlueBubbles connector will load and connect.

## Features

- iMessage send and receive via BlueBubbles server
- DM and group chat support
- Read receipt support
- Webhook-based inbound message handling
- DM and group access policies

## Related

- [iMessage Connector](/connectors/imessage) — Direct iMessage integration (macOS only)
- [Connectors overview](/guides/connectors)
