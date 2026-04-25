# Lens Connector

> **Registry note:** `@elizaos/plugin-lens` is not currently listed in the Milady plugin registry (`plugins.json`). The package may be available from npm or a separate elizaOS plugin repository. Verify availability before configuring.

Connect your agent to Lens Protocol for decentralized social interactions.

## Overview

The Lens connector is an external elizaOS plugin that bridges your agent to the Lens Protocol decentralized social graph built on Polygon. It is auto-enabled when an API key is configured.

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

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | Lens Protocol API key |

## Features

- Post publishing and engagement on Lens Protocol
- Profile-based social graph traversal
- Decentralized content on Polygon

## Related

- [Lens Plugin Reference](/plugin-registry/platform/lens)
- [Farcaster Connector](/connectors/farcaster) — Another decentralized social connector
- [Nostr Connector](/connectors/nostr) — Relay-based decentralized social
- [Connectors overview](/guides/connectors#lens)
