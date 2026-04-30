/**
 * Tests for TrustAwareRetrieverImpl.
 *
 * Exercises:
 *   - Ranking order (trust × recency × relevance × type)
 *   - Deduplication across time-ordered and semantic results
 *   - Trust override
 *   - maxResults trimming
 *   - minTrustThreshold filtering
 *   - Memory type inference
 *   - Type boosts
 */

import { describe, expect, it, vi } from "vitest";
import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { DEFAULT_RETRIEVAL_CONFIG } from "../config.js";
import {
  TrustAwareRetrieverImpl,
  type RetrievalOptions,
  type EntityMemoryProvider,
} from "./retriever.js";

// ---------- Helpers ----------

function makeMemory(overrides: Partial<Memory> & { id: string }): Memory {
  return {
    entityId: "entity-1" as UUID,
    roomId: "room-1" as UUID,
    content: { text: "test memory" },
    createdAt: Date.now(),
    ...overrides,
    id: overrides.id as UUID,
  } as Memory;
}

function createMockRuntime(
  timeMemories: Memory[] = [],
  semanticMemories: Memory[] = [],
): IAgentRuntime {
  return {
    getMemories: vi.fn(async () => timeMemories),
    searchMemories: vi.fn(async () => semanticMemories),
  } as unknown as IAgentRuntime;
}

function createMockEventBus() {
  return {
    emit: vi.fn(),
  };
}

const defaultOptions: RetrievalOptions = {
  roomId: "room-1" as UUID,
};

// ---------- Tests ----------

describe("TrustAwareRetrieverImpl", () => {
  describe("retrieve()", () => {
    it("returns empty array when no memories exist", async () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const runtime = createMockRuntime();

      const results = await retriever.retrieve(runtime, defaultOptions);
      expect(results).toEqual([]);
    });

    it("ranks memories by composite score", async () => {
      const now = Date.now();
      const recent = makeMemory({
        id: "m1",
        createdAt: now - 1000,
        metadata: { type: "custom", trustScore: 0.9, memoryType: "instruction" } as Memory["metadata"],
      });
      const old = makeMemory({
        id: "m2",
        createdAt: now - 48 * 60 * 60 * 1000, // 48h ago
        metadata: { type: "custom", trustScore: 0.5, memoryType: "observation" } as Memory["metadata"],
      });

      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const runtime = createMockRuntime([recent, old]);

      const results = await retriever.retrieve(runtime, defaultOptions);
      expect(results).toHaveLength(2);
      expect(results[0].memory.id).toBe("m1"); // higher trust + more recent
      expect(results[0].rankScore).toBeGreaterThan(results[1].rankScore);
    });

    it("deduplicates memories from time-ordered and semantic results", async () => {
      const mem = makeMemory({ id: "m1" });
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);

      // Same memory in both time-ordered and semantic results
      const runtime = createMockRuntime([mem], [mem]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        embedding: [0.1, 0.2, 0.3],
      });

      expect(results).toHaveLength(1);
    });

    it("includes semantic results when embedding is provided", async () => {
      const timeMem = makeMemory({ id: "m1", content: { text: "time" } });
      const semanticMem = makeMemory({
        id: "m2",
        content: { text: "semantic" },
        metadata: { type: "custom", similarity: 0.95 } as Memory["metadata"],
      });

      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const runtime = createMockRuntime([timeMem], [semanticMem]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        embedding: [0.1, 0.2],
      });

      expect(results).toHaveLength(2);
    });

    it("respects maxResults limit", async () => {
      const memories = Array.from({ length: 10 }, (_, i) =>
        makeMemory({ id: `m${i}` }),
      );

      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const runtime = createMockRuntime(memories);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        maxResults: 3,
      });

      expect(results).toHaveLength(3);
    });

    it("filters below minTrustThreshold", async () => {
      const config = { ...DEFAULT_RETRIEVAL_CONFIG, minTrustThreshold: 0.6 };
      const trusted = makeMemory({
        id: "m1",
        metadata: { type: "custom", trustScore: 0.8 } as Memory["metadata"],
      });
      const untrusted = makeMemory({
        id: "m2",
        metadata: { type: "custom", trustScore: 0.2 } as Memory["metadata"],
      });

      const retriever = new TrustAwareRetrieverImpl(config);
      const runtime = createMockRuntime([trusted, untrusted]);

      const results = await retriever.retrieve(runtime, defaultOptions);
      expect(results).toHaveLength(1);
      expect(results[0].memory.id).toBe("m1");
    });

    it("applies trust override to all memories when policy context is valid", async () => {
      const mem = makeMemory({
        id: "m1",
        metadata: { type: "custom", trustScore: 0.2 } as Memory["metadata"],
      });

      const eventBus = createMockEventBus();
      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        undefined,
        eventBus,
      );
      const runtime = createMockRuntime([mem]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        trustOverride: 0.95,
        trustOverridePolicy: {
          source: "user",
          actor: "ops-user",
          approvedBy: "security-reviewer",
          reason: "incident response memory triage",
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0].trustScore).toBe(0.95);
      expect(eventBus.emit).toHaveBeenCalledWith(
        "autonomy:retrieval:trust-override",
        expect.objectContaining({
          decision: "applied",
          actor: "ops-user",
          requestedOverride: 0.95,
          appliedOverride: 0.95,
        }),
      );
    });

    it("rejects trust override when actor attribution is missing", async () => {
      const mem = makeMemory({
        id: "m1",
        metadata: { type: "custom", trustScore: 0.2 } as Memory["metadata"],
      });

      const eventBus = createMockEventBus();
      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        undefined,
        eventBus,
      );
      const runtime = createMockRuntime([mem]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        trustOverride: 0.95,
      });

      expect(results).toHaveLength(1);
      expect(results[0].trustScore).toBe(0.2);
      expect(eventBus.emit).toHaveBeenCalledWith(
        "autonomy:retrieval:trust-override",
        expect.objectContaining({
          decision: "rejected",
          actor: "unknown",
          appliedOverride: null,
        }),
      );
    });

    it("rejects high-risk trust override without independent approval", async () => {
      const mem = makeMemory({
        id: "m1",
        metadata: { type: "custom", trustScore: 0.2 } as Memory["metadata"],
      });

      const eventBus = createMockEventBus();
      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        undefined,
        eventBus,
      );
      const runtime = createMockRuntime([mem]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        trustOverride: 0.95,
        trustOverridePolicy: {
          source: "api",
          actor: "ops-user",
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0].trustScore).toBe(0.2);
      expect(eventBus.emit).toHaveBeenCalledWith(
        "autonomy:retrieval:trust-override",
        expect.objectContaining({
          decision: "rejected",
          source: "api",
          actor: "ops-user",
          highRisk: true,
        }),
      );
    });

    it("filters by memory type when specified", async () => {
      const instruction = makeMemory({
        id: "m1",
        content: { text: "You must always be polite" },
        metadata: { type: "custom", memoryType: "instruction" } as Memory["metadata"],
      });
      const observation = makeMemory({
        id: "m2",
        content: { text: "User seemed happy" },
        metadata: { type: "custom", memoryType: "observation" } as Memory["metadata"],
      });

      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const runtime = createMockRuntime([instruction, observation]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        memoryTypes: ["instruction"],
      });

      expect(results).toHaveLength(1);
      expect(results[0].memoryType).toBe("instruction");
    });
  });

  describe("computeTrustScore()", () => {
    it("returns metadata trustScore when present", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({
        id: "m1",
        metadata: { type: "custom", trustScore: 0.85 } as Memory["metadata"],
      });

      expect(retriever.computeTrustScore(mem)).toBe(0.85);
    });

    it("returns trustOverride when specified", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({
        id: "m1",
        metadata: { type: "custom", trustScore: 0.2 } as Memory["metadata"],
      });

      expect(retriever.computeTrustScore(mem, 0.99)).toBe(0.99);
    });

    it("clamps trustOverride to [0, 1]", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({ id: "m1" });

      expect(retriever.computeTrustScore(mem, 1.5)).toBe(1);
      expect(retriever.computeTrustScore(mem, -0.5)).toBe(0);
    });

    it("returns 0.5 default when no trust info available", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({ id: "m1" });

      expect(retriever.computeTrustScore(mem)).toBe(0.5);
    });
  });

  describe("computeRecencyScore()", () => {
    it("returns ~1 for very recent memories", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const now = Date.now();
      const mem = makeMemory({ id: "m1", createdAt: now - 1000 }); // 1 sec ago

      const score = retriever.computeRecencyScore(mem, now);
      expect(score).toBeGreaterThan(0.99);
    });

    it("returns ~0.5 for 24h-old memories", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const now = Date.now();
      const mem = makeMemory({ id: "m1", createdAt: now - 24 * 60 * 60 * 1000 });

      const score = retriever.computeRecencyScore(mem, now);
      expect(score).toBeCloseTo(0.5, 1);
    });

    it("returns ~0.25 for 48h-old memories", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const now = Date.now();
      const mem = makeMemory({ id: "m1", createdAt: now - 48 * 60 * 60 * 1000 });

      const score = retriever.computeRecencyScore(mem, now);
      expect(score).toBeCloseTo(0.25, 1);
    });

    it("returns 0.5 for missing createdAt", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({ id: "m1", createdAt: 0 });

      const score = retriever.computeRecencyScore(mem, Date.now());
      expect(score).toBe(0.5);
    });
  });

  describe("computeRelevanceScore()", () => {
    it("reads similarity from metadata", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({
        id: "m1",
        metadata: { type: "custom", similarity: 0.92 } as Memory["metadata"],
      });

      expect(retriever.computeRelevanceScore(mem)).toBe(0.92);
    });

    it("returns 0.5 default when no similarity", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({ id: "m1" });

      expect(retriever.computeRelevanceScore(mem)).toBe(0.5);
    });
  });

  describe("inferMemoryType()", () => {
    it("reads explicit memoryType from metadata", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({
        id: "m1",
        metadata: { type: "custom", memoryType: "fact" } as Memory["metadata"],
      });

      expect(retriever.inferMemoryType(mem)).toBe("fact");
    });

    it("infers instruction from content keywords", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({
        id: "m1",
        content: { text: "You must always respond politely" },
      });

      expect(retriever.inferMemoryType(mem)).toBe("instruction");
    });

    it("infers goal from content keywords", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({
        id: "m1",
        content: { text: "The user's goal is to learn Python" },
      });

      expect(retriever.inferMemoryType(mem)).toBe("goal");
    });

    it("infers preference from content keywords", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({
        id: "m1",
        content: { text: "User prefers dark mode" },
      });

      expect(retriever.inferMemoryType(mem)).toBe("preference");
    });

    it("defaults to observation for generic content", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({
        id: "m1",
        content: { text: "The sky is blue today" },
      });

      expect(retriever.inferMemoryType(mem)).toBe("observation");
    });
  });

  describe("getTypeBoost()", () => {
    it("returns default boosts for known types", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);

      expect(retriever.getTypeBoost("instruction")).toBe(1.0);
      expect(retriever.getTypeBoost("system")).toBe(1.0);
      expect(retriever.getTypeBoost("fact")).toBe(0.9);
      expect(retriever.getTypeBoost("goal")).toBe(0.85);
      expect(retriever.getTypeBoost("preference")).toBe(0.8);
      expect(retriever.getTypeBoost("observation")).toBe(0.6);
    });

    it("uses user-configured boosts when provided", () => {
      const config = {
        ...DEFAULT_RETRIEVAL_CONFIG,
        typeBoosts: { observation: 0.95 },
      };
      const retriever = new TrustAwareRetrieverImpl(config);

      expect(retriever.getTypeBoost("observation")).toBe(0.95);
      // Non-overridden types keep defaults
      expect(retriever.getTypeBoost("instruction")).toBe(1.0);
    });

    it("clamps user-configured boosts to guardrail bounds", () => {
      const config = {
        ...DEFAULT_RETRIEVAL_CONFIG,
        typeBoosts: { observation: 5 },
      };
      const retriever = new TrustAwareRetrieverImpl(config);

      expect(retriever.getTypeBoost("observation")).toBe(2);
    });
  });

  describe("contentHash()", () => {
    it("returns null for empty text", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({ id: "m1", content: {} });
      expect(retriever.contentHash(mem)).toBeNull();
    });

    it("returns null for missing text", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const mem = makeMemory({ id: "m1", content: { text: "" } });
      expect(retriever.contentHash(mem)).toBeNull();
    });

    it("produces consistent hashes for identical text", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const m1 = makeMemory({ id: "m1", content: { text: "hello world" } });
      const m2 = makeMemory({ id: "m2", content: { text: "hello world" } });
      expect(retriever.contentHash(m1)).toBe(retriever.contentHash(m2));
    });

    it("normalizes whitespace for dedup", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const m1 = makeMemory({ id: "m1", content: { text: "hello   world" } });
      const m2 = makeMemory({ id: "m2", content: { text: "  hello world  " } });
      expect(retriever.contentHash(m1)).toBe(retriever.contentHash(m2));
    });

    it("includes memory type in hash to avoid cross-type collisions", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const m1 = makeMemory({
        id: "m1",
        content: { text: "hello" },
        metadata: { type: "custom", memoryType: "fact" } as Memory["metadata"],
      });
      const m2 = makeMemory({
        id: "m2",
        content: { text: "hello" },
        metadata: { type: "custom", memoryType: "observation" } as Memory["metadata"],
      });
      expect(retriever.contentHash(m1)).not.toBe(retriever.contentHash(m2));
    });

    it("distinguishes long texts that differ only after 200 chars", () => {
      const retriever = new TrustAwareRetrieverImpl(DEFAULT_RETRIEVAL_CONFIG);
      const prefix = "a".repeat(250);
      const m1 = makeMemory({ id: "m1", content: { text: prefix + " ending one" } });
      const m2 = makeMemory({ id: "m2", content: { text: prefix + " ending two" } });
      expect(retriever.contentHash(m1)).not.toBe(retriever.contentHash(m2));
    });
  });

  describe("two-phase cross-room retrieval", () => {
    function createMockEntityMemoryProvider(
      memories: Memory[] = [],
      searchMemories?: Memory[],
    ): EntityMemoryProvider {
      return {
        getEntityMemories: vi.fn(async () => memories),
        ...(searchMemories !== undefined
          ? { searchEntityMemories: vi.fn(async () => searchMemories) }
          : {}),
      };
    }

    it("includes entity memories when canonicalEntityId is provided", async () => {
      const roomMem = makeMemory({ id: "room-1", content: { text: "room scoped memory" } });
      const entityMem = makeMemory({
        id: "entity-1",
        content: { text: "entity scoped memory from discord" },
        metadata: { type: "custom", trustScore: 0.8 } as Memory["metadata"],
      });

      const entityProvider = createMockEntityMemoryProvider([entityMem]);
      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        null,
        null,
        entityProvider,
      );
      const runtime = createMockRuntime([roomMem]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        canonicalEntityId: "canonical-user-123",
      });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.memory.id);
      expect(ids).toContain("room-1");
      expect(ids).toContain("entity-1");
      expect(entityProvider.getEntityMemories).toHaveBeenCalledWith(
        "canonical-user-123",
        expect.objectContaining({ tiers: ["mid-term", "long-term"] }),
      );
    });

    it("deduplicates identical content across room and entity memories", async () => {
      const sharedText = "user prefers bullet point formatting";
      const roomMem = makeMemory({
        id: "room-1",
        content: { text: sharedText },
        metadata: { type: "custom", memoryType: "preference" } as Memory["metadata"],
      });
      const entityMem = makeMemory({
        id: "entity-1",
        content: { text: sharedText },
        metadata: { type: "custom", memoryType: "preference" } as Memory["metadata"],
      });

      const entityProvider = createMockEntityMemoryProvider([entityMem]);
      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        null,
        null,
        entityProvider,
      );
      const runtime = createMockRuntime([roomMem]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        canonicalEntityId: "canonical-user-123",
      });

      // Should only get 1 result since content hashes match
      expect(results).toHaveLength(1);
    });

    it("uses semantic search on entity provider when embedding is available", async () => {
      const entityMem = makeMemory({
        id: "entity-1",
        content: { text: "entity semantic match" },
        metadata: { type: "custom", similarity: 0.85 } as Memory["metadata"],
      });

      const searchResults = [entityMem];
      const entityProvider = createMockEntityMemoryProvider([], searchResults);
      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        null,
        null,
        entityProvider,
      );
      const runtime = createMockRuntime([]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        canonicalEntityId: "canonical-user-123",
        embedding: [0.1, 0.2, 0.3],
      });

      expect(results).toHaveLength(1);
      expect(results[0].memory.id).toBe("entity-1");
      expect(entityProvider.searchEntityMemories).toHaveBeenCalledWith(
        "canonical-user-123",
        [0.1, 0.2, 0.3],
        expect.objectContaining({ matchThreshold: 0.3 }),
      );
    });

    it("falls back to recency-based entity fetch when no embedding", async () => {
      const entityMem = makeMemory({
        id: "entity-1",
        content: { text: "entity recency match" },
      });

      const entityProvider = createMockEntityMemoryProvider([entityMem]);
      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        null,
        null,
        entityProvider,
      );
      const runtime = createMockRuntime([]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        canonicalEntityId: "canonical-user-123",
      });

      expect(results).toHaveLength(1);
      expect(entityProvider.getEntityMemories).toHaveBeenCalled();
    });

    it("does not fetch entity memories when canonicalEntityId is absent", async () => {
      const entityMem = makeMemory({ id: "entity-1", content: { text: "should not appear" } });
      const entityProvider = createMockEntityMemoryProvider([entityMem]);
      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        null,
        null,
        entityProvider,
      );
      const runtime = createMockRuntime([]);

      const results = await retriever.retrieve(runtime, defaultOptions);

      expect(results).toHaveLength(0);
      expect(entityProvider.getEntityMemories).not.toHaveBeenCalled();
    });

    it("does not fetch entity memories when provider is null", async () => {
      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        null,
        null,
        null,
      );
      const runtime = createMockRuntime([]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        canonicalEntityId: "canonical-user-123",
      });

      // No crash, just empty
      expect(results).toHaveLength(0);
    });

    it("gracefully handles entity provider errors", async () => {
      const roomMem = makeMemory({ id: "room-1", content: { text: "room memory" } });
      const entityProvider: EntityMemoryProvider = {
        getEntityMemories: vi.fn(async () => {
          throw new Error("database connection lost");
        }),
      };

      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        null,
        null,
        entityProvider,
      );
      const runtime = createMockRuntime([roomMem]);

      // Should not throw — falls back to room-only results
      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        canonicalEntityId: "canonical-user-123",
      });

      expect(results).toHaveLength(1);
      expect(results[0].memory.id).toBe("room-1");
    });

    it("allows entity memories with null content hash through dedup", async () => {
      const roomMem = makeMemory({ id: "room-1", content: { text: "room text" } });
      // Entity memory with no text content — hash will be null, should still pass through
      const entityMem = makeMemory({
        id: "entity-1",
        content: { action: "some_action" },
        metadata: { type: "custom", memoryType: "action" } as Memory["metadata"],
      });

      const entityProvider = createMockEntityMemoryProvider([entityMem]);
      const retriever = new TrustAwareRetrieverImpl(
        DEFAULT_RETRIEVAL_CONFIG,
        null,
        null,
        entityProvider,
      );
      const runtime = createMockRuntime([roomMem]);

      const results = await retriever.retrieve(runtime, {
        ...defaultOptions,
        canonicalEntityId: "canonical-user-123",
      });

      expect(results).toHaveLength(2);
    });
  });

  describe("rank tuning guardrails", () => {
    it("reverts to default weights when configured weights violate guardrail band", () => {
      const config = {
        ...DEFAULT_RETRIEVAL_CONFIG,
        trustWeight: 0.95,
        recencyWeight: 0.03,
        relevanceWeight: 0.01,
        typeWeight: 0.01,
      };
      const retriever = new TrustAwareRetrieverImpl(config);

      expect(retriever.getRankingWeights()).toEqual({
        trustWeight: DEFAULT_RETRIEVAL_CONFIG.trustWeight,
        recencyWeight: DEFAULT_RETRIEVAL_CONFIG.recencyWeight,
        relevanceWeight: DEFAULT_RETRIEVAL_CONFIG.relevanceWeight,
        typeWeight: DEFAULT_RETRIEVAL_CONFIG.typeWeight,
      });
    });

    it("clamps maxResults to guardrail ceiling", async () => {
      const memories = Array.from({ length: 300 }, (_, i) =>
        makeMemory({ id: `m${i}` }),
      );
      const config = {
        ...DEFAULT_RETRIEVAL_CONFIG,
        maxResults: 500,
      };
      const retriever = new TrustAwareRetrieverImpl(config);
      const runtime = createMockRuntime(memories);

      const results = await retriever.retrieve(runtime, defaultOptions);
      expect(results).toHaveLength(200);
    });

    it("emits rank guardrail audit event when constructor sanitizes config", () => {
      const eventBus = createMockEventBus();
      const config = {
        ...DEFAULT_RETRIEVAL_CONFIG,
        maxResults: 500,
      };

      new TrustAwareRetrieverImpl(config, undefined, eventBus);

      expect(eventBus.emit).toHaveBeenCalledWith(
        "autonomy:retrieval:rank-guardrail",
        expect.objectContaining({
          adjustments: expect.arrayContaining([
            expect.stringContaining("maxResults clamped"),
          ]),
        }),
      );
    });
  });
});
