# Model routing notes

## Why a cloud agent can show `Execution profile: TEXT_FAST`

The `TEXT_FAST` / `TEXT_LARGE` split is not decided by the cloud backend itself.
It starts in the app UI and chat message metadata:

- `packages/app-core/src/state/useChatSend.ts`
  - sends `conversationMode` with each chat request
- `packages/agent/src/providers/simple-mode.ts`
  - maps message metadata to an execution profile
  - `conversationMode === "simple"` → `TEXT_FAST`
  - DM without simple mode → `default_full`
  - voice channels → `VOICE_FAST`
  - group chats → `GROUP_COMPACT`

## Why greetings often used the small model

The Companion view was forcing:

- `packages/app-core/src/components/pages/CompanionView.tsx`
  - `chatMode = "simple"`

That meant normal cloud chat messages were sent with `conversationMode: "simple"`,
so the runtime injected `Execution profile: TEXT_FAST.` into the prompt context.
In practice, that steers the turn toward the configured `models.small` / provider
small-model slot.

## What triggers `TEXT_LARGE`

Today, `TEXT_LARGE` is typically reached when the runtime or a feature explicitly
calls `runtime.useModel(ModelType.TEXT_LARGE, ...)`, or when the chat turn stays
in the full/power path instead of the fast/simple path.

Examples:

- research executor uses `ModelType.TEXT_LARGE`
- some planner/reasoning paths use the provider's large-model slot
- DM chat in `power` mode stays on the fuller path instead of `TEXT_FAST`

## What is configurable today

### Per browser/client

The chat UI persists a local chat mode:

- `packages/app-core/src/state/persistence.ts`
  - `loadChatMode()` / `saveChatMode()`

That is **client-side state**, not durable container config.

### Per provider / container model names

The actual small vs large model IDs come from config/env:

- `config.models.small`
- `config.models.large`
- provider-specific envs such as `ANTHROPIC_SMALL_MODEL`, `ANTHROPIC_LARGE_MODEL`
- cloud env propagation in `packages/agent/src/runtime/eliza.ts`

## Change made here

Cloud Companion sessions now default to `power` mode instead of forcibly forcing
`simple` mode. That stops cloud-hosted chat from defaulting every turn to
`TEXT_FAST` while leaving non-cloud companion sessions on the lighter simple mode.

## Current limitation

There is still no first-class **per-container conversation-mode setting** in the
agent config. The current default chat mode is primarily chosen by the frontend.
If we want a true container-level default later, we should add an explicit config
field (for example `ui.defaultConversationMode`) and have the frontend honor it.
