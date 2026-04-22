---
title: "Speech-to-Text Plugin"
sidebarTitle: "Speech-to-Text"
description: "Speech-to-text plugin for Milady — transcribe audio input into text for voice-enabled agent interactions."
---

The Speech-to-Text (STT) plugin enables Milady agents to transcribe audio input into text, powering voice-based interactions.

**Package:** `@elizaos/plugin-stt`

> **Note:** This plugin is an upstream elizaOS feature plugin and is not included in the bundled `plugins.json` registry. It is installable from the remote elizaOS plugin registry and auto-enables via the `features.stt` config flag.

## Installation

```bash
milady plugins install stt
```

## Enable via Features

```json
{
  "features": {
    "stt": true
  }
}
```

## Features

- Audio transcription to text
- Voice input support for agent conversations
- Works alongside the [TTS plugin](/plugin-registry/tts) for full voice interaction

## Related

- [TTS Plugin](/plugin-registry/tts) — Text-to-speech output
- [Browser Plugin](/plugin-registry/browser) — Web automation
