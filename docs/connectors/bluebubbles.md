---
title: BlueBubbles Connector
sidebarTitle: BlueBubbles
description: Connect your agent to iMessage via a local BlueBubbles server using the @elizaos/plugin-bluebubbles package.
---

Connect your agent to iMessage through a self-hosted BlueBubbles server for DM and group messaging on macOS.

## Overview

The BlueBubbles connector is an external elizaOS plugin that bridges your agent to iMessage via [BlueBubbles](https://bluebubbles.app), a self-hosted iMessage bridge for macOS. Unlike the direct iMessage connector, BlueBubbles provides a REST API and webhook-based approach that works reliably across restarts and offers group chat support.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluebubbles` |
| Config key | `connectors.bluebubbles` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Setup

### 1. Install BlueBubbles Server

Install the [BlueBubbles Server](https://bluebubbles.app) on a Mac with iMessage configured. The server acts as a bridge between your iMessage account and your agent.

### 2. Get the Server Password

In BlueBubbles Server settings, find or set the server password. This is used to authenticate API requests.

### 3. Configure Milady

Add the connector configuration to `milady.json`:

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

Or via environment variables:

```bash
export BLUEBUBBLES_PASSWORD=YOUR_BLUEBUBBLES_PASSWORD
export BLUEBUBBLES_SERVER_URL=http://localhost:1234
```

## Disabling

To explicitly disable the connector even when credentials are present:

```json
{
  "connectors": {
    "bluebubbles": {
      "apiKey": "YOUR_BLUEBUBBLES_PASSWORD",
      "enabled": false
    }
  }
}
```

## Environment Variables

| Env Variable | Description |
|---|---|
| `BLUEBUBBLES_PASSWORD` | Server password for authentication |
| `BLUEBUBBLES_SERVER_URL` | BlueBubbles server URL (default: `http://localhost:1234`) |
| `BLUEBUBBLES_ENABLED` | Enable or disable the connector |
| `BLUEBUBBLES_DM_POLICY` | DM access policy (`pairing`, `open`, `allowlist`, `disabled`) |
| `BLUEBUBBLES_ALLOW_FROM` | Comma-separated allowed user IDs |
| `BLUEBUBBLES_GROUP_POLICY` | Group message policy |
| `BLUEBUBBLES_GROUP_ALLOW_FROM` | Comma-separated allowed group IDs |
| `BLUEBUBBLES_WEBHOOK_PATH` | Webhook endpoint path for incoming messages |
| `BLUEBUBBLES_SEND_READ_RECEIPTS` | Send read receipts for received messages |

## Full Configuration Reference

All fields are defined under `connectors.bluebubbles` in `milady.json`.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | — | Explicitly enable/disable |
| `apiKey` | string | — | BlueBubbles server password |

### Access Policies

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dmPolicy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group message policy |

### Features

- iMessage and SMS messaging via BlueBubbles bridge
- DM and group chat support
- Webhook-based inbound message handling
- Read receipt support
- Self-hosted — all data stays on your Mac

## Related

- [iMessage connector](/connectors/imessage) — Direct iMessage connector (macOS CLI)
- [Blooio connector](/connectors/blooio) — Cloud-based iMessage bridge
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
