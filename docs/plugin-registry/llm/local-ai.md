---
title: "LocalAI Plugin"
sidebarTitle: "LocalAI"
description: "LocalAI provider for Milady — self-hosted, OpenAI-compatible local model inference."
---

The LocalAI plugin connects Milady agents to a self-hosted LocalAI instance, providing OpenAI-compatible inference with locally running models.

**Package:** `@elizaos/plugin-local-ai`

**Category:** AI Provider

## Overview

LocalAI is a self-hosted, OpenAI-compatible API server for running LLMs, image generation, and audio models locally. This plugin registers LocalAI as a model provider within the elizaOS runtime, allowing agents to use any model served by a LocalAI instance without sending data to external services.

## Installation

```bash
milady plugins install local-ai
```

## Auto-Enable

Auto-enables when `LOCAL_AI_URL` is set.

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `LOCAL_AI_URL` | Yes | LocalAI server URL (e.g. `http://localhost:8080`) |
| `LOCAL_AI_MODEL` | No | Default model name |
| `LOCAL_AI_API_KEY` | No | API key if required by the server (sensitive) |

### Example

```bash
export LOCAL_AI_URL=http://localhost:8080
export LOCAL_AI_MODEL=gpt-4
```
