---
title: Plugins Overview
sidebarTitle: Overview
description: Milady's plugin system provides modular capabilities — model providers, platform connectors, DeFi integrations, and custom features.
---

Plugins are the primary extension mechanism for Milady. Every capability beyond the core runtime — from LLM providers to blockchain interactions — is delivered as a plugin.

## First-Party Public Plugins

Milady now treats first-party public plugins as package-owned products with host-owned install and lifecycle plumbing.

<CardGroup cols={2}>

<Card title="555 Stream" icon="tower-broadcast" href="/plugins/555-stream">
  Canonical stream/auth/channels/go-live/ads plugin.
</Card>

<Card title="555 Arcade" icon="gamepad-modern" href="/plugins/555-arcade">
  Canonical games/score/leaderboard/quests plugin.
</Card>

</CardGroup>

Use these supporting pages when working on first-party publication:

- [555 Stream](/plugins/555-stream)
- [555 Arcade](/plugins/555-arcade)
- [First-Party Public Plugin Standard](/plugins/first-party-public-standard)
- [First-Party Release Status](/plugins/first-party-release-status)

## What is a Plugin?

A plugin is a self-contained module that registers one or more of:

- **Actions** — Things the agent can do (e.g., send a tweet, swap tokens)
- **Providers** — Context injected into the agent's prompt (e.g., wallet balance, time)
- **Evaluators** — Post-processing logic that runs after each response
- **Services** — Long-running background processes (e.g., cron jobs, event listeners)

## Plugin Categories

<CardGroup cols={2}>

<Card title="Core Plugins" icon="cube" href="/plugin-registry/bootstrap">
  Essential plugins that ship with every Milady installation — message processing, knowledge, database, and secrets.
</Card>

<Card title="Model Providers" icon="brain" href="/plugin-registry/llm/openai">
  LLM integrations for OpenAI, Anthropic, Google, Groq, Ollama, OpenRouter, and DeepSeek.
</Card>

<Card title="Platform Connectors" icon="plug" href="/plugin-registry/platform/discord">
  Bridges to messaging platforms — Discord, Telegram, Twitter, Slack, WhatsApp, and Farcaster.
</Card>

<Card title="DeFi & Blockchain" icon="wallet" href="/plugin-registry/defi/evm">
  On-chain interactions for EVM chains and Solana — token transfers, swaps, and DeFi protocols.
</Card>

<Card title="Feature Plugins" icon="wand-magic-sparkles" href="/plugin-registry/browser">
  Extended capabilities — browser control, image generation, text-to-speech, computer use, and cron scheduling.
</Card>

</CardGroup>

## How Plugins Load

Plugins are loaded during runtime initialization in this order:

1. **Milady plugin** — The bridge plugin (`createMiladyPlugin()`) providing workspace context, session keys, emotes, custom actions, and lifecycle actions. Always first in the plugins array.
2. **Pre-registered plugins** — `@elizaos/plugin-sql` and `@elizaos/plugin-local-embedding` are pre-registered before `runtime.initialize()` to prevent race conditions.
3. **Core plugins** — Always loaded: `sql`, `local-embedding`, `secrets-manager`, `form`, `knowledge`, `rolodex`, `trajectory-logger`, `agent-orchestrator`, `cron`, `shell`, `plugin-manager`, `agent-skills`, `pdf` (see `src/runtime/core-plugins.ts`).
4. **Connector plugins** — Loaded when channel config is present in `connectors` (e.g., Discord, Telegram, Slack).
5. **Provider plugins** — Loaded when the corresponding API key env var is set (e.g., `ANTHROPIC_API_KEY` enables `@elizaos/plugin-anthropic`).
6. **Feature plugins** — Loaded when feature flags or `plugins.entries` are enabled in `milady.json`.
7. **User-installed plugins** — Tracked in `plugins.installs` in `milady.json`.
8. **Custom/drop-in plugins** — Scanned from `~/.milady/plugins/custom/`.
9. **Ejected plugins** — Local overrides from `~/.milady/plugins/ejected/`.

```json
// milady.json plugin configuration
{
  "plugins": {
    "allow": ["@elizaos/plugin-openai", "discord"],
    "entries": {
      "openai": { "enabled": true }
    }
  },
  "connectors": {
    "discord": { "token": "..." }
  }
}
```

## Plugin Lifecycle

```
Install → Register → Initialize → Active → Shutdown
```

1. **Install** — Plugin package is resolved (npm or local)
2. **Register** — Actions, providers, evaluators, and services are registered with the runtime
3. **Initialize** — `init()` is called with runtime context
4. **Active** — Plugin processes events and provides capabilities
5. **Shutdown** — `cleanup()` is called on runtime stop

## Managing Plugins

### Install from Registry

```bash
milady plugins install @elizaos/plugin-openai
```

### List Installed Plugins

```bash
milady plugins list
```

### Enable/Disable

```bash
milady plugins enable plugin-name
milady plugins disable plugin-name
```

### Eject (Copy to Local)

```bash
milady plugins eject plugin-name
```

See [Plugin Eject](/plugins/plugin-eject) for details on customizing ejected plugins.

## Related

- [Plugin Architecture](/plugins/architecture) — Deep dive into the plugin system
- [Create a Plugin](/plugins/create-a-plugin) — Step-by-step tutorial
- [Plugin Development](/plugins/development) — Development guide and API
- [555 Stream](/plugins/555-stream) — Canonical public stream plugin guide
- [555 Arcade](/plugins/555-arcade) — Canonical public arcade plugin guide
- [First-Party Public Plugin Standard](/plugins/first-party-public-standard) — Package/host rules for `555 Stream` and `555 Arcade`
- [First-Party Release Status](/plugins/first-party-release-status) — Current readiness and remaining public gaps
- [Plugin Registry](/plugins/registry) — Browse available plugins
