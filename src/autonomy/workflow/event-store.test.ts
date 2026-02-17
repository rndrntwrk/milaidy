import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryEventStore } from "./event-store.js";

describe("InMemoryEventStore", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("append()", () => {
    it("assigns monotonically increasing sequence IDs", async () => {
      const store = new InMemoryEventStore();
      const id1 = await store.append("req-1", "tool:proposed", { tool: "A" });
      const id2 = await store.append("req-1", "tool:validated", { valid: true });
      const id3 = await store.append("req-2", "tool:proposed", { tool: "B" });
      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
    });

    it("increments size", async () => {
      const store = new InMemoryEventStore();
      expect(store.size).toBe(0);
      await store.append("req-1", "tool:proposed", {});
      expect(store.size).toBe(1);
      await store.append("req-1", "tool:validated", {});
      expect(store.size).toBe(2);
    });

    it("records timestamp", async () => {
      const store = new InMemoryEventStore();
      const before = Date.now();
      await store.append("req-1", "tool:proposed", {});
      const after = Date.now();
      const events = await store.getByRequestId("req-1");
      expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(events[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("getByRequestId()", () => {
    it("returns events for a specific request", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", { tool: "A" });
      await store.append("req-2", "tool:proposed", { tool: "B" });
      await store.append("req-1", "tool:validated", { valid: true });

      const req1Events = await store.getByRequestId("req-1");
      expect(req1Events).toHaveLength(2);
      expect(req1Events[0].type).toBe("tool:proposed");
      expect(req1Events[1].type).toBe("tool:validated");
    });

    it("returns empty array for unknown request ID", async () => {
      const store = new InMemoryEventStore();
      expect(await store.getByRequestId("unknown")).toEqual([]);
    });
  });

  describe("getRecent()", () => {
    it("returns the N most recent events", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", {});
      await store.append("req-1", "tool:validated", {});
      await store.append("req-1", "tool:executed", {});

      const recent = await store.getRecent(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].type).toBe("tool:validated");
      expect(recent[1].type).toBe("tool:executed");
    });

    it("returns all events if n > size", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", {});
      expect(await store.getRecent(100)).toHaveLength(1);
    });

    it("returns empty array for n <= 0", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", {});
      expect(await store.getRecent(0)).toEqual([]);
      expect(await store.getRecent(-1)).toEqual([]);
    });
  });

  describe("FIFO eviction", () => {
    it("evicts oldest events when exceeding maxEvents", async () => {
      const store = new InMemoryEventStore(3);
      await store.append("req-1", "tool:proposed", {});
      await store.append("req-2", "tool:proposed", {});
      await store.append("req-3", "tool:proposed", {});
      expect(store.size).toBe(3);

      await store.append("req-4", "tool:proposed", {});
      expect(store.size).toBe(3);

      // req-1 should have been evicted
      expect(await store.getByRequestId("req-1")).toHaveLength(0);
      expect(await store.getByRequestId("req-4")).toHaveLength(1);
    });

    it("maintains correct secondary index after eviction", async () => {
      const store = new InMemoryEventStore(2);
      await store.append("req-1", "tool:proposed", {});
      await store.append("req-1", "tool:validated", {});
      // Both events belong to req-1, store is full
      expect(await store.getByRequestId("req-1")).toHaveLength(2);

      // Adding a new event evicts the oldest
      await store.append("req-2", "tool:proposed", {});
      expect(store.size).toBe(2);

      const req1Events = await store.getByRequestId("req-1");
      expect(req1Events).toHaveLength(1);
      expect(req1Events[0].type).toBe("tool:validated");
    });
  });

  describe("clear()", () => {
    it("removes all events", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", {});
      await store.append("req-2", "tool:proposed", {});
      expect(store.size).toBe(2);

      store.clear();
      expect(store.size).toBe(0);
      expect(await store.getByRequestId("req-1")).toEqual([]);
    });

    it("resets sequence IDs after clear", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", {});
      await store.append("req-1", "tool:validated", {});
      store.clear();

      const id = await store.append("req-2", "tool:proposed", {});
      expect(id).toBe(1);
    });
  });

  describe("sequence ordering", () => {
    it("events retrieved by request ID are in insertion order", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", {});
      await store.append("req-2", "tool:proposed", {});
      await store.append("req-1", "tool:validated", {});
      await store.append("req-2", "tool:validated", {});
      await store.append("req-1", "tool:executed", {});

      const events = await store.getByRequestId("req-1");
      expect(events.map((e) => e.type)).toEqual([
        "tool:proposed",
        "tool:validated",
        "tool:executed",
      ]);
      expect(events[0].sequenceId).toBeLessThan(events[1].sequenceId);
      expect(events[1].sequenceId).toBeLessThan(events[2].sequenceId);
    });
  });

  describe("correlation ID", () => {
    it("stores correlationId when provided", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", {}, "corr-1");

      const events = await store.getByRequestId("req-1");
      expect(events[0].correlationId).toBe("corr-1");
    });

    it("omits correlationId when not provided", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", {});

      const events = await store.getByRequestId("req-1");
      expect(events[0].correlationId).toBeUndefined();
    });

    it("returns events by correlation ID", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", {}, "corr-A");
      await store.append("req-1", "tool:validated", {}, "corr-A");
      await store.append("req-2", "tool:proposed", {}, "corr-B");

      const corrA = await store.getByCorrelationId("corr-A");
      expect(corrA).toHaveLength(2);
      expect(corrA[0].type).toBe("tool:proposed");
      expect(corrA[1].type).toBe("tool:validated");

      const corrB = await store.getByCorrelationId("corr-B");
      expect(corrB).toHaveLength(1);
    });

    it("returns empty array for unknown correlation ID", async () => {
      const store = new InMemoryEventStore();
      expect(await store.getByCorrelationId("unknown")).toEqual([]);
    });

    it("maintains correlation index after eviction", async () => {
      const store = new InMemoryEventStore(2);
      await store.append("req-1", "tool:proposed", {}, "corr-1");
      await store.append("req-1", "tool:validated", {}, "corr-1");
      // Full — next append evicts first
      await store.append("req-2", "tool:proposed", {}, "corr-2");

      const corr1 = await store.getByCorrelationId("corr-1");
      expect(corr1).toHaveLength(1);
      expect(corr1[0].type).toBe("tool:validated");

      const corr2 = await store.getByCorrelationId("corr-2");
      expect(corr2).toHaveLength(1);
    });
  });

  describe("hash chain", () => {
    it("adds event hashes and links prevHash across events", async () => {
      const store = new InMemoryEventStore();
      await store.append("req-1", "tool:proposed", {});
      await store.append("req-1", "tool:validated", {});

      const events = await store.getByRequestId("req-1");
      expect(events[0].eventHash).toMatch(/^[a-f0-9]{64}$/);
      expect(events[0].prevHash).toBeUndefined();
      expect(events[1].eventHash).toMatch(/^[a-f0-9]{64}$/);
      expect(events[1].prevHash).toBe(events[0].eventHash);
    });
  });

  describe("time-based retention", () => {
    it("evicts events older than retentionMs", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
        const store = new InMemoryEventStore({ maxEvents: 10, retentionMs: 1_000 });
        await store.append("req-1", "tool:proposed", {});

        vi.setSystemTime(new Date("2025-01-01T00:00:00.500Z"));
        await store.append("req-1", "tool:validated", {});

        vi.setSystemTime(new Date("2025-01-01T00:00:02.100Z"));
        await store.append("req-2", "tool:proposed", {});

        expect(await store.getByRequestId("req-1")).toHaveLength(0);
        expect(await store.getByRequestId("req-2")).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not evict by age when retentionMs is disabled", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
        const store = new InMemoryEventStore({ maxEvents: 10, retentionMs: 0 });
        await store.append("req-1", "tool:proposed", {});

        vi.setSystemTime(new Date("2025-01-02T00:00:00.000Z"));
        await store.append("req-1", "tool:validated", {});

        expect(await store.getByRequestId("req-1")).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
