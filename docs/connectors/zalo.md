---
title: Zalo Connector
sidebarTitle: Zalo
description: Connect your agent to Zalo using the @elizaos/plugin-zalo package.
---

Connect your agent to Zalo for Official Account messaging and support workflows.

## Overview

The Zalo connector is an elizaOS plugin that bridges your agent to the Zalo platform via the Official Account API. This connector is **auto-enabled** when its configuration is present in `milady.json`. A personal-account variant is also available as `@elizaos/plugin-zalouser`.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-zalo` |
| Config key | `connectors.zalo` |
| Category | Auto-enabled connector |

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

| Variable | Required | Description |
|----------|----------|-------------|
| `ZALO_ACCESS_TOKEN` | Yes | OA access token |
| `ZALO_SECRET_KEY` | Yes | Application secret key |
| `ZALO_APP_ID` | No | Application ID |
| `ZALO_REFRESH_TOKEN` | No | Token refresh credential |
| `ZALO_ENABLED` | No | Enable or disable the plugin |
| `ZALO_PROXY_URL` | No | Proxy URL for API requests |
| `ZALO_USE_POLLING` | No | Use polling instead of webhooks (`true`/`false`) |
| `ZALO_WEBHOOK_URL` | No | Webhook URL for receiving messages |
| `ZALO_WEBHOOK_PATH` | No | Webhook endpoint path |
| `ZALO_WEBHOOK_PORT` | No | Webhook listener port |

## Features

- Official Account messaging and support workflows
- Webhook-based message handling
- Customer interaction management

## Related

- [Zalo User (personal account) connector](/connectors/zalouser)
- [Connectors overview](/guides/connectors#zalo)
