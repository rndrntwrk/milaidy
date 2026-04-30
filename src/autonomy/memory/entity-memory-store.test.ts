/**
 * Tests for InMemoryEntityMemoryStore.
 */

import { describe, expect, it } from "vitest";
import {
  InMemoryEntityMemoryStore,
  MID_TERM_TTL_MS,
  type EntityMemoryInput,
} from "./entity-memory-store.js";

function makeInput(
  overrides?: Partial<EntityMemoryInput>,
): EntityMemoryInput {
  return {
    canonicalEntityId: "entity-1",
    tier: "mid-term",
    memoryType: "fact",
    content: { text: "test fact" },
    trustScore: 0.7,
    provenance: {
      sourcePlatform: "discord",
      sourceRoomId: "room-1",
      createdBy: "test",
    },
    ...overrides,
  };
}

describe("InMemoryEntityMemoryStore", () => {
  describe("insert()", () => {
    it("creates a memory with auto-generated ID", async () => {
      const store = new InMemoryEntityMemoryStore();
      const mem = await store.insert(makeInput());

      expect(mem.id).toBeTruthy();
      expect(mem.canonicalEntityId).toBe("entity-1");
      expect(mem.tier).toBe("mid-term");
      expect(mem.memoryType).toBe("fact");
      expect(mem.sessionCount).toBe(1);
      expect(mem.superseded).toBe(false);
    });

    it("sets default TTL for mid-term memories", async () => {
      const store = new InMemoryEntityMemoryStore();
      const before = Date.now();
      const mem = await store.insert(makeInput({ tier: "mid-term" }));

      expect(mem.expiresAt).not.toBeNull();
      expect(mem.expiresAt!).toBeGreaterThanOrEqual(before + MID_TERM_TTL_MS - 100);
    });

    it("sets null expiresAt for long-term memories", async () => {
      const store = new InMemoryEntityMemoryStore();
      const mem = await store.insert(makeInput({ tier: "long-term" }));

      expect(mem.expiresAt).toBeNull();
    });

    it("respects explicit expiresAt override", async () => {
      const store = new InMemoryEntityMemoryStore();
      const mem = await store.insert(
        makeInput({ expiresAt: 1234567890 }),
      );

      expect(mem.expiresAt).toBe(1234567890);
    });
  });

  describe("getById()", () => {
    it("returns memory by ID", async () => {
      const store = new InMemoryEntityMemoryStore();
      const mem = await store.insert(makeInput());
      const found = await store.getById(mem.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(mem.id);
    });

    it("returns null for non-existent ID", async () => {
      const store = new InMemoryEntityMemoryStore();
      const found = await store.getById("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("query()", () => {
    it("filters by canonical entity ID", async () => {
      const store = new InMemoryEntityMemoryStore();
      await store.insert(makeInput({ canonicalEntityId: "entity-1" }));
      await store.insert(makeInput({ canonicalEntityId: "entity-2" }));

      const results = await store.query({ canonicalEntityId: "entity-1" });
      expect(results).toHaveLength(1);
    });

    it("filters by tier", async () => {
      const store = new InMemoryEntityMemoryStore();
      await store.insert(makeInput({ tier: "mid-term" }));
      await store.insert(makeInput({ tier: "long-term" }));

      const midOnly = await store.query({
        canonicalEntityId: "entity-1",
        tiers: ["mid-term"],
      });
      expect(midOnly).toHaveLength(1);
      expect(midOnly[0].tier).toBe("mid-term");
    });

    it("filters by memory type", async () => {
      const store = new InMemoryEntityMemoryStore();
      await store.insert(makeInput({ memoryType: "fact" }));
      await store.insert(makeInput({ memoryType: "preference" }));

      const factsOnly = await store.query({
        canonicalEntityId: "entity-1",
        memoryTypes: ["fact"],
      });
      expect(factsOnly).toHaveLength(1);
    });

    it("excludes superseded by default", async () => {
      const store = new InMemoryEntityMemoryStore();
      const mem = await store.insert(makeInput());
      await store.markSuperseded(mem.id);

      const results = await store.query({ canonicalEntityId: "entity-1" });
      expect(results).toHaveLength(0);

      const withSuperseded = await store.query({
        canonicalEntityId: "entity-1",
        includeSuperseded: true,
      });
      expect(withSuperseded).toHaveLength(1);
    });

    it("excludes expired by default", async () => {
      const store = new InMemoryEntityMemoryStore();
      await store.insert(
        makeInput({ expiresAt: Date.now() - 1000 }),
      );

      const results = await store.query({ canonicalEntityId: "entity-1" });
      expect(results).toHaveLength(0);

      const withExpired = await store.query({
        canonicalEntityId: "entity-1",
        includeExpired: true,
      });
      expect(withExpired).toHaveLength(1);
    });

    it("respects limit", async () => {
      const store = new InMemoryEntityMemoryStore();
      for (let i = 0; i < 10; i++) {
        await store.insert(makeInput());
      }

      const results = await store.query({
        canonicalEntityId: "entity-1",
        limit: 3,
      });
      expect(results).toHaveLength(3);
    });

    it("sorts by createdAt descending", async () => {
      const store = new InMemoryEntityMemoryStore();
      const m1 = await store.insert(makeInput());
      // Small delay to ensure different timestamps
      const m2 = await store.insert(makeInput());

      const results = await store.query({ canonicalEntityId: "entity-1" });
      // m2 should be first (newer)
      expect(results[0].createdAt).toBeGreaterThanOrEqual(results[1].createdAt);
    });
  });

  describe("bumpSessionCount()", () => {
    it("increments session count", async () => {
      const store = new InMemoryEntityMemoryStore();
      const mem = await store.insert(makeInput());
      expect(mem.sessionCount).toBe(1);

      await store.bumpSessionCount(mem.id);
      const updated = await store.getById(mem.id);
      expect(updated!.sessionCount).toBe(2);
    });
  });

  describe("markSuperseded()", () => {
    it("marks a memory as superseded", async () => {
      const store = new InMemoryEntityMemoryStore();
      const mem = await store.insert(makeInput());
      expect(mem.superseded).toBe(false);

      await store.markSuperseded(mem.id);
      const updated = await store.getById(mem.id);
      expect(updated!.superseded).toBe(true);
    });
  });

  describe("promoteTier()", () => {
    it("promotes mid-term to long-term", async () => {
      const store = new InMemoryEntityMemoryStore();
      const mem = await store.insert(makeInput({ tier: "mid-term" }));
      expect(mem.expiresAt).not.toBeNull();

      const promoted = await store.promoteTier(mem.id, "long-term");
      expect(promoted.tier).toBe("long-term");
      expect(promoted.expiresAt).toBeNull(); // Permanent
      expect(promoted.provenance.promotedFrom).toBe("mid-term");
      expect(promoted.provenance.promotedAt).toBeGreaterThan(0);
    });

    it("throws for non-existent memory", async () => {
      const store = new InMemoryEntityMemoryStore();
      await expect(
        store.promoteTier("nonexistent", "long-term"),
      ).rejects.toThrow("not found");
    });
  });

  describe("purgeExpired()", () => {
    it("removes expired memories", async () => {
      const store = new InMemoryEntityMemoryStore();
      await store.insert(makeInput({ expiresAt: Date.now() - 1000 }));
      await store.insert(makeInput({ expiresAt: Date.now() + 999999 }));
      await store.insert(makeInput({ tier: "long-term" })); // null expiresAt

      const purged = await store.purgeExpired();
      expect(purged).toBe(1);
    });

    it("returns 0 when nothing expired", async () => {
      const store = new InMemoryEntityMemoryStore();
      await store.insert(makeInput({ tier: "long-term" }));

      const purged = await store.purgeExpired();
      expect(purged).toBe(0);
    });
  });

  describe("count()", () => {
    it("counts non-superseded memories", async () => {
      const store = new InMemoryEntityMemoryStore();
      await store.insert(makeInput({ tier: "mid-term" }));
      await store.insert(makeInput({ tier: "long-term" }));
      const superseded = await store.insert(makeInput({ tier: "mid-term" }));
      await store.markSuperseded(superseded.id);

      expect(await store.count("entity-1")).toBe(2);
      expect(await store.count("entity-1", "mid-term")).toBe(1);
      expect(await store.count("entity-1", "long-term")).toBe(1);
    });
  });

  describe("getEntityMemories() (EntityMemoryProvider)", () => {
    it("returns ElizaOS Memory format", async () => {
      const store = new InMemoryEntityMemoryStore();
      await store.insert(
        makeInput({
          content: { text: "User likes TypeScript" },
          memoryType: "preference",
        }),
      );

      const memories = await store.getEntityMemories("entity-1");
      expect(memories).toHaveLength(1);
      expect((memories[0].content as { text: string }).text).toBe(
        "User likes TypeScript",
      );
      expect(
        (memories[0].metadata as Record<string, unknown>).memoryType,
      ).toBe("preference");
      expect(
        (memories[0].metadata as Record<string, unknown>).memoryTier,
      ).toBe("mid-term");
    });
  });

  describe("searchEntityMemories()", () => {
    it("returns memories sorted by cosine similarity", async () => {
      const store = new InMemoryEntityMemoryStore();
      await store.insert(
        makeInput({
          content: { text: "close match" },
          embedding: [0.9, 0.1, 0.0],
        }),
      );
      await store.insert(
        makeInput({
          content: { text: "far match" },
          embedding: [0.1, 0.1, 0.9],
        }),
      );

      const results = await store.searchEntityMemories(
        "entity-1",
        [1.0, 0.0, 0.0],
        { limit: 10 },
      );

      expect(results.length).toBeGreaterThanOrEqual(1);
      // First result should be the closer match
      expect((results[0].content as { text: string }).text).toBe("close match");
    });

    it("filters below match threshold", async () => {
      const store = new InMemoryEntityMemoryStore();
      await store.insert(
        makeInput({
          content: { text: "very far" },
          embedding: [0.0, 0.0, 1.0],
        }),
      );

      const results = await store.searchEntityMemories(
        "entity-1",
        [1.0, 0.0, 0.0],
        { matchThreshold: 0.5 },
      );

      expect(results).toHaveLength(0);
    });
  });
});
