---
title: "Vision Plugin"
sidebarTitle: "Vision"
description: "Vision plugin for Milady — image understanding and visual analysis capabilities for agents."
---

The Vision plugin gives Milady agents the ability to understand and analyze images, enabling visual reasoning in conversations.

**Package:** `@elizaos/plugin-vision`

## Installation

```bash
milady plugins install vision
```

## Enable via Features

```json
{
  "features": {
    "vision": true
  }
}
```

**Note:** This plugin requires the `@tensorflow/tfjs-node` native addon. On systems without native build tools, set `MILADY_NO_VISION_DEPS=1` to skip installation of optional vision dependencies.

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `CAMERA_NAME` | No | Name of the camera device to use |
| `PIXEL_CHANGE_THRESHOLD` | No | Pixel change threshold for motion detection |

## Features

- Image understanding and description
- Visual analysis of screenshots and photos
- Camera input with change detection
- Feature-gated — only loaded when explicitly enabled

## Related

- [Browser Plugin](/plugin-registry/browser) — Web automation with screenshot capture
- [Computer Use Plugin](/plugin-registry/computeruse) — Full desktop automation
- [Image Generation Plugin](/plugin-registry/image-generation) — Generate images
