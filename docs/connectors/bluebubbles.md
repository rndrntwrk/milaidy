# BlueBubbles Connector

Connect your agent to iMessage through a local [BlueBubbles](https://bluebubbles.app) server running on macOS using the `@elizaos/plugin-bluebubbles` package.

## Prerequisites

- A Mac with Messages signed in
- [BlueBubbles](https://bluebubbles.app) server installed and running on that Mac

## Configuration

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-bluebubbles` |
| Config key | `connectors.bluebubbles` |
| Availability | Registry — install with `milady plugins install @elizaos/plugin-bluebubbles` |
| Enable trigger | `password` or `serverUrl` is truthy in connector config, or `accounts` with at least one enabled entry |

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
4. Install the plugin: `milady plugins install @elizaos/plugin-bluebubbles`
5. Start your agent — the BlueBubbles connector will enable when credentials are present.

## Features

- iMessage send and receive via BlueBubbles server
- DM and group chat support
- Read receipt support
- Webhook-based inbound message handling
- DM and group access policies

## Related

- [iMessage Connector](/connectors/imessage) -- Native iMessage connector (macOS only, reads Messages database directly)
- [Blooio Connector](/connectors/blooio) -- iMessage/SMS via Blooio cloud service
- [Connectors overview](/guides/connectors)
