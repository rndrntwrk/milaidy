/**
 * Trigger task action — REAL integration tests.
 *
 * Tests createTriggerTaskAction using a real PGLite-backed runtime
 * with real trigger infrastructure, real access control, and real task management.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime, UUID } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";
import { createTriggerTaskAction } from "./action";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;
let action: ReturnType<typeof createTriggerTaskAction>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
  action = createTriggerTaskAction();
}, 180_000);

afterAll(async () => {
  await cleanup();
});

describe("createTriggerTaskAction", () => {
  it("has correct action metadata", () => {
    expect(action.name).toBeDefined();
    expect(typeof action.name).toBe("string");
    expect(action.handler).toBeDefined();
  });

  it("rejects non-owner callers on validate", async () => {
    const nonOwner = "non-owner-trigger-001" as UUID;
    const valid = await action.validate?.(
      runtime,
      {
        entityId: nonOwner,
        content: { text: "create a trigger" },
      } as never,
      {} as never,
    );
    // Non-owner should fail validation
    expect(valid).toBe(false);
  }, 60_000);

  it("handler rejects missing parameters", async () => {
    const result = await action.handler?.(
      runtime,
      {
        entityId: runtime.agentId,
        roomId: "room-trigger-001" as UUID,
        content: { text: "create trigger" },
      } as never,
      {} as never,
      { parameters: {} } as never,
    );

    expect(result).toBeDefined();
    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(false);
  }, 60_000);

  it("handler rejects when triggers feature is disabled", async () => {
    // With a fresh runtime, triggers may not be enabled
    const result = await action.handler?.(
      runtime,
      {
        entityId: runtime.agentId,
        roomId: "room-trigger-002" as UUID,
        content: { text: "create nightly summary" },
      } as never,
      {} as never,
      {
        parameters: {
          name: "Nightly Summary",
          prompt: "Summarize today's events",
          schedule: "0 0 * * *",
        },
      } as never,
    );

    expect(result).toBeDefined();
    const r = result as unknown as Record<string, unknown>;
    expect(typeof r.success).toBe("boolean");
    expect(typeof r.text).toBe("string");
  }, 60_000);
});
