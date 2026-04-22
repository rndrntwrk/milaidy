---
title: Zalo User Connector
sidebarTitle: Zalo User
description: Connect your agent to Zalo personal accounts for one-to-one messaging using the @elizaos/plugin-zalouser package.
---

Connect your agent to Zalo using a personal account for one-to-one messaging workflows.

## Overview

The Zalo User connector is an external elizaOS plugin for personal Zalo account messaging. Unlike the [Zalo OA connector](/connectors/zalo) which uses Official Account APIs, this connector operates through a personal account and supports direct one-to-one messaging.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-zalouser` |
| Config key | `connectors.zalouser` |
| Auto-enable trigger | `botToken`, `token`, or `apiKey` is truthy in connector config |

## Setup

### 1. Obtain Device Credentials

The connector authenticates using device-level credentials (IMEI and cookie). Refer to the [Zalo User setup guide](https://docs.eliza.ai/plugin-setup-guide#zalo-user-personal) for instructions on obtaining these values.

### 2. Configure Milady

Add the connector configuration to `milady.json`:

```json
{
  "connectors": {
    "zalouser": {
      "enabled": true,
      "apiKey": "placeholder"
    }
  }
}
```

Or via environment variables:

```bash
export ZALOUSER_IMEI=YOUR_DEVICE_IMEI
export ZALOUSER_COOKIE_PATH=./auth/zalouser
```

## Disabling

To explicitly disable the connector even when credentials are present:

```json
{
  "connectors": {
    "zalouser": {
      "enabled": false
    }
  }
}
```

## Environment Variables

| Env Variable | Description |
|---|---|
| `ZALOUSER_IMEI` | Device IMEI identifier for authentication |
| `ZALOUSER_ENABLED` | Enable or disable the connector |
| `ZALOUSER_COOKIE_PATH` | Path to cookie/session storage |
| `ZALOUSER_USER_AGENT` | Custom user agent string |
| `ZALOUSER_DM_POLICY` | DM access policy (`pairing`, `open`, `allowlist`, `disabled`) |
| `ZALOUSER_GROUP_POLICY` | Group message policy |
| `ZALOUSER_LISTEN_TIMEOUT` | Timeout for listen operations (ms) |
| `ZALOUSER_ALLOWED_THREADS` | Comma-separated allowed thread/conversation IDs |
| `ZALOUSER_PROFILES` | Profile configuration |
| `ZALOUSER_DEFAULT_PROFILE` | Default profile to use |

## Full Configuration Reference

All fields are defined under `connectors.zalouser` in `milady.json`.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | — | Explicitly enable/disable |
| `apiKey` | string | — | Trigger field for auto-enable |

### Access Policies

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dmPolicy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group message policy |

### Features

- Personal Zalo account messaging (one-to-one)
- Multi-profile support for managing multiple conversations
- Thread allowlisting for access control
- Cookie-based session persistence

## Related

- [Zalo OA connector](/connectors/zalo) — Official Account connector for business workflows
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
