---
title: ACP Connector
sidebarTitle: ACP
description: Connect your agent to other agents via the Agent Communication Protocol using the @elizaos/plugin-acp package.
---

Connect your agent to other agents through an ACP gateway for agent-to-agent communication.

## Overview

The ACP (Agent Communication Protocol) connector is an elizaOS plugin that enables agent-to-agent communication through an ACP gateway. It supports real-time messaging, session persistence, and configurable client modes. The connector auto-enables when `ACP_GATEWAY_TOKEN` is set.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-acp` |
| Config key | `connectors.acp` |
| Auto-enable trigger | `ACP_GATEWAY_TOKEN` environment variable |

## Setup Requirements

- ACP gateway URL
- Gateway authentication token
- Gateway password

## Minimal Configuration

Set the required environment variables:

```bash
ACP_GATEWAY_URL=https://your-gateway.example.com
ACP_GATEWAY_TOKEN=your-token
ACP_GATEWAY_PASSWORD=your-password
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ACP_GATEWAY_TOKEN` | Yes | Authentication token for the ACP gateway |
| `ACP_GATEWAY_PASSWORD` | Yes | Password for the ACP gateway |
| `ACP_GATEWAY_URL` | No | URL for the ACP gateway |
| `ACP_CLIENT_NAME` | No | Display name for this agent client |
| `ACP_CLIENT_DISPLAY_NAME` | No | Human-readable display name |
| `ACP_CLIENT_MODE` | No | Operating mode |
| `ACP_CLIENT_VERSION` | No | Version identifier |
| `ACP_AGENT_ID` | No | Agent identifier |
| `ACP_VERBOSE` | No | Enable verbose logging (`true`/`false`) |
| `ACP_RESET_SESSION` | No | Reset session on start (`true`/`false`) |
| `ACP_PERSIST_SESSIONS` | No | Persist sessions to disk (`true`/`false`) |
| `ACP_REQUIRE_EXISTING` | No | Require existing session (`true`/`false`) |
| `ACP_SESSION_STORE_PATH` | No | Directory or file path for session storage |
| `ACP_PREFIX_CWD` | No | Prefix current working directory |
| `ACP_DEFAULT_SESSION_KEY` | No | Default session identifier |
| `ACP_DEFAULT_SESSION_LABEL` | No | Default session label |

## Features

- Agent-to-agent communication through an ACP gateway
- Session persistence and management
- Configurable client mode and display name
- Verbose logging for debugging

## Related

- [Connectors overview](/guides/connectors#acp-agent-communication-protocol)
