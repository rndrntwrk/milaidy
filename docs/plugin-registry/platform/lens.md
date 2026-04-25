---
title: "Lens Plugin"
sidebarTitle: "Lens"
description: "The @elizaos/plugin-lens package is not currently available in the Milady plugin registry."
---

> **Registry note:** `@elizaos/plugin-lens` is not currently listed in the Milady plugin registry (`plugins.json`). The package may be available from npm or a separate elizaOS plugin repository. Verify availability before configuring.

The Lens plugin connects Milady agents to the Lens Protocol, enabling social interactions on the decentralized social graph built on Polygon.

<Warning>
This plugin is not included in the bundled plugin registry (`plugins.json`). It may be available as an upstream elizaOS community plugin on npm. The `milady plugins install lens` command will fail unless the package is published to npm.
</Warning>

**Package:** `@elizaos/plugin-lens`

## Installation

```bash
# Requires the package to be available on npm
milady plugins install lens
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

## Enabling

After installation, the plugin loads when `apiKey` is present in the connector config. Unlike bundled connectors, it does not auto-enable from config alone — it must be installed first.

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
