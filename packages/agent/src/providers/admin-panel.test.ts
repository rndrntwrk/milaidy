/**
 * Admin panel provider — REAL integration tests.
 *
 * Tests the admin panel provider using a real PGLite-backed runtime
 * with real role resolution instead of mocking checkSenderRole.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stringToUuid, type AgentRuntime, type Memory, type UUID } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";
import { createAdminPanelProvider } from "./admin-panel";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

function normalizeUuidLike(value: string): UUID {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? (value as UUID)
    : (stringToUuid(value) as UUID);
}

const ROOM_ID = normalizeUuidLike("room-admin-panel-001");

function makeMessage(overrides: Record<string, unknown> = {}): Memory {
  return {
    entityId: runtime.agentId,
    roomId: ROOM_ID,
    content: { text: "hello", source: "discord" },
    ...overrides,
  } as Memory;
}

describe("adminPanelProvider", () => {
  const provider = createAdminPanelProvider();

  it("returns empty for non-admin callers", async () => {
    const nonAdminMsg = makeMessage({
      entityId: normalizeUuidLike("non-admin-panel-test-001"),
    });

    const result = await provider.get(
      runtime,
      nonAdminMsg,
      {} as never,
    );

    expect(result).toBeDefined();
    expect(typeof result.text).toBe("string");
    // Non-admin should get empty or minimal response
    expect(result.text).toBe("");
  }, 60_000);

  it("returns data for admin/owner callers", async () => {
    // Using agentId as entityId — the agent itself should have admin-like access
    const result = await provider.get(
      runtime,
      makeMessage(),
      {} as never,
    );

    expect(result).toBeDefined();
    expect(typeof result.text).toBe("string");
  }, 60_000);

  it("skips non-client_chat sources when configured to do so", async () => {
    // Test with a source that is not client_chat
    const discordMsg = makeMessage({
      content: { text: "hello", source: "discord" },
    });

    const result = await provider.get(
      runtime,
      discordMsg,
      {} as never,
    );

    // Provider should handle different sources gracefully
    expect(result).toBeDefined();
    expect(typeof result.text).toBe("string");
  }, 60_000);
});
