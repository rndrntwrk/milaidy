/**
 * Send message action (admin pathway) — REAL integration tests.
 *
 * Tests sendMessageAction's admin pathway using a real PGLite-backed runtime
 * with real role checking and message routing.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime, UUID } from "@elizaos/core";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";
import { sendMessageAction } from "./send-message";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ runtime, cleanup } = await createRealTestRuntime());
}, 180_000);

afterAll(async () => {
  await cleanup();
});

function makeMessage(entityId: string, roomId = "room-1") {
  return {
    entityId,
    roomId,
    content: { source: "client_chat", text: "test" },
  } as never;
}

async function callAdminHandler(
  rt: AgentRuntime,
  message: ReturnType<typeof makeMessage>,
  params: Record<string, unknown>,
) {
  return sendMessageAction.handler?.(
    rt,
    message,
    {} as never,
    { parameters: { target: "admin", ...params } } as never,
  );
}

describe("sendMessageAction — admin pathway", () => {
  // -----------------------------------------------------------------------
  // Permission checks
  // -----------------------------------------------------------------------

  it("allows the agent itself (autonomous)", async () => {
    const result = await callAdminHandler(
      runtime,
      makeMessage(runtime.agentId),
      { text: "hello from self" },
    );
    // Agent sending to itself/admin should succeed
    expect(result).toBeDefined();
    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(true);
  }, 60_000);

  it("rejects non-admin callers", async () => {
    const nonAdminEntityId = "non-admin-send-msg-001" as UUID;

    const result = await callAdminHandler(
      runtime,
      makeMessage(nonAdminEntityId),
      { text: "hello" },
    );
    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(false);
  }, 60_000);

  // -----------------------------------------------------------------------
  // Parameter validation
  // -----------------------------------------------------------------------

  it("rejects missing text", async () => {
    const result = await sendMessageAction.handler?.(
      runtime,
      makeMessage(runtime.agentId),
      {} as never,
      { parameters: { target: "admin" } } as never,
    );
    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(false);
  }, 60_000);

  it("rejects empty text", async () => {
    const result = await callAdminHandler(
      runtime,
      makeMessage(runtime.agentId),
      { text: "   " },
    );
    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(false);
  }, 60_000);

  it("rejects invalid urgency", async () => {
    const result = await callAdminHandler(
      runtime,
      makeMessage(runtime.agentId),
      { text: "hello", urgency: "critical" },
    );
    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(false);
  }, 60_000);

  // -----------------------------------------------------------------------
  // Successful sends
  // -----------------------------------------------------------------------

  it("sends to admin successfully with default urgency", async () => {
    const result = await callAdminHandler(
      runtime,
      makeMessage(runtime.agentId),
      { text: "Task completed" },
    );

    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(true);
    // Check that the response indicates the message was sent
    expect(typeof r.text).toBe("string");
    const values = r.values as Record<string, unknown> | undefined;
    if (values) {
      expect(values.urgency).toBe("normal");
    }
  }, 60_000);

  it("sends with urgent urgency", async () => {
    const result = await callAdminHandler(
      runtime,
      makeMessage(runtime.agentId),
      { text: "Alert!", urgency: "urgent" },
    );

    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(true);
    expect(typeof r.text).toBe("string");
  }, 60_000);

  it("recognizes target 'owner' as admin pathway", async () => {
    const result = await sendMessageAction.handler?.(
      runtime,
      makeMessage(runtime.agentId),
      {} as never,
      { parameters: { target: "owner", text: "hi owner" } } as never,
    );

    const r = result as unknown as Record<string, unknown>;
    expect(r.success).toBe(true);
  }, 60_000);
});
