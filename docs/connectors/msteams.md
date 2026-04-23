# Microsoft Teams Connector

Connect your agent to Microsoft Teams for DMs, team channels, and threaded conversations using the `@elizaos/plugin-msteams` package.

## Prerequisites

- An Azure Bot registration with App ID, App Password, and Tenant ID
- The bot registered in the Microsoft Teams admin center

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `MSTEAMS_APP_PASSWORD` | Yes | Azure Bot App Password (client secret) |
| `MSTEAMS_APP_ID` | No | Azure Bot App ID (Microsoft App ID) |
| `MSTEAMS_TENANT_ID` | No | Azure AD Tenant ID |
| `MSTEAMS_ENABLED` | No | Enable or disable the connector |
| `MSTEAMS_WEBHOOK_PATH` | No | Webhook endpoint path |
| `MSTEAMS_WEBHOOK_PORT` | No | Port for incoming webhook events |
| `MSTEAMS_MEDIA_MAX_MB` | No | Maximum media file size in MB |
| `MSTEAMS_ALLOWED_TENANTS` | No | Comma-separated allowed tenant list |
| `MSTEAMS_SHAREPOINT_SITE_ID` | No | SharePoint site ID for file uploads in group chats |

The connector auto-enables when `botToken`, `token`, or `apiKey` is truthy in the connector config. The `appId`/`appPassword`/`tenantId` fields alone do not trigger auto-enable -- you must include one of the trigger fields or add the plugin to `plugins.allow`.

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "msteams": {
      "botToken": "YOUR_BOT_TOKEN",
      "appId": "YOUR_APP_ID",
      "appPassword": "YOUR_APP_PASSWORD",
      "tenantId": "YOUR_TENANT_ID"
    }
  }
}
```

If you don't have a `botToken`, add the plugin explicitly:

```json
{
  "plugins": {
    "allow": ["@elizaos/plugin-msteams"]
  },
  "connectors": {
    "msteams": {
      "appId": "YOUR_APP_ID",
      "appPassword": "YOUR_APP_PASSWORD",
      "tenantId": "YOUR_TENANT_ID"
    }
  }
}
```

To disable:

```json
{
  "connectors": {
    "msteams": {
      "enabled": false
    }
  }
}
```

## Setup

1. Register an Azure Bot in the [Azure Portal](https://portal.azure.com).
2. Note the **App ID**, **App Password** (client secret), and **Tenant ID**.
3. Configure the bot's messaging endpoint to point to your Milady instance.
4. Add the bot to Microsoft Teams via the Teams admin center.
5. Add the credentials to your Milady config.
6. Start your agent.

## Features

- Team channel and DM messaging
- Threaded reply support (`thread` or `top-level` reply styles)
- Mention-based response filtering
- Per-team and per-channel configuration
- Media uploads via OneDrive/SharePoint
- Multi-tenant support via allowed tenants list
- Webhook-based event handling

## Related

- [Google Chat connector](/connectors/googlechat)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
