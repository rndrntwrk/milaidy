# Blooio Connector

Connect your agent to iMessage and SMS messaging via the Blooio bridge service using the `@elizaos/plugin-blooio` package.

## Prerequisites

- A Blooio account and API key from the Blooio platform

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `BLOOIO_API_KEY` | Yes | Blooio service API key |
| `BLOOIO_BASE_URL` | No | Base URL for API requests |
| `BLOOIO_FROM_NUMBER` | No | Sender phone number |
| `BLOOIO_WEBHOOK_URL` | No | Webhook callback URL for receiving inbound messages |
| `BLOOIO_WEBHOOK_PATH` | No | Webhook endpoint path |
| `BLOOIO_WEBHOOK_PORT` | No | Webhook listener port |
| `BLOOIO_WEBHOOK_SECRET` | No | Secret key for webhook/client verification |
| `BLOOIO_SIGNATURE_TOLERANCE_SEC` | No | Tolerance window in seconds for signature validation |

These can be set as environment variables or under the `connectors.blooio` config in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "blooio": {
      "apiKey": "YOUR_BLOOIO_API_KEY"
    }
  }
}
```

The connector auto-enables when `apiKey` is truthy in the connector config and `enabled` is not explicitly `false`.

To disable:

```json
{
  "connectors": {
    "blooio": {
      "apiKey": "YOUR_BLOOIO_API_KEY",
      "enabled": false
    }
  }
}
```

## Setup

1. Obtain an API key from the Blooio platform.
2. Add it to `connectors.blooio` in your config or set the `BLOOIO_API_KEY` environment variable.
3. Start your agent -- the Blooio connector will auto-enable.

## Features

- iMessage and SMS messaging via the Blooio bridge
- Signed webhook verification for inbound messages
- Outbound message sending via API

## Related

- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
