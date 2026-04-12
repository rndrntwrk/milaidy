import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasRoleAccess } from "./access";

/**
 * Integration test for hasRoleAccess — no module mocks.
 *
 * Uses the real checkSenderRole from @miladyai/shared/eliza-core-roles, backed by minimal
 * runtime objects that implement the interface methods it needs (getRoom,
 * getWorld, getSetting, getEntityById).
 */

type RoleName = "OWNER" | "ADMIN" | "USER" | "GUEST";

function makeRuntime(
  agentId = "agent-1",
  opts?: {
    worldRoles?: Record<string, RoleName>;
    worldOwnerId?: string;
    hasWorld?: boolean;
  },
) {
  const worldId = "world-1";
  const worldRoles = opts?.worldRoles ?? {};
  const hasWorld = opts?.hasWorld ?? true;
  const worldOwnerId = opts?.worldOwnerId;

  return {
    agentId,
    getRoom: vi.fn().mockResolvedValue(
      hasWorld ? { id: "room-1", worldId } : null,
    ),
    getWorld: vi.fn().mockResolvedValue(
      hasWorld
        ? {
            id: worldId,
            metadata: {
              ...(worldOwnerId
                ? { ownership: { ownerId: worldOwnerId } }
                : {}),
              roles: worldRoles,
            },
          }
        : null,
    ),
    getSetting: vi.fn().mockReturnValue(null),
    getEntityById: vi.fn().mockResolvedValue(null),
    getRelationships: vi.fn().mockResolvedValue([]),
  } as unknown as IAgentRuntime;
}

function makeMessage(entityId = "user-1", roomId = "room-1") {
  return {
    entityId: entityId as UUID,
    roomId: roomId as UUID,
    content: { text: "test", source: "test" },
  } as Memory;
}

describe("hasRoleAccess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when requiredRole is GUEST", async () => {
    expect(await hasRoleAccess(makeRuntime(), makeMessage(), "GUEST")).toBe(
      true,
    );
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
    // No world means checkSenderRole returns null => lenient fallback allows through
    const runtime = makeRuntime("agent-1", { hasWorld: false });
    expect(
      await hasRoleAccess(runtime, makeMessage(), "ADMIN"),
    ).toBe(true);
  });

  it("allows OWNER when ADMIN is required", async () => {
    const runtime = makeRuntime("agent-1", {
      worldRoles: { "user-1": "OWNER" },
    });
    expect(
      await hasRoleAccess(runtime, makeMessage(), "ADMIN"),
    ).toBe(true);
  });

  it("allows ADMIN when ADMIN is required", async () => {
    const runtime = makeRuntime("agent-1", {
      worldRoles: { "user-1": "ADMIN" },
    });
    expect(
      await hasRoleAccess(runtime, makeMessage(), "ADMIN"),
    ).toBe(true);
  });

  it("blocks USER when ADMIN is required", async () => {
    const runtime = makeRuntime("agent-1", {
      worldRoles: { "user-1": "USER" },
    });
    expect(
      await hasRoleAccess(runtime, makeMessage(), "ADMIN"),
    ).toBe(false);
  });

  it("blocks GUEST when USER is required", async () => {
    const runtime = makeRuntime("agent-1", {
      worldRoles: { "user-1": "GUEST" },
    });
    expect(
      await hasRoleAccess(runtime, makeMessage(), "USER"),
    ).toBe(false);
  });

  it("blocks GUEST when OWNER is required", async () => {
    const runtime = makeRuntime("agent-1", {
      worldRoles: { "user-1": "GUEST" },
    });
    expect(
      await hasRoleAccess(runtime, makeMessage(), "OWNER"),
    ).toBe(false);
  });

  it("allows USER when USER is required", async () => {
    const runtime = makeRuntime("agent-1", {
      worldRoles: { "user-1": "USER" },
    });
    expect(
      await hasRoleAccess(runtime, makeMessage(), "USER"),
    ).toBe(true);
  });

  it("allows OWNER when OWNER is required", async () => {
    const runtime = makeRuntime("agent-1", {
      worldRoles: { "user-1": "OWNER" },
    });
    expect(
      await hasRoleAccess(runtime, makeMessage(), "OWNER"),
    ).toBe(true);
  });

  it("returns false when runtime methods throw", async () => {
    const runtime = {
      agentId: "agent-1",
      getRoom: vi.fn().mockRejectedValue(new Error("boom")),
      getSetting: vi.fn().mockReturnValue(null),
    } as unknown as IAgentRuntime;
    expect(
      await hasRoleAccess(runtime, makeMessage(), "ADMIN"),
    ).toBe(false);
  });
});
