/**
 * Tests for tier promotion engine.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryEntityMemoryStore } from "./entity-memory-store.js";
import { TierPromoter, DEFAULT_TIER_PROMOTION_CONFIG } from "./tier-promoter.js";
import type { ConversationSummary } from "./conversation-summarizer.js";

function makeSummary(
  overrides?: Partial<ConversationSummary>,
): ConversationSummary {
  return {
    summary: "Test conversation about staking tokens.",
    topics: ["staking", "tokens"],
    facts: [
      {
        text: "TestUser prefers concise responses",
        confidence: 0.8,
        category: "preference",
      },
      {
        text: "TestUser is a developer",
        confidence: 0.6,
        category: "biographical",
      },
    ],
    messageCount: 6,
    turnCount: 3,
    timespan: 30000,
    platform: "discord",
    roomId: "room-1",
    generatedAt: Date.now(),
    ...overrides,
  };
}

describe("TierPromoter", () => {
  let store: InMemoryEntityMemoryStore;
  let promoter: TierPromoter;
  const entityId = "canonical-entity-123";

  beforeEach(() => {
    store = new InMemoryEntityMemoryStore();
    promoter = new TierPromoter(store);
  });

  describe("processSessionEnd()", () => {
    it("creates mid-term memories from conversation summary", async () => {
      const summary = makeSummary();
      const result = await promoter.processSessionEnd(entityId, summary);

      // 1 summary + 2 facts = 3 mid-term memories
      expect(result.midTermCreated).toBe(3);
      expect(result.duplicatesBumped).toBe(0);
      expect(result.totalEntityMemories).toBe(3);
    });

    it("filters facts below minimum confidence", async () => {
      const summary = makeSummary({
        facts: [
          { text: "High confidence fact", confidence: 0.9, category: "preference" },
          { text: "Low confidence fact", confidence: 0.3, category: "intent" },
        ],
      });

      const result = await promoter.processSessionEnd(entityId, summary);
      // 1 summary + 1 high-confidence fact = 2
      expect(result.midTermCreated).toBe(2);
    });

    it("bumps session count for duplicate facts", async () => {
      const summary = makeSummary();

      // First session
      await promoter.processSessionEnd(entityId, summary);

      // Second session with same facts (simulates repeated preference)
      const result = await promoter.processSessionEnd(entityId, summary);

      expect(result.duplicatesBumped).toBe(3); // summary + 2 facts all duplicated
      expect(result.midTermCreated).toBe(0);
    });

    it("promotes mid-term to long-term after threshold sessions", async () => {
      const config = { promotionThreshold: 2 }; // lower threshold for test
      const fastPromoter = new TierPromoter(store, config);

      const summary = makeSummary();

      // Session 1: creates mid-term memories (sessionCount = 1)
      await fastPromoter.processSessionEnd(entityId, summary);

      // Session 2: bumps sessionCount to 2 → triggers promotion
      const result = await fastPromoter.processSessionEnd(entityId, summary);

      expect(result.promotedToLongTerm).toBeGreaterThan(0);
    });

    it("purges expired memories during session end", async () => {
      // Insert an expired memory first
      await store.insert({
        canonicalEntityId: entityId,
        tier: "mid-term",
        memoryType: "observation",
        content: { text: "old expired memory" },
        trustScore: 0.5,
        provenance: {
          sourcePlatform: "discord",
          sourceRoomId: "room-old",
          createdBy: "test",
        },
        expiresAt: Date.now() - 1000, // already expired
      });

      const summary = makeSummary();
      const result = await promoter.processSessionEnd(entityId, summary);

      expect(result.expired).toBe(1);
    });
  });

  describe("seedMidTermMemory()", () => {
    it("creates new memory when no duplicate exists", async () => {
      const result = await promoter.seedMidTermMemory(entityId, {
        tier: "mid-term",
        memoryType: "fact",
        content: { text: "User lives in Berlin" },
        trustScore: 0.7,
        provenance: {
          sourcePlatform: "discord",
          sourceRoomId: "room-1",
          createdBy: "test",
        },
      });

      expect(result.created).toBe(1);
      expect(result.bumped).toBe(0);
    });

    it("bumps session count for duplicate content", async () => {
      // Insert first
      await promoter.seedMidTermMemory(entityId, {
        tier: "mid-term",
        memoryType: "fact",
        content: { text: "User lives in Berlin" },
        trustScore: 0.7,
        provenance: {
          sourcePlatform: "discord",
          sourceRoomId: "room-1",
          createdBy: "test",
        },
      });

      // Insert duplicate
      const result = await promoter.seedMidTermMemory(entityId, {
        tier: "mid-term",
        memoryType: "fact",
        content: { text: "User lives in Berlin" },
        trustScore: 0.7,
        provenance: {
          sourcePlatform: "telegram",
          sourceRoomId: "room-2",
          createdBy: "test",
        },
      });

      expect(result.created).toBe(0);
      expect(result.bumped).toBe(1);

      // Verify sessionCount increased
      const memories = await store.query({ canonicalEntityId: entityId });
      expect(memories).toHaveLength(1);
      expect(memories[0].sessionCount).toBe(2);
    });

    it("handles case-insensitive dedup", async () => {
      await promoter.seedMidTermMemory(entityId, {
        tier: "mid-term",
        memoryType: "fact",
        content: { text: "User Prefers Dark Mode" },
        trustScore: 0.7,
        provenance: {
          sourcePlatform: "discord",
          sourceRoomId: "room-1",
          createdBy: "test",
        },
      });

      const result = await promoter.seedMidTermMemory(entityId, {
        tier: "mid-term",
        memoryType: "fact",
        content: { text: "user prefers dark mode" },
        trustScore: 0.7,
        provenance: {
          sourcePlatform: "telegram",
          sourceRoomId: "room-2",
          createdBy: "test",
        },
      });

      expect(result.bumped).toBe(1);
    });
  });

  describe("promoteMatureMidTermMemories()", () => {
    it("promotes memories at or above threshold", async () => {
      const mem = await store.insert({
        canonicalEntityId: entityId,
        tier: "mid-term",
        memoryType: "fact",
        content: { text: "frequently mentioned fact" },
        trustScore: 0.8,
        provenance: {
          sourcePlatform: "discord",
          sourceRoomId: "room-1",
          createdBy: "test",
        },
      });

      // Bump to threshold (default = 3)
      await store.bumpSessionCount(mem.id); // 2
      await store.bumpSessionCount(mem.id); // 3

      const promoted = await promoter.promoteMatureMidTermMemories(entityId);
      expect(promoted).toBe(1);

      const updated = await store.getById(mem.id);
      expect(updated!.tier).toBe("long-term");
      expect(updated!.expiresAt).toBeNull();
    });

    it("does not promote below threshold", async () => {
      await store.insert({
        canonicalEntityId: entityId,
        tier: "mid-term",
        memoryType: "fact",
        content: { text: "single session fact" },
        trustScore: 0.7,
        provenance: {
          sourcePlatform: "discord",
          sourceRoomId: "room-1",
          createdBy: "test",
        },
      });

      const promoted = await promoter.promoteMatureMidTermMemories(entityId);
      expect(promoted).toBe(0);
    });

    it("respects maxLongTermPerEntity cap", async () => {
      const smallCapPromoter = new TierPromoter(store, {
        promotionThreshold: 1,
        maxLongTermPerEntity: 2,
      });

      // Create 5 mid-term memories all at sessionCount 1 (threshold 1)
      for (let i = 0; i < 5; i++) {
        await store.insert({
          canonicalEntityId: entityId,
          tier: "mid-term",
          memoryType: "fact",
          content: { text: `fact ${i}` },
          trustScore: 0.7,
          provenance: {
            sourcePlatform: "discord",
            sourceRoomId: "room-1",
            createdBy: "test",
          },
        });
      }

      const promoted =
        await smallCapPromoter.promoteMatureMidTermMemories(entityId);
      expect(promoted).toBe(2); // Capped at 2
    });
  });

  describe("runMaintenance()", () => {
    it("purges expired and promotes mature memories", async () => {
      // Insert expired memory
      await store.insert({
        canonicalEntityId: entityId,
        tier: "mid-term",
        memoryType: "observation",
        content: { text: "old" },
        trustScore: 0.5,
        provenance: {
          sourcePlatform: "discord",
          sourceRoomId: "room-1",
          createdBy: "test",
        },
        expiresAt: Date.now() - 1000,
      });

      // Insert mature memory
      const mature = await store.insert({
        canonicalEntityId: entityId,
        tier: "mid-term",
        memoryType: "fact",
        content: { text: "mature fact" },
        trustScore: 0.8,
        provenance: {
          sourcePlatform: "discord",
          sourceRoomId: "room-1",
          createdBy: "test",
        },
      });
      await store.bumpSessionCount(mature.id);
      await store.bumpSessionCount(mature.id);

      const result = await promoter.runMaintenance([entityId]);
      expect(result.expired).toBe(1);
      expect(result.promoted).toBe(1);
    });

    it("handles empty entity list gracefully", async () => {
      const result = await promoter.runMaintenance([]);
      expect(result.expired).toBe(0);
      expect(result.promoted).toBe(0);
    });
  });
});
