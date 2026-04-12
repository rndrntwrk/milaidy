import { describe, expect, it, vi } from "vitest";
import {
  createMessageMemory,
  stringToUuid,
  type AgentRuntime,
} from "@elizaos/core";
import { generateChatResponse } from "../chat-routes";

function createUserMessage(text: string) {
  return createMessageMemory({
    id: stringToUuid(`chat-route-message:${text}`),
    entityId: stringToUuid("chat-route-user"),
    roomId: stringToUuid("chat-route-room"),
    content: {
      text,
      source: "api",
    },
  });
}

function createChatRouteRuntime(options?: {
  handleMessage?: AgentRuntime["messageService"]["handleMessage"];
}) {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    character: { name: "TestAgent" },
    messageService: {
      handleMessage:
        options?.handleMessage ??
        (async () => ({
          responseContent: { text: "hello world" },
        })),
    },
    actions: [],
    logger,
    emitEvent: vi.fn(),
  } as unknown as AgentRuntime;
}

describe("generateChatResponse reply fallback/recovery", () => {
  it("generates a response for a simple message", async () => {
    const runtime = createChatRouteRuntime({
      handleMessage: async () => ({
        responseContent: { text: "hello there" },
      }),
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("hello"),
      "TestAgent",
      { timeoutDuration: 120_000 },
    );

    expect(result).toBeDefined();
    expect(result.text).toBe("hello there");
  });

  it("fails fast when generation exceeds the configured timeout", async () => {
    const runtime = createChatRouteRuntime({
      handleMessage: async () => await new Promise(() => {}),
    });

    await expect(
      generateChatResponse(runtime, createUserMessage("hello"), "TestAgent", {
        timeoutDuration: 1,
      }),
    ).rejects.toThrow(/timed out/i);
  }, 30_000);

  it("handles messages and returns a structured response", async () => {
    const runtime = createChatRouteRuntime({
      handleMessage: async () => ({
        responseContent: { text: "structured reply" },
      }),
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("what can you do?"),
      "TestAgent",
      { timeoutDuration: 120_000 },
    );

    expect(result).toBeDefined();
    expect(result.text).toBe("structured reply");
    expect(typeof (result.usedActionCallbacks ?? false)).toBe("boolean");
  });
});
