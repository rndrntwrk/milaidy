import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryEventStore } from "./event-store.js";

describe("InMemoryEventStore", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("append()", () => {
    it("assigns monotonically increasing sequence IDs", () => {
      const store = new InMemoryEventStore();
      const id1 = store.append("req-1", "tool:proposed", { tool: "A" });
      const id2 = store.append("req-1", "tool:validated", { valid: true });
      const id3 = store.append("req-2", "tool:proposed", { tool: "B" });
      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
    });

    it("increments size", () => {
      const store = new InMemoryEventStore();
      expect(store.size).toBe(0);
      store.append("req-1", "tool:proposed", {});
      expect(store.size).toBe(1);
      store.append("req-1", "tool:validated", {});
      expect(store.size).toBe(2);
    });

    it("records timestamp", () => {
      const store = new InMemoryEventStore();
      const before = Date.now();
      store.append("req-1", "tool:proposed", {});
      const after = Date.now();
      const events = store.getByRequestId("req-1");
      expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(events[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("getByRequestId()", () => {
    it("returns events for a specific request", () => {
      const store = new InMemoryEventStore();
      store.append("req-1", "tool:proposed", { tool: "A" });
      store.append("req-2", "tool:proposed", { tool: "B" });
      store.append("req-1", "tool:validated", { valid: true });

      const req1Events = store.getByRequestId("req-1");
      expect(req1Events).toHaveLength(2);
      expect(req1Events[0].type).toBe("tool:proposed");
      expect(req1Events[1].type).toBe("tool:validated");
    });

    it("returns empty array for unknown request ID", () => {
      const store = new InMemoryEventStore();
      expect(store.getByRequestId("unknown")).toEqual([]);
    });
  });

  describe("getRecent()", () => {
    it("returns the N most recent events", () => {
      const store = new InMemoryEventStore();
      store.append("req-1", "tool:proposed", {});
      store.append("req-1", "tool:validated", {});
      store.append("req-1", "tool:executed", {});

      const recent = store.getRecent(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].type).toBe("tool:validated");
      expect(recent[1].type).toBe("tool:executed");
    });

    it("returns all events if n > size", () => {
      const store = new InMemoryEventStore();
      store.append("req-1", "tool:proposed", {});
      expect(store.getRecent(100)).toHaveLength(1);
    });

    it("returns empty array for n <= 0", () => {
      const store = new InMemoryEventStore();
      store.append("req-1", "tool:proposed", {});
      expect(store.getRecent(0)).toEqual([]);
      expect(store.getRecent(-1)).toEqual([]);
    });
  });

  describe("FIFO eviction", () => {
    it("evicts oldest events when exceeding maxEvents", () => {
      const store = new InMemoryEventStore(3);
      store.append("req-1", "tool:proposed", {});
      store.append("req-2", "tool:proposed", {});
      store.append("req-3", "tool:proposed", {});
      expect(store.size).toBe(3);

      store.append("req-4", "tool:proposed", {});
      expect(store.size).toBe(3);

      // req-1 should have been evicted
      expect(store.getByRequestId("req-1")).toHaveLength(0);
      expect(store.getByRequestId("req-4")).toHaveLength(1);
    });

    it("maintains correct secondary index after eviction", () => {
      const store = new InMemoryEventStore(2);
      store.append("req-1", "tool:proposed", {});
      store.append("req-1", "tool:validated", {});
      // Both events belong to req-1, store is full
      expect(store.getByRequestId("req-1")).toHaveLength(2);

      // Adding a new event evicts the oldest
      store.append("req-2", "tool:proposed", {});
      expect(store.size).toBe(2);

      const req1Events = store.getByRequestId("req-1");
      expect(req1Events).toHaveLength(1);
      expect(req1Events[0].type).toBe("tool:validated");
    });
  });

  describe("clear()", () => {
    it("removes all events", () => {
      const store = new InMemoryEventStore();
      store.append("req-1", "tool:proposed", {});
      store.append("req-2", "tool:proposed", {});
      expect(store.size).toBe(2);

      store.clear();
      expect(store.size).toBe(0);
      expect(store.getByRequestId("req-1")).toEqual([]);
    });

    it("resets sequence IDs after clear", () => {
      const store = new InMemoryEventStore();
      store.append("req-1", "tool:proposed", {});
      store.append("req-1", "tool:validated", {});
      store.clear();

      const id = store.append("req-2", "tool:proposed", {});
      expect(id).toBe(1);
    });
  });

  describe("sequence ordering", () => {
    it("events retrieved by request ID are in insertion order", () => {
      const store = new InMemoryEventStore();
      store.append("req-1", "tool:proposed", {});
      store.append("req-2", "tool:proposed", {});
      store.append("req-1", "tool:validated", {});
      store.append("req-2", "tool:validated", {});
      store.append("req-1", "tool:executed", {});

      const events = store.getByRequestId("req-1");
      expect(events.map((e) => e.type)).toEqual([
        "tool:proposed",
        "tool:validated",
        "tool:executed",
      ]);
      expect(events[0].sequenceId).toBeLessThan(events[1].sequenceId);
      expect(events[1].sequenceId).toBeLessThan(events[2].sequenceId);
    });
  });
});
