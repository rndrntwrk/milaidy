---
title: Bluesky Connector
sidebarTitle: Bluesky
description: Connect your agent to Bluesky using the @elizaos/plugin-bluesky package.
---

Connect your agent to Bluesky for social posting and engagement on the AT Protocol network.

## Overview

The Bluesky connector is an elizaOS plugin that bridges your agent to Bluesky via the AT Protocol. It supports automated posting, mention monitoring, and reply handling.

Bluesky is an **auto-enabled connector** — it loads automatically when its configuration is present in `milady.json`. No manual plugin install is required.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluesky` |
| Config key | `connectors.bluesky` |
| Category | Auto-enabled connector |

## Setup Requirements

- Bluesky account credentials (handle and app password)
- Generate an app password at [bsky.app/settings/app-passwords](https://bsky.app/settings/app-passwords)

## Configuration

```json
{
  "connectors": {
    "bluesky": {
      "enabled": true,
      "postEnable": true,
      "postIntervalMin": 90,
      "postIntervalMax": 180
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BLUESKY_PASSWORD` | App password (not your main password) |
| `BLUESKY_HANDLE` | Bluesky handle (e.g., `yourname.bsky.social`) |
| `BLUESKY_ENABLED` | Set to `true` to enable |
| `BLUESKY_DRY_RUN` | Set to `true` for testing without posting |
| `BLUESKY_SERVICE` | Bluesky PDS service URL (optional) |
| `BLUESKY_ENABLE_DMS` | Enable DM handling |
| `BLUESKY_ENABLE_POSTING` | Enable automated posting |
| `BLUESKY_POLL_INTERVAL` | Polling interval in ms |
| `BLUESKY_ACTION_INTERVAL` | Action processing interval in ms |
| `BLUESKY_MAX_POST_LENGTH` | Max characters per post |
| `BLUESKY_POST_IMMEDIATELY` | Post immediately on startup |
| `BLUESKY_POST_INTERVAL_MIN` | Min seconds between posts |
| `BLUESKY_POST_INTERVAL_MAX` | Max seconds between posts |
| `BLUESKY_MAX_ACTIONS_PROCESSING` | Max concurrent action processing |
| `BLUESKY_ENABLE_ACTION_PROCESSING` | Enable action processing |

## Features

- Post creation at configurable intervals
- Mention and reply monitoring
- Dry run mode for testing
- AT Protocol-based decentralized social networking

## Related

- [Connectors overview](/guides/connectors#bluesky)
