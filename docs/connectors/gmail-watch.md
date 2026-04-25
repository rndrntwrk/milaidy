# Gmail Watch Connector

Monitor Gmail inboxes for incoming messages using Google Cloud Pub/Sub with the `@elizaos/plugin-gmail-watch` package.

## Prerequisites

- A Gmail account
- Google Cloud service account or OAuth credentials with Gmail API access
- A Pub/Sub topic configured for Gmail push notifications

## Configuration

Gmail Watch does not use environment variables for configuration. It is enabled via the `features` section of your config.

Install the plugin from the registry:

```bash
milady plugins install gmail-watch
```

Enable in `~/.milady/milady.json`:

```json
{
  "features": {
    "gmailWatch": true
  }
}
```

## Setup

1. Set up a Google Cloud project with the Gmail API enabled.
2. Configure a Pub/Sub topic for Gmail push notifications.
3. Create a service account or OAuth credentials with Gmail API access.
4. Install the plugin: `milady plugins install gmail-watch`.
5. Enable the feature in your config as shown above.
6. Start your agent.

## Features

- Gmail Pub/Sub message watching
- Auto-renewal of watch subscriptions
- Inbound email event handling
- Label filtering for targeted inbox monitoring

## Important

Unlike most connectors, Gmail Watch is configured via the `features` section of `milady.json`, **not** the `connectors` section. It must be installed from the registry before use.

## Related

- [Gmail Watch plugin reference](/plugin-registry/platform/gmail-watch)
- [Connectors overview](/guides/connectors#gmail-watch)
- [Configuration reference](/configuration)
