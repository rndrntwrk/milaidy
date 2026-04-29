import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCheckSenderRole } = vi.hoisted(() => ({
  mockCheckSenderRole: vi.fn(),
}));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderRole: mockCheckSenderRole,
  resolveCanonicalOwnerIdForMessage: vi.fn().mockResolvedValue(null),
}));

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

import { hasRoleAccess } from "./access";

function makeRuntime(agentId = "agent-1") {
  return { agentId, getSetting: vi.fn() } as never;
}

function makeMessage(entityId = "user-1", roomId = "room-1") {
  return {
    entityId,
    roomId,
    content: { text: "test", source: "test" },
  } as never;
}

describe("hasRoleAccess", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when requiredRole is GUEST", async () => {
    expect(await hasRoleAccess(makeRuntime(), makeMessage(), "GUEST")).toBe(
      true,
    );
    expect(mockCheckSenderRole).not.toHaveBeenCalled();
  });

  it("returns true when runtime is undefined (no context)", async () => {
    expect(await hasRoleAccess(undefined, makeMessage(), "ADMIN")).toBe(true);
  });

  it("returns true when message is undefined (no context)", async () => {
    expect(await hasRoleAccess(makeRuntime(), undefined, "ADMIN")).toBe(true);
  });

  it("returns true when sender is the agent itself", async () => {
    const runtime = makeRuntime("agent-1");
    const message = makeMessage("agent-1");
    expect(await hasRoleAccess(runtime, message, "OWNER")).toBe(true);
  });

  it("returns true when checkSenderRole returns null (no world context)", async () => {
    mockCheckSenderRole.mockResolvedValue(null);
    expect(
      await hasRoleAccess(makeRuntime(), makeMessage(), "ADMIN"),
    ).toBe(true);
  });

  it("allows OWNER when ADMIN is required", async () => {
    mockCheckSenderRole.mockResolvedValue({ role: "OWNER" });
    expect(
      await hasRoleAccess(makeRuntime(), makeMessage(), "ADMIN"),
    ).toBe(true);
  });

  it("allows ADMIN when ADMIN is required", async () => {
    mockCheckSenderRole.mockResolvedValue({ role: "ADMIN" });
    expect(
      await hasRoleAccess(makeRuntime(), makeMessage(), "ADMIN"),
    ).toBe(true);
  });

  it("blocks USER when ADMIN is required", async () => {
    mockCheckSenderRole.mockResolvedValue({ role: "USER" });
    expect(
      await hasRoleAccess(makeRuntime(), makeMessage(), "ADMIN"),
    ).toBe(false);
  });

  it("blocks GUEST when USER is required", async () => {
    mockCheckSenderRole.mockResolvedValue({ role: "GUEST" });
    expect(
      await hasRoleAccess(makeRuntime(), makeMessage(), "USER"),
    ).toBe(false);
  });

  it("blocks GUEST when OWNER is required", async () => {
    mockCheckSenderRole.mockResolvedValue({ role: "GUEST" });
    expect(
      await hasRoleAccess(makeRuntime(), makeMessage(), "OWNER"),
    ).toBe(false);
  });

  it("allows USER when USER is required", async () => {
    mockCheckSenderRole.mockResolvedValue({ role: "USER" });
    expect(
      await hasRoleAccess(makeRuntime(), makeMessage(), "USER"),
    ).toBe(true);
  });

  it("allows OWNER when OWNER is required", async () => {
    mockCheckSenderRole.mockResolvedValue({ role: "OWNER" });
    expect(
      await hasRoleAccess(makeRuntime(), makeMessage(), "OWNER"),
    ).toBe(true);
  });

  it("returns false when checkSenderRole throws", async () => {
    mockCheckSenderRole.mockRejectedValue(new Error("boom"));
    expect(
      await hasRoleAccess(makeRuntime(), makeMessage(), "ADMIN"),
    ).toBe(false);
  });
});
