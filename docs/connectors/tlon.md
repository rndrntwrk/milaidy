---
title: Tlon Connector
sidebarTitle: Tlon
description: Connect your agent to Tlon/Urbit using the @elizaos/plugin-tlon package.
---

Connect your agent to the Urbit network via Tlon for ship-to-ship messaging.

## Overview

The Tlon connector is an elizaOS plugin that bridges your agent to the Urbit network. It supports ship-to-ship messaging and group chat participation. This connector is **auto-enabled** when its configuration is present in `milady.json`.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-tlon` |
| Config key | `connectors.tlon` |
| Install | `milady plugins install @elizaos/plugin-tlon` |

## Setup Requirements

- Tlon ship credentials (Urbit ship name and access code)

## Configuration

```json
{
  "connectors": {
    "tlon": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TLON_SHIP` | No | Urbit ship name (e.g., `~zod`) |
| `TLON_CODE` | No | Ship access/authentication code |
| `TLON_URL` | No | Ship URL (e.g., `http://localhost:8080`) |
| `TLON_ENABLED` | No | Set to `true` to enable |
| `TLON_DM_ALLOWLIST` | No | Comma-separated allowed user list for DMs |
| `TLON_GROUP_CHANNELS` | No | Comma-separated list of group channel identifiers |
| `TLON_AUTO_DISCOVER_CHANNELS` | No | Comma-separated list of channels to auto-discover |

## Features

- Urbit-based chat and social interactions
- Ship-to-ship messaging
- Group chat participation
- DM allowlisting
- Auto-discovery of channels

## Related

- [Connectors overview](/guides/connectors#tlon)
