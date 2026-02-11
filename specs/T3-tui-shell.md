# T3: Minimal TUI Shell

## Goal
Boot a pi-tui `TUI` instance with an `Editor` for input and a scrolling `Container` for chat messages. No ElizaOS wiring yet — just the visual shell.

## Reference
Study `pi-mono/packages/coding-agent/src/modes/interactive/interactive-mode.ts` lines 1–250 for how pi creates its TUI. Our version is simpler.

## Implementation: `src/tui/tui-app.ts`

```typescript
import type { AgentRuntime } from "@elizaos/core";
import {
  TUI,
  ProcessTerminal,
  Container,
  Editor,
  Text,
  Spacer,
  Loader,
  Markdown,
  type Component,
  type EditorOptions,
} from "@mariozechner/pi-tui";
import { getMilaidyTheme } from "./theme.js";

export interface MilaidyTUIOptions {
  runtime: AgentRuntime;
  /** Called when user submits a message */
  onSubmit?: (text: string) => Promise<void>;
}

export class MilaidyTUI {
  private ui!: TUI;
  private chatContainer!: Container;
  private editorContainer!: Container;
  private editor!: Editor;
  private statusContainer!: Container;
  private options: MilaidyTUIOptions;

  constructor(options: MilaidyTUIOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    const terminal = new ProcessTerminal();

    // Main layout: chat (scrollable) + status + editor (fixed at bottom)
    this.chatContainer = new Container({ direction: "vertical", scroll: true });
    this.statusContainer = new Container({ direction: "vertical" });
    this.editorContainer = new Container({ direction: "vertical" });

    // Welcome message
    this.chatContainer.addChild(new Text("Welcome to Milaidy ✨", 0, 1));
    this.chatContainer.addChild(new Spacer(1));

    // Editor for user input
    this.editor = new Editor(terminal, {
      placeholder: "Message milaidy...",
      singleLine: false,
      submitOnEnter: true,  // Enter submits, Shift+Enter for newline
    } as EditorOptions);

    this.editor.onSubmit = async (text: string) => {
      if (!text.trim()) return;
      this.editor.clear();
      if (this.options.onSubmit) {
        await this.options.onSubmit(text.trim());
      }
    };

    this.editorContainer.addChild(this.editor);

    // Root container
    const root = new Container({ direction: "vertical" });
    root.addChild(this.chatContainer, { flex: 1 });
    root.addChild(this.statusContainer);
    root.addChild(new Spacer(1));
    root.addChild(this.editorContainer);

    this.ui = new TUI(terminal, root);
    this.ui.setFocus(this.editor);
    this.ui.start();
  }

  /** Add a component to the chat area */
  addToChatContainer(component: Component): void {
    this.chatContainer.addChild(component);
    this.ui.requestRender();
  }

  /** Set status line text */
  setStatus(component: Component): void {
    this.statusContainer.clear();
    this.statusContainer.addChild(component);
    this.ui.requestRender();
  }

  /** Clear status area */
  clearStatus(): void {
    this.statusContainer.clear();
    this.ui.requestRender();
  }

  /** Request a re-render */
  requestRender(): void {
    this.ui.requestRender();
  }

  /** Get the TUI instance (for overlays, etc.) */
  getTUI(): TUI {
    return this.ui;
  }

  async stop(): Promise<void> {
    this.ui.stop();
  }
}
```

## pi-tui API Notes

From reading the pi-tui source:

- `TUI(terminal, rootComponent)` — the main class, does differential rendering
- `Container({ direction, scroll })` — layout component, vertical/horizontal, optionally scrollable
- `Editor(terminal, options)` — text input with Kitty keyboard support, IME, multi-line
- `Text(text, paddingLeft, paddingTop)` — simple text line
- `Spacer(lines)` — vertical space
- `Markdown(text, theme)` — renders markdown with ANSI formatting
- `Loader(tui, spinnerFn, textFn, message)` — animated spinner
- `ui.setFocus(component)` — sets which component gets keyboard input
- `ui.start()` / `ui.stop()` — enter/exit alternate screen, start render loop

**IMPORTANT**: Verify exact constructor signatures against the pi-tui source. The Editor API in particular may differ — check `packages/tui/src/components/editor.ts` for the real interface. The `onSubmit` callback pattern is from the coding-agent's `CustomEditor` wrapper, not base `Editor`. You may need to handle `handleInput` + key detection for Enter.

## Acceptance
- Running the TUI shows a welcome message and a text input area
- Typing text and pressing Enter triggers the `onSubmit` callback
- Ctrl+C exits cleanly
- `bun run build` passes
