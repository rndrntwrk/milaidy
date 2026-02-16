/**
 * Tests for InMemoryCache.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { InMemoryCache } from "./in-memory-cache.js";

describe("InMemoryCache", () => {
  it("stores and retrieves values", async () => {
    const cache = new InMemoryCache();
    await cache.set("k1", { hello: "world" });
    expect(await cache.get("k1")).toEqual({ hello: "world" });
  });

  it("returns undefined for missing keys", async () => {
    const cache = new InMemoryCache();
    expect(await cache.get("nope")).toBeUndefined();
  });

  it("deletes keys", async () => {
    const cache = new InMemoryCache();
    await cache.set("k1", 1);
    expect(await cache.del("k1")).toBe(true);
    expect(await cache.get("k1")).toBeUndefined();
    expect(await cache.del("k1")).toBe(false);
  });

  it("checks key existence", async () => {
    const cache = new InMemoryCache();
    expect(await cache.has("k1")).toBe(false);
    await cache.set("k1", 42);
    expect(await cache.has("k1")).toBe(true);
  });

  it("clears all entries", async () => {
    const cache = new InMemoryCache();
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.clear();
    expect(cache.size).toBe(0);
    expect(await cache.get("a")).toBeUndefined();
  });

  it("evicts oldest entries when maxEntries exceeded", async () => {
    const cache = new InMemoryCache({ maxEntries: 3 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.set("c", 3);
    await cache.set("d", 4); // evicts "a"
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBe(2);
    expect(await cache.get("d")).toBe(4);
    expect(cache.size).toBe(3);
  });

  it("expires entries after TTL", async () => {
    vi.useFakeTimers();
    try {
      const cache = new InMemoryCache();
      await cache.set("k1", "val", 100);
      expect(await cache.get("k1")).toBe("val");
      vi.advanceTimersByTime(101);
      expect(await cache.get("k1")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("has() returns false for expired keys", async () => {
    vi.useFakeTimers();
    try {
      const cache = new InMemoryCache();
      await cache.set("k1", "val", 50);
      expect(await cache.has("k1")).toBe(true);
      vi.advanceTimersByTime(51);
      expect(await cache.has("k1")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("get promotes entry to most-recently-used", async () => {
    const cache = new InMemoryCache({ maxEntries: 3 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.set("c", 3);
    // Access "a" to promote it
    await cache.get("a");
    // Now "b" is oldest
    await cache.set("d", 4); // should evict "b"
    expect(await cache.get("b")).toBeUndefined();
    expect(await cache.get("a")).toBe(1);
  });

  it("close clears the store", async () => {
    const cache = new InMemoryCache();
    await cache.set("k1", 1);
    await cache.close();
    expect(cache.size).toBe(0);
  });
});
