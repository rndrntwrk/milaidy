---
title: Zalo User Connector
sidebarTitle: Zalo User
description: Connect your agent to Zalo personal accounts using the @elizaos/plugin-zalouser package.
---

Connect your agent to Zalo for one-to-one messaging via a personal account.

## Overview

The Zalo User connector is an elizaOS plugin for personal-account Zalo messaging. Unlike the [Zalo OA connector](/connectors/zalo) which uses the Official Account API, this connector operates through a personal Zalo account for direct one-to-one messaging workflows.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-zalouser` |
| Config key | `connectors.zalouser` |
| Install | `milady plugins install zalouser` |

## Setup Requirements

- Zalo account cookie file for authentication
- IMEI identifier (optional)

## Configuration

```json
{
  "connectors": {
    "zalouser": {
      "enabled": true
    }
  }
}
```

## Config Keys

| Key | Type | Description |
|-----|------|-------------|
| `ZALOUSER_ENABLED` | boolean | Enable or disable the connector |
| `ZALOUSER_COOKIE_PATH` | string | Path to cookie file for authentication |
| `ZALOUSER_IMEI` | string | Device IMEI identifier |
| `ZALOUSER_USER_AGENT` | string | User agent string |
| `ZALOUSER_DM_POLICY` | string | DM policy (e.g. `allow`, `deny`, `allowlist`) |
| `ZALOUSER_GROUP_POLICY` | string | Group message policy (e.g. `allow`, `deny`) |
| `ZALOUSER_ALLOWED_THREADS` | string | Comma-separated allowed channel/room list |
| `ZALOUSER_PROFILES` | string | Profile configuration |
| `ZALOUSER_DEFAULT_PROFILE` | string | Default profile |
| `ZALOUSER_LISTEN_TIMEOUT` | number | Timeout value for listening |

## Features

- Personal account messaging (outside Official Account)
- DM and group policy controls
- Profile configuration
- Thread allowlists
- Configurable listen timeout

## Related

- [Zalo OA connector](/connectors/zalo)
- [Connectors overview](/guides/connectors#zalo-user)
