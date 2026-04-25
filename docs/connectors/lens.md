# Lens Connector

Connect your agent to Lens Protocol for decentralized social interactions using the `@elizaos/plugin-lens` package.

> **Note:** This plugin is not currently listed in the plugin registry. Check the [elizaOS plugins organization](https://github.com/elizaOS-plugins) for availability.

## Prerequisites

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

## Features

- Decentralized social graph interactions via Lens Protocol

## Related

- [Connectors overview](/guides/connectors)
