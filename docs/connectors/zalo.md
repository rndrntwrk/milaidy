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
| Install | `milady plugins install @elizaos/plugin-zalo` |

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
| `ZALO_ACCESS_TOKEN` | OA access token |
| `ZALO_REFRESH_TOKEN` | Token refresh credential |
| `ZALO_APP_ID` | Application ID |
| `ZALO_SECRET_KEY` | Application secret key |

## Features

- Official Account messaging and support workflows
- Webhook-based message handling (or polling mode)
- Customer interaction management

## Related

- [Zalo User (personal account) connector](/connectors/zalouser)
- [Connectors overview](/guides/connectors#zalo)
