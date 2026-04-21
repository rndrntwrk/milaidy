---
title: "Speech-to-Text Plugin"
sidebarTitle: "Speech-to-Text"
description: "Speech-to-text plugin for Milady — transcribe audio input into text for voice-enabled agent interactions."
---

The Speech-to-Text (STT) plugin enables Milady agents to transcribe audio input into text, powering voice-based interactions.

**Package:** `@elizaos/plugin-stt`

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

The STT plugin uses the configured model provider for transcription. No additional API key is needed beyond your primary provider.

## Features

- Audio transcription to text
- Voice input support for agent conversations
- Works alongside the [TTS plugin](/plugin-registry/tts) for full voice interaction
- Integrates with Talk mode for real-time voice conversations

## Related

- [TTS Plugin](/plugin-registry/tts) — Text-to-speech output
- [Browser Plugin](/plugin-registry/browser) — Web automation
