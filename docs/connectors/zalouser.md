---
title: Zalo User Connector
sidebarTitle: Zalo User
description: Connect your agent to a Zalo personal account using the @elizaos/plugin-zalouser package.
---

Connect your agent to Zalo for personal-account one-to-one messaging workflows.

## Overview

The Zalo User connector is an elizaOS plugin that bridges your agent to Zalo via a personal account (as opposed to the Official Account API used by `@elizaos/plugin-zalo`). This connector is available from the plugin registry.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-zalouser` |
| Config key | `connectors.zalouser` |
| Install | `milady plugins install zalouser` |

## Setup Requirements

- Zalo personal account credentials (device IMEI and session cookie)

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

## Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `ZALOUSER_IMEI` | string | Device IMEI identifier |
| `ZALOUSER_PROFILES` | string | Profile configuration |
| `ZALOUSER_DEFAULT_PROFILE` | string | Default profile to use |
| `ZALOUSER_COOKIE_PATH` | string | Path to session cookie file |
| `ZALOUSER_USER_AGENT` | string | User agent string for requests |
| `ZALOUSER_DM_POLICY` | string | DM policy (`allow`, `deny`, `allowlist`) |
| `ZALOUSER_GROUP_POLICY` | string | Group message policy (`allow`, `deny`) |
| `ZALOUSER_ALLOWED_THREADS` | string | Comma-separated list of allowed thread IDs |
| `ZALOUSER_LISTEN_TIMEOUT` | number | Timeout for listening to events |
| `ZALOUSER_ENABLED` | boolean | Enable or disable the connector |

## Features

- Personal-account one-to-one messaging (unlike the OA variant)
- DM and group policy controls
- Multi-profile support
- Thread allowlisting
- Configurable listen timeout

## Related

- [Zalo (Official Account) connector](/connectors/zalo)
- [Connectors overview](/guides/connectors#zalo-user)
