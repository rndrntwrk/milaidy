# iMessage Connector

Connect your agent to iMessage for private chats and group conversations on macOS using the `@elizaos/plugin-imessage` package.

## Prerequisites

- macOS with iMessage configured and signed in
- Full Disk Access granted to the terminal or application running Milady (for chat database access at `~/Library/Messages/chat.db`)
- A CLI tool for iMessage access (e.g., `imessage-exporter`)

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `IMESSAGE_ENABLED` | No | Enable or disable the connector |
| `IMESSAGE_CLI_PATH` | No | Path to the iMessage CLI tool executable |
| `IMESSAGE_DB_PATH` | No | Path to the iMessage database (default: `~/Library/Messages/chat.db`) |
| `IMESSAGE_DM_POLICY` | No | DM policy (e.g., `allow`, `deny`, `allowlist`) |
| `IMESSAGE_ALLOW_FROM` | No | Comma-separated allowed sender list |
| `IMESSAGE_GROUP_POLICY` | No | Group message policy |
| `IMESSAGE_POLL_INTERVAL_MS` | No | Polling interval in milliseconds |

The connector auto-enables when `cliPath` is truthy in the connector config and `enabled` is not explicitly `false`.

Configure in `~/.milady/milady.json`:

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

To disable:

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

## Setup

1. Ensure macOS has iMessage configured and signed in.
2. Grant Full Disk Access to the terminal or Milady process (System Settings > Privacy & Security > Full Disk Access).
3. Install an iMessage CLI tool and note its path.
4. Add the CLI path to `connectors.imessage.cliPath` in your config.
5. Start your agent -- the iMessage connector will auto-enable.

## Features

## Environment Variables

| Variable | Description |
|----------|-------------|
| `IMESSAGE_CLI_PATH` | Path to the iMessage CLI tool executable |
| `IMESSAGE_DB_PATH` | Path to the iMessage database |
| `IMESSAGE_ENABLED` | Set to `true` to enable |
| `IMESSAGE_DM_POLICY` | DM access policy |
| `IMESSAGE_ALLOW_FROM` | Comma-separated list of allowed user IDs |
| `IMESSAGE_GROUP_POLICY` | Group join policy |
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

- [BlueBubbles Connector](/connectors/bluebubbles) -- iMessage via BlueBubbles HTTP API (works from any machine)
- [Blooio Connector](/connectors/blooio) -- iMessage/SMS via Blooio cloud service
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
