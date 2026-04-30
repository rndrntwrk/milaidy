import { describe, expect, it, beforeEach, vi } from "vitest";
import { InMemoryEntityLinkStore } from "./entity-link-store.js";
import { EntityLinker, type EntityEventEmitter } from "./entity-linker.js";

describe("EntityLinker", () => {
  let store: InMemoryEntityLinkStore;
  let emitter: EntityEventEmitter;
  let linker: EntityLinker;
  let emittedEvents: Array<{ event: string; data: unknown }>;

  beforeEach(() => {
    store = new InMemoryEntityLinkStore();
    emittedEvents = [];
    emitter = {
      emit: (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      },
    } as EntityEventEmitter;
    linker = new EntityLinker(store, emitter);
  });

  describe("seedOperators", () => {
    it("creates operator entities on first call", async () => {
      await linker.seedOperators([
        {
          displayName: "enoomian",
          platformIds: {
            discord: "enoomian",
            web_chat: "admin-uuid",
            telegram: "@enoomian",
          },
          preferences: { style: "direct" },
        },
      ]);

      const entity = await store.getByPlatformId("discord", "enoomian");
      expect(entity).not.toBeNull();
      expect(entity!.displayName).toBe("enoomian");
      expect(entity!.isOperator).toBe(true);
      expect(entity!.trustLevel).toBe(1.0);
      expect(entity!.platformIds.telegram).toBe("@enoomian");
    });

    it("is idempotent on repeated calls", async () => {
      const config = [
        {
          displayName: "enoomian",
          platformIds: { discord: "enoomian" },
        },
      ];

      await linker.seedOperators(config);
      await linker.seedOperators(config); // second call should be no-op

      const all = await store.listEntities();
      expect(all).toHaveLength(1);
    });

    it("updates existing entity with new platform IDs", async () => {
      // First seed with discord only
      await store.upsertEntity({
        displayName: "enoomian",
        isOperator: true,
        trustLevel: 1.0,
        platformIds: { discord: "enoomian" },
      });

      // Create a fresh linker to reset seeded flag
      const freshLinker = new EntityLinker(store);
      await freshLinker.seedOperators([
        {
          displayName: "enoomian",
          platformIds: {
            discord: "enoomian",
            telegram: "@enoomian",
          },
        },
      ]);

      const entity = await store.getByPlatformId("discord", "enoomian");
      expect(entity!.platformIds.telegram).toBe("@enoomian");
    });
  });

  describe("resolve", () => {
    it("resolves known platform user to canonical entity", async () => {
      await store.upsertEntity({
        displayName: "enoomian",
        platformIds: { discord: "enoomian#1234" },
        isOperator: true,
        trustLevel: 1.0,
      });

      const entity = await linker.resolve("discord", "enoomian#1234");
      expect(entity).not.toBeNull();
      expect(entity!.displayName).toBe("enoomian");
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe("entity:resolved");
    });

    it("returns null for unknown user without autoCreate", async () => {
      const entity = await linker.resolve("discord", "unknown-user");
      expect(entity).toBeNull();
    });

    it("auto-creates entity when autoCreate is true", async () => {
      const entity = await linker.resolve("discord", "new-user#9999", {
        autoCreate: true,
        displayName: "New User",
      });

      expect(entity).not.toBeNull();
      expect(entity!.displayName).toBe("New User");
      expect(entity!.isOperator).toBe(false);
      expect(entity!.trustLevel).toBe(0.5);

      // Should have emitted entity:linked
      const linkedEvent = emittedEvents.find((e) => e.event === "entity:linked");
      expect(linkedEvent).toBeTruthy();
    });

    it("uses platform:id as display name when none provided", async () => {
      const entity = await linker.resolve("discord", "anon#0000", {
        autoCreate: true,
      });

      expect(entity!.displayName).toBe("discord:anon#0000");
    });

    it("updates lastSeen on resolution", async () => {
      await store.upsertEntity({
        displayName: "testuser",
        platformIds: { discord: "test" },
      });

      const before = await store.getByPlatformId("discord", "test");
      expect(before!.lastSeen.discord).toBeUndefined();

      await linker.resolve("discord", "test");

      const after = await store.getByPlatformId("discord", "test");
      expect(after!.lastSeen.discord).toBeGreaterThan(0);
    });
  });

  describe("link", () => {
    it("manually links a platform to an existing entity", async () => {
      const entity = await store.upsertEntity({
        displayName: "testuser",
        platformIds: { discord: "test#1234" },
      });

      await linker.link(entity.id, "telegram", "@testuser");

      const resolved = await linker.lookup("telegram", "@testuser");
      expect(resolved?.id).toBe(entity.id);

      // Should have emitted entity:linked
      const linkedEvent = emittedEvents.find((e) => e.event === "entity:linked");
      expect(linkedEvent).toBeTruthy();
    });
  });

  describe("listAll", () => {
    it("lists all entities", async () => {
      await store.upsertEntity({ displayName: "u1", platformIds: { discord: "d1" } });
      await store.upsertEntity({ displayName: "u2", platformIds: { discord: "d2" }, isOperator: true, trustLevel: 1.0 });

      const all = await linker.listAll();
      expect(all).toHaveLength(2);

      const operators = await linker.listAll({ operatorsOnly: true });
      expect(operators).toHaveLength(1);
    });
  });
});
