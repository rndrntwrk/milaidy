# T7: Action/Tool Execution Display

## Goal
Show ElizaOS action executions (the equivalent of "tool calls" in pi-agent-core) with a spinner during execution, expand/collapse for output, and styled result display.

## Context

ElizaOS actions are triggered during `processActions()`. The runtime emits events:
- `EventType.ACTION_STARTED` — `{ action: string, params: any }`
- `EventType.ACTION_COMPLETED` — `{ action: string, result: ActionResult }`

From `eliza/packages/core/src/runtime.ts` lines ~1031 and ~1197.

We need to listen for these events on the runtime and update TUI components.

## Implementation

### `src/tui/components/tool-execution.ts`

```typescript
import {
  type Component,
  Loader,
  Text,
  type TUI,
  visibleWidth,
} from "@mariozechner/pi-tui";
import chalk from "chalk";

export type ToolStatus = "running" | "success" | "error";

export class ToolExecutionComponent implements Component {
  private actionName: string;
  private args: Record<string, unknown>;
  private status: ToolStatus = "running";
  private resultText: string = "";
  private expanded = false;
  private loader: Loader | null;

  constructor(
    actionName: string,
    args: Record<string, unknown>,
    tui: TUI,
  ) {
    this.actionName = actionName;
    this.args = args;
    this.loader = new Loader(
      tui,
      (spinner) => chalk.yellow(spinner),
      (text) => chalk.dim(text),
      `Running ${actionName}...`,
    );
  }

  updateResult(result: { text?: string; isError?: boolean }): void {
    this.status = result.isError ? "error" : "success";
    this.resultText = result.text ?? "";
    if (this.loader) {
      this.loader.stop();
      this.loader = null;
    }
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  render(width: number): string[] {
    const lines: string[] = [];

    // Header line: icon + action name + args summary
    const icon =
      this.status === "running" ? chalk.yellow("⟳") :
      this.status === "success" ? chalk.green("✓") :
      chalk.red("✗");

    const argSummary = this.summarizeArgs(width - 20);
    const header = `  ${icon} ${chalk.bold(this.actionName)} ${chalk.dim(argSummary)}`;
    lines.push(header);

    // Running: show loader
    if (this.status === "running" && this.loader) {
      const loaderLines = this.loader.render(width - 4);
      lines.push(...loaderLines.map((l) => `    ${l}`));
    }

    // Completed: show result (if expanded or short)
    if (this.status !== "running" && this.resultText) {
      const resultLines = this.resultText.split("\n");
      const isShort = resultLines.length <= 3;

      if (isShort || this.expanded) {
        const displayLines = this.expanded ? resultLines : resultLines.slice(0, 3);
        for (const line of displayLines) {
          const color = this.status === "error" ? chalk.red : chalk.dim;
          lines.push(`    ${color(line.slice(0, width - 6))}`);
        }
        if (!isShort && !this.expanded) {
          lines.push(chalk.dim(`    ... ${resultLines.length - 3} more lines`));
        }
      } else {
        lines.push(chalk.dim(`    ${resultLines.length} lines (expand to view)`));
      }
    }

    return lines;
  }

  invalidate(): void {
    this.loader?.invalidate();
  }

  private summarizeArgs(maxWidth: number): string {
    const entries = Object.entries(this.args);
    if (entries.length === 0) return "";
    const summary = entries
      .map(([k, v]) => {
        const val = typeof v === "string"
          ? (v.length > 30 ? v.slice(0, 27) + "..." : v)
          : JSON.stringify(v);
        return `${k}=${val}`;
      })
      .join(" ");
    return summary.length > maxWidth
      ? summary.slice(0, maxWidth - 3) + "..."
      : summary;
  }
}
```

### Event Wiring in `eliza-tui-bridge.ts`

Register event listeners on the ElizaOS runtime:

```typescript
// In ElizaTUIBridge.initialize():

this.runtime.registerEvent(EventType.ACTION_STARTED, async (payload) => {
  const { action } = payload as { action: string; params?: any };
  const component = new ToolExecutionComponent(
    action,
    (payload as any).params ?? {},
    this.tui.getTUI(),
  );
  this.pendingActions.set(action + "-" + Date.now(), component);
  this.tui.addToChatContainer(component);
  this.tui.requestRender();
});

this.runtime.registerEvent(EventType.ACTION_COMPLETED, async (payload) => {
  const { action, result } = payload as { action: string; result: any };
  // Find the most recent pending component for this action
  for (const [key, component] of this.pendingActions.entries()) {
    if (key.startsWith(action + "-")) {
      component.updateResult({
        text: result?.text ?? JSON.stringify(result, null, 2),
        isError: result?.error != null,
      });
      this.pendingActions.delete(key);
      this.tui.requestRender();
      break;
    }
  }
});
```

Add field to bridge class:
```typescript
private pendingActions = new Map<string, ToolExecutionComponent>();
```

### Toggle expand/collapse

In `tui-app.ts`, add a keybinding (e.g., Ctrl+E) to toggle tool output expansion:

```typescript
if (matchesKey(data, "ctrl+e")) {
  this.toolOutputExpanded = !this.toolOutputExpanded;
  // Broadcast to all ToolExecutionComponents
  this.onToggleToolExpand?.(this.toolOutputExpanded);
}
```

## Important Notes

- **Event payload shapes**: The exact payload structure for `ACTION_STARTED` / `ACTION_COMPLETED` events may differ from what's documented. Check `eliza/packages/core/src/runtime.ts` around line 1031 for `ACTION_STARTED` and line 1197 for `ACTION_COMPLETED`. The payload is passed to `emitEvent()` — look at what fields are included.

- **Action vs Tool naming**: ElizaOS calls them "actions" (not tools). Use "action" in code/logs but either term in UI.

## Acceptance
- When ElizaOS executes an action, a spinner appears in the chat
- On completion, the spinner is replaced with ✓ (success) or ✗ (error)
- Action arguments are summarized on the header line
- Result text is shown collapsed by default, expandable
- Error results show in red
