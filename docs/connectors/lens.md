---
title: Lens Connector
sidebarTitle: Lens
description: The @elizaos/plugin-lens package is not currently available in the Milady plugin registry.
---

<Warning>
**Not available.** The `@elizaos/plugin-lens` package is not currently in the Milady plugin registry. This page describes a connector that may be added in a future release. Check the [plugin registry](/plugins/registry) for available connectors.
</Warning>

Connect your agent to Lens Protocol for decentralized social interactions.

## Overview

The Lens connector was an external elizaOS plugin that bridged your agent to the Lens Protocol decentralized social graph.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-lens` (upstream, not bundled) |
| Config key | `connectors.lens` |
| Auto-enable trigger | `apiKey`, `token`, or `botToken` |

## Minimal Configuration

```json
{
  "connectors": {
    "lens": {
      "apiKey": "your-lens-api-key"
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LENS_API_KEY` | Lens Protocol API key |

## Setup Steps

1. Obtain API credentials from the [Lens Protocol](https://www.lens.xyz/) developer portal
2. Add the API key to `connectors.lens` in your config or set the `LENS_API_KEY` environment variable
3. Start your agent — the Lens connector will auto-enable
