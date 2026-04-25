---
title: "Plugin Architecture"
sidebarTitle: "Architecture"
description: "Deep dive into Milady's plugin system — registration lifecycle, hook points, auto-enable mechanism, and dependency resolution."
---

The Milady plugin system is built on elizaOS core. Every capability beyond the base runtime — model providers, platform connectors, DeFi integrations, scheduling, and custom features — is delivered as a plugin.

> **Path convention:** Paths like `packages/agent/` and `packages/app-core/` below refer to directories inside the `eliza/` git submodule.

## System Design

Plugins are isolated modules that register capabilities with the `AgentRuntime`. The runtime orchestrates plugin loading, dependency resolution, initialization, and shutdown.

```
AgentRuntime
├── Core Plugins     (always loaded)
├── Auto-enabled     (triggered by env vars / config)
├── Character        (specified in character file)
└── Local            (from plugins/ directory)
```

The source of truth for which plugins are always loaded lives in the elizaOS submodule at `eliza/packages/agent/src/runtime/core-plugins.ts` (re-exported by `eliza/packages/app-core/src/runtime/core-plugins.ts`). Initialize the submodule with `bun run setup:upstreams` to inspect these files locally.

```typescript
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql",               // database adapter — required
  "@elizaos/plugin-local-embedding",   // local embeddings — required for memory
  "@elizaos/plugin-form",              // form handling for guided user journeys
  "knowledge",                         // RAG knowledge management — built-in runtime feature, not a standalone registry plugin
  "@elizaos/plugin-trajectory-logger", // trajectory logging for debugging and RL training
  "@elizaos/plugin-agent-orchestrator",// multi-agent orchestration (PTY, SwarmCoordinator, workspace provisioning)
  "@elizaos/plugin-cron",              // scheduled jobs and automation
  "@elizaos/plugin-app-control",       // launch, close, and list running Milady apps from agent chat
  "@elizaos/plugin-shell",             // shell command execution
  "@elizaos/plugin-agent-skills",      // skill execution and marketplace runtime
  "@elizaos/plugin-commands",          // slash command handling (skills auto-register as /commands)
  "@elizaos/plugin-plugin-manager",    // dynamic plugin management for registry/plugin installs
  "roles",                             // internal role-based access control (OWNER/ADMIN/NONE) — built-in runtime module
];
```

> **Note:** Several capabilities that were previously separate plugins are now built-in to the runtime: `knowledge`, `relationships`, `trajectories`, and `roles` are native features; `form`, `experience`, `clipboard`, and `personality` are advanced capabilities enabled via `advancedCapabilities: true`; `plugin-manager`, `secrets-manager`, and `trust` are core capabilities enabled via character settings. `@elizaos/plugin-agent-orchestrator` is opt-in via the `ELIZA_AGENT_ORCHESTRATOR` env var (the Eliza app enables it by default).

### Optional Core Plugins

A separate list of optional core plugins can be enabled from the admin panel. These are not loaded by default due to packaging or specification constraints. The list lives in `eliza/packages/agent/src/runtime/core-plugins.ts`:

```typescript
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-pdf",                   // PDF processing
  "@elizaos/plugin-cua",                   // CUA computer-use agent (cloud sandbox automation)
  "@elizaos/plugin-obsidian",              // Obsidian vault CLI integration
  "@elizaos/plugin-code",                  // code writing and file operations
  "@elizaos/plugin-repoprompt",            // RepoPrompt CLI integration and workflow orchestration
  "@elizaos/plugin-claude-code-workbench", // Claude Code companion workflows for this monorepo
  "@elizaos/plugin-computeruse",           // computer use automation (requires platform-specific binaries)
  "@elizaos/plugin-browser",              // browser automation (requires stagehand-server)
  "@elizaos/plugin-vision",               // vision/image understanding (feature-gated)
  "@elizaos/plugin-cli",                  // CLI interface
  "@elizaos/plugin-discord",              // Discord bot integration
  "@elizaos/plugin-discord-local",        // Local Discord desktop integration for macOS
  "@elizaos/plugin-bluebubbles",          // BlueBubbles-backed iMessage integration for macOS
  "@elizaos/plugin-telegram",             // Telegram bot integration
  "@elizaos/plugin-signal",               // Signal user-account integration
  "@elizaos/plugin-twitch",               // Twitch integration
  "@elizaos/plugin-edge-tts",             // text-to-speech (Microsoft Edge TTS)
  "@elizaos/plugin-elevenlabs",           // ElevenLabs text-to-speech
  "@elizaos/plugin-music-library",        // music metadata, library, playlists, YouTube search
  "@elizaos/plugin-music-player",         // music playback engine + streaming routes
];
```

Plugins such as `@elizaos/plugin-directives`, `@elizaos/plugin-mcp`, and `@elizaos/plugin-scheduling` are commented out in the source and may be activated in future releases.

## Plugin Hook Points

A plugin can register any combination of the following hook points:

| Hook | Type | Purpose |
|------|------|---------|
| `actions` | `Action[]` | Things the agent can do; the LLM selects actions from this list |
| `providers` | `Provider[]` | Context injected into the prompt before each LLM call |
| `evaluators` | `Evaluator[]` | Post-response assessment; can trigger follow-up actions |
| `services` | `ServiceClass[]` | Long-running background processes |
| `routes` | `Route[]` | HTTP endpoints exposed by the agent API server |
| `events` | `Record<EventName, Handler[]>` | Callbacks for runtime events |
| `models` | `Record<ModelType, Handler>` | Custom model inference handlers |

## Registration Lifecycle

```
1. Resolve      — Plugin package is located (npm, local, workspace)
2. Import       — Module is dynamically imported and shape is validated
3. Sort         — Plugins are ordered by dependencies and priority field
4. Init         — plugin.init(config, runtime) is called
5. Register     — actions, providers, services, routes, events are registered
6. Active       — Plugin responds to messages and events
7. Shutdown     — plugin.cleanup() / service.stop() called on exit
```

### Plugin Interface

```typescript
interface Plugin {
  name: string;
  description: string;

  // Lifecycle
  init?: (config: Record<string, unknown>, runtime: IAgentRuntime) => Promise<void>;

  // Hook points
  actions?: Action[];
  providers?: Provider[];
  evaluators?: Evaluator[];
  services?: ServiceClass[];
  routes?: Route[];
  events?: Record<string, Handler[]>;
  models?: Record<string, ModelHandler>;
  componentTypes?: ComponentType[];

  // Load order
  priority?: number;          // Higher = loaded later
  dependencies?: string[];    // Other plugin names this depends on
  tests?: TestSuite[];
}
```

## Auto-Enable Mechanism

Plugins are automatically enabled when their required configuration is detected. This logic lives in the elizaOS submodule at `eliza/packages/agent/src/config/plugin-auto-enable.ts` (extended by `eliza/packages/app-core/src/config/plugin-auto-enable.ts` for Milady-specific connectors like WeChat) and runs before runtime initialization.

### Trigger Sources

**Environment variable API keys** — The `AUTH_PROVIDER_PLUGINS` map connects env vars to plugin package names. Plugins marked with `*` are upstream elizaOS plugins available from the remote registry but **not** included in the bundled `plugins.json`:

```typescript
const AUTH_PROVIDER_PLUGINS = {
  ANTHROPIC_API_KEY:              "@elizaos/plugin-anthropic",
  CLAUDE_API_KEY:                 "@elizaos/plugin-anthropic",
  OPENAI_API_KEY:                 "@elizaos/plugin-openai",
  AI_GATEWAY_API_KEY:             "@elizaos/plugin-vercel-ai-gateway",
  AIGATEWAY_API_KEY:              "@elizaos/plugin-vercel-ai-gateway",
  GOOGLE_API_KEY:                 "@elizaos/plugin-google-genai",
  GOOGLE_GENERATIVE_AI_API_KEY:   "@elizaos/plugin-google-genai",
  GOOGLE_CLOUD_API_KEY:           "@elizaos/plugin-google-antigravity",  // * upstream-only
  GROQ_API_KEY:                   "@elizaos/plugin-groq",
  XAI_API_KEY:                    "@elizaos/plugin-xai",
  GROK_API_KEY:                   "@elizaos/plugin-xai",
  OPENROUTER_API_KEY:             "@elizaos/plugin-openrouter",
  OLLAMA_BASE_URL:                "@elizaos/plugin-ollama",
  ZAI_API_KEY:                    "@homunculuslabs/plugin-zai",          // * upstream-only
  DEEPSEEK_API_KEY:               "@elizaos/plugin-deepseek",            // * upstream-only
  TOGETHER_API_KEY:               "@elizaos/plugin-together",            // * upstream-only
  MISTRAL_API_KEY:                "@elizaos/plugin-mistral",             // * upstream-only
  COHERE_API_KEY:                 "@elizaos/plugin-cohere",              // * upstream-only
  PERPLEXITY_API_KEY:             "@elizaos/plugin-perplexity",          // * upstream-only
  ELIZAOS_CLOUD_API_KEY:          "@elizaos/plugin-elizacloud",
  ELIZAOS_CLOUD_ENABLED:          "@elizaos/plugin-elizacloud",
  CUA_API_KEY:                    "@elizaos/plugin-cua",
  CUA_HOST:                       "@elizaos/plugin-cua",
  OBSIDIAN_VAULT_PATH:            "@elizaos/plugin-obsidian",
  OBSIDAN_VAULT_PATH:             "@elizaos/plugin-obsidian",
  REPOPROMPT_CLI_PATH:            "@elizaos/plugin-repoprompt",
  CLAUDE_CODE_WORKBENCH_ENABLED:  "@elizaos/plugin-claude-code-workbench",
  SOLANA_PRIVATE_KEY:             "@elizaos/plugin-solana",
  LASTFM_API_KEY:                 "@elizaos/plugin-music-library",
  GENIUS_API_KEY:                 "@elizaos/plugin-music-library",
  THEAUDIODB_API_KEY:             "@elizaos/plugin-music-library",
  SPOTIFY_CLIENT_ID:              "@elizaos/plugin-music-library",
  SPOTIFY_CLIENT_SECRET:          "@elizaos/plugin-music-library",
  SHOPIFY_ACCESS_TOKEN:           "@elizaos/plugin-shopify",
};
```

**Connector configuration** — Connector blocks with a `botToken`, `token`, or `apiKey` field auto-enable the corresponding connector plugin. Plugins marked with `*` are upstream-only (not in the bundled `plugins.json`):

```typescript
const CONNECTOR_PLUGINS = {
  bluebubbles: "@elizaos/plugin-bluebubbles",
  telegram:    "@elizaos/plugin-telegram",
  discord:     "@elizaos/plugin-discord",
  discordLocal:"@elizaos/plugin-discord-local",
  slack:       "@elizaos/plugin-slack",
  twitter:     "@elizaos/plugin-twitter",           // * upstream-only
  whatsapp:    "@elizaos/plugin-whatsapp",
  signal:      "@elizaos/plugin-signal",
  imessage:    "@elizaos/plugin-imessage",
  farcaster:   "@elizaos/plugin-farcaster",
  lens:        "@elizaos/plugin-lens",               // * upstream-only
  msteams:     "@elizaos/plugin-msteams",
  mattermost:  "@elizaos/plugin-mattermost",
  googlechat:  "@elizaos/plugin-google-chat",
  feishu:      "@elizaos/plugin-feishu",
  matrix:      "@elizaos/plugin-matrix",
  nostr:       "@elizaos/plugin-nostr",
  blooio:      "@elizaos/plugin-blooio",
  twitch:      "@elizaos/plugin-twitch",
  wechat:      "elizaoswechat",  // Milady-specific (added in app-core)
};
```

> **Note:** The upstream `eliza/packages/agent` defines all `@elizaos/*` connectors. Milady's `eliza/packages/app-core` extends this map with the `wechat` entry pointing to `@elizaos/plugin-wechat`.

**Feature flags** — The `features` section of `milady.json` auto-enables feature plugins. A feature can be enabled with `features.<name>: true` or `features.<name>.enabled: true`:

```json
{
  "features": {
    "browser": true,
    "imageGen": true,
    "tts": { "enabled": true }
  }
}
```

The complete `FEATURE_PLUGINS` map. Plugins marked with `*` are upstream-only (not in the bundled `plugins.json`):

```typescript
const FEATURE_PLUGINS = {
  browser:              "@elizaos/plugin-browser",
  cua:                  "@elizaos/plugin-cua",                   // * upstream-only
  obsidian:             "@elizaos/plugin-obsidian",              // * upstream-only
  cron:                 "@elizaos/plugin-cron",
  shell:                "@elizaos/plugin-shell",
  executeCode:          "@elizaos/plugin-executecode",
  imageGen:             "@elizaos/plugin-image-generation",
  tts:                  "@elizaos/plugin-edge-tts",
  stt:                  "@elizaos/plugin-stt",
  agentSkills:          "@elizaos/plugin-agent-skills",
  commands:             "@elizaos/plugin-commands",
  diagnosticsOtel:      "@elizaos/plugin-diagnostics-otel",      // * upstream-only
  webhooks:             "@elizaos/plugin-webhooks",
  gmailWatch:           "@elizaos/plugin-gmail-watch",
  x402:                 "@elizaos/plugin-x402",
  fal:                  "@elizaos/plugin-fal",
  suno:                 "@elizaos/plugin-suno",
  musicLibrary:         "@elizaos/plugin-music-library",
  musicPlayer:          "@elizaos/plugin-music-player",
  vision:               "@elizaos/plugin-vision",
  computeruse:          "@elizaos/plugin-computeruse",
  repoprompt:           "@elizaos/plugin-repoprompt",            // * upstream-only
  claudeCodeWorkbench:  "@elizaos/plugin-claude-code-workbench", // * upstream-only
};
```

> **Note:** `personality`, `experience`, and `form` are no longer separate feature plugins -- they are now built-in advanced capabilities enabled via `advancedCapabilities: true` in the character settings.

**Streaming destinations** — The `streaming` section of config auto-enables streaming plugins for live video platforms:

```typescript
const STREAMING_PLUGINS = {
  twitch:     "@elizaos/plugin-twitch-streaming",   // * upstream-only
  youtube:    "@elizaos/plugin-youtube-streaming",   // * upstream-only
  customRtmp: "@elizaos/plugin-custom-rtmp",         // * upstream-only
  pumpfun:    "@elizaos/plugin-pumpfun-streaming",   // * upstream-only
  x:          "@elizaos/plugin-x-streaming",         // * upstream-only
};
```

**Auth profiles** — Auth profiles specifying a provider name trigger loading of the matching provider plugin.

### Opting Out

Individual plugins can be disabled even when their env vars are present:

```json
{
  "plugins": {
    "entries": {
      "anthropic": { "enabled": false }
    }
  }
}
```

Setting `plugins.enabled: false` in config disables auto-enable for all optional plugins.

## Dependency Resolution

Plugins are sorted topologically before initialization. If plugin B lists plugin A in its `dependencies` array, A will always initialize before B.

The `priority` field provides coarse ordering independent of dependency edges. Lower priority values initialize earlier (default: `0`).

## Plugin Isolation

Each plugin receives:

- A reference to the shared `AgentRuntime` (read-only access to other plugins' registered capabilities)
- Its own configuration namespace
- Secrets injected by the secrets manager at init time

Plugins do not share mutable state directly — they communicate through the runtime's service registry and event system.

## Module Shape

When a plugin package is dynamically imported, `findRuntimePluginExport()` locates the Plugin export using this priority order:

1. `module.default` — ES module default export
2. `module.plugin` — named `plugin` export
3. `module` itself — CJS default pattern
4. Named exports ending in `Plugin` or starting with `plugin`
5. Other named exports matching the Plugin interface shape
6. Minimal `{ name, description }` exports for named keys matching `plugin`

A module export is accepted as a Plugin when it has both `name` and `description` fields plus at least one of `services`, `providers`, `actions`, `routes`, `events` (as arrays), or `init` (as a function).

## Related

- [Create a Plugin](/plugins/create-a-plugin) — Build a plugin from scratch
- [Plugin Patterns](/plugins/patterns) — Common implementation patterns
- [Plugin Schemas](/plugins/schemas) — Full schema reference
- [Plugin Registry](/plugins/registry) — Browse available plugins
