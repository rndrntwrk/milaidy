# Bluesky Connector

Connect your agent to Bluesky for social posting and engagement on the AT Protocol network using the `@elizaos/plugin-bluesky` package.

## Prerequisites

The Bluesky connector is an elizaOS plugin that bridges your agent to Bluesky via the AT Protocol. It supports automated posting, mention monitoring, and reply handling.

Unlike the auto-enabled connectors (Discord, Telegram, etc.), Bluesky is a **registry plugin** that must be installed manually before use. It is not auto-enabled from connector config alone.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluesky` |
| Config key | `connectors.bluesky` |
| Install | `milady plugins install @elizaos/plugin-bluesky` |

## Setup Requirements

- Bluesky account credentials (handle and app password)
- Generate an app password at [bsky.app/settings/app-passwords](https://bsky.app/settings/app-passwords)

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `BLUESKY_HANDLE` | Yes | Bluesky handle (e.g., `yourname.bsky.social`) |
| `BLUESKY_PASSWORD` | Yes | App password (not your main password -- generate at bsky.app/settings/app-passwords) |
| `BLUESKY_ENABLED` | No | Enable or disable the plugin (default: `true`) |
| `BLUESKY_SERVICE` | No | Bluesky PDS instance URL (default: `https://bsky.social`) |
| `BLUESKY_DRY_RUN` | No | Set to `true` for testing without posting (default: `false`) |
| `BLUESKY_ENABLE_POSTING` | No | Enable or disable post creation (default: `true`) |
| `BLUESKY_ENABLE_DMS` | No | Enable processing of direct messages via the chat.bsky API (default: `true`) |
| `BLUESKY_POLL_INTERVAL` | No | Polling interval in seconds for fetching notifications (default: `60`) |
| `BLUESKY_ACTION_INTERVAL` | No | Interval in seconds between action-processing cycles (default: `120`) |
| `BLUESKY_MAX_POST_LENGTH` | No | Maximum characters per post (default: `300`) |
| `BLUESKY_POST_IMMEDIATELY` | No | Post immediately instead of waiting for schedule (default: `false`) |
| `BLUESKY_POST_INTERVAL_MIN` | No | Minimum interval in seconds between automated posts (default: `1800`) |
| `BLUESKY_POST_INTERVAL_MAX` | No | Maximum interval in seconds between automated posts (default: `3600`) |
| `BLUESKY_MAX_ACTIONS_PROCESSING` | No | Maximum actions to process in a single batch (default: `5`) |
| `BLUESKY_ENABLE_ACTION_PROCESSING` | No | Enable automated action processing (default: `true`) |

Install the plugin from the registry:

```bash
milady plugins install bluesky
```

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "bluesky": {
      "enabled": true
    }
  }
}
```

## Setup

| Variable | Required | Description |
|----------|----------|-------------|
| `BLUESKY_HANDLE` | Yes | Bluesky handle (e.g., `yourname.bsky.social`) |
| `BLUESKY_PASSWORD` | Yes | App password (not your main password -- generate at bsky.app/settings/app-passwords) |
| `BLUESKY_ENABLED` | No | Set to `true` to enable (default: `true`) |
| `BLUESKY_SERVICE` | No | Bluesky PDS instance URL (default: `https://bsky.social`) |
| `BLUESKY_DRY_RUN` | No | Set to `true` for testing without posting (default: `false`) |
| `BLUESKY_ENABLE_POSTING` | No | Enable or disable post creation (default: `true`) |
| `BLUESKY_ENABLE_DMS` | No | Enable processing of direct messages via the chat.bsky API (default: `true`) |
| `BLUESKY_POLL_INTERVAL` | No | Polling interval in seconds (default: `60`) |
| `BLUESKY_ACTION_INTERVAL` | No | Interval in seconds between action-processing cycles (default: `120`) |
| `BLUESKY_MAX_POST_LENGTH` | No | Maximum number of characters allowed in a post (default: `300`) |
| `BLUESKY_POST_IMMEDIATELY` | No | If true, posts are published immediately instead of waiting for a schedule (default: `false`) |
| `BLUESKY_POST_INTERVAL_MIN` | No | Minimum interval in seconds between automated posts (default: `1800`) |
| `BLUESKY_POST_INTERVAL_MAX` | No | Maximum interval in seconds between automated posts (default: `3600`) |
| `BLUESKY_MAX_ACTIONS_PROCESSING` | No | Maximum number of actions to process in a single batch (default: `5`) |
| `BLUESKY_ENABLE_ACTION_PROCESSING` | No | Enable or disable automated action processing (default: `true`) |

## Features

- Post creation at configurable intervals
- Mention and reply monitoring
- Direct message handling via chat.bsky API
- Action processing (likes, reposts)
- Dry run mode for testing
- AT Protocol-based decentralized social networking

## Related

- [Bluesky plugin reference](/plugin-registry/platform/bluesky)
- [Connectors overview](/guides/connectors#bluesky)
