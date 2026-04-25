# Zalo Connector

Connect your agent to Zalo for Official Account messaging and support workflows using the `@elizaos/plugin-zalo` package.

A personal-account variant is also available as `@elizaos/plugin-zalouser`.

## Prerequisites

- A Zalo Official Account (OA) with access token and secret key

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `ZALO_ACCESS_TOKEN` | Yes | OA access token |
| `ZALO_SECRET_KEY` | Yes | Application secret key |
| `ZALO_APP_ID` | No | Application ID |
| `ZALO_REFRESH_TOKEN` | No | Token refresh credential |
| `ZALO_ENABLED` | No | Enable or disable the connector |
| `ZALO_PROXY_URL` | No | Proxy URL for API requests |
| `ZALO_USE_POLLING` | No | Use polling instead of webhooks |
| `ZALO_WEBHOOK_URL` | No | Webhook URL for inbound messages |
| `ZALO_WEBHOOK_PATH` | No | Webhook endpoint path |
| `ZALO_WEBHOOK_PORT` | No | Webhook listener port |

Install the plugin from the registry:

```bash
milady plugins install zalo
```

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "zalo": {
      "enabled": true
    }
  }
}
```

## Setup

| Variable | Description |
|----------|-------------|
| `ZALO_ACCESS_TOKEN` | OA access token (required) |
| `ZALO_SECRET_KEY` | Application secret key (required) |
| `ZALO_REFRESH_TOKEN` | Token refresh credential |
| `ZALO_APP_ID` | Application ID |
| `ZALO_ENABLED` | Set to `true` to enable |
| `ZALO_PROXY_URL` | Proxy URL for API requests |
| `ZALO_USE_POLLING` | Use polling instead of webhooks |
| `ZALO_WEBHOOK_URL` | Webhook URL for receiving messages |
| `ZALO_WEBHOOK_PATH` | Webhook endpoint path |
| `ZALO_WEBHOOK_PORT` | Port for webhook listener |

## Features

- Official Account messaging and support workflows
- Webhook-based message handling
- Polling mode as alternative to webhooks
- Customer interaction management
- Token refresh support

## Related

- [Zalo plugin reference](/plugin-registry/platform/zalo)
- [Connectors overview](/guides/connectors#zalo)
