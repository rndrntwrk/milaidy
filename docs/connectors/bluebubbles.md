# BlueBubbles Connector

Connect your agent to iMessage through a local [BlueBubbles](https://bluebubbles.app) server running on macOS using the `@elizaos/plugin-bluebubbles` package.

## Prerequisites

- A Mac with Messages signed in
- [BlueBubbles](https://bluebubbles.app) server installed and running on that Mac

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `BLUEBUBBLES_PASSWORD` | Yes | BlueBubbles server password |
| `BLUEBUBBLES_SERVER_URL` | No | BlueBubbles server URL (e.g., `http://192.168.1.10:1234`) |
| `BLUEBUBBLES_ENABLED` | No | Enable or disable the connector |
| `BLUEBUBBLES_DM_POLICY` | No | DM policy (e.g., `allow`, `deny`, `allowlist`) |
| `BLUEBUBBLES_ALLOW_FROM` | No | Comma-separated allowed user list |
| `BLUEBUBBLES_GROUP_POLICY` | No | Group message policy (e.g., `allow`, `deny`) |
| `BLUEBUBBLES_GROUP_ALLOW_FROM` | No | Comma-separated allowed group list |
| `BLUEBUBBLES_WEBHOOK_PATH` | No | Webhook path for inbound messages |
| `BLUEBUBBLES_SEND_READ_RECEIPTS` | No | Send read receipts for incoming messages |

These can be set as environment variables or under the `connectors.bluebubbles` config in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "bluebubbles": {
      "serverUrl": "http://192.168.1.10:1234",
      "password": "your-bluebubbles-password"
    }
  }
}
```

The connector auto-enables when `password` or `serverUrl` is truthy in the connector config, or `accounts` contains at least one enabled entry.

To disable:

```json
{
  "connectors": {
    "bluebubbles": {
      "serverUrl": "http://192.168.1.10:1234",
      "password": "your-bluebubbles-password",
      "enabled": false
    }
  }
}
```

## Setup

1. Install [BlueBubbles](https://bluebubbles.app) on a Mac with Messages signed in.
2. Start the BlueBubbles server and note the server URL and password.
3. Add the server URL and password to `connectors.bluebubbles` in your config.
4. Start your agent -- the BlueBubbles connector will auto-enable.

## Features

- iMessage messaging via BlueBubbles HTTP API
- DM and group chat support
- Read receipts
- Webhook-based inbound message delivery
- Works from any machine on the network (not limited to the Mac running Messages)

## Related

- [iMessage Connector](/connectors/imessage) -- Native iMessage connector (macOS only, reads Messages database directly)
- [Blooio Connector](/connectors/blooio) -- iMessage/SMS via Blooio cloud service
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
