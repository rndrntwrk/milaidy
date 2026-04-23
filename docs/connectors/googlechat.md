# Google Chat Connector

Connect your agent to Google Chat for DMs and space conversations using the `@elizaos/plugin-google-chat` package.

## Prerequisites

- A Google Cloud project with the Google Chat API enabled
- A service account with Chat Bot permissions

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | No | Path to credentials file or inline JSON |
| `GOOGLE_CHAT_SERVICE_ACCOUNT` | No | Service account credentials (inline) |
| `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` | No | Path to service account credentials file |
| `GOOGLE_CHAT_ENABLED` | No | Enable or disable the connector |
| `GOOGLE_CHAT_AUDIENCE` | No | Authentication audience/scope |
| `GOOGLE_CHAT_AUDIENCE_TYPE` | No | Audience type (e.g., `app-url`, `project-number`) |
| `GOOGLE_CHAT_BOT_USER` | No | Bot user identifier |
| `GOOGLE_CHAT_SPACES` | No | Comma-separated space/room list |
| `GOOGLE_CHAT_WEBHOOK_PATH` | No | Webhook endpoint path |
| `GOOGLE_CHAT_REQUIRE_MENTION` | No | Only respond when @mentioned |

The connector auto-enables when `botToken`, `token`, or `apiKey` is truthy in the connector config. The `serviceAccountFile`/`audience` fields alone do not trigger auto-enable -- you must include one of the trigger fields or add the plugin to `plugins.allow`.

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "googlechat": {
      "apiKey": "placeholder",
      "serviceAccountFile": "./service-account.json",
      "audienceType": "project-number",
      "audience": "123456789",
      "webhookPath": "/google-chat"
    }
  }
}
```

If you don't want to set a trigger field, add the plugin explicitly:

```json
{
  "plugins": {
    "allow": ["@elizaos/plugin-google-chat"]
  },
  "connectors": {
    "googlechat": {
      "serviceAccountFile": "./service-account.json",
      "audienceType": "project-number",
      "audience": "123456789",
      "webhookPath": "/google-chat"
    }
  }
}
```

To disable:

```json
{
  "connectors": {
    "googlechat": {
      "enabled": false
    }
  }
}
```

## Setup

1. Create a Google Cloud project and enable the Google Chat API.
2. Create a service account with the Chat Bot role.
3. Download the service account key file or configure inline credentials.
4. Configure the Chat app in the Google Cloud Console with an HTTP endpoint pointing to your Milady instance.
5. Add the credentials and webhook path to your Milady config.
6. Start your agent.

## Features

- **Space support** -- Join and respond in Google Chat spaces
- **Direct messages** -- Handle DMs with users
- **Mention filtering** -- Optionally only respond when @mentioned
- **Multi-account** -- Run multiple Google Chat bots from a single agent via the `accounts` map

## Related

- [MS Teams connector](/connectors/msteams)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
