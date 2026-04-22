---
title: "iMessage Plugin"
sidebarTitle: "iMessage"
description: "iMessage connector for Milady — macOS native messaging with iMessage and SMS support, database access, and remote host connectivity."
---

The iMessage plugin connects Milady agents to iMessage on macOS, supporting both iMessage and SMS conversations with configurable service selection and attachment handling.

**Package:** `@elizaos/plugin-imessage`

## Installation

```bash
milady plugins install imessage
```

## Setup

### 1. Prerequisites

- macOS with iMessage configured and signed in
- Full Disk Access granted to the terminal or application running Milady (for chat database access)

### 2. Configure Milady

```json
{
  "connectors": {
    "imessage": {
      "enabled": true,
      "service": "auto",
      "dmPolicy": "pairing"
    }
  }
}
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `service` | No | Service type: `imessage`, `sms`, or `auto` (default: `auto`) |
| `cliPath` | No | Path to iMessage CLI tool |
| `dbPath` | No | Path to iMessage database |
| `remoteHost` | No | Remote host for SSH-based access |
| `region` | No | Region configuration |
| `includeAttachments` | No | Include attachments in messages (default: `true`) |
| `dmPolicy` | No | DM handling policy |

## Features

- **Service selection** — Choose between iMessage, SMS, or automatic detection
- **Database access** — Direct access to macOS iMessage database for message history
- **Remote host** — Connect to iMessage on a remote Mac via SSH
- **Attachments** — Send and receive media attachments
- **Per-group config** — Configure mention requirements and tool access per group
- **Multi-account** — Supports multiple accounts via `accounts` map

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `IMESSAGE_CLI_PATH` | No | Path to the iMessage CLI tool binary |
| `IMESSAGE_DB_PATH` | No | Path to the iMessage database file |
| `IMESSAGE_ENABLED` | No | Enable or disable the plugin |
| `IMESSAGE_DM_POLICY` | No | DM policy (e.g., `allow`, `deny`, `allowlist`) |
| `IMESSAGE_ALLOW_FROM` | No | Comma-separated list of allowed sender IDs |
| `IMESSAGE_GROUP_POLICY` | No | Group message policy |
| `IMESSAGE_POLL_INTERVAL_MS` | No | Polling interval in milliseconds |

## Auto-Enable

The plugin auto-enables when the `connectors.imessage` block is present:

```json
{
  "connectors": {
    "imessage": {
      "enabled": true
    }
  }
}
```

## Troubleshooting

### Full Disk Access

If message retrieval fails, ensure Full Disk Access is granted:

1. Open **System Settings → Privacy & Security → Full Disk Access**
2. Add the terminal application or Milady process

### Database Path

The default iMessage database is at `~/Library/Messages/chat.db`. If using a non-standard location, set `dbPath` explicitly.

## Related

- [Signal Plugin](/plugin-registry/platform/signal) — Signal messaging integration
- [Connectors Guide](/guides/connectors) — General connector documentation
