# T6: User and Assistant Message Components

## Goal
Create styled, reusable TUI components for displaying user messages and assistant responses, including thinking blocks and markdown rendering.

## Reference
Study `pi-mono/packages/coding-agent/src/modes/interactive/components/`:
- `user-message.ts` — simple component that renders user text
- `assistant-message.ts` — renders streaming assistant content with thinking blocks

## Implementation

### `src/tui/components/user-message.ts`

```typescript
import { type Component, visibleWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";

export class UserMessageComponent implements Component {
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  render(width: number): string[] {
    const prefix = chalk.bold.cyan("You → ");
    const prefixWidth = visibleWidth(prefix);
    const contentWidth = width - prefixWidth;

    // Word-wrap the user text within the available width
    const lines = wrapText(this.text, contentWidth);
    return lines.map((line, i) =>
      i === 0 ? `${prefix}${line}` : `${" ".repeat(prefixWidth)}${line}`
    );
  }

  invalidate(): void {}
}

function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && visibleWidth(current + " " + word) > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
```

### `src/tui/components/assistant-message.ts`

```typescript
import { Markdown, type Component, type MarkdownTheme } from "@mariozechner/pi-tui";
import chalk from "chalk";

export class AssistantMessageComponent implements Component {
  private markdown: Markdown;
  private thinkingText: string = "";
  private showThinking: boolean;
  private responseText: string = "";
  private isStreaming: boolean = true;

  constructor(showThinking = false, markdownTheme?: MarkdownTheme) {
    this.showThinking = showThinking;
    this.markdown = new Markdown("", markdownTheme);
  }

  /** Update with new response text (called during streaming) */
  updateContent(text: string): void {
    this.responseText = text;
    this.rebuildMarkdown();
  }

  /** Update thinking text */
  updateThinking(text: string): void {
    this.thinkingText = text;
    if (this.showThinking) {
      this.rebuildMarkdown();
    }
  }

  /** Mark streaming as complete */
  finalize(): void {
    this.isStreaming = false;
    this.rebuildMarkdown();
  }

  private rebuildMarkdown(): void {
    let content = "";

    // Show thinking in a dimmed block if enabled
    if (this.showThinking && this.thinkingText) {
      content += `> ${this.thinkingText.split("\n").join("\n> ")}\n\n`;
    }

    content += this.responseText;

    // Add streaming cursor indicator
    if (this.isStreaming && this.responseText) {
      content += " ▊";
    }

    this.markdown.setContent(content);
  }

  render(width: number): string[] {
    const prefix = chalk.bold.magenta("✨ ");
    const mdLines = this.markdown.render(width - 3);
    return mdLines.map((line, i) =>
      i === 0 ? `${prefix}${line}` : `   ${line}`
    );
  }

  invalidate(): void {
    this.markdown.invalidate();
  }
}
```

### `src/tui/components/index.ts`

```typescript
export { UserMessageComponent } from "./user-message.js";
export { AssistantMessageComponent } from "./assistant-message.js";
export { ToolExecutionComponent } from "./tool-execution.js";  // T7
export { StatusBar } from "./status-bar.js";                   // T8
export { FooterComponent } from "./footer.js";                 // T8
```

### Update `eliza-tui-bridge.ts`

Replace raw `Text` and `Markdown` usage with the new components:

```typescript
// In handleUserInput:
this.tui.addToChatContainer(new UserMessageComponent(text));

// In onStreamEvent:
case "token":
  if (!this.currentAssistant) {
    this.currentAssistant = new AssistantMessageComponent();
    this.tui.addToChatContainer(this.currentAssistant);
    this.tui.clearStatus();
  }
  this.streamedText += event.text;
  this.currentAssistant.updateContent(this.streamedText);
  this.tui.requestRender();
  break;

case "thinking":
  if (this.currentAssistant) {
    this.thinkingText += event.text;
    this.currentAssistant.updateThinking(this.thinkingText);
  }
  break;

case "done":
  if (this.currentAssistant) {
    this.currentAssistant.finalize();
    this.currentAssistant = null;
  }
  break;
```

## Acceptance
- User messages render with "You →" prefix and word-wrapping
- Assistant messages render with "✨" prefix and full markdown (code blocks, bold, lists, etc.)
- Streaming shows a block cursor that disappears when done
- Thinking blocks render as dimmed blockquotes when enabled
- Components correctly implement `render(width)` and `invalidate()`
