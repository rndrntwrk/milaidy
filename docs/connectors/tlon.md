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

| Variable | Required | Description |
|----------|----------|-------------|
| `TLON_SHIP` | No | Urbit ship/node identifier |
| `TLON_CODE` | No | Ship authentication/access code |
| `TLON_URL` | No | Ship URL |
| `TLON_ENABLED` | No | Enable or disable the plugin |
| `TLON_DM_ALLOWLIST` | No | Comma-separated list of allowed DM user IDs |
| `TLON_GROUP_CHANNELS` | No | Comma-separated list of group channel IDs |
| `TLON_AUTO_DISCOVER_CHANNELS` | No | Automatically discover and join channels (`true`/`false`) |

## Features

- Urbit-based chat and social interactions
- Ship-to-ship messaging
- Group chat participation

## Related

- [Connectors overview](/guides/connectors#tlon)
