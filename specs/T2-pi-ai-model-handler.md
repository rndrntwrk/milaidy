# T2: pi-ai Model Handler for ElizaOS

## Goal
Register `@mariozechner/pi-ai` as the LLM provider inside ElizaOS's `AgentRuntime`, so all `runtime.useModel(ModelType.TEXT_LARGE, ...)` calls route through pi-ai's unified streaming API.

## Context

### ElizaOS model system
ElizaOS uses `ModelHandler` functions registered per `ModelType`:

```typescript
// From @elizaos/core types
type ModelHandler = (runtime: IAgentRuntime, params: any) => Promise<any>;

// Registration:
runtime.registerModel(ModelType.TEXT_LARGE, handler);
runtime.registerModel(ModelType.TEXT_SMALL, handler);
```

Normally these are provided by plugins like `@elizaos/plugin-anthropic`. We replace them.

### pi-ai API
```typescript
import { stream, complete, streamSimple, getModel } from "@mariozechner/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-20250514");
const result = await complete(model, {
  systemPrompt: "You are helpful.",
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }], timestamp: Date.now() }],
});
// result.content[0].text
```

## Implementation: `src/tui/pi-ai-model-handler.ts`

```typescript
import {
  complete,
  stream,
  getModel,
  type Model,
  type Context,
  type AssistantMessage,
} from "@mariozechner/pi-ai";
import type { IAgentRuntime, GenerateTextParams } from "@elizaos/core";
import { ModelType } from "@elizaos/core";

export interface PiAiConfig {
  /** pi-ai model for TEXT_LARGE (e.g. getModel("anthropic", "claude-sonnet-4-20250514")) */
  largeModel: Model<any>;
  /** pi-ai model for TEXT_SMALL (e.g. getModel("anthropic", "claude-haiku-3-5")) */
  smallModel: Model<any>;
  /** Optional: callback when streaming tokens (for TUI display) */
  onStreamToken?: (token: string) => void;
}

/**
 * Convert ElizaOS GenerateTextParams into pi-ai Context format.
 */
function elizaParamsToPiAiContext(params: GenerateTextParams): Context {
  return {
    systemPrompt: "", // system prompt is baked into `params.prompt` by ElizaOS
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: params.prompt }],
        timestamp: Date.now(),
      },
    ],
  };
}

/**
 * Create an ElizaOS ModelHandler that delegates to pi-ai.
 */
function createPiAiHandler(model: Model<any>, onStreamToken?: (token: string) => void) {
  return async (_runtime: IAgentRuntime, params: GenerateTextParams): Promise<string> => {
    const context = elizaParamsToPiAiContext(params);

    if (onStreamToken) {
      // Use streaming so TUI can show tokens incrementally
      const s = stream(model, context, {
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      });

      let fullText = "";
      for await (const event of s) {
        if (event.type === "text") {
          fullText += event.text;
          onStreamToken(event.text);
        }
      }
      return fullText;
    }

    // Non-streaming fallback
    const result = await complete(model, context, {
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    });

    const textContent = result.content.find((c) => c.type === "text");
    return textContent?.text ?? "";
  };
}

/**
 * Register pi-ai as the model provider for an ElizaOS AgentRuntime.
 * Call this BEFORE runtime.initialize() or after clearing existing handlers.
 */
export function registerPiAiModelHandler(
  runtime: IAgentRuntime,
  config: PiAiConfig,
): void {
  const largeHandler = createPiAiHandler(config.largeModel, config.onStreamToken);
  const smallHandler = createPiAiHandler(config.smallModel, config.onStreamToken);

  // Register for all text model types
  runtime.registerModel(ModelType.TEXT_LARGE, largeHandler);
  runtime.registerModel(ModelType.TEXT_SMALL, smallHandler);
  // TEXT_MEDIUM falls back to LARGE in most ElizaOS setups
}
```

## Key Considerations

1. **ElizaOS prompt format**: ElizaOS pre-composes the full prompt (system + context + user) into `params.prompt`. We send it as a single user message to pi-ai. This is intentional — ElizaOS owns prompt composition.

2. **Streaming hook**: The `onStreamToken` callback is how T5 (streaming display) will receive tokens. The bridge passes this through.

3. **API keys**: pi-ai resolves keys from env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) automatically via its `env-api-keys.ts`. No extra config needed if env is set.

4. **Model selection**: The `PiAiConfig` maps ElizaOS model types to specific pi-ai models. The model selector (T9) will swap these dynamically.

## Acceptance
- Unit test: mock `IAgentRuntime`, call `registerPiAiModelHandler()`, verify handlers are registered
- Integration test: create a real pi-ai model, verify `complete()` returns text (requires API key — mark as `.live.test.ts`)
- `bun run build` passes
