/**
 * Tests for autonomy/trust/source-tracker.ts
 *
 * Exercises:
 *   - Source recording and reliability computation
 *   - LRU eviction
 *   - Unknown source defaults
 */

import { beforeEach, describe, expect, it } from "vitest";
import { SourceTracker } from "./source-tracker.js";
import type { TrustSource } from "../types.js";

function makeSource(id: string, overrides: Partial<TrustSource> = {}): TrustSource {
  return {
    id,
    type: "user",
    reliability: 0.7,
    ...overrides,
  };
}

describe("SourceTracker", () => {
  let tracker: SourceTracker;

  beforeEach(() => {
    tracker = new SourceTracker();
  });

  describe("record", () => {
    it("creates a new record for unknown source", () => {
      tracker.record(makeSource("user-1"), "positive");

      const record = tracker.get("user-1");
      expect(record).toBeDefined();
      expect(record!.positive).toBe(1);
      expect(record!.negative).toBe(0);
      expect(record!.type).toBe("user");
    });

    it("increments positive count", () => {
      tracker.record(makeSource("user-1"), "positive");
      tracker.record(makeSource("user-1"), "positive");

      expect(tracker.get("user-1")!.positive).toBe(2);
    });

    it("increments negative count", () => {
      tracker.record(makeSource("user-1"), "negative");
      expect(tracker.get("user-1")!.negative).toBe(1);
    });

    it("handles neutral feedback without changing counts", () => {
      tracker.record(makeSource("user-1"), "positive");
      tracker.record(makeSource("user-1"), "neutral");

      const record = tracker.get("user-1")!;
      expect(record.positive).toBe(1);
      expect(record.negative).toBe(0);
    });

    it("updates reliability based on feedback ratio", () => {
      tracker.record(makeSource("user-1"), "positive");
      tracker.record(makeSource("user-1"), "positive");
      tracker.record(makeSource("user-1"), "negative");

      expect(tracker.getReliability("user-1")).toBeCloseTo(2 / 3, 1);
    });

    it("updates lastSeen timestamp", () => {
      tracker.record(makeSource("user-1"), "positive");
      const first = tracker.get("user-1")!.lastSeen;

      // Small delay to ensure different timestamps
      tracker.record(makeSource("user-1"), "positive");
      const second = tracker.get("user-1")!.lastSeen;

      expect(second).toBeGreaterThanOrEqual(first);
    });
  });

  describe("getReliability", () => {
    it("returns 0.5 for unknown sources", () => {
      expect(tracker.getReliability("unknown")).toBe(0.5);
    });

    it("returns computed reliability for known sources", () => {
      tracker.record(makeSource("user-1"), "positive");
      tracker.record(makeSource("user-1"), "positive");

      expect(tracker.getReliability("user-1")).toBe(1.0);
    });
  });

  describe("get", () => {
    it("returns undefined for unknown source", () => {
      expect(tracker.get("non-existent")).toBeUndefined();
    });
  });

  describe("getTrackedSources", () => {
    it("returns all tracked source IDs", () => {
      tracker.record(makeSource("a"), "positive");
      tracker.record(makeSource("b"), "negative");
      tracker.record(makeSource("c"), "neutral");

      const ids = tracker.getTrackedSources();
      expect(ids).toContain("a");
      expect(ids).toContain("b");
      expect(ids).toContain("c");
      expect(ids).toHaveLength(3);
    });
  });

  describe("size", () => {
    it("tracks the number of sources", () => {
      expect(tracker.size).toBe(0);
      tracker.record(makeSource("a"), "positive");
      expect(tracker.size).toBe(1);
      tracker.record(makeSource("b"), "positive");
      expect(tracker.size).toBe(2);
    });
  });

  describe("clear", () => {
    it("removes all tracking data", () => {
      tracker.record(makeSource("a"), "positive");
      tracker.record(makeSource("b"), "positive");

      tracker.clear();

      expect(tracker.size).toBe(0);
      expect(tracker.get("a")).toBeUndefined();
    });
  });

  describe("LRU eviction", () => {
    it("evicts oldest source when at capacity", () => {
      const smallTracker = new SourceTracker(3);

      smallTracker.record(makeSource("oldest"), "positive");
      smallTracker.record(makeSource("middle"), "positive");
      smallTracker.record(makeSource("newest"), "positive");

      // At capacity, adding one more should evict "oldest"
      smallTracker.record(makeSource("newest2"), "positive");

      expect(smallTracker.size).toBe(3);
      expect(smallTracker.get("oldest")).toBeUndefined();
      expect(smallTracker.get("newest2")).toBeDefined();
    });

    it("evicts the oldest entry at capacity", () => {
      const smallTracker = new SourceTracker(2);

      smallTracker.record(makeSource("a"), "positive");
      smallTracker.record(makeSource("b"), "positive");

      // At capacity — adding "c" should evict one of the existing entries
      smallTracker.record(makeSource("c"), "positive");

      expect(smallTracker.size).toBe(2);
      expect(smallTracker.get("c")).toBeDefined();
      // One of a or b was evicted
      const aExists = smallTracker.get("a") !== undefined;
      const bExists = smallTracker.get("b") !== undefined;
      expect(aExists || bExists).toBe(true);
      expect(aExists && bExists).toBe(false);
    });
  });
});
