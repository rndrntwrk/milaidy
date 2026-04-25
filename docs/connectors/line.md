---
title: LINE Connector
sidebarTitle: LINE
description: Connect your agent to LINE using the @elizaos/plugin-line package.
---

Connect your agent to LINE for bot messaging and customer conversations.

## Overview

The LINE connector is an elizaOS plugin that bridges your agent to LINE Messaging API. It supports rich message types, group chat, and webhook-based event handling. This connector is **auto-enabled** when its configuration is present in `milady.json`.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-line` |
| Config key | `connectors.line` |
| Install | `milady plugins install @elizaos/plugin-line` |

## Setup Requirements

- LINE Channel access token
- LINE Channel secret
- Create a Messaging API channel at [developers.line.biz](https://developers.line.biz)

## Configuration

```json
{
  "connectors": {
    "line": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LINE_CHANNEL_ACCESS_TOKEN` | Yes | Channel access token from LINE Developer Console |
| `LINE_CHANNEL_SECRET` | No | Channel secret for webhook verification |
| `LINE_ENABLED` | No | Enable or disable the connector |
| `LINE_DM_POLICY` | No | DM policy (e.g., `allow`, `deny`, `allowlist`) |
| `LINE_ALLOW_FROM` | No | Comma-separated allowed user list |
| `LINE_GROUP_POLICY` | No | Group message policy (e.g., `allow`, `deny`) |
| `LINE_WEBHOOK_PATH` | No | Webhook endpoint path |

## Features

- Bot messaging and customer conversations
- Rich message types (text, sticker, image, video)
- Group chat support
- Webhook-based event handling

## Related

- [Connectors overview](/guides/connectors#line)
