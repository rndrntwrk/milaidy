import {
  type GenerateTextParams,
  type IAgentRuntime,
  type JsonValue,
  ModelType,
  type TextStreamResult,
  type TokenUsage,
} from "@elizaos/core";
import {
  type Api,
  type AssistantMessage,
  type Context,
  complete,
  getProviders,
  type Model,
  stream,
} from "@mariozechner/pi-ai";

export interface StreamEvent {
  type: "token" | "thinking" | "done" | "error" | "usage";
  text?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  error?: string;
  reason?: string;
}

export type StreamEventCallback = (event: StreamEvent) => void;

export interface PiAiConfig {
  /** pi-ai model for TEXT_LARGE */
  largeModel: Model<Api>;
  /** pi-ai model for TEXT_SMALL */
  smallModel: Model<Api>;
  /** Optional: callback for streaming events (for TUI display) */
  onStreamEvent?: StreamEventCallback;
  /** Optional: signal provider for aborting in-flight requests */
  getAbortSignal?: () => AbortSignal | undefined;
  /**
   * Optional API key resolver.
   *
   * This is important for OAuth-backed providers (e.g. openai-codex) where
   * the token is not available via process.env.
   */
  getApiKey?: (
    provider: string,
  ) => Promise<string | undefined> | string | undefined;
  /** Provider label in ElizaOS model registry */
  providerName?: string;
  /** Additional provider aliases to register under (so runtime.useModel(provider=...) still routes here). */
  providerAliases?: string[];
  /** Priority used by ElizaOS when multiple handlers are registered */
  priority?: number;
}

export interface PiAiModelHandlerController {
  getLargeModel(): Model<Api>;
  setLargeModel(model: Model<Api>): void;
  getSmallModel(): Model<Api>;
  setSmallModel(model: Model<Api>): void;
}

function elizaParamsToPiAiContext(params: GenerateTextParams): Context {
  return {
    // ElizaOS pre-composes the full prompt (system+context+user) into params.prompt.
    // We keep pi-ai's systemPrompt empty and send the prompt as a single user message.
    systemPrompt: "",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: params.prompt }],
        timestamp: Date.now(),
      },
    ],
  };
}

function assistantMessageToText(message: AssistantMessage): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

function usageToEliza(usage: {
  input: number;
  output: number;
  totalTokens: number;
}): TokenUsage {
  return {
    promptTokens: usage.input,
    completionTokens: usage.output,
    totalTokens: usage.totalTokens,
  };
}

function extractAbortSignal(
  params: Record<string, JsonValue | object>,
  getAbortSignal?: () => AbortSignal | undefined,
): AbortSignal | undefined {
  const fromGetter = getAbortSignal?.();
  if (fromGetter) return fromGetter;

  // Best-effort: some ElizaOS callers pass abortSignal in model params.
  const maybe = (params as unknown as { abortSignal?: AbortSignal })
    .abortSignal;
  return maybe;
}

function createPiAiHandler(
  getModel: () => Model<Api>,
  config: {
    onStreamEvent?: StreamEventCallback;
    getAbortSignal?: () => AbortSignal | undefined;
    getApiKey?: (
      provider: string,
    ) => Promise<string | undefined> | string | undefined;
  },
) {
  return async (
    _runtime: IAgentRuntime,
    params: Record<string, JsonValue | object>,
  ): Promise<JsonValue | object> => {
    const p = params as unknown as GenerateTextParams;
    const model = getModel();
    const context = elizaParamsToPiAiContext(p);

    const signal = extractAbortSignal(params, config.getAbortSignal);
    const apiKey = await config.getApiKey?.(model.provider);

    const streamRequested =
      Boolean(p.stream) || typeof p.onStreamChunk === "function";
    const hasTuiListener = typeof config.onStreamEvent === "function";
    const shouldStream = streamRequested || hasTuiListener;

    if (!shouldStream) {
      const result = await complete(model, context, {
        temperature: p.temperature,
        maxTokens: p.maxTokens,
        signal,
        ...(apiKey ? { apiKey } : {}),
      });
      return assistantMessageToText(result);
    }

    // Streaming path.
    const makeStream = () =>
      stream(model, context, {
        temperature: p.temperature,
        maxTokens: p.maxTokens,
        signal,
        ...(apiKey ? { apiKey } : {}),
      });

    // If Eliza explicitly requested stream=true, return TextStreamResult.
    if (p.stream) {
      let fullText = "";
      let resolvedUsage: TokenUsage | undefined;
      let finishReason: string | undefined;

      let resolveText: (value: string) => void;
      let resolveUsage: (value: TokenUsage | undefined) => void;
      let resolveFinish: (value: string | undefined) => void;

      const text = new Promise<string>((r) => {
        resolveText = r;
      });
      const usage = new Promise<TokenUsage | undefined>((r) => {
        resolveUsage = r;
      });
      const finishReasonP = new Promise<string | undefined>((r) => {
        resolveFinish = r;
      });

      async function* textStreamGenerator() {
        try {
          for await (const event of makeStream()) {
            switch (event.type) {
              case "text_delta": {
                const delta = event.delta;
                fullText += delta;
                if (p.onStreamChunk) {
                  await p.onStreamChunk(delta);
                }
                config.onStreamEvent?.({ type: "token", text: delta });
                yield delta;
                break;
              }
              case "thinking_delta": {
                config.onStreamEvent?.({ type: "thinking", text: event.delta });
                break;
              }
              case "done": {
                finishReason = event.reason;
                resolvedUsage = usageToEliza(event.message.usage);
                config.onStreamEvent?.({
                  type: "usage",
                  usage: {
                    inputTokens: event.message.usage.input,
                    outputTokens: event.message.usage.output,
                    totalTokens: event.message.usage.totalTokens,
                  },
                });
                config.onStreamEvent?.({ type: "done" });
                break;
              }
              case "error": {
                finishReason = event.reason;

                // Treat user cancellation as a normal end-of-stream so the UI can
                // keep and finalize the partial response.
                if (event.reason === "aborted") {
                  config.onStreamEvent?.({
                    type: "done",
                    reason: event.reason,
                  });
                } else {
                  config.onStreamEvent?.({
                    type: "error",
                    error: event.error.errorMessage ?? "Model stream error",
                    reason: event.reason,
                  });
                }

                // Keep partial text.
                break;
              }
            }
          }
        } finally {
          resolveText(fullText);
          resolveUsage(resolvedUsage);
          resolveFinish(finishReason);
        }
      }

      const result: TextStreamResult = {
        textStream: textStreamGenerator(),
        text,
        usage,
        finishReason: finishReasonP,
      };

      return result;
    }

    // Stream for TUI or onStreamChunk, but return a string for Eliza.
    let fullText = "";

    for await (const event of makeStream()) {
      switch (event.type) {
        case "text_delta": {
          const delta = event.delta;
          fullText += delta;
          if (p.onStreamChunk) {
            await p.onStreamChunk(delta);
          }
          config.onStreamEvent?.({ type: "token", text: delta });
          break;
        }
        case "thinking_delta": {
          config.onStreamEvent?.({ type: "thinking", text: event.delta });
          break;
        }
        case "done": {
          config.onStreamEvent?.({
            type: "usage",
            usage: {
              inputTokens: event.message.usage.input,
              outputTokens: event.message.usage.output,
              totalTokens: event.message.usage.totalTokens,
            },
          });
          config.onStreamEvent?.({ type: "done" });
          break;
        }
        case "error": {
          if (event.reason === "aborted") {
            config.onStreamEvent?.({ type: "done", reason: event.reason });
          } else {
            config.onStreamEvent?.({
              type: "error",
              error: event.error.errorMessage ?? "Model stream error",
              reason: event.reason,
            });
          }
          break;
        }
      }
    }

    return fullText;
  };
}

/**
 * Register pi-ai as the model provider for an ElizaOS runtime.
 *
 * Returns a controller that can be used to switch models without re-registering handlers.
 */
export function registerPiAiModelHandler(
  runtime: IAgentRuntime,
  config: PiAiConfig,
): PiAiModelHandlerController {
  let largeModel = config.largeModel;
  let smallModel = config.smallModel;

  const providerName = config.providerName ?? "pi-ai";
  const priority = config.priority ?? 1000;

  const largeHandler = createPiAiHandler(() => largeModel, {
    onStreamEvent: config.onStreamEvent,
    getAbortSignal: config.getAbortSignal,
    getApiKey: config.getApiKey,
  });
  const smallHandler = createPiAiHandler(() => smallModel, {
    onStreamEvent: config.onStreamEvent,
    getAbortSignal: config.getAbortSignal,
    getApiKey: config.getApiKey,
  });

  const aliases = new Set<string>([
    providerName,
    ...(config.providerAliases ?? []),
    // Also register under all known pi-ai provider names so ElizaOS calls like
    // runtime.useModel(..., provider="anthropic") still route through pi-ai.
    ...getProviders(),
  ]);

  for (const alias of aliases) {
    runtime.registerModel(ModelType.TEXT_LARGE, largeHandler, alias, priority);
    runtime.registerModel(ModelType.TEXT_SMALL, smallHandler, alias, priority);
  }

  return {
    getLargeModel: () => largeModel,
    setLargeModel: (m) => {
      largeModel = m;
    },
    getSmallModel: () => smallModel,
    setSmallModel: (m) => {
      smallModel = m;
    },
  };
}
