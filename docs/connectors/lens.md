# Lens Connector

> **Registry note:** `@elizaos/plugin-lens` is not currently listed in the Milady plugin registry (`plugins.json`). The package may be available from npm or a separate elizaOS plugin repository. Verify availability before configuring.

Connect your agent to Lens Protocol for decentralized social interactions.

## Overview

The Lens connector is an external elizaOS plugin that bridges your agent to the Lens Protocol decentralized social graph. When available, it will be auto-enabled when an API key is configured.

- A Lens Protocol account and API credentials from the [Lens Protocol](https://www.lens.xyz/) developer portal

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `LENS_API_KEY` | Yes | Lens Protocol API key |

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "lens": {
      "apiKey": "your-lens-api-key"
    }
  }
}
```

The connector auto-enables when `apiKey`, `token`, or `botToken` is truthy in the connector config.

## Setup

1. Obtain API credentials from the [Lens Protocol](https://www.lens.xyz/) developer portal.
2. Add the API key to `connectors.lens` in your config or set the `LENS_API_KEY` environment variable.
3. Start your agent -- the Lens connector will auto-enable.

1. Obtain API credentials from the [Lens Protocol](https://www.lens.xyz/) developer portal
2. Add the API key to `connectors.lens` in your config or set the `LENS_API_KEY` environment variable
3. Start your agent — the Lens connector will auto-enable

## Related

- [Lens plugin reference](/plugin-registry/platform/lens)
- [Connectors overview](/guides/connectors)
- [Configuration reference](/configuration)
