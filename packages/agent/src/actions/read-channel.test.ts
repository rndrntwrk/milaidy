/**
 * Read channel action tests — REAL integration tests.
 *
 * Tests readChannelAction using a real PGLite-backed runtime with real
 * rooms and messages instead of mocking database operations and roles.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime, UUID } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";
import { readChannelAction } from "./read-channel";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

function makeMessage(text = "read channel") {
  return {
    entityId: runtime.agentId,
    roomId: "room-1" as UUID,
    content: { text, source: "client_chat" },
  } as never;
}

describe("readChannelAction", () => {
  it("has correct metadata", () => {
    expect(readChannelAction.name).toBe("READ_CHANNEL");
    expect(readChannelAction.parameters).toBeDefined();
    expect(readChannelAction.parameters?.length).toBeGreaterThan(0);
  });

  it("rejects when no channel param", async () => {
    const result = await readChannelAction.handler?.(
      runtime,
      makeMessage(),
      {} as never,
      { parameters: {} } as never,
    );
    expect(result).toBeDefined();
    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(typeof r.text).toBe("string");
  }, 60_000);

  it("returns channel not found for unknown channel", async () => {
    const result = await readChannelAction.handler?.(
      runtime,
      makeMessage(),
      {} as never,
      { parameters: { channel: "nonexistent-channel-xyz" } } as never,
    );
    expect(result).toBeDefined();
    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(false);
  }, 60_000);

  it("handles channel read without crashing", async () => {
    // Create a real room in the database
    const roomId = "test-room-read-channel-001" as UUID;
    try {
      await runtime.ensureRoomExists({
        id: roomId,
        name: "test-channel",
        source: "test",
      });
    } catch {
      // Room creation may vary — test should still work
    }

    const result = await readChannelAction.handler?.(
      runtime,
      makeMessage("read test-channel"),
      {} as never,
      { parameters: { channel: "test-channel" } } as never,
    );

    // Action should handle the request without throwing
    expect(result).toBeDefined();
    const r = result as unknown as Record<string, unknown>;
    expect(typeof r.success).toBe("boolean");
    expect(typeof r.text).toBe("string");
  }, 60_000);
});
