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

- iMessage and SMS messaging on macOS
- DM and group chat support with configurable policies
- Remote host access via SSH
- Attachment support
- Multi-account support via the `accounts` config map

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
