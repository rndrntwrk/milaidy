---
title: "Lens Plugin"
sidebarTitle: "Lens"
description: "The @elizaos/plugin-lens package is not currently available in the Milady plugin registry."
---

<Warning>
**Not currently available.** The `@elizaos/plugin-lens` package is not present in the Milady plugin registry. The documentation below is retained for reference in case the plugin is restored in a future release.
</Warning>

The Lens plugin connected Milady agents to the Lens Protocol for social interactions on the decentralized social graph built on Polygon.

**Package:** `@elizaos/plugin-lens`

## Installation (unavailable)

```bash
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

- [Farcaster Plugin](/plugin-registry/platform/farcaster) — Another decentralized social connector
- [Nostr Plugin](/plugin-registry/platform/nostr) — Relay-based decentralized social
- [Connectors Guide](/guides/connectors#lens) — Full configuration reference
