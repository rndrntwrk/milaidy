---
title: Zalo Connector
sidebarTitle: Zalo
description: Connect your agent to Zalo using the @elizaos/plugin-zalo package.
---

Connect your agent to Zalo for Official Account messaging and support workflows.

## Overview

The Zalo connector is an elizaOS plugin that bridges your agent to the Zalo platform via the Official Account API. This connector is available from the plugin registry. A personal-account variant is also available as `@elizaos/plugin-zalouser`.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-zalo` |
| Config key | `connectors.zalo` |
| Install | `milady plugins install zalo` |

## Setup Requirements

- Zalo Official Account (OA) access token

## Configuration

```json
{
  "connectors": {
    "zalo": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ZALO_ACCESS_TOKEN` | OA access token (required) |
| `ZALO_SECRET_KEY` | Application secret key (required) |
| `ZALO_REFRESH_TOKEN` | Token refresh credential |
| `ZALO_APP_ID` | Application ID |

## Features

- Official Account messaging and support workflows
- Webhook-based message handling
- Customer interaction management

---

## Zalo User (Personal Account)

A separate connector, `@elizaos/plugin-zalouser`, provides personal Zalo account messaging (as opposed to Official Account). Install it with:

```bash
milady plugins install zalouser
```

### Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-zalouser` |
| Config key | `connectors.zalouser` |
| Category | `connector` |

### Configuration

```json
{
  "connectors": {
    "zalouser": {
      "enabled": true
    }
  }
}
```

### Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `ZALOUSER_IMEI` | string | Device IMEI identifier |
| `ZALOUSER_ENABLED` | boolean | Enable or disable the connector |
| `ZALOUSER_PROFILES` | string | Profile configuration |
| `ZALOUSER_DM_POLICY` | string | DM policy (`allow`, `deny`, `allowlist`) |
| `ZALOUSER_USER_AGENT` | string | User agent string |
| `ZALOUSER_COOKIE_PATH` | string | Path to cookie storage |
| `ZALOUSER_GROUP_POLICY` | string | Group message policy (`allow`, `deny`) |
| `ZALOUSER_LISTEN_TIMEOUT` | number | Listen timeout in ms |
| `ZALOUSER_ALLOWED_THREADS` | string | Comma-separated list of allowed threads |
| `ZALOUSER_DEFAULT_PROFILE` | string | Default profile name |

## Related

- [Connectors overview](/guides/connectors#zalo)
