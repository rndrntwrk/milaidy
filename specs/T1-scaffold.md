# T1: Scaffold `src/tui/` Module Structure

## Goal
Create the directory layout and barrel exports for the TUI module. Add pi-tui and pi-ai as dependencies.

## Dependencies to Add

In `package.json` add:
```json
"@mariozechner/pi-tui": "^0.52.9",
"@mariozechner/pi-ai": "^0.52.9"
```

For local dev, these can be workspace-linked to `../pi-mono/packages/tui` and `../pi-mono/packages/ai`.

## Directory Structure

```
src/tui/
  index.ts                    # Barrel: exports createMilaidyTUI()
  eliza-tui-bridge.ts         # Stub: ElizaTUIBridge class
  pi-ai-model-handler.ts      # Stub: registerPiAiModelHandler()
  tui-app.ts                  # Stub: MilaidyTUI class (owns TUI lifecycle)
  components/
    index.ts                  # Barrel for components
    assistant-message.ts      # Stub
    user-message.ts           # Stub
    tool-execution.ts         # Stub
    status-bar.ts             # Stub
    footer.ts                 # Stub
    chat-editor.ts            # Stub (wraps pi-tui Editor)
  theme.ts                    # Milaidy TUI theme constants
```

## `src/tui/index.ts`

```typescript
export { MilaidyTUI } from "./tui-app.js";
export { ElizaTUIBridge } from "./eliza-tui-bridge.js";
export { registerPiAiModelHandler } from "./pi-ai-model-handler.js";
```

## `src/tui/tui-app.ts` (stub)

```typescript
import type { AgentRuntime } from "@elizaos/core";

export interface MilaidyTUIOptions {
  runtime: AgentRuntime;
}

export class MilaidyTUI {
  constructor(private options: MilaidyTUIOptions) {}

  async start(): Promise<void> {
    // T3 will implement
    throw new Error("Not implemented");
  }

  async stop(): Promise<void> {
    // T3 will implement
  }
}
```

## Acceptance
- `bun run build` succeeds with the new files
- No runtime usage yet — stubs only
- `bun run check` passes (Biome lint/format)
