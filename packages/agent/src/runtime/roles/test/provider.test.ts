import type { IAgentRuntime, Memory, State, UUID } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";

/**
 * Integration test for rolesProvider — no module mocks.
 *
 * Uses real hasAdminAccess from security/access.js, which calls the real
 * checkSenderRole from @miladyai/shared/eliza-core-roles. Mock runtime objects implement
 * the interface methods (getRoom, getWorld, getEntityById, getSetting) so
 * the real code path resolves roles from world metadata.
 */

import { rolesProvider } from "../src/provider";
import type { RoleName, RolesWorldMetadata } from "../src/types";
import { setConnectorAdminWhitelist } from "../src/utils";

function mockRuntime(opts: {
  agentId?: string;
  room?: { worldId: string | null } | null;
  worldMeta?: RolesWorldMetadata | null;
  entities?: Record<
    string,
    { names: string[]; metadata?: Record<string, unknown> }
  >;
  updateWorld?: ReturnType<typeof vi.fn>;
  settings?: Record<string, string | boolean | number | null>;
}): IAgentRuntime {
  const settingsStore = { ...(opts.settings ?? {}) };
  return {
    agentId: opts.agentId ?? "agent-runtime-id",
    getRoom: vi.fn().mockResolvedValue(opts.room ?? null),
    getWorld: vi
      .fn()
      .mockResolvedValue(
        opts.worldMeta !== undefined && opts.worldMeta !== null
          ? { id: "world-1", metadata: opts.worldMeta }
          : opts.worldMeta === null
            ? null
            : undefined,
      ),
    updateWorld: opts.updateWorld ?? vi.fn().mockResolvedValue(undefined),
    getEntityById: vi.fn().mockImplementation(async (id: string) => {
      const e = opts.entities?.[id];
      if (!e) return null;
      return { id, names: e.names, metadata: e.metadata ?? {} };
    }),
    getSetting: vi.fn().mockImplementation((key: string) => {
      return settingsStore[key] ?? null;
    }),
    setSetting: vi.fn().mockImplementation((key: string, value: unknown) => {
      if (value === null || value === undefined) {
        delete settingsStore[key];
        return;
      }
      settingsStore[key] = value as string | boolean | number | null;
    }),
  } as unknown as IAgentRuntime;
}

function msg(entityId: string): Memory {
  return {
    entityId: entityId as UUID,
    roomId: "room-1" as UUID,
    content: { text: "" },
  } as Memory;
}

const emptyState = {} as State;

describe("rolesProvider", () => {
  it("has correct provider metadata", () => {
    expect(rolesProvider.name).toBe("roles");
    expect(rolesProvider.dynamic).toBe(true);
  });

  it("returns OWNER speaker with hierarchy", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: {
        roles: { o1: "OWNER", a1: "ADMIN", u1: "USER", g1: "GUEST" },
      },
      entities: {
        o1: { names: ["Shaw"] },
        a1: { names: ["Alice"] },
        u1: { names: ["Bob"] },
        g1: { names: ["Eve"] },
      },
    });
    const result = await rolesProvider.get(runtime, msg("o1"), emptyState);
    expect(result.values?.speakerRole).toBe("OWNER");
    expect(result.values?.canManageRoles).toBe(true);
    expect(result.values?.ownerCount).toBe(1);
    expect(result.values?.adminCount).toBe(1);
    expect(result.values?.userCount).toBe(1);
    expect(result.data?.owners).toEqual(["o1"]);
    expect(result.data?.admins).toEqual(["a1"]);
    expect(result.data?.users).toEqual(["u1"]);
    expect(result.text).toContain("Shaw");
    expect(result.text).toContain("Alice");
    expect(result.text).toContain("Bob");
  });

  it("filters connector-local OWNER entries when a canonical owner is configured", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: {
        ownership: { ownerId: "discord-guild-owner" },
        roles: { "discord-guild-owner": "OWNER", "owner-app": "OWNER" },
      },
      settings: {
        ELIZA_ADMIN_ENTITY_ID: "owner-app",
      },
      entities: {
        "owner-app": { names: ["Shaw"] },
        "discord-guild-owner": { names: ["GuildOwner"] },
      },
    });

    const result = await rolesProvider.get(
      runtime,
      msg("owner-app"),
      emptyState,
    );
    expect(result.values?.speakerRole).toBe("OWNER");
    expect(result.data?.owners).toEqual(["owner-app"]);
    expect(result.text).toContain("Shaw");
    expect(result.text).not.toContain("GuildOwner");
  });

  it("returns USER speaker (no manage)", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles: { u1: "USER" } },
      entities: { u1: { names: ["Bob"] } },
    });
    const result = await rolesProvider.get(runtime, msg("u1"), emptyState);
    expect(result.values?.speakerRole).toBe("USER");
    expect(result.values?.canManageRoles).toBe(false);
  });

  it("hides the role roster from non-admin callers", async () => {
    // Entity u1 has role USER, which is not ADMIN/OWNER.
    // The real hasAdminAccess will check checkSenderRole, find USER role,
    // and return false (not admin).
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles: { o1: "OWNER", a1: "ADMIN", u1: "USER" } },
      entities: {
        o1: { names: ["Shaw"] },
        a1: { names: ["Alice"] },
        u1: { names: ["Bob"] },
      },
    });

    const result = await rolesProvider.get(runtime, msg("u1"), emptyState);
    expect(result.text).toContain("Current speaker role: **USER**");
    expect(result.text).not.toContain("Owners:");
    expect(result.text).not.toContain("Admins:");
    expect(result.data?.owners).toEqual([]);
    expect(result.data?.admins).toEqual([]);
    expect(result.data?.users).toEqual([]);
    expect(result.data?.roles).toEqual({});
  });

  it("returns GUEST for unroled speaker", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles: { o1: "OWNER" } },
      entities: { o1: { names: ["Shaw"] } },
    });
    const result = await rolesProvider.get(runtime, msg("nobody"), emptyState);
    expect(result.values?.speakerRole).toBe("GUEST");
    expect(result.values?.canManageRoles).toBe(false);
  });

  it("promotes a connector-whitelisted Discord speaker to ADMIN on first contact", async () => {
    const worldMeta: RolesWorldMetadata = { roles: { o1: "OWNER" } };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta,
      entities: {
        o1: { names: ["Shaw"] },
        discordAdmin: {
          names: ["Owner Person"],
          metadata: { discord: { userId: "123456789", username: "owner" } },
        },
      },
    });
    setConnectorAdminWhitelist(runtime, { discord: ["123456789"] });

    const result = await rolesProvider.get(
      runtime,
      msg("discordAdmin"),
      emptyState,
    );
    expect(result.values?.speakerRole).toBe("ADMIN");
    expect(result.values?.canManageRoles).toBe(true);
    expect(result.data?.admins).toContain("discordAdmin");
    expect(worldMeta.roles?.discordAdmin).toBeUndefined();
  });

  it("returns empty when no room found", async () => {
    const result = await rolesProvider.get(
      mockRuntime({ room: null }),
      msg("e1"),
      emptyState,
    );
    expect(result.values?.speakerRole).toBe("GUEST");
    expect(result.text).toBe("");
  });

  it("returns empty when room has no worldId", async () => {
    const result = await rolesProvider.get(
      mockRuntime({ room: { worldId: null } }),
      msg("e1"),
      emptyState,
    );
    expect(result.values?.speakerRole).toBe("GUEST");
  });

  it("returns empty when world not found", async () => {
    const result = await rolesProvider.get(
      mockRuntime({ room: { worldId: "w1" }, worldMeta: null }),
      msg("e1"),
      emptyState,
    );
    expect(result.values?.speakerRole).toBe("GUEST");
  });

  it("handles world with no roles", async () => {
    const runtime = mockRuntime({ room: { worldId: "w1" }, worldMeta: {} });
    const result = await rolesProvider.get(runtime, msg("e1"), emptyState);
    expect(result.values?.speakerRole).toBe("GUEST");
    expect(result.data?.owners).toEqual([]);
    expect(result.data?.admins).toEqual([]);
    expect(result.data?.users).toEqual([]);
  });

  it("handles null metadata", async () => {
    const runtime = {
      agentId: "agent-runtime-id",
      getRoom: vi.fn().mockResolvedValue({ worldId: "w1" }),
      getWorld: vi.fn().mockResolvedValue({ id: "w1", metadata: null }),
      getEntityById: vi.fn().mockResolvedValue(null),
      getSetting: vi.fn().mockReturnValue(null),
    } as unknown as IAgentRuntime;
    const result = await rolesProvider.get(runtime, msg("e1"), emptyState);
    expect(result.values?.speakerRole).toBe("GUEST");
  });

  it("survives getEntityById throwing", async () => {
    const runtime = {
      agentId: "agent-runtime-id",
      getRoom: vi.fn().mockResolvedValue({ worldId: "w1" }),
      getWorld: vi
        .fn()
        .mockResolvedValue({ id: "w1", metadata: { roles: { e1: "OWNER" } } }),
      getEntityById: vi.fn().mockRejectedValue(new Error("DB gone")),
      getSetting: vi.fn().mockReturnValue(null),
    } as unknown as IAgentRuntime;
    const result = await rolesProvider.get(runtime, msg("e1"), emptyState);
    expect(result.values?.speakerRole).toBe("OWNER");
  });

  it("GUEST entities not listed in text output", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles: { o1: "OWNER", g1: "GUEST" } },
      entities: { o1: { names: ["Shaw"] }, g1: { names: ["Eve"] } },
    });
    const result = await rolesProvider.get(runtime, msg("o1"), emptyState);
    // GUEST entities are not listed in any named section
    expect(result.text).not.toContain("Eve");
    expect(result.text).not.toContain("Guest");
  });

  it("data.roles mirrors the world metadata", async () => {
    const roles = {
      o1: "OWNER" as RoleName,
      a1: "ADMIN" as RoleName,
      u1: "USER" as RoleName,
    };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles },
      entities: {
        o1: { names: ["O"] },
        a1: { names: ["A"] },
        u1: { names: ["U"] },
      },
    });
    const result = await rolesProvider.get(runtime, msg("o1"), emptyState);
    expect(result.data?.roles).toEqual(roles);
  });

  it("always returns consistent data shape (even when empty)", async () => {
    const result = await rolesProvider.get(
      mockRuntime({ room: null }),
      msg("e1"),
      emptyState,
    );
    expect(result.data?.roles).toEqual({});
    expect(result.data?.owners).toEqual([]);
    expect(result.data?.admins).toEqual([]);
    expect(result.data?.users).toEqual([]);
  });
});
