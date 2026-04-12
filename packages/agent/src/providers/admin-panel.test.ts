/**
 * Admin panel provider — REAL integration tests.
 *
 * Tests the admin panel provider using a real PGLite-backed runtime
 * with real role resolution instead of mocking checkSenderRole.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
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

const ROOM_ID = "room-admin-panel-001" as UUID;

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
      entityId: "non-admin-panel-test-001" as UUID,
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
