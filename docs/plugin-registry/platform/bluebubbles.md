---
title: "BlueBubbles Plugin"
sidebarTitle: "BlueBubbles"
description: "BlueBubbles connector for sending and receiving iMessage through a local BlueBubbles server"
---

iMessage connector via a local BlueBubbles server.

**Package:** `@elizaos/plugin-bluebubbles`

## Overview

The BlueBubbles plugin connects Milady agents to iMessage through a local BlueBubbles server. Agents can send and receive iMessages, enabling conversational workflows over Apple's messaging platform.

## Installation

```bash
milady plugins install bluebubbles
```

## Auto-Enable

This plugin auto-enables when the `BLUEBUBBLES_SERVER_URL` environment variable is set.

## Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `BLUEBUBBLES_SERVER_URL` | string | Yes | BlueBubbles server URL |
| `BLUEBUBBLES_PASSWORD` | string | Yes (sensitive) | BlueBubbles server password |
