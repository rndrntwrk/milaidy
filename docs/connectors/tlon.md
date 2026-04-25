# Tlon Connector

Connect your agent to the Urbit network via Tlon for ship-to-ship messaging using the `@elizaos/plugin-tlon` package.

## Prerequisites

- An Urbit ship with access credentials (ship name and access code)

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `TLON_SHIP` | No | Urbit ship name (e.g., `~zod`) |
| `TLON_CODE` | No | Ship authentication/access code |
| `TLON_URL` | No | Ship URL (e.g., `http://localhost:8080`) |
| `TLON_ENABLED` | No | Enable or disable the connector |
| `TLON_DM_ALLOWLIST` | No | Comma-separated allowed user list for DMs |
| `TLON_GROUP_CHANNELS` | No | Comma-separated list of group channel identifiers |
| `TLON_AUTO_DISCOVER_CHANNELS` | No | Auto-discover available channels (boolean) |

Install the plugin from the registry:

```bash
milady plugins install tlon
```

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "tlon": {
      "enabled": true
    }
  }
}
```

## Setup

1. Ensure you have access to an Urbit ship.
2. Note the ship name, access code, and URL.
3. Install the plugin: `milady plugins install tlon`.
4. Set the `TLON_SHIP`, `TLON_CODE`, and `TLON_URL` environment variables or configure them inline.
5. Start your agent.

## Features

- Urbit-based chat and social interactions
- Ship-to-ship messaging
- Group chat participation
- DM allowlisting
- Automatic channel discovery

## Related

- [Connectors overview](/guides/connectors#tlon)
