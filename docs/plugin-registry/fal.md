---
title: "FAL Plugin"
sidebarTitle: "FAL"
description: "FAL media generation plugin for Milady — access FAL.ai's suite of image, video, and audio generation models."
---

The FAL plugin connects Milady agents to [FAL.ai](https://fal.ai)'s media generation platform, providing access to fast inference for image, video, and audio generation models.

**Package:** `@elizaos/plugin-fal`

## Installation

```bash
milady plugins install fal
```

## Enable via Features

```json
{
  "features": {
    "fal": true
  }
}
```

## Configuration

Set your FAL API key:

```json
{
  "env": {
    "FAL_KEY": "<YOUR_FAL_KEY>"
  },
  "features": {
    "fal": true
  },
  "media": {
    "image": {
      "enabled": true,
      "mode": "own-key",
      "provider": "fal",
      "fal": { "model": "flux/schnell" }
    },
    "video": {
      "enabled": true,
      "mode": "own-key",
      "provider": "fal"
    }
  }
}
```

**Get credentials:** [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)

| Variable | Description |
|----------|-------------|
| `FAL_KEY` | FAL.ai API key |

The FAL plugin also auto-enables when `media.image.provider` or `media.video.provider` is set to `"fal"` with `mode: "own-key"`.

## Features

- Image generation via FAL.ai models (Flux, Stable Diffusion, etc.)
- Video generation
- Audio generation
- Fast inference on serverless GPU infrastructure

## Related

- [Image Generation Plugin](/plugin-registry/image-generation) — General image generation
- [Suno Plugin](/plugin-registry/suno) — Music generation
- [Media Generation Guide](/guides/media-generation) — Overview of media capabilities
