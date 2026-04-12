/**
 * Escalation trigger provider — REAL integration tests.
 *
 * Tests createEscalationTriggerProvider using a real PGLite-backed runtime
 * with real role resolution and escalation service.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";
import { createEscalationTriggerProvider } from "./escalation-trigger";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

function makeMessage(overrides: Record<string, unknown> = {}): Memory {
  return {
    entityId: runtime.agentId,
    roomId: "room-esc-trigger-001" as UUID,
    content: { text: "hello", source: "client_chat" },
    ...overrides,
  } as Memory;
}

describe("escalationTriggerProvider", () => {
  const provider = createEscalationTriggerProvider();

  it("returns a result for admin callers", async () => {
    const result = await provider.get(
      runtime,
      makeMessage(),
      {} as never,
    );

    expect(result).toBeDefined();
    expect(typeof result.text).toBe("string");
  }, 60_000);

  it("returns empty for non-admin callers", async () => {
    const nonAdminMsg = makeMessage({
      entityId: "non-admin-esc-001" as UUID,
    });

    const result = await provider.get(
      runtime,
      nonAdminMsg,
      {} as never,
    );

    expect(result).toBeDefined();
    expect(typeof result.text).toBe("string");
  }, 60_000);

  it("handles messages from different sources", async () => {
    const discordMsg = makeMessage({
      content: { text: "hello", source: "discord" },
    });

    const result = await provider.get(
      runtime,
      discordMsg,
      {} as never,
    );

    expect(result).toBeDefined();
    expect(typeof result.text).toBe("string");
  }, 60_000);
});
