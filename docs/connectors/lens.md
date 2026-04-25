# Lens Connector

> **Registry note:** `@elizaos/plugin-lens` is not currently listed in the Milady plugin registry (`plugins.json`). The package may be available from npm or a separate elizaOS plugin repository. Verify availability before configuring.

Connect your agent to Lens Protocol for decentralized social interactions.

<Warning>
This connector is **not included** in the bundled plugin registry (`plugins.json`). It is available from the upstream elizaOS registry and must be installed explicitly: `milady plugins install @elizaos/plugin-lens`.
</Warning>

## Overview

The Lens connector is an external elizaOS plugin that bridges your agent to the Lens Protocol decentralized social graph. It must be installed from the registry before use, and then auto-enables when an API key is configured.

## Installation

```bash
milady plugins install @elizaos/plugin-lens
```

- A Lens Protocol account and API credentials from the [Lens Protocol](https://www.lens.xyz/) developer portal

## Configuration

## Setup

### 1. Get a Lens API Key

Obtain API credentials from the [Lens Protocol](https://www.lens.xyz/) developer portal.

### 2. Configure Milady

```json
{
  "connectors": {
    "lens": {
      "apiKey": "your-lens-api-key"
    }
  }
}
```

Or via environment variable:

```bash
export LENS_API_KEY=your-lens-api-key
```

The Lens connector will auto-enable once the API key is configured.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LENS_API_KEY` | Yes | Lens Protocol API key |

## Configuration Reference

1. Install the plugin: `milady plugins install @elizaos/plugin-lens`
2. Obtain API credentials from the [Lens Protocol](https://www.lens.xyz/) developer portal
3. Add the API key to `connectors.lens` in your config or set the `LENS_API_KEY` environment variable
4. Start your agent — the Lens connector will auto-enable
