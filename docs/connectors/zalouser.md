---
title: Zalo User Connector
sidebarTitle: Zalo User
description: Connect your agent to Zalo personal accounts using the @elizaos/plugin-zalouser package.
---

Connect your agent to Zalo personal accounts for one-to-one messaging workflows.

## Overview

The Zalo User connector is a personal-account variant of the [Zalo connector](/connectors/zalo). While the standard Zalo plugin uses the Official Account API, this connector authenticates as a personal Zalo user via cookie-based sessions.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-zalouser` |
| Config key | `connectors.zalouser` |
| Install | `milady plugins install zalouser` |

## Configuration

```json
{
  "connectors": {
    "zalouser": {
      "enabled": true,
      "cookiePath": "./auth/zalouser"
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ZALOUSER_ENABLED` | Enable or disable the connector |
| `ZALOUSER_COOKIE_PATH` | Path to cookie/session storage |
| `ZALOUSER_IMEI` | Device IMEI identifier |
| `ZALOUSER_USER_AGENT` | User agent string for requests |
| `ZALOUSER_PROFILES` | Profile configuration |
| `ZALOUSER_DEFAULT_PROFILE` | Default profile to use |
| `ZALOUSER_DM_POLICY` | DM policy: `"allow"`, `"deny"`, or `"allowlist"` |
| `ZALOUSER_GROUP_POLICY` | Group message policy: `"allow"` or `"deny"` |
| `ZALOUSER_ALLOWED_THREADS` | Comma-separated list of allowed thread IDs |
| `ZALOUSER_LISTEN_TIMEOUT` | Timeout for message listening (ms) |

## Features

- Personal account messaging (not Official Account)
- One-to-one chat workflows
- Cookie-based session persistence
- DM and group policy controls

## Related

- [Zalo (Official Account)](/connectors/zalo) — Official Account messaging
- [Connectors overview](/guides/connectors#zalo)
