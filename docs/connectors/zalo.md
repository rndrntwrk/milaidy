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

| Variable | Description |
|----------|-------------|
| `ZALO_ACCESS_TOKEN` | OA access token (required) |
| `ZALO_SECRET_KEY` | Application secret key (required) |
| `ZALO_REFRESH_TOKEN` | Token refresh credential |
| `ZALO_APP_ID` | Application ID |
| `ZALO_SECRET_KEY` | Application secret key |
| `ZALO_ENABLED` | Set to `true` to enable |
| `ZALO_PROXY_URL` | Proxy URL for Zalo API requests |
| `ZALO_USE_POLLING` | Use polling instead of webhooks |
| `ZALO_WEBHOOK_URL` | Webhook callback URL |
| `ZALO_WEBHOOK_PATH` | Custom webhook path |
| `ZALO_WEBHOOK_PORT` | Webhook listener port |

## Features

- Official Account messaging and support workflows
- Webhook-based message handling
- Customer interaction management

## Related

- [Zalo User (personal account) connector](/connectors/zalouser)
- [Connectors overview](/guides/connectors#zalo)
