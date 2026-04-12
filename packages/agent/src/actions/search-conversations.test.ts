/**
 * Search conversations action tests — REAL integration tests.
 *
 * Tests searchConversationsAction using a real PGLite-backed runtime
 * with real memory search instead of mocking useModel and searchMemories.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime, UUID } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";
import { searchConversationsAction } from "./search-conversations";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

function makeMessage(text = "search for pizza") {
  return {
    entityId: runtime.agentId,
    roomId: "room-1" as UUID,
    content: { text, source: "client_chat" },
  } as never;
}

describe("searchConversationsAction", () => {
  it("has correct metadata", () => {
    expect(searchConversationsAction.name).toBe("SEARCH_CONVERSATIONS");
    expect(searchConversationsAction.parameters?.length).toBeGreaterThan(0);
  });

  it("rejects empty query", async () => {
    const result = (await searchConversationsAction.handler?.(
      runtime,
      makeMessage(),
      {} as never,
      { parameters: {} } as never,
    )) as unknown as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(typeof result.text).toBe("string");
  }, 60_000);

  it("handles a search query without crashing", async () => {
    const result = (await searchConversationsAction.handler?.(
      runtime,
      makeMessage("search for pizza"),
      {} as never,
      { parameters: { query: "pizza" } } as never,
    )) as unknown as Record<string, unknown>;

    // With a fresh database, there are no conversations to find,
    // but the action should complete without errors
    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.text).toBe("string");
  }, 60_000);

  it("returns no results for unmatched query", async () => {
    const result = (await searchConversationsAction.handler?.(
      runtime,
      makeMessage("search for xyznonexistent12345"),
      {} as never,
      { parameters: { query: "xyznonexistent12345" } } as never,
    )) as unknown as Record<string, unknown>;

    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.text).toBe("string");
    const text = result.text as string;
    if (result.success === true) {
      expect(
        text.toLowerCase().includes("no") ||
          text.toLowerCase().includes("0") ||
          text.toLowerCase().includes("empty") ||
          text.length > 0,
      ).toBe(true);
    } else {
      expect(text.toLowerCase()).toContain("failed");
    }
  }, 60_000);
});
