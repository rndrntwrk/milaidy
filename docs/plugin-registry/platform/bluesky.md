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
| `BLUESKY_PASSWORD` | Yes | App password (not your main password) |
| `BLUESKY_ENABLED` | No | Enable or disable the plugin |
| `BLUESKY_SERVICE` | No | BlueSky service URL (PDS instance) |
| `BLUESKY_DRY_RUN` | No | Simulate operations without posting |
| `BLUESKY_ENABLE_DMS` | No | Enable direct message processing |
| `BLUESKY_ENABLE_POSTING` | No | Enable or disable posting |
| `BLUESKY_POLL_INTERVAL` | No | Polling interval in seconds |
| `BLUESKY_ACTION_INTERVAL` | No | Seconds between action-processing cycles |
| `BLUESKY_MAX_POST_LENGTH` | No | Maximum characters per post |
| `BLUESKY_POST_IMMEDIATELY` | No | Publish immediately instead of scheduling |
| `BLUESKY_POST_INTERVAL_MIN` | No | Minimum seconds between automated posts |
| `BLUESKY_POST_INTERVAL_MAX` | No | Maximum seconds between automated posts |
| `BLUESKY_MAX_ACTIONS_PROCESSING` | No | Maximum actions per batch |
| `BLUESKY_ENABLE_ACTION_PROCESSING` | No | Enable automated action processing |

See the [Bluesky Connector reference](/connectors/bluesky) for the full list of 15 environment variables.

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
