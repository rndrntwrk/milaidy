---
title: Zalo Personal Account Connector
sidebarTitle: Zalo Personal
description: Connect your agent to Zalo personal accounts using the @elizaos/plugin-zalouser package.
---

Connect your agent to Zalo for one-to-one personal-account messaging workflows.

## Overview

The Zalouser connector is an elizaOS plugin that bridges your agent to Zalo through a personal account (as opposed to an Official Account). This connector targets direct messaging and group chat via a personal Zalo login. For Official Account workflows, see the [Zalo OA connector](/connectors/zalo).

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-zalouser` |
| Install | `milady plugins install zalouser` |

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

| Variable | Required | Description |
|----------|----------|-------------|
| `ZALOUSER_ENABLED` | No | Enable or disable the connector (`true`/`false`) |
| `ZALOUSER_IMEI` | No | Device IMEI identifier |
| `ZALOUSER_USER_AGENT` | No | User agent string for the session |
| `ZALOUSER_COOKIE_PATH` | No | Path to cookie/session file |
| `ZALOUSER_PROFILES` | No | Profile configuration |
| `ZALOUSER_DEFAULT_PROFILE` | No | Default profile to use |

### Message Policies

| Variable | Required | Description |
|----------|----------|-------------|
| `ZALOUSER_DM_POLICY` | No | DM policy (`allow`, `deny`, `allowlist`) |
| `ZALOUSER_GROUP_POLICY` | No | Group message policy (`allow`, `deny`) |
| `ZALOUSER_ALLOWED_THREADS` | No | Comma-separated list of allowed channel/room IDs |
| `ZALOUSER_LISTEN_TIMEOUT` | No | Timeout value for listening (ms) |

## Features

- Personal-account one-to-one messaging
- Group chat support with configurable policies
- Thread allowlisting for selective engagement

## Related

- [Zalo OA Connector](/connectors/zalo) — Official Account variant
- [Connectors overview](/guides/connectors)
