---
title: "Zalouser Plugin"
sidebarTitle: "Zalouser"
description: "Zalo personal-account connector for Milady — one-to-one messaging via personal Zalo accounts."
---

The Zalouser plugin connects Milady agents to personal Zalo accounts for one-to-one messaging, as an alternative to the [Zalo Official Account](/plugin-registry/platform/zalo) connector.

**Package:** `@elizaos/plugin-zalouser`

## Installation

```bash
milady plugins install zalouser
```

## Setup

### 1. Export Zalo Session

Export session cookies from the official Zalo app or web client.

### 2. Get Device IMEI

Note the device IMEI from your Zalo app installation.

### 3. Configure Environment

```bash
ZALOUSER_COOKIE_PATH=/path/to/cookies.json
ZALOUSER_IMEI=your-device-imei
```

### 4. Enable the Connector

```json
{
  "connectors": {
    "zalouser": {
      "enabled": true
    }
  }
}
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ZALOUSER_COOKIE_PATH` | Yes | Path to exported Zalo session cookies |
| `ZALOUSER_IMEI` | Yes | Device IMEI from the official Zalo app |
| `ZALOUSER_USER_AGENT` | No | Browser user agent string |
| `ZALOUSER_PROFILES` | No | Multiple account profiles (JSON) |
| `ZALOUSER_DEFAULT_PROFILE` | No | Default profile name |
| `ZALOUSER_ALLOWED_THREADS` | No | Comma-separated allowed thread IDs |
| `ZALOUSER_DM_POLICY` | No | DM acceptance policy |
| `ZALOUSER_GROUP_POLICY` | No | Group message policy |
| `ZALOUSER_LISTEN_TIMEOUT` | No | Connection timeout in milliseconds |

## Features

- **Personal account messaging** — Use a personal Zalo account instead of Official Account
- **One-to-one conversations** — Direct messaging with Zalo contacts
- **Multiple profiles** — Configure multiple account profiles
- **Thread filtering** — Restrict which conversations the agent participates in

## Related

- [Zalo Plugin](/plugin-registry/platform/zalo) — Official Account variant
- [Zalouser Connector](/connectors/zalouser) — Connector setup guide
- [Connectors Guide](/guides/connectors) — General connector documentation
