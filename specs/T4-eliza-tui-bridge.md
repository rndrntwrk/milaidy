# T4: ElizaTUIBridge — The Core Glue

## Goal
Bridge user input from pi-tui → ElizaOS AgentRuntime message processing → response display back in pi-tui. This is the central integration piece.

## How ElizaOS Processes Messages

From studying `eliza/packages/core/src/runtime.ts`:

1. **Message creation**: Create a `Memory` object with the user's text
2. **State composition**: `runtime.composeState(message)` builds the full context
3. **Event emission**: `runtime.emitEvent(EventType.MESSAGE_RECEIVED, payload)` triggers registered handlers
4. **Response**: Event handlers (from plugins) process the message, call `runtime.generateText()`, and invoke `callback` with the response

The key entry point for injecting a message into ElizaOS from a custom client:

```typescript
import {
  createMessageMemory,
  stringToUuid,
  ChannelType,
  type Memory,
  type Content,
  type UUID,
} from "@elizaos/core";
```

## Implementation: `src/tui/eliza-tui-bridge.ts`

```typescript
import {
  type AgentRuntime,
  type Memory,
  type Content,
  type UUID,
  type HandlerCallback,
  ChannelType,
  EventType,
  createMessageMemory,
  stringToUuid,
} from "@elizaos/core";
import { Text, Markdown, Loader, Spacer, type Component } from "@mariozechner/pi-tui";
import type { MilaidyTUI } from "./tui-app.js";

// Stable UUIDs for the TUI "room" and "user"
const TUI_ROOM_ID = stringToUuid("milaidy-tui-room") as UUID;
const TUI_USER_ID = stringToUuid("milaidy-tui-user") as UUID;
const TUI_WORLD_ID = stringToUuid("milaidy-tui-world") as UUID;

export class ElizaTUIBridge {
  private runtime: AgentRuntime;
  private tui: MilaidyTUI;
  private isProcessing = false;
  private streamedText = "";
  private currentMarkdown: Markdown | null = null;

  constructor(runtime: AgentRuntime, tui: MilaidyTUI) {
    this.runtime = runtime;
    this.tui = tui;
  }

  /**
   * Initialize the bridge — ensure TUI room/entities exist in ElizaOS.
   */
  async initialize(): Promise<void> {
    // Ensure the TUI "room" exists so ElizaOS can store conversation history
    await this.runtime.ensureRoomExists({
      id: TUI_ROOM_ID,
      name: "Milaidy TUI",
      type: ChannelType.DM,
      source: "milaidy-tui",
      worldId: TUI_WORLD_ID,
    });

    // Ensure user entity
    await this.runtime.ensureConnection({
      entityId: TUI_USER_ID,
      roomId: TUI_ROOM_ID,
      userName: "User",
      name: "User",
      source: "milaidy-tui",
    });
  }

  /**
   * Handle user input from the TUI editor.
   * Creates an ElizaOS Memory, emits MESSAGE_RECEIVED, renders response.
   */
  async handleUserInput(text: string): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Display user message in TUI
      this.tui.addToChatContainer(new Text(`  You: ${text}`, 0, 0));
      this.tui.addToChatContainer(new Spacer(1));

      // 2. Create ElizaOS Memory for the user message
      const content: Content = {
        text,
        source: "milaidy-tui",
      };

      const message = createMessageMemory({
        id: stringToUuid(`msg-${Date.now()}`) as UUID,
        entityId: TUI_USER_ID,
        roomId: TUI_ROOM_ID,
        content,
        agentId: this.runtime.agentId,
      });

      // 3. Show loading spinner
      const loader = new Loader(
        this.tui.getTUI(),
        (spinner) => `\x1b[36m${spinner}\x1b[0m`,
        (text) => `\x1b[90m${text}\x1b[0m`,
        "Thinking...",
      );
      this.tui.setStatus(loader);

      // 4. Prepare streaming markdown for response
      this.streamedText = "";
      this.currentMarkdown = null;

      // 5. Process through ElizaOS
      // The callback receives the agent's response
      const callback: HandlerCallback = async (response: Content) => {
        this.tui.clearStatus();

        if (response.text) {
          // Create or update markdown component with response
          if (!this.currentMarkdown) {
            this.currentMarkdown = new Markdown(response.text);
            this.tui.addToChatContainer(this.currentMarkdown);
          } else {
            this.currentMarkdown.setContent(response.text);
          }
          this.tui.addToChatContainer(new Spacer(1));
          this.tui.requestRender();
        }

        return [];
      };

      // 6. Compose state and emit the message event
      const state = await this.runtime.composeState(message);

      await this.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
        runtime: this.runtime,
        message,
        callback,
        state,
        source: "milaidy-tui",
      });

    } catch (error) {
      this.tui.clearStatus();
      const errText = error instanceof Error ? error.message : String(error);
      this.tui.addToChatContainer(new Text(`  Error: ${errText}`, 0, 0));
      this.tui.addToChatContainer(new Spacer(1));
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Called by the pi-ai model handler when streaming tokens.
   * Updates the current markdown component in real-time.
   */
  onStreamToken(token: string): void {
    this.streamedText += token;
    if (this.currentMarkdown) {
      this.currentMarkdown.setContent(this.streamedText);
      this.tui.requestRender();
    } else {
      // First token — create the markdown component
      this.currentMarkdown = new Markdown(this.streamedText);
      this.tui.addToChatContainer(this.currentMarkdown);
      this.tui.clearStatus(); // Remove "Thinking..." spinner
      this.tui.requestRender();
    }
  }
}
```

## Wiring It All Together

In `src/tui/index.ts`, the startup sequence:

```typescript
export async function launchTUI(runtime: AgentRuntime) {
  // 1. Create TUI shell
  const tui = new MilaidyTUI({ runtime });

  // 2. Create bridge
  const bridge = new ElizaTUIBridge(runtime, tui);

  // 3. Register pi-ai model handler with streaming hook
  registerPiAiModelHandler(runtime, {
    largeModel: getModel("anthropic", "claude-sonnet-4-20250514"),
    smallModel: getModel("anthropic", "claude-haiku-3-5-20241022"),
    onStreamToken: (token) => bridge.onStreamToken(token),
  });

  // 4. Wire editor submit → bridge
  tui.options.onSubmit = (text) => bridge.handleUserInput(text);

  // 5. Initialize bridge (ensure room/entities)
  await bridge.initialize();

  // 6. Start TUI
  await tui.start();
}
```

## Key ElizaOS Integration Points

**`ensureRoomExists` / `ensureConnection`**: Required so ElizaOS has a room to store message history. Without this, `composeState` fails.

**`createMessageMemory`**: Creates a properly structured `Memory` object. Must have `entityId`, `roomId`, `content`, valid UUIDs.

**`composeState`**: Builds the full context (recent messages, character bio, providers). This is what goes into the LLM prompt.

**`emitEvent(MESSAGE_RECEIVED)`**: This triggers ElizaOS's event pipeline. Registered handlers (from plugins) will process the message, call `generateText`, and invoke the callback.

**IMPORTANT**: The exact API for `ensureRoomExists`, `ensureConnection`, and `createMessageMemory` may have changed in the `next` version of `@elizaos/core`. Verify against `eliza/packages/core/src/runtime.ts` and `eliza/packages/core/src/types/`. The names above are from the current codebase scan but parameter shapes may differ.

## Acceptance
- User types in TUI editor → message appears in chat
- ElizaOS processes the message (verify via runtime logs)
- Response appears as rendered markdown in chat
- Streaming tokens update the markdown progressively
- Error states show a clean error message, don't crash TUI
