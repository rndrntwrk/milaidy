# T10: CLI Command `milaidy tui`

## Goal
Register a new Commander command that boots the ElizaOS runtime and launches the TUI, wiring everything together.

## Context

Current CLI structure:
- `src/entry.ts` → `src/cli/run-main.ts` → Commander program
- Commands registered in `src/cli/program/register.*.ts`
- `register.start.ts` calls `startEliza()` which boots the full runtime with readline/clack

We add `milaidy tui` as a new command that boots the same ElizaOS runtime but uses the pi-tui interface instead.

## Implementation

### `src/cli/program/register.tui.ts`

```typescript
import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";

const defaultRuntime = { error: console.error, exit: process.exit };

async function tuiAction(options: { model?: string }) {
  await runCommandWithRuntime(defaultRuntime, async () => {
    const { launchTUI } = await import("../../tui/index.js");
    const { bootElizaRuntime } = await import("../../runtime/eliza.js");

    // Boot ElizaOS runtime (same as `start` but without starting the CLI chat)
    const runtime = await bootElizaRuntime();

    // Launch TUI with optional model override
    await launchTUI(runtime, {
      modelOverride: options.model,
    });
  });
}

export function registerTuiCommand(program: Command) {
  program
    .command("tui")
    .description("Start Milaidy with the interactive TUI")
    .option("-m, --model <model>", "Model to use (e.g. anthropic/claude-sonnet-4)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/tui", "docs.milady.ai/tui")}\n`,
    )
    .action(tuiAction);
}
```

### Register in `src/cli/program/build-program.ts`

Add to the existing command registration:

```typescript
import { registerTuiCommand } from "./register.tui.js";
// ... in buildProgram():
registerTuiCommand(program);
```

### Extract `bootElizaRuntime()` from `startEliza()`

The current `startEliza()` in `src/runtime/eliza.ts` does both:
1. Runtime boot (plugin loading, config, character setup)
2. Chat loop (readline-based)

We need to split it so the TUI can reuse step 1. Extract:

```typescript
/**
 * Boot the ElizaOS runtime without starting a chat loop.
 * Returns the initialized AgentRuntime.
 */
export async function bootElizaRuntime(): Promise<AgentRuntime> {
  // ... everything startEliza() does up to but NOT including
  // the readline/chat loop. Return the runtime instance.
}

/**
 * Original entry: boots runtime + starts readline chat.
 */
export async function startEliza(): Promise<void> {
  const runtime = await bootElizaRuntime();
  // ... existing readline/chat loop code
}
```

### `src/tui/index.ts` — Full launch sequence

```typescript
import { getModel } from "@mariozechner/pi-ai";
import type { AgentRuntime } from "@elizaos/core";
import { MilaidyTUI } from "./tui-app.js";
import { ElizaTUIBridge } from "./eliza-tui-bridge.js";
import { registerPiAiModelHandler } from "./pi-ai-model-handler.js";

export interface LaunchTUIOptions {
  modelOverride?: string;
}

export async function launchTUI(
  runtime: AgentRuntime,
  options: LaunchTUIOptions = {},
): Promise<void> {
  // 1. Resolve model
  const modelSpec = options.modelOverride ?? "anthropic/claude-sonnet-4-20250514";
  const [provider, modelId] = modelSpec.split("/");
  const largeModel = getModel(provider, modelId);
  const smallModel = getModel(provider, modelId); // same for now

  // 2. Create TUI
  const tui = new MilaidyTUI({ runtime });

  // 3. Create bridge
  const bridge = new ElizaTUIBridge(runtime, tui);

  // 4. Register pi-ai with streaming hook
  registerPiAiModelHandler(runtime, {
    largeModel,
    smallModel,
    onStreamEvent: (event) => bridge.onStreamEvent(event),
  });

  // 5. Wire input
  tui.setOnSubmit((text) => bridge.handleUserInput(text));

  // 6. Initialize ElizaOS room/entities
  await bridge.initialize();

  // 7. Start TUI (blocks until quit)
  await tui.start();
}
```

## Extracting `bootElizaRuntime()`

This is the trickiest part. The current `startEliza()` in `src/runtime/eliza.ts` is ~500 lines and does:

1. Load config (`loadMilaidyConfig()`)
2. Onboarding (interactive prompts for first-time setup)
3. Character resolution
4. Plugin discovery and loading
5. `AgentRuntime` creation and initialization
6. readline chat loop

Steps 1–5 become `bootElizaRuntime()`. Step 6 stays in `startEliza()`.

**IMPORTANT**: The onboarding flow uses `@clack/prompts` which won't work inside pi-tui's alternate screen. For the TUI command, skip onboarding and require config to already exist. Add a guard:

```typescript
export async function bootElizaRuntime(opts?: { skipOnboarding?: boolean }): Promise<AgentRuntime> {
  const config = await loadMilaidyConfig();
  if (!config && !opts?.skipOnboarding) {
    // Run onboarding (existing clack flow)
    await runOnboarding();
    config = await loadMilaidyConfig();
  }
  if (!config) {
    throw new Error("No config found. Run `milaidy start` first to set up.");
  }
  // ... rest of boot
}
```

## Acceptance
- `milaidy tui` launches the TUI with ElizaOS runtime
- `milaidy tui --model openai/gpt-4o` overrides the model
- `milaidy start` still works unchanged (regression check)
- `bun run build` passes
- Config must exist before `tui` works (clean error message if not)
