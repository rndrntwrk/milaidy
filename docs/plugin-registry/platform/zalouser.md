---
title: "Zalo User Plugin"
sidebarTitle: "Zalo User"
description: "Zalo personal-account connector for one-to-one messaging workflows."
---

The Zalo User plugin connects Milady agents to Zalo using a personal account for one-to-one messaging, as an alternative to the [Zalo OA plugin](/plugin-registry/platform/zalo) which uses Official Account APIs.

**Package:** `@elizaos/plugin-zalouser`

## Installation

```bash
milady plugins install zalouser
```

## Setup

1. Obtain device credentials (IMEI and cookie) — see the [Zalo User setup guide](https://docs.eliza.ai/plugin-setup-guide#zalo-user-personal)
2. Configure the connector in `milady.json`

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

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | Trigger field for auto-enable (set to any truthy value) |
| `enabled` | No | Set `false` to disable |

## Environment Variables

```bash
export ZALOUSER_IMEI=YOUR_DEVICE_IMEI
export ZALOUSER_COOKIE_PATH=./auth/zalouser
```

| Variable | Description |
|----------|-------------|
| `ZALOUSER_IMEI` | Device IMEI identifier |
| `ZALOUSER_COOKIE_PATH` | Path to cookie/session storage |
| `ZALOUSER_USER_AGENT` | Custom user agent string |
| `ZALOUSER_DM_POLICY` | DM access policy |
| `ZALOUSER_GROUP_POLICY` | Group message policy |
| `ZALOUSER_LISTEN_TIMEOUT` | Timeout for listen operations (ms) |
| `ZALOUSER_ALLOWED_THREADS` | Comma-separated allowed thread IDs |

## Features

- **Personal account messaging** — One-to-one conversations via personal Zalo account
- **Multi-profile** — Manage multiple conversation profiles
- **Thread allowlisting** — Control which conversations the agent participates in
- **Session persistence** — Cookie-based session management across restarts

## Auto-Enable

The plugin auto-enables when the `connectors.zalouser` block contains an `apiKey`, `token`, or `botToken`.

## Related

- [Zalo User connector reference](/connectors/zalouser) — Full configuration reference
- [Zalo OA plugin](/plugin-registry/platform/zalo) — Official Account connector
- [Connectors Guide](/guides/connectors) — General connector documentation
