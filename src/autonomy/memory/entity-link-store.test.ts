import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryEntityLinkStore, type CanonicalEntity } from "./entity-link-store.js";

describe("InMemoryEntityLinkStore", () => {
  let store: InMemoryEntityLinkStore;

  beforeEach(() => {
    store = new InMemoryEntityLinkStore();
  });

  describe("upsertEntity", () => {
    it("creates a new entity with generated UUID", async () => {
      const entity = await store.upsertEntity({
        displayName: "enoomian",
        isOperator: true,
        trustLevel: 1.0,
        platformIds: { discord: "enoomian#1234" },
      });

      expect(entity.id).toBeTruthy();
      expect(entity.displayName).toBe("enoomian");
      expect(entity.isOperator).toBe(true);
      expect(entity.trustLevel).toBe(1.0);
      expect(entity.platformIds.discord).toBe("enoomian#1234");
    });

    it("updates existing entity by id", async () => {
      const created = await store.upsertEntity({
        displayName: "testuser",
        platformIds: { discord: "test#5678" },
      });

      const updated = await store.upsertEntity({
        id: created.id,
        displayName: "testuser-updated",
        platformIds: { discord: "test#5678", web_chat: "web-uuid" },
      });

      expect(updated.id).toBe(created.id);
      expect(updated.displayName).toBe("testuser-updated");
      expect(updated.platformIds.web_chat).toBe("web-uuid");
      expect(updated.firstSeen).toBe(created.firstSeen); // preserved
    });

    it("throws when platform ID is already linked to a different entity", async () => {
      await store.upsertEntity({
        displayName: "user1",
        platformIds: { discord: "shared-id" },
      });

      await expect(
        store.upsertEntity({
          displayName: "user2",
          platformIds: { discord: "shared-id" },
        }),
      ).rejects.toThrow("already linked");
    });
  });

  describe("getByPlatformId", () => {
    it("resolves entity by platform and platform ID", async () => {
      const created = await store.upsertEntity({
        displayName: "enoomian",
        platformIds: {
          discord: "enoomian#1234",
          web_chat: "admin-uuid",
          telegram: "@enoomian",
        },
      });

      const byDiscord = await store.getByPlatformId("discord", "enoomian#1234");
      const byWeb = await store.getByPlatformId("web_chat", "admin-uuid");
      const byTelegram = await store.getByPlatformId("telegram", "@enoomian");

      expect(byDiscord?.id).toBe(created.id);
      expect(byWeb?.id).toBe(created.id);
      expect(byTelegram?.id).toBe(created.id);
    });

    it("returns null for unknown platform ID", async () => {
      const result = await store.getByPlatformId("discord", "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("linkPlatform / unlinkPlatform", () => {
    it("links a new platform to an existing entity", async () => {
      const entity = await store.upsertEntity({
        displayName: "testuser",
        platformIds: { discord: "test#1234" },
      });

      await store.linkPlatform(entity.id, "telegram", "@testuser");

      const resolved = await store.getByPlatformId("telegram", "@testuser");
      expect(resolved?.id).toBe(entity.id);
      expect(resolved?.platformIds.telegram).toBe("@testuser");
    });

    it("throws when linking a platform ID already owned by another entity", async () => {
      const entity1 = await store.upsertEntity({
        displayName: "user1",
        platformIds: { discord: "user1#1234" },
      });
      await store.upsertEntity({
        displayName: "user2",
        platformIds: { discord: "user2#5678" },
      });

      // Link telegram to user2, then try to link same telegram to user1
      const user2 = (await store.getByPlatformId("discord", "user2#5678"))!;
      await store.linkPlatform(user2.id, "telegram", "@shared");

      await expect(
        store.linkPlatform(entity1.id, "telegram", "@shared"),
      ).rejects.toThrow("already linked");
    });

    it("unlinks a platform from an entity", async () => {
      const entity = await store.upsertEntity({
        displayName: "testuser",
        platformIds: { discord: "test#1234", telegram: "@test" },
      });

      await store.unlinkPlatform(entity.id, "telegram");

      const resolved = await store.getByPlatformId("telegram", "@test");
      expect(resolved).toBeNull();

      // Discord link should still work
      const byDiscord = await store.getByPlatformId("discord", "test#1234");
      expect(byDiscord?.id).toBe(entity.id);
    });
  });

  describe("listEntities", () => {
    it("lists all entities", async () => {
      await store.upsertEntity({ displayName: "user1", platformIds: { discord: "u1" } });
      await store.upsertEntity({ displayName: "user2", platformIds: { discord: "u2" } });
      await store.upsertEntity({
        displayName: "operator",
        isOperator: true,
        platformIds: { discord: "op" },
      });

      const all = await store.listEntities();
      expect(all).toHaveLength(3);
    });

    it("filters to operators only", async () => {
      await store.upsertEntity({ displayName: "user1", platformIds: { discord: "u1" } });
      await store.upsertEntity({
        displayName: "operator",
        isOperator: true,
        platformIds: { discord: "op" },
      });

      const operators = await store.listEntities({ operatorsOnly: true });
      expect(operators).toHaveLength(1);
      expect(operators[0].displayName).toBe("operator");
    });

    it("respects limit", async () => {
      await store.upsertEntity({ displayName: "u1", platformIds: { discord: "d1" } });
      await store.upsertEntity({ displayName: "u2", platformIds: { discord: "d2" } });
      await store.upsertEntity({ displayName: "u3", platformIds: { discord: "d3" } });

      const limited = await store.listEntities({ limit: 2 });
      expect(limited).toHaveLength(2);
    });
  });

  describe("searchByName", () => {
    it("finds entities by case-insensitive substring", async () => {
      await store.upsertEntity({ displayName: "enoomian", platformIds: { discord: "e" } });
      await store.upsertEntity({ displayName: "ENOOMIAN_ALT", platformIds: { discord: "ea" } });
      await store.upsertEntity({ displayName: "other", platformIds: { discord: "o" } });

      const results = await store.searchByName("enoom");
      expect(results).toHaveLength(2);
    });
  });

  describe("touchLastSeen", () => {
    it("updates last seen for a platform", async () => {
      const entity = await store.upsertEntity({
        displayName: "testuser",
        platformIds: { discord: "test" },
      });

      await store.touchLastSeen(entity.id, "discord");

      const updated = await store.getById(entity.id);
      expect(updated?.lastSeen.discord).toBeGreaterThan(0);
    });
  });

  describe("addKnownFact", () => {
    it("appends unique facts", async () => {
      const entity = await store.upsertEntity({
        displayName: "testuser",
        platformIds: { discord: "test" },
      });

      await store.addKnownFact(entity.id, "Prefers TypeScript");
      await store.addKnownFact(entity.id, "Works on 555 project");
      await store.addKnownFact(entity.id, "Prefers TypeScript"); // duplicate

      const updated = await store.getById(entity.id);
      expect(updated?.knownFacts).toHaveLength(2);
      expect(updated?.knownFacts).toContain("Prefers TypeScript");
      expect(updated?.knownFacts).toContain("Works on 555 project");
    });
  });

  describe("updatePreferences", () => {
    it("shallow merges preferences", async () => {
      const entity = await store.upsertEntity({
        displayName: "testuser",
        platformIds: { discord: "test" },
        preferences: { style: "concise", format: "markdown" },
      });

      await store.updatePreferences(entity.id, { style: "detailed", theme: "dark" });

      const updated = await store.getById(entity.id);
      expect(updated?.preferences).toEqual({
        style: "detailed",
        format: "markdown",
        theme: "dark",
      });
    });
  });
});
