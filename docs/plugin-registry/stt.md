---
title: "Speech-to-Text Plugin"
sidebarTitle: "Speech-to-Text"
description: "Speech-to-text plugin for Milady — transcribe audio input into text for voice-enabled agent interactions."
---

> **Not in plugin registry.** `@elizaos/plugin-stt` is not registered in `plugins.json`. This plugin may not be installable via `milady plugins install`. Speech-to-text (Whisper) is available through the [OpenAI](/plugin-registry/llm/openai) plugin.

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

The STT plugin uses the configured model provider for transcription. No additional API key is needed beyond your primary provider.

## Features

- Audio transcription to text
- Voice input support for agent conversations
- Works alongside the [TTS plugin](/plugin-registry/tts) for full voice interaction
- Integrates with Talk mode for real-time voice conversations

## Related

- [TTS Plugin](/plugin-registry/tts) — Text-to-speech output
- [Browser Plugin](/plugin-registry/browser) — Web automation
