---
title: ACP Connector
sidebarTitle: ACP
description: Connect your agent to the Agent Communication Protocol gateway using the @elizaos/plugin-acp package.
---

Connect your agent to other agents through an ACP (Agent Communication Protocol) gateway for real-time inter-agent communication.

## Overview

The ACP connector is an elizaOS plugin that bridges your agent to an ACP gateway, enabling agent-to-agent messaging and orchestration workflows. It is auto-enabled when a valid gateway token is detected.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-acp` |
| Install | `milady plugins install acp` |
| Auto-enable trigger | `ACP_GATEWAY_TOKEN` environment variable |

## Setup Requirements

- An ACP gateway URL
- A gateway authentication token or password

## Configuration

```json
{
  "connectors": {
    "acp": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ACP_GATEWAY_URL` | No | URL for the ACP gateway |
| `ACP_GATEWAY_TOKEN` | No | Authentication token for the gateway |
| `ACP_GATEWAY_PASSWORD` | Yes | Password for the gateway |
| `ACP_AGENT_ID` | No | Agent identifier |
| `ACP_CLIENT_NAME` | No | Client display name |
| `ACP_CLIENT_DISPLAY_NAME` | No | Human-readable display name |
| `ACP_CLIENT_MODE` | No | Operating mode |
| `ACP_CLIENT_VERSION` | No | Client version identifier |
| `ACP_VERBOSE` | No | Enable verbose logging (`true`/`false`) |

### Session Management

| Variable | Required | Description |
|----------|----------|-------------|
| `ACP_PERSIST_SESSIONS` | No | Persist sessions to disk (`true`/`false`) |
| `ACP_SESSION_STORE_PATH` | No | Directory or file path for session storage |
| `ACP_DEFAULT_SESSION_KEY` | No | Default session identifier |
| `ACP_DEFAULT_SESSION_LABEL` | No | Default session label |
| `ACP_RESET_SESSION` | No | Reset session on start (`true`/`false`) |
| `ACP_REQUIRE_EXISTING` | No | Require an existing session (`true`/`false`) |
| `ACP_PREFIX_CWD` | No | Prefix current working directory |

## Features

- Real-time agent-to-agent messaging via ACP gateway
- Session persistence and management
- Multi-agent orchestration workflows

## Related

- [Connectors overview](/guides/connectors)
