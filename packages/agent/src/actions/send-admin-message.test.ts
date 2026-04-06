import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCheckSenderRole, mockSendMessageToTarget, mockGetRoom, mockGetWorld } =
  vi.hoisted(() => ({
    mockCheckSenderRole: vi.fn(),
    mockSendMessageToTarget: vi.fn(),
    mockGetRoom: vi.fn(),
    mockGetWorld: vi.fn(),
  }));

vi.mock("@miladyai/plugin-roles", () => ({
  checkSenderRole: mockCheckSenderRole,
}));

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

import type { UUID } from "@elizaos/core";
import { sendAdminMessageAction } from "./send-admin-message";

function makeRuntime(overrides?: Record<string, unknown>) {
  return {
    agentId: "agent-1" as UUID,
    character: { name: "TestAgent" },
    getRoom: mockGetRoom,
    getWorld: mockGetWorld,
    sendMessageToTarget: mockSendMessageToTarget,
    ...overrides,
  } as never;
}

function makeMessage(entityId: string, roomId = "room-1") {
  return {
    entityId,
    roomId,
    content: { source: "client_chat", text: "test" },
  } as never;
}

describe("sendAdminMessageAction", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
    mockSendMessageToTarget.mockReset();
    mockGetRoom.mockReset();
    mockGetWorld.mockReset();
    mockSendMessageToTarget.mockResolvedValue(undefined);
  });

  // -----------------------------------------------------------------------
  // validate
  // -----------------------------------------------------------------------

  it("allows the agent itself (autonomous)", async () => {
    const runtime = makeRuntime();
    const message = makeMessage("agent-1");

    const valid = await sendAdminMessageAction.validate?.(
      runtime,
      message,
      {} as never,
    );
    expect(valid).toBe(true);
    // checkSenderRole should NOT be called for self
    expect(mockCheckSenderRole).not.toHaveBeenCalled();
  });

  it("allows admin callers", async () => {
    mockCheckSenderRole.mockResolvedValue({
      entityId: "owner-1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });

    const valid = await sendAdminMessageAction.validate?.(
      makeRuntime(),
      makeMessage("owner-1"),
      {} as never,
    );
    expect(valid).toBe(true);
  });

  it("rejects non-admin callers", async () => {
    mockCheckSenderRole.mockResolvedValue({
      entityId: "user-1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const valid = await sendAdminMessageAction.validate?.(
      makeRuntime(),
      makeMessage("user-1"),
      {} as never,
    );
    expect(valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // handler — parameter validation
  // -----------------------------------------------------------------------

  it("rejects missing text", async () => {
    const result = await sendAdminMessageAction.handler?.(
      makeRuntime(),
      makeMessage("agent-1"),
      {} as never,
      { parameters: {} } as never,
    );
    expect(result).toMatchObject({
      success: false,
      values: { error: "INVALID_PARAMETERS" },
    });
    expect(mockSendMessageToTarget).not.toHaveBeenCalled();
  });

  it("rejects empty text", async () => {
    const result = await sendAdminMessageAction.handler?.(
      makeRuntime(),
      makeMessage("agent-1"),
      {} as never,
      { parameters: { text: "   " } } as never,
    );
    expect(result).toMatchObject({
      success: false,
      values: { error: "INVALID_PARAMETERS" },
    });
  });

  it("rejects invalid urgency", async () => {
    const result = await sendAdminMessageAction.handler?.(
      makeRuntime(),
      makeMessage("agent-1"),
      {} as never,
      { parameters: { text: "hello", urgency: "critical" } } as never,
    );
    expect(result).toMatchObject({
      success: false,
      values: { error: "INVALID_PARAMETERS" },
    });
  });

  // -----------------------------------------------------------------------
  // handler — successful sends
  // -----------------------------------------------------------------------

  it("sends to admin using world ownership metadata", async () => {
    mockGetRoom.mockResolvedValue({ worldId: "world-1" });
    mockGetWorld.mockResolvedValue({
      metadata: { ownership: { ownerId: "owner-uuid-123" } },
    });

    const result = await sendAdminMessageAction.handler?.(
      makeRuntime(),
      makeMessage("agent-1"),
      {} as never,
      { parameters: { text: "Task completed" } } as never,
    );

    expect(result).toMatchObject({
      success: true,
      values: { success: true, urgency: "normal" },
      data: { actionName: "SEND_ADMIN_MESSAGE" },
    });
    expect(mockSendMessageToTarget).toHaveBeenCalledOnce();
    const [target, content] = mockSendMessageToTarget.mock.calls[0];
    expect(target.source).toBe("client_chat");
    expect(target.entityId).toBe("owner-uuid-123");
    expect(content.text).toBe("Task completed");
    expect(content.metadata).toEqual({ urgency: "normal" });
  });

  it("falls back to deterministic entity ID when no world ownership", async () => {
    mockGetRoom.mockResolvedValue(null);

    const result = await sendAdminMessageAction.handler?.(
      makeRuntime(),
      makeMessage("agent-1"),
      {} as never,
      { parameters: { text: "Alert!", urgency: "urgent" } } as never,
    );

    expect(result).toMatchObject({
      success: true,
      values: { urgency: "urgent" },
    });
    expect(result).toMatchObject({
      text: "Message sent to admin (URGENT).",
    });
    expect(mockSendMessageToTarget).toHaveBeenCalledOnce();
    const [target, content] = mockSendMessageToTarget.mock.calls[0];
    expect(target.source).toBe("client_chat");
    // Deterministic UUID from stringToUuid("TestAgent-admin-entity")
    expect(typeof target.entityId).toBe("string");
    expect(content.metadata).toEqual({ urgency: "urgent" });
  });

  it("handles send failure gracefully", async () => {
    mockGetRoom.mockResolvedValue(null);
    mockSendMessageToTarget.mockRejectedValue(new Error("WS not connected"));

    const result = await sendAdminMessageAction.handler?.(
      makeRuntime(),
      makeMessage("agent-1"),
      {} as never,
      { parameters: { text: "urgent notification" } } as never,
    );

    expect(result).toMatchObject({
      success: false,
      values: { error: "SEND_FAILED" },
    });
  });

  it("trims whitespace from text", async () => {
    mockGetRoom.mockResolvedValue(null);

    await sendAdminMessageAction.handler?.(
      makeRuntime(),
      makeMessage("agent-1"),
      {} as never,
      { parameters: { text: "  hello world  " } } as never,
    );

    const [, content] = mockSendMessageToTarget.mock.calls[0];
    expect(content.text).toBe("hello world");
  });

  it("defaults urgency to normal when omitted", async () => {
    mockGetRoom.mockResolvedValue(null);

    const result = await sendAdminMessageAction.handler?.(
      makeRuntime(),
      makeMessage("agent-1"),
      {} as never,
      { parameters: { text: "hi" } } as never,
    );

    expect(result).toMatchObject({ values: { urgency: "normal" } });
    const [, content] = mockSendMessageToTarget.mock.calls[0];
    expect(content.metadata).toEqual({ urgency: "normal" });
  });
});
