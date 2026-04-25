---
title: "Suno Plugin"
sidebarTitle: "Suno"
description: "Suno music generation plugin for Milady — generate music and songs using Suno's AI models."
---

The Suno plugin connects Milady agents to Suno's music generation platform, enabling agents to create music and songs from text prompts.

**Package:** `@elizaos/plugin-suno`

> **Note:** This plugin is an upstream elizaOS feature plugin and is not included in the bundled `plugins.json` registry. It is installable from the remote elizaOS plugin registry and auto-enables via the `features.suno` config flag.

## Installation

```bash
milady plugins install suno
```

## Enable via Features

```json
{
  "features": {
    "suno": true
  }
}
```

## Configuration

Set your Suno API key:

```json
{
  "env": {
    "SUNO_API_KEY": "<YOUR_SUNO_KEY>"
  },
  "features": {
    "suno": true
  },
  "media": {
    "audio": {
      "enabled": true,
      "mode": "own-key",
      "provider": "suno"
    }
  }
}
```

| Variable | Description |
|----------|-------------|
| `SUNO_API_KEY` | Suno API key for music generation |

The Suno plugin also auto-enables when `media.audio.provider` is set to `"suno"` with `mode: "own-key"`.

## Features

- Music generation from text descriptions
- Song creation with lyrics
- Multiple music styles and genres

## Related

- [FAL Plugin](/plugin-registry/fal) — Image, video, and audio generation
- [Image Generation Plugin](/plugin-registry/image-generation) — Image generation
- [Media Generation Guide](/guides/media-generation) — Overview of media capabilities
