---
title: BlueBubbles Connector
sidebarTitle: BlueBubbles
description: Connect your agent to iMessage via a local BlueBubbles server using the @elizaos/plugin-bluebubbles package.
---

Connect your agent to iMessage messaging through a self-hosted BlueBubbles server.

## Overview

The BlueBubbles connector bridges your agent to iMessage via a local [BlueBubbles](https://bluebubbles.app) server running on macOS. Unlike the direct iMessage connector (which uses a CLI tool) or Blooio (which uses a cloud proxy), BlueBubbles runs its own local server with a REST API and webhook support. It is a bundled Milady dependency.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluebubbles` |
| Config key | `connectors.bluebubbles` |
| Auto-enable trigger | `BLUEBUBBLES_PASSWORD` env var or connector config present |

## Prerequisites

1. A Mac with iMessage configured
2. [BlueBubbles Server](https://bluebubbles.app) installed and running on the Mac
3. The server password from BlueBubbles settings

## Minimal Configuration

In `~/.milady/milady.json`:

```json
{
  "connectors": {
    "bluebubbles": {
      "enabled": true
    }
  },
  "env": {
    "BLUEBUBBLES_PASSWORD": "your-bluebubbles-server-password",
    "BLUEBUBBLES_SERVER_URL": "http://localhost:1234"
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BLUEBUBBLES_ENABLED` | No | Enable or disable the connector |
| `BLUEBUBBLES_PASSWORD` | **Yes** | BlueBubbles server password |
| `BLUEBUBBLES_SERVER_URL` | No | Server URL (defaults to local) |
| `BLUEBUBBLES_DM_POLICY` | No | DM policy: `allow`, `deny`, or `allowlist` |
| `BLUEBUBBLES_ALLOW_FROM` | No | Comma-separated allowed user list |
| `BLUEBUBBLES_GROUP_POLICY` | No | Group message policy: `allow`, `deny` |
| `BLUEBUBBLES_GROUP_ALLOW_FROM` | No | Comma-separated allowed group list |
| `BLUEBUBBLES_WEBHOOK_PATH` | No | Custom webhook path for inbound messages |
| `BLUEBUBBLES_SEND_READ_RECEIPTS` | No | Send read receipts (`true`/`false`) |

## Features

- iMessage send and receive through BlueBubbles REST API
- Webhook-based inbound message handling
- DM and group chat support with policy controls
- Read receipt support
- Self-hosted — no third-party proxy required

## When to Use BlueBubbles vs Other iMessage Options

| Connector | Approach | Best For |
|-----------|----------|----------|
| **BlueBubbles** | Self-hosted server on Mac | Users who want full local control with a GUI server app |
| **iMessage** (direct) | CLI tool on Mac | Users who prefer a lightweight CLI-only approach |
| **Blooio** | Cloud proxy service | Users who want iMessage without running a Mac server |
