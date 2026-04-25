---
title: Lens Connector
sidebarTitle: Lens
description: The @elizaos/plugin-lens package is not currently available in the Milady plugin registry.
---

<Warning>
**Not currently available.** The `@elizaos/plugin-lens` package is not present in the Milady plugin registry. The documentation below is retained for reference in case the plugin is restored in a future release. Do not attempt to configure this connector — it will not load.
</Warning>

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
