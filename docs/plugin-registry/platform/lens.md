---
title: "Lens Plugin"
sidebarTitle: "Lens"
description: "The Lens Protocol plugin is not currently available."
---

<Warning>
The `@elizaos/plugin-lens` package is not currently available in the plugin registry. This documentation is retained for reference but the plugin may not be installable. Check the plugin registry for current availability.
</Warning>

The Lens plugin connects Milady agents to the Lens Protocol, enabling social interactions on the decentralized social graph built on Polygon.

**Package:** `@elizaos/plugin-lens`

<Warning>
`@elizaos/plugin-lens` is an upstream elizaOS package and is **not currently in the bundled Milady plugin registry**. It is referenced in the `CONNECTOR_PLUGINS` auto-enable map and will be resolved at runtime if the package is installed manually via `npm install @elizaos/plugin-lens`.
</Warning>

## Installation

```bash
npm install @elizaos/plugin-lens
```

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

Or use environment variables:

```bash
export LENS_API_KEY=your-lens-api-key
```

## Auto-Enable

The plugin auto-enables when `apiKey`, `token`, or `botToken` is present in the connector config.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `apiKey` | Yes | Lens Protocol API key |

## Features

- Lens Protocol social interactions
- Post publishing and engagement
- Profile-based social graph traversal
- Decentralized content on Polygon

## Related

- [Farcaster Plugin](/plugin-registry/platform/farcaster) — Decentralized social connector
- [Nostr Plugin](/plugin-registry/platform/nostr) ��� Relay-based decentralized social
- [Connectors Guide](/guides/connectors) — Full connector reference
