---
title: iMessage Connector
sidebarTitle: iMessage
description: Connect your agent to iMessage using the @elizaos/plugin-imessage package.
---

Connect your agent to iMessage for private chats and group conversations on macOS.

## Overview

The iMessage connector is an external elizaOS plugin that bridges your agent to iMessage and SMS on macOS. It accesses the native iMessage database directly and supports remote host connectivity via SSH. It is auto-enabled by the runtime when a CLI path is detected in your connector configuration.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-imessage` |
| Config key | `connectors.imessage` |
| Auto-enable trigger | `cliPath` is truthy in connector config |

## Prerequisites

- macOS with iMessage configured and signed in
- Full Disk Access granted to the terminal or application running Milady (for chat database access at `~/Library/Messages/chat.db`)
- A CLI tool for iMessage access (e.g., `imessage-exporter`)

## Minimal Configuration

In `~/.milady/milady.json`:

```json
{
  "connectors": {
    "imessage": {
      "cliPath": "/usr/local/bin/imessage",
      "service": "auto",
      "dmPolicy": "pairing"
    }
  }
}
```

## Disabling

To explicitly disable the connector even when a CLI path is present:

```json
{
  "connectors": {
    "imessage": {
      "cliPath": "/usr/local/bin/imessage",
      "enabled": false
    }
  }
}
```

## Auto-Enable Mechanism

The `plugin-auto-enable.ts` module checks `connectors.imessage` in your config. If the `cliPath` field is truthy (and `enabled` is not explicitly `false`), the runtime automatically loads `@elizaos/plugin-imessage`.

No environment variable is required to trigger auto-enable — it is driven entirely by the connector config object.

## Environment Variables

All settings can alternatively be set via environment variables:

| Variable | Description |
|----------|-------------|
| `IMESSAGE_CLI_PATH` | Path to the iMessage CLI binary |
| `IMESSAGE_DB_PATH` | Path to the iMessage database file |
| `IMESSAGE_ENABLED` | Enable or disable the connector |
| `IMESSAGE_DM_POLICY` | DM policy (`pairing`, `allowlist`, `open`, `disabled`) |
| `IMESSAGE_ALLOW_FROM` | Comma-separated list of allowed sender IDs |
| `IMESSAGE_GROUP_POLICY` | Group message policy (`open`, `disabled`, `allowlist`) |
| `IMESSAGE_POLL_INTERVAL_MS` | Polling interval in milliseconds |

## Full Configuration Reference

All fields are defined under `connectors.imessage` in `milady.json`.

### Core Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `cliPath` | string | — | Path to the iMessage CLI tool executable |
| `dbPath` | string | — | Path to the iMessage database (default: `~/Library/Messages/chat.db`) |
| `remoteHost` | string | — | Remote Mac hostname for SSH-based iMessage access |
| `service` | `"imessage"` \| `"sms"` \| `"auto"` | — | Message service selection. `"auto"` detects the appropriate service |
| `region` | string | — | Region configuration for phone number formatting |
| `name` | string | — | Account display name |
| `enabled` | boolean | — | Explicitly enable/disable |
| `capabilities` | string[] | — | Capability flags |
| `includeAttachments` | boolean | — | Include attachments in messages |
| `configWrites` | boolean | — | Allow config writes from iMessage events |
| `dmPolicy` | `"pairing"` \| `"allowlist"` \| `"open"` \| `"disabled"` | `"pairing"` | DM access policy. `"open"` requires `allowFrom` to include `"*"` |
| `allowFrom` | (string\|number)[] | — | User IDs allowed to DM |
| `groupPolicy` | `"open"` \| `"disabled"` \| `"allowlist"` | `"allowlist"` | Group join policy |
| `groupAllowFrom` | (string\|number)[] | — | User IDs allowed in groups |
| `historyLimit` | integer >= 0 | — | Max messages in context |
| `dmHistoryLimit` | integer >= 0 | — | History limit for DMs |
| `dms` | object | — | Per-DM history overrides keyed by DM ID. Each value: `{historyLimit?: int}` |
| `textChunkLimit` | integer > 0 | — | Max characters per message chunk |
| `chunkMode` | `"length"` \| `"newline"` | — | Long message splitting strategy |
| `mediaMaxMb` | integer > 0 | — | Max media file size in MB |
| `markdown` | object | — | Table rendering: `tables` can be `"off"`, `"bullets"`, or `"code"` |

### Streaming Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `blockStreaming` | boolean | — | Disable streaming entirely |
| `blockStreamingCoalesce` | object | — | Coalescing settings: `minChars`, `maxChars`, `idleMs` |

### Group Configuration

Per-group settings are defined under `groups.<group-id>`:

| Field | Type | Description |
|-------|------|-------------|
| `requireMention` | boolean | Only respond when @mentioned |
| `tools` | ToolPolicySchema | Tool access policy |
| `toolsBySender` | object | Per-sender tool policies (keyed by sender ID) |

### Heartbeat

```json
{
  "connectors": {
    "imessage": {
      "heartbeat": {
        "showOk": true,
        "showAlerts": true,
        "useIndicator": true
      }
    }
  }
}
```

### Multi-Account Support

The `accounts` field allows running multiple iMessage accounts from a single agent:

```json
{
  "connectors": {
    "imessage": {
      "accounts": {
        "personal": {
          "cliPath": "/usr/local/bin/imessage",
          "service": "imessage",
          "groups": {}
        },
        "work": {
          "cliPath": "/usr/local/bin/imessage",
          "remoteHost": "work-mac.local",
          "service": "auto",
          "groups": {}
        }
      }
    }
  }
}
```

Each account entry supports the same fields as the top-level `connectors.imessage` configuration (excluding the `accounts` field itself).

## Remote Host Access

To connect to iMessage on a remote Mac via SSH, set the `remoteHost` field:

```json
{
  "connectors": {
    "imessage": {
      "cliPath": "/usr/local/bin/imessage",
      "remoteHost": "mac-mini.local"
    }
  }
}
```

Ensure SSH key-based authentication is configured between the local machine and the remote host.

## Troubleshooting

### Full Disk Access

If message retrieval fails, ensure Full Disk Access is granted:

1. Open **System Settings > Privacy & Security > Full Disk Access**
2. Add the terminal application or Milady process

### Database Path

The default iMessage database is at `~/Library/Messages/chat.db`. If using a non-standard location, set `dbPath` explicitly.

### macOS Only

The iMessage connector requires macOS. It will not function on Linux or Windows.

## Related

- [iMessage plugin reference](/plugin-registry/platform/imessage)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
