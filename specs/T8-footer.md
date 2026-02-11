# T8: Footer + Status Bar

## Goal
Add a persistent footer showing model info, token usage, agent status, and keybinding hints.

## Reference
Study `pi-mono/packages/coding-agent/src/modes/interactive/components/footer.ts` for how pi renders its footer. It's a single-line `Component` that reads state from a data provider.

## Implementation

### `src/tui/components/status-bar.ts`

A one-line component above the editor showing model + token info:

```typescript
import { type Component, visibleWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";

export interface StatusBarData {
  modelName: string;
  modelProvider: string;
  inputTokens: number;
  outputTokens: number;
  isStreaming: boolean;
  agentName: string;
}

export class StatusBar implements Component {
  private data: StatusBarData = {
    modelName: "",
    modelProvider: "",
    inputTokens: 0,
    outputTokens: 0,
    isStreaming: false,
    agentName: "milaidy",
  };

  update(partial: Partial<StatusBarData>): void {
    Object.assign(this.data, partial);
  }

  render(width: number): string[] {
    const d = this.data;

    // Left side: model info
    const model = d.modelName
      ? chalk.cyan(`${d.modelProvider}/${d.modelName}`)
      : chalk.dim("no model");

    // Right side: token usage
    const tokens = (d.inputTokens || d.outputTokens)
      ? chalk.dim(`↑${d.inputTokens} ↓${d.outputTokens}`)
      : "";

    // Center: streaming indicator
    const status = d.isStreaming ? chalk.yellow("● streaming") : "";

    // Build the line with spacing
    const leftPart = ` ${model} ${status}`;
    const rightPart = `${tokens} `;
    const leftWidth = visibleWidth(leftPart);
    const rightWidth = visibleWidth(rightPart);
    const gap = Math.max(1, width - leftWidth - rightWidth);

    const line = `${leftPart}${" ".repeat(gap)}${rightPart}`;

    // Render with a dim background-ish separator
    return [chalk.dim("─".repeat(width)), line];
  }

  invalidate(): void {}
}
```

### `src/tui/components/footer.ts`

A keybinding hints bar at the very bottom:

```typescript
import { type Component, visibleWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";

interface KeyHint {
  key: string;
  label: string;
}

export class FooterComponent implements Component {
  private hints: KeyHint[] = [
    { key: "Enter", label: "send" },
    { key: "Shift+Enter", label: "newline" },
    { key: "Ctrl+P", label: "model" },
    { key: "Ctrl+E", label: "expand" },
    { key: "Ctrl+C", label: "cancel/quit" },
  ];

  setHints(hints: KeyHint[]): void {
    this.hints = hints;
  }

  render(width: number): string[] {
    const parts = this.hints.map(
      (h) => `${chalk.bold(h.key)} ${chalk.dim(h.label)}`
    );
    const joined = parts.join(chalk.dim(" │ "));

    // Truncate if too wide
    if (visibleWidth(joined) > width) {
      // Show as many as fit
      let result = "";
      for (const part of parts) {
        const candidate = result
          ? result + chalk.dim(" │ ") + part
          : part;
        if (visibleWidth(candidate) > width) break;
        result = candidate;
      }
      return [result];
    }

    return [joined];
  }

  invalidate(): void {}
}
```

### Integration in `tui-app.ts`

Add the status bar and footer to the root layout:

```typescript
// In MilaidyTUI.start():

this.statusBar = new StatusBar();
this.footer = new FooterComponent();

const root = new Container({ direction: "vertical" });
root.addChild(this.chatContainer, { flex: 1 });  // Scrollable chat
root.addChild(this.statusBar);                    // Model + tokens line
root.addChild(new Spacer(1));
root.addChild(this.editorContainer);              // Input editor
root.addChild(this.footer);                       // Keybinding hints
```

### Wire status updates from bridge

In `eliza-tui-bridge.ts`:

```typescript
// After model handler registration:
this.tui.getStatusBar().update({
  modelName: config.largeModel.modelId,
  modelProvider: config.largeModel.provider,
});

// In onStreamEvent:
case "token":
  this.tui.getStatusBar().update({ isStreaming: true });
  break;
case "usage":
  this.tui.getStatusBar().update({
    inputTokens: event.usage.inputTokens,
    outputTokens: event.usage.outputTokens,
    isStreaming: false,
  });
  break;
case "done":
  this.tui.getStatusBar().update({ isStreaming: false });
  break;
```

## Acceptance
- Status bar shows current model name and provider
- Token counts update after each response
- Streaming indicator appears during generation
- Footer shows keybinding hints
- Both components render in a single line and handle narrow terminals
