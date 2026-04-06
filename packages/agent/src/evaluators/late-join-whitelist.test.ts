import type { Memory, State, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetEntityRole, mockResolveWorldForMessage, mockSetEntityRole } =
  vi.hoisted(() => ({
    mockGetEntityRole: vi.fn(),
    mockResolveWorldForMessage: vi.fn(),
    mockSetEntityRole: vi.fn(),
  }));

vi.mock("@miladyai/plugin-roles", () => ({
  getEntityRole: mockGetEntityRole,
  resolveWorldForMessage: mockResolveWorldForMessage,
  setEntityRole: mockSetEntityRole,
}));

const { mockLoadElizaConfig } = vi.hoisted(() => ({
  mockLoadElizaConfig: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadElizaConfig: mockLoadElizaConfig,
}));

import { lateJoinWhitelistEvaluator } from "./late-join-whitelist";

const ENTITY_ID = "entity-aaa" as UUID;
const ROOM_ID = "room-bbb" as UUID;
const WORLD_ID = "world-ccc" as UUID;

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "agent-ddd" as UUID,
    getEntityById: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as never;
}

function makeMessage(overrides: Record<string, unknown> = {}): Memory {
  return {
    entityId: ENTITY_ID,
    roomId: ROOM_ID,
    content: { text: "hello" },
    ...overrides,
  } as Memory;
}

const WORLD_METADATA = { roles: {} };

describe("lateJoinWhitelistEvaluator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveWorldForMessage.mockResolvedValue({
      world: { id: WORLD_ID, metadata: WORLD_METADATA },
      metadata: WORLD_METADATA,
    });
    mockGetEntityRole.mockReturnValue("NONE");
    mockLoadElizaConfig.mockReturnValue({});
  });

  it("has correct metadata", () => {
    expect(lateJoinWhitelistEvaluator.name).toBe("late_join_whitelist");
    expect(lateJoinWhitelistEvaluator.alwaysRun).toBe(true);
  });

  describe("validate", () => {
    it("returns true when entity has NONE role", async () => {
      mockGetEntityRole.mockReturnValue("NONE");
      const result = await lateJoinWhitelistEvaluator.validate(
        makeRuntime(),
        makeMessage(),
      );
      expect(result).toBe(true);
    });

    it("returns false when entity is already ADMIN", async () => {
      mockGetEntityRole.mockReturnValue("ADMIN");
      const result = await lateJoinWhitelistEvaluator.validate(
        makeRuntime(),
        makeMessage(),
      );
      expect(result).toBe(false);
    });

    it("returns false when entity is already OWNER", async () => {
      mockGetEntityRole.mockReturnValue("OWNER");
      const result = await lateJoinWhitelistEvaluator.validate(
        makeRuntime(),
        makeMessage(),
      );
      expect(result).toBe(false);
    });

    it("returns false when world cannot be resolved", async () => {
      mockResolveWorldForMessage.mockResolvedValue(null);
      const result = await lateJoinWhitelistEvaluator.validate(
        makeRuntime(),
        makeMessage(),
      );
      expect(result).toBe(false);
    });
  });

  describe("handler", () => {
    it("promotes entity matching discord whitelist", async () => {
      mockLoadElizaConfig.mockReturnValue({
        plugins: {
          entries: {
            "@miladyai/plugin-roles": {
              config: {
                connectorAdmins: {
                  discord: ["discord-user-123"],
                },
              },
            },
          },
        },
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: {
            discord: { userId: "discord-user-123" },
          },
        }),
      });

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.objectContaining({ entityId: ENTITY_ID }),
        ENTITY_ID,
        "ADMIN",
      );
    });

    it("promotes entity matching telegram username", async () => {
      mockLoadElizaConfig.mockReturnValue({
        plugins: {
          entries: {
            "@miladyai/plugin-roles": {
              config: {
                connectorAdmins: {
                  telegram: ["tg_alice"],
                },
              },
            },
          },
        },
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: {
            telegram: { username: "tg_alice" },
          },
        }),
      });

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.objectContaining({ entityId: ENTITY_ID }),
        ENTITY_ID,
        "ADMIN",
      );
    });

    it("does nothing when entity does not match whitelist", async () => {
      mockLoadElizaConfig.mockReturnValue({
        plugins: {
          entries: {
            "@miladyai/plugin-roles": {
              config: {
                connectorAdmins: {
                  discord: ["discord-user-999"],
                },
              },
            },
          },
        },
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: {
            discord: { userId: "discord-user-123" },
          },
        }),
      });

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });

    it("does nothing when no whitelist is configured", async () => {
      mockLoadElizaConfig.mockReturnValue({});

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: { discord: { userId: "discord-user-123" } },
        }),
      });

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });

    it("does nothing when entity is not found", async () => {
      mockLoadElizaConfig.mockReturnValue({
        plugins: {
          entries: {
            "@miladyai/plugin-roles": {
              config: { connectorAdmins: { discord: ["anyone"] } },
            },
          },
        },
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue(null),
      });

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });

    it("handles loadElizaConfig throwing gracefully", async () => {
      mockLoadElizaConfig.mockImplementation(() => {
        throw new Error("config not found");
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: { discord: { userId: "discord-user-123" } },
        }),
      });

      // Should not throw
      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });
  });
});
