---
title: "Suno Plugin"
sidebarTitle: "Suno"
description: "Suno music generation plugin for Milady — generate music and songs using Suno's AI models."
---

<Warning>
This plugin is not yet available in the Milady plugin registry.
</Warning>

The Suno plugin connects Milady agents to Suno's music generation platform, enabling agents to create music and songs from text prompts.

**Package:** `@elizaos/plugin-suno` (not yet published)

> **Note:** This plugin is an upstream elizaOS feature plugin and is not included in the bundled `plugins.json` registry. It is installable from the remote elizaOS plugin registry and auto-enables via the `features.suno` config flag.

## Installation

```bash
milady plugins install @elizaos/plugin-suno
```

## Configuration

### Enable via Features

```json
{
  "features": {
    "suno": true
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUNO_API_KEY` | Yes | Suno API key |

```bash
export SUNO_API_KEY=your-suno-api-key
```

## Features

- Music generation from text descriptions
- Song creation with lyrics
- Multiple music styles and genres
- Instrumental track generation

## Related

- [FAL Plugin](/plugin-registry/fal) — Image, video, and audio generation
- [Image Generation Plugin](/plugin-registry/image-generation) — Image generation
- [Media Generation Guide](/guides/media-generation) — Overview of media capabilities
