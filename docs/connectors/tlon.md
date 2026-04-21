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
| Category | Auto-enabled connector |

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

| Variable | Description |
|----------|-------------|
| `TLON_SHIP` | Urbit ship name |
| `TLON_CODE` | Ship access code |
| `TLON_URL` | Ship URL |
| `TLON_ENABLED` | Set to `true` to enable |
| `TLON_DM_ALLOWLIST` | Comma-separated list of allowed DM senders |
| `TLON_GROUP_CHANNELS` | Comma-separated list of group channels to join |
| `TLON_AUTO_DISCOVER_CHANNELS` | Auto-discover and join available channels |

## Features

- Urbit-based chat and social interactions
- Ship-to-ship messaging
- Group chat participation

## Related

- [Connectors overview](/guides/connectors#tlon)
