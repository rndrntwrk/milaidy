---
title: Lens Connector
sidebarTitle: Lens
description: The Lens Protocol connector is not currently available.
---

> **Unavailable.** The `@elizaos/plugin-lens` package does not exist in the plugin registry or on npm. This connector is not currently functional.

> **Registry status:** This connector is referenced in the runtime auto-enable map but is not included in the `plugins.json` registry. You may need to install it manually with `npm install @elizaos/plugin-lens` before it can be loaded.

## Overview

The Lens connector is an upstream elizaOS plugin that bridges your agent to the Lens Protocol decentralized social graph. It is auto-enabled when an API key is configured.

<Warning>
`@elizaos/plugin-lens` is an upstream elizaOS package and is **not bundled** in the Milady plugin registry. It is referenced in the `CONNECTOR_PLUGINS` auto-enable map and will be resolved at runtime if the package is installed. You may need to install it manually: `npm install @elizaos/plugin-lens`.
</Warning>

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
