---
title: "Zalo User Plugin"
sidebarTitle: "Zalo User"
description: "Zalo personal-account connector for Milady — one-to-one messaging via personal Zalo accounts."
---

The Zalo User plugin connects Milady agents to Zalo personal accounts, enabling direct messaging workflows through cookie-based authentication rather than the Official Account API.

**Package:** `@elizaos/plugin-zalouser`

## Installation

```bash
milady plugins install zalouser
```

## Setup

### 1. Prepare Credentials

Obtain your Zalo session cookies from an authenticated browser session.

### 2. Configure Milady

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

Or via environment variables:

```bash
export ZALOUSER_ENABLED=true
export ZALOUSER_COOKIE_PATH=./auth/zalouser
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `enabled` | No | Enable or disable the connector (default: `true`) |
| `cookiePath` | No | Path to cookie/session storage |
| `imei` | No | Device IMEI identifier |
| `userAgent` | No | User agent string for requests |
| `dmPolicy` | No | DM acceptance policy |
| `groupPolicy` | No | Group message policy |
| `allowedThreads` | No | Comma-separated list of allowed thread IDs |
| `listenTimeout` | No | Timeout for message listening in ms |

## Difference from Zalo OA

| | Zalo (OA) | Zalo User |
|---|-----------|-----------|
| Auth method | Access token + secret key | Cookie-based session |
| Account type | Official Account | Personal account |
| Use case | Customer support, business | Personal messaging |
| Package | `@elizaos/plugin-zalo` | `@elizaos/plugin-zalouser` |

## Related

- [Zalo OA Plugin](/plugin-registry/platform/zalo) — Official Account connector
- [Connectors Guide](/guides/connectors) — General connector documentation
