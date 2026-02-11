import { type IAgentRuntime, ModelType } from "@elizaos/core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { registerPiAiModelHandler } from "./pi-ai-model-handler.js";

function createDummyModel(): Model<Api> {
  return {
    id: "dummy-model",
    name: "Dummy",
    api: "openai-responses",
    provider: "openai",
    baseUrl: "http://localhost",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1,
    maxTokens: 1,
  };
}

describe("registerPiAiModelHandler", () => {
  it("registers handlers for TEXT_LARGE and TEXT_SMALL", () => {
    const calls: Array<{
      modelType: string;
      provider: string;
      priority: number;
    }> = [];

    const runtime = {
      registerModel: (
        modelType: string,
        _handler: unknown,
        provider: string,
        priority?: number,
      ) => {
        calls.push({ modelType, provider, priority: priority ?? 0 });
      },
    } as unknown as IAgentRuntime;

    registerPiAiModelHandler(runtime, {
      largeModel: createDummyModel(),
      smallModel: createDummyModel(),
    });

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelType: ModelType.TEXT_LARGE,
          provider: "pi-ai",
        }),
        expect.objectContaining({
          modelType: ModelType.TEXT_SMALL,
          provider: "pi-ai",
        }),
      ]),
    );
  });
});
