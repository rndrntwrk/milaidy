---
title: "Zalo User Plugin"
sidebarTitle: "Zalo User"
description: "Zalo personal-account connector for Milady — one-to-one messaging via personal Zalo accounts."
---

The Zalo User plugin connects Milady agents to Zalo via personal accounts, enabling one-to-one messaging workflows outside the Official Account system.

**Package:** `@elizaos/plugin-zalouser`

## Installation

```bash
milady plugins install zalouser
```

## Setup

### 1. Obtain Credentials

You need a personal Zalo account with cookie-based authentication. The plugin uses device IMEI and user-agent for session management.

### 2. Configure Milady

```json
{
  "connectors": {
    "zalouser": {
      "enabled": true,
      "cookiePath": "./auth/zalouser/cookies.json",
      "imei": "YOUR_DEVICE_IMEI",
      "userAgent": "YOUR_USER_AGENT"
    }
  }
}
```

Or via environment variables:

```bash
export ZALOUSER_COOKIE_PATH=./auth/zalouser/cookies.json
export ZALOUSER_IMEI=YOUR_DEVICE_IMEI
export ZALOUSER_USER_AGENT=YOUR_USER_AGENT
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `enabled` | No | Set `false` to disable (default: `true`) |
| `cookiePath` | No | Path to cookie/session file |
| `imei` | No | Device IMEI identifier for session |
| `userAgent` | No | User-agent string for requests |
| `dmPolicy` | No | DM access policy: `"pairing"`, `"allowlist"`, `"open"`, or `"disabled"` |
| `groupPolicy` | No | Group message policy: `"allowlist"`, `"open"`, or `"disabled"` |
| `listenTimeout` | No | Timeout for message listener (ms) |
| `allowedThreads` | No | Comma-separated list of allowed thread IDs |
| `defaultProfile` | No | Default profile name to use |
| `profiles` | No | Profile configuration string |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ZALOUSER_ENABLED` | Enable or disable the plugin |
| `ZALOUSER_COOKIE_PATH` | Path to cookie/session file |
| `ZALOUSER_IMEI` | Device IMEI identifier |
| `ZALOUSER_USER_AGENT` | User-agent string |
| `ZALOUSER_DM_POLICY` | DM access policy |
| `ZALOUSER_GROUP_POLICY` | Group message policy |
| `ZALOUSER_LISTEN_TIMEOUT` | Message listener timeout |
| `ZALOUSER_ALLOWED_THREADS` | Comma-separated allowed thread IDs |
| `ZALOUSER_DEFAULT_PROFILE` | Default profile name |
| `ZALOUSER_PROFILES` | Profile configuration |

## Differences from Zalo (Official Account)

| Feature | Zalo (OA) | Zalo User (Personal) |
|---------|-----------|---------------------|
| Account type | Official Account | Personal account |
| API | Zalo OA API | Cookie-based auth |
| Package | `@elizaos/plugin-zalo` | `@elizaos/plugin-zalouser` |
| Use case | Business/support workflows | Personal one-to-one messaging |

## Related

- [Zalo Official Account Plugin](/plugin-registry/platform/zalo) — For business/OA messaging
- [Connectors Guide](/guides/connectors) — General connector documentation
