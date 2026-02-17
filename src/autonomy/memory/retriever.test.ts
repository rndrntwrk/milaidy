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
import { TrustAwareRetrieverImpl, type RetrievalOptions } from "./retriever.js";

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
  });
});
