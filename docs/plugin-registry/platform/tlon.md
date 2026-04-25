---
title: "Tlon Plugin"
sidebarTitle: "Tlon"
description: "Tlon connector for Milady — bot integration with the Tlon (Urbit) messaging platform."
---

The Tlon plugin connects Milady agents to Tlon (Urbit), enabling message handling through a connected Urbit ship.

**Package:** `@elizaos/plugin-tlon`

## Installation

```bash
milady plugins install tlon
```

## Setup

### 1. Get Your Urbit Ship Credentials

1. Have a running Urbit ship (planet, star, or comet)
2. Note the ship name (e.g., `~zod`)
3. Obtain the access code from your ship's web interface (Settings → Access Key)
4. Note the ship's URL (e.g., `http://localhost:8080`)

### 2. Configure Milady

```json
{
  "connectors": {
    "tlon": {
      "ship": "YOUR_SHIP",
      "code": "YOUR_CODE",
      "url": "YOUR_URL"
    }
  }
}
```

Or via environment variables:

```bash
export TLON_SHIP=YOUR_SHIP
export TLON_CODE=YOUR_CODE
export TLON_URL=YOUR_URL
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `ship` | Yes | Urbit ship name (e.g., `~zod`) |
| `code` | Yes | Urbit ship access code |
| `url` | Yes | Urbit ship URL |
| `enabled` | No | Set `false` to disable (default: `true`) |
| `dmAllowlist` | No | Comma-separated allowed user list for DMs |
| `groupChannels` | No | Comma-separated list of group channel identifiers |
| `autoDiscoverChannels` | No | Comma-separated list of channels to auto-discover |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TLON_SHIP` | No | Urbit ship name |
| `TLON_CODE` | No | Ship access code |
| `TLON_URL` | No | Ship URL |
| `TLON_ENABLED` | No | Enable or disable the connector |
| `TLON_DM_ALLOWLIST` | No | Comma-separated allowed user list for DMs |
| `TLON_GROUP_CHANNELS` | No | Comma-separated group channel identifiers |
| `TLON_AUTO_DISCOVER_CHANNELS` | No | Comma-separated channels to auto-discover |

## Features

- Urbit-based chat and social interactions
- Ship-to-ship messaging
- Group chat participation
- DM allowlists for access control
- Channel auto-discovery

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
