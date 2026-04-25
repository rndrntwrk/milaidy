---
title: "Lens Plugin"
sidebarTitle: "Lens"
description: "The @elizaos/plugin-lens package is not currently available in the Milady plugin registry."
---

<Warning>
**Not available.** The `@elizaos/plugin-lens` package is not currently in the Milady plugin registry. This page describes a plugin that may be added in a future release.
</Warning>

The Lens plugin connects Milady agents to the Lens Protocol, enabling social interactions on the decentralized social graph built on Polygon.

**Package:** `@elizaos/plugin-lens`

> **Availability:** This plugin is not in the bundled registry (`plugins.json`). It is available as an upstream elizaOS plugin and auto-enables when its connector config is present.

## Installation

If available in your installation, the plugin can be enabled via connector config. Otherwise, check the elizaOS plugins repository for the latest source.

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
