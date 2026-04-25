---
title: "Instagram Plugin"
sidebarTitle: "Instagram"
description: "Instagram connector for Milady — interact with Instagram messaging and content."
---

The Instagram plugin connects Milady agents to Instagram, enabling message handling and content interactions.

**Package:** `@elizaos/plugin-instagram`

## Installation

```bash
milady plugins install instagram
```

## Setup

### 1. Get Your Instagram Credentials

1. Use your Instagram account username and password
2. For automation, consider creating a dedicated account for your agent

### 2. Configure Milady

```json
{
  "connectors": {
    "instagram": {
      "username": "YOUR_USERNAME",
      "password": "YOUR_PASSWORD"
    }
  }
}
```

Or via environment variables:

```bash
export INSTAGRAM_USERNAME=YOUR_USERNAME
export INSTAGRAM_PASSWORD=YOUR_PASSWORD
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `username` | Yes | Instagram account username |
| `password` | Yes | Instagram account password |
| `enabled` | No | Set `false` to disable (default: `true`) |
| `proxy` | No | Proxy URL for API requests (reduces rate-limit bans) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `INSTAGRAM_USERNAME` | Yes | Instagram account username |
| `INSTAGRAM_PASSWORD` | Yes | Instagram account password |
| `INSTAGRAM_PROXY` | No | Proxy URL for Instagram API requests |
| `INSTAGRAM_VERIFICATION_CODE` | No | Two-factor verification code |

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
