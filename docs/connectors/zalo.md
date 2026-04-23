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

1. Register a Zalo Official Account at [oa.zalo.me](https://oa.zalo.me/).
2. Obtain your OA access token, secret key, and app ID.
3. Install the plugin: `milady plugins install zalo`.
4. Set `ZALO_ACCESS_TOKEN` and `ZALO_SECRET_KEY` as environment variables or in your config.
5. Configure webhook URL in the Zalo OA dashboard to point to your Milady instance (or enable polling with `ZALO_USE_POLLING`).
6. Start your agent.

## Features

- Official Account messaging and support workflows
- Webhook-based message handling
- Polling mode as alternative to webhooks
- Customer interaction management
- Token refresh support

## Related

- [Connectors overview](/guides/connectors#zalo)
