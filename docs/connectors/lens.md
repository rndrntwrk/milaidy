---
title: Lens Connector
sidebarTitle: Lens
description: The @elizaos/plugin-lens package is not currently available in the Milady plugin registry.
---

<Warning>
**Not available.** The `@elizaos/plugin-lens` package is not currently in the Milady plugin registry. This page describes a connector that may be added in a future release. Check the [plugin registry](/plugins/registry) for available connectors.
</Warning>

Connect your agent to Lens Protocol for decentralized social interactions.

<Warning>
The Lens plugin (`@elizaos/plugin-lens`) is an upstream elizaOS plugin and is **not included** in the Milady bundled plugin registry. You must install it manually before use.
</Warning>

## Overview

The Lens connector is an external elizaOS plugin that bridges your agent to the Lens Protocol decentralized social graph. After manual installation, it loads when an API key is configured.

## Installation

```bash
milady plugins install @elizaos/plugin-lens
```

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-lens` |
| Registry | Upstream elizaOS (not bundled) |
| Config key | `connectors.lens` |
| Enable trigger | `apiKey` is truthy in connector config (after install) |

> **Note:** The Lens plugin is not published to the `@elizaos` plugin registry. It ships as a bundled or separately sourced package. Check your installation for availability.

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

1. Install the plugin: `milady plugins install @elizaos/plugin-lens`
2. Obtain API credentials from the [Lens Protocol](https://www.lens.xyz/) developer portal
3. Add the API key to `connectors.lens` in your config or set the `LENS_API_KEY` environment variable
4. Start your agent — the Lens connector will load
