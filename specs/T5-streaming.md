# T5: Streaming Token Display

## Goal
Hook into pi-ai's streaming API to display LLM tokens in real-time as they arrive, updating the Markdown component progressively.

## Context

The T2 model handler already has an `onStreamToken` callback, and T4's bridge has `onStreamToken()`. This task refines the streaming UX:

1. **Smooth rendering**: Batch token updates to avoid re-rendering on every single token (pi-tui renders differentially, but we should still be efficient)
2. **Thinking/reasoning display**: Handle pi-ai's thinking content blocks
3. **Stop/abort**: Ctrl+C during streaming should abort the stream

## pi-ai Streaming Events

From `pi-mono/packages/ai/src/types.ts`:

```typescript
export type AssistantMessageEvent =
  | { type: "text"; text: string }           // Text token
  | { type: "thinking"; text: string }       // Thinking/reasoning token  
  | { type: "toolCall"; ... }                // Tool call
  | { type: "usage"; usage: Usage }          // Token usage stats
  | { type: "error"; error: string }         // Error
  | { type: "done"; message: AssistantMessage }; // Stream complete
```

The `stream()` function returns an `AssistantMessageEventStream` which is an async iterable.

## Implementation

### Update `pi-ai-model-handler.ts`

Expand the handler to emit richer events:

```typescript
export interface StreamEvent {
  type: "token" | "thinking" | "done" | "error" | "usage";
  text?: string;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
}

export type StreamEventCallback = (event: StreamEvent) => void;
```

Replace `onStreamToken` with `onStreamEvent` in `PiAiConfig`:

```typescript
export interface PiAiConfig {
  largeModel: Model<any>;
  smallModel: Model<any>;
  onStreamEvent?: StreamEventCallback;
}
```

The handler iterates the stream:

```typescript
const s = stream(model, context, { temperature, maxTokens, signal });

for await (const event of s) {
  switch (event.type) {
    case "text":
      fullText += event.text;
      onStreamEvent?.({ type: "token", text: event.text });
      break;
    case "thinking":
      onStreamEvent?.({ type: "thinking", text: event.text });
      break;
    case "usage":
      onStreamEvent?.({ type: "usage", usage: event.usage });
      break;
    case "error":
      onStreamEvent?.({ type: "error", error: event.error });
      break;
  }
}
onStreamEvent?.({ type: "done" });
```

### Update `eliza-tui-bridge.ts`

Replace `onStreamToken` with:

```typescript
onStreamEvent(event: StreamEvent): void {
  switch (event.type) {
    case "token":
      this.streamedText += event.text;
      this.updateStreamingMarkdown();
      break;
    case "thinking":
      // Optionally display thinking in a collapsed block
      this.thinkingText += event.text;
      break;
    case "usage":
      this.lastUsage = event.usage;
      // Update footer/status with token counts
      break;
    case "done":
      // Finalize the streaming message
      this.finalizeStream();
      break;
    case "error":
      this.handleStreamError(event.error);
      break;
  }
}

private updateStreamingMarkdown(): void {
  if (this.currentMarkdown) {
    this.currentMarkdown.setContent(this.streamedText);
    this.tui.requestRender();
  } else {
    this.currentMarkdown = new Markdown(this.streamedText);
    this.tui.addToChatContainer(this.currentMarkdown);
    this.tui.clearStatus();
    this.tui.requestRender();
  }
}
```

### Abort Support

In `MilaidyTUI`, intercept Ctrl+C:

```typescript
// In tui-app.ts, add to the root input handler:
private abortController: AbortController | null = null;

handleGlobalInput(data: string): void {
  if (matchesKey(data, "ctrl+c") && this.abortController) {
    this.abortController.abort();
    return;
  }
}
```

Pass `signal` through the chain: `TUI → bridge → model handler → pi-ai stream()`.

## Acceptance
- Tokens appear one-by-one (or in small batches) as the LLM generates
- Ctrl+C during streaming stops generation, shows partial response
- Token usage is tracked and available for the status bar (T8)
- Thinking blocks from reasoning models are captured (display is T6)
