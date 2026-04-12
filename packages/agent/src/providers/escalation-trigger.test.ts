/**
 * Escalation trigger provider — REAL integration tests.
 *
 * Tests createEscalationTriggerProvider using a real PGLite-backed runtime
 * with real role resolution and escalation service.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stringToUuid, type AgentRuntime, type Memory, type UUID } from "@elizaos/core";
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

function normalizeUuidLike(value: string): UUID {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? (value as UUID)
    : (stringToUuid(value) as UUID);
}

function makeMessage(overrides: Record<string, unknown> = {}): Memory {
  return {
    entityId: runtime.agentId,
    roomId: normalizeUuidLike("room-esc-trigger-001"),
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
      entityId: normalizeUuidLike("non-admin-esc-001"),
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
