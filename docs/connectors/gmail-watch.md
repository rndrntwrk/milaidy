---
title: Gmail Watch Connector
sidebarTitle: Gmail Watch
description: Monitor Gmail inboxes using the @elizaos/plugin-gmail-watch package.
---

Monitor Gmail inboxes for incoming messages using Pub/Sub.

## Overview

The Gmail Watch connector is an elizaOS plugin that monitors Gmail inboxes via Google Cloud Pub/Sub. It watches for new messages and triggers agent events. Unlike most connectors, Gmail Watch is enabled via a feature flag and the `hooks.gmail` configuration rather than the `connectors` section.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-gmail-watch` |
| Feature flag | `features.gmailWatch` |
| Install | `milady plugins install gmail-watch` |
| Auto-enable | `hooks.gmail.account` is set, or `features.gmailWatch` is `true` |

## Setup Requirements

- A Gmail account
- Google Cloud service account or OAuth credentials with Gmail API access
- A Google Cloud Pub/Sub topic configured for Gmail push notifications

## Configuration

Gmail Watch is configured in two places in `milady.json`:

### 1. Enable via feature flag

```json
{
  "features": {
    "gmailWatch": true
  }
}
```

### 2. Configure the Gmail account in hooks

```json
{
  "hooks": {
    "gmail": {
      "account": "user@gmail.com",
      "label": "INBOX",
      "includeBody": true
    }
  }
}
```

### Full example

```json
{
  "features": {
    "gmailWatch": true
  },
  "hooks": {
    "enabled": true,
    "gmail": {
      "account": "user@gmail.com",
      "label": "INBOX",
      "includeBody": true
    }
  }
}
```

### Gmail Hook Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `account` | string | — | Gmail address to monitor (required) |
| `label` | string | `"INBOX"` | Gmail label to watch |
| `includeBody` | boolean | `false` | Include email body content in agent events |

## Features

- Gmail Pub/Sub message watching
- Auto-renewal of watch subscriptions
- Inbound email event handling
- Label filtering for targeted inbox monitoring

## Related

- [Hooks configuration](/configuration#hooks)
- [Connectors overview](/guides/connectors#gmail-watch)
- [Configuration reference](/configuration)
