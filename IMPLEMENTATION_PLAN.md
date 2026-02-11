# Milaidy TUI — Implementation Plan

> **Goal:** Replace the basic readline/clack CLI with a rich TUI built on `@mariozechner/pi-tui` for rendering and `@mariozechner/pi-ai` for LLM provider routing, while keeping `@elizaos/core` `AgentRuntime` as the agent brain.

## Architecture Overview

```
┌───────────────────────────────────────────────────────┐
│                    milaidy TUI                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  pi-tui  (TUI, Editor, Markdown, Loader, Box…)   │ │
│  └────────────────────┬──────────────────────────────┘ │
│                       │ render / input                  │
│  ┌────────────────────┴──────────────────────────────┐ │
│  │            ElizaTUIBridge                          │ │
│  │  • Editor input → ElizaOS Memory → processActions │ │
│  │  • Runtime events → TUI component updates         │ │
│  │  • Streams LLM tokens via pi-ai → Markdown        │ │
│  └──────────┬─────────────────────┬──────────────────┘ │
│             │                     │                     │
│  ┌──────────┴──────────┐ ┌───────┴──────────────────┐  │
│  │  @elizaos/core      │ │  @mariozechner/pi-ai     │  │
│  │  AgentRuntime       │ │  stream() / complete()   │  │
│  │  (plugins, memory,  │ │  (model registry,        │  │
│  │   actions, state)   │ │   provider auth)         │  │
│  └─────────────────────┘ └──────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

**Key decisions:**
- We do NOT use `pi-agent-core` (`Agent`/`AgentSession`). ElizaOS owns the agent loop.
- `pi-ai` replaces ElizaOS's built-in model handlers (anthropic plugin, etc.) with a unified provider.
- `pi-tui` replaces `@clack/prompts` and readline for the interactive experience.
- The TUI is a new `milaidy tui` command (existing `start` unchanged for backwards compat).

## Dependencies to Add

```
@mariozechner/pi-tui   (workspace link to ../pi-mono/packages/tui or npm)
@mariozechner/pi-ai    (workspace link to ../pi-mono/packages/ai or npm)
```

## Tasks

### Phase 1 — Foundation

- [ ] **T1: Scaffold `src/tui/` module structure**
  - Spec: `specs/T1-scaffold.md`
  - Create directory layout, barrel exports, add pi-tui + pi-ai deps

- [ ] **T2: pi-ai model handler for ElizaOS**
  - Spec: `specs/T2-pi-ai-model-handler.md`
  - Register pi-ai as ElizaOS `ModelHandler` so `runtime.useModel()` routes through pi-ai

- [ ] **T3: Minimal TUI shell with Editor + chat container**
  - Spec: `specs/T3-tui-shell.md`
  - Boot pi-tui `TUI`, wire `Editor` for input, `Container` for chat, basic render loop

- [ ] **T4: ElizaTUIBridge — input → ElizaOS → response → TUI**
  - Spec: `specs/T4-eliza-tui-bridge.md`
  - The core glue: user input → `AgentRuntime` message processing → response display

### Phase 2 — Streaming & Display

- [ ] **T5: Streaming token display**
  - Spec: `specs/T5-streaming.md`
  - Hook into pi-ai streaming to update Markdown component token-by-token

- [ ] **T6: User and assistant message components**
  - Spec: `specs/T6-message-components.md`
  - Styled `UserMessage` and `AssistantMessage` components with Markdown rendering

- [ ] **T7: Action/tool execution display**
  - Spec: `specs/T7-tool-display.md`
  - Show ElizaOS action execution with expand/collapse, spinner, result

### Phase 3 — Polish & Integration

- [ ] **T8: Footer + status bar**
  - Spec: `specs/T8-footer.md`
  - Model info, token usage, keybinding hints

- [ ] **T9: Model selector overlay**
  - Spec: `specs/T9-model-selector.md`
  - Ctrl+P overlay using pi-ai model registry + pi-tui SelectList

- [ ] **T10: CLI command `milaidy tui` wiring**
  - Spec: `specs/T10-cli-command.md`
  - Register Commander command, boot ElizaOS runtime + TUI bridge

- [ ] **T11: Theme integration**
  - Spec: `specs/T11-theme.md`
  - Map milaidy palette to pi-tui theme system, respect terminal capabilities
