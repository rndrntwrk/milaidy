---
title: "Bluesky Plugin"
sidebarTitle: "Bluesky"
description: "Bluesky connector for Milady — post, reply, and interact on the AT Protocol network."
---

The Bluesky plugin connects Milady agents to the Bluesky social network via the AT Protocol, enabling posting, replying, and social interactions.

**Package:** `@elizaos/plugin-bluesky`

## Installation

This connector auto-enables when its configuration is present in `milady.json`. You can also install it explicitly:

```bash
milady plugins install bluesky
```

## Setup

### 1. Get Your Bluesky Credentials

1. Go to [bsky.app](https://bsky.app) and create an account (or use an existing one)
2. Note your handle (e.g., `yourname.bsky.social`)
3. Use your account username and password (or generate an app password in Settings → App Passwords)

### 2. Configure Milady

Set the credentials via environment variables in your config:

```json
{
  "env": {
    "BLUESKY_HANDLE": "yourname.bsky.social",
    "BLUESKY_PASSWORD": "YOUR_APP_PASSWORD"
  },
  "connectors": {
    "bluesky": {
      "enabled": true
    }
  }
}
```

Set credentials via environment variables:

```bash
export BLUESKY_HANDLE=yourname.bsky.social
export BLUESKY_PASSWORD=your-app-password
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BLUESKY_HANDLE` | Yes | Bluesky handle (e.g., `yourname.bsky.social`) |
| `BLUESKY_PASSWORD` | Yes | App password (generate at Settings > App Passwords) |
| `BLUESKY_ENABLED` | No | Set to `true` to enable |
| `BLUESKY_SERVICE` | No | Bluesky PDS instance URL |
| `BLUESKY_DRY_RUN` | No | Set to `true` for testing without posting |
| `BLUESKY_ENABLE_POSTING` | No | Enable or disable post creation |
| `BLUESKY_ENABLE_DMS` | No | Enable direct message processing |
| `BLUESKY_ENABLE_POSTING` | No | Enable or disable posting |
| `BLUESKY_POLL_INTERVAL` | No | Polling interval in seconds |
| `BLUESKY_ACTION_INTERVAL` | No | Interval in seconds between action-processing cycles |
| `BLUESKY_MAX_POST_LENGTH` | No | Maximum characters per post |
| `BLUESKY_POST_IMMEDIATELY` | No | Post immediately instead of waiting for schedule |
| `BLUESKY_POST_INTERVAL_MIN` | No | Minimum interval in seconds between automated posts |
| `BLUESKY_POST_INTERVAL_MAX` | No | Maximum interval in seconds between automated posts |
| `BLUESKY_MAX_ACTIONS_PROCESSING` | No | Maximum actions to process in a single batch |
| `BLUESKY_ENABLE_ACTION_PROCESSING` | No | Enable or disable automated action processing |

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
