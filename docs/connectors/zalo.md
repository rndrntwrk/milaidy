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

## Setup

### 1. Create a Zalo Official Account

1. Go to the [Zalo Developers portal](https://developers.zalo.me/)
2. Create an application and obtain your App ID and App Secret
3. Generate an access token and refresh token for API access

### 2. Configure Milady

```json
{
  "connectors": {
    "zalo": {
      "accessToken": "YOUR_ACCESS_TOKEN",
      "secretKey": "YOUR_SECRET_KEY",
      "refreshToken": "YOUR_REFRESH_TOKEN",
      "appId": "YOUR_APP_ID"
    }
  }
}
```

Or via environment variables:

```bash
export ZALO_ACCESS_TOKEN=YOUR_ACCESS_TOKEN
export ZALO_SECRET_KEY=YOUR_SECRET_KEY
export ZALO_REFRESH_TOKEN=YOUR_REFRESH_TOKEN
export ZALO_APP_ID=YOUR_APP_ID
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ZALO_ACCESS_TOKEN` | Yes | OA access token |
| `ZALO_SECRET_KEY` | Yes | Application secret key |
| `ZALO_REFRESH_TOKEN` | No | Token refresh credential |
| `ZALO_APP_ID` | No | Application ID |

## Configuration Reference

| Field | Required | Description |
|-------|----------|-------------|
| `accessToken` | Yes | Zalo API access token |
| `secretKey` | Yes | Zalo application secret key |
| `refreshToken` | No | Zalo API refresh token |
| `appId` | No | Zalo application ID |
| `enabled` | No | Set `false` to disable (default: `true`) |

## Features

- Official Account messaging and support workflows
- Webhook-based message handling
- Customer interaction management

## Related

- [Zalo Plugin Reference](/plugin-registry/platform/zalo)
- [Connectors overview](/guides/connectors#zalo)
