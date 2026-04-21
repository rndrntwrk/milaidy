---
title: ACP Connector
sidebarTitle: ACP
description: Connect agents through the Agent Communication Protocol (ACP) gateway using the @elizaos/plugin-acp package.
---

Connect your agent to other agents through the Agent Communication Protocol gateway for real-time agent-to-agent communication.

## Overview

The ACP connector is an elizaOS plugin that bridges your agent to an ACP gateway, enabling agent-to-agent communication. It supports session persistence, configurable client modes, and real-time message relay.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-acp` |
| Config key | `connectors.acp` |
| Category | Feature (connector-tagged) |

## Setup Requirements

- An ACP gateway URL
- Gateway password (required)
- Gateway token (optional, for authentication)

## Configuration

```json
{
  "connectors": {
    "acp": {
      "enabled": true,
      "gatewayUrl": "https://your-acp-gateway.example.com",
      "gatewayPassword": "YOUR_GATEWAY_PASSWORD"
    }
  }
}
```

## Environment Variables

| Variable | Required | Sensitive | Description |
|----------|----------|-----------|-------------|
| `ACP_GATEWAY_URL` | No | No | URL for the ACP gateway |
| `ACP_GATEWAY_TOKEN` | No | Yes | Authentication token for the gateway |
| `ACP_GATEWAY_PASSWORD` | Yes | Yes | Password for the gateway |
| `ACP_AGENT_ID` | No | No | Agent identifier |
| `ACP_CLIENT_NAME` | No | No | Client display name |
| `ACP_CLIENT_DISPLAY_NAME` | No | No | Client display name (UI-facing) |
| `ACP_CLIENT_MODE` | No | No | Operating mode |
| `ACP_CLIENT_VERSION` | No | No | Client version identifier |
| `ACP_PREFIX_CWD` | No | No | Prefix current working directory |
| `ACP_VERBOSE` | No | No | Enable verbose logging |
| `ACP_RESET_SESSION` | No | No | Reset session on start |
| `ACP_PERSIST_SESSIONS` | No | No | Persist sessions to disk |
| `ACP_REQUIRE_EXISTING` | No | No | Require an existing session |
| `ACP_SESSION_STORE_PATH` | No | No | Directory or file path for session storage |
| `ACP_DEFAULT_SESSION_KEY` | No | No | Default session identifier |
| `ACP_DEFAULT_SESSION_LABEL` | No | No | Default session label |

## Features

- Agent-to-agent communication via ACP gateway
- Session persistence and management
- Configurable client modes
- Real-time message relay

## Related

- [Connectors overview](/guides/connectors)
