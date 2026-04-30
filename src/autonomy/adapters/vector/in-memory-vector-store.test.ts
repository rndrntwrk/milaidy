/**
 * Tests for InMemoryVectorStore.
 */

import { describe, expect, it } from "vitest";
import { InMemoryVectorStore } from "./in-memory-vector-store.js";

describe("InMemoryVectorStore", () => {
  it("upserts and retrieves documents", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([{ id: "d1", vector: [1, 0, 0], content: "hello" }]);
    const doc = await store.get("d1");
    expect(doc).toBeDefined();
    expect(doc!.content).toBe("hello");
  });

  it("returns undefined for missing documents", async () => {
    const store = new InMemoryVectorStore();
    expect(await store.get("nope")).toBeUndefined();
  });

  it("counts documents", async () => {
    const store = new InMemoryVectorStore();
    expect(await store.count()).toBe(0);
    await store.upsert([
      { id: "a", vector: [1, 0] },
      { id: "b", vector: [0, 1] },
    ]);
    expect(await store.count()).toBe(2);
  });

  it("deletes documents", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([
      { id: "a", vector: [1, 0] },
      { id: "b", vector: [0, 1] },
    ]);
    await store.delete(["a"]);
    expect(await store.count()).toBe(1);
    expect(await store.get("a")).toBeUndefined();
  });

  it("updates existing documents on upsert", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([{ id: "d1", vector: [1, 0], content: "v1" }]);
    await store.upsert([{ id: "d1", vector: [0, 1], content: "v2" }]);
    const doc = await store.get("d1");
    expect(doc!.content).toBe("v2");
    expect(doc!.vector).toEqual([0, 1]);
    expect(await store.count()).toBe(1);
  });

  it("searches by cosine similarity (default)", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([
      { id: "a", vector: [1, 0, 0] },
      { id: "b", vector: [0, 1, 0] },
      { id: "c", vector: [0.9, 0.1, 0] },
    ]);
    const results = await store.search([1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0].document.id).toBe("a");
    expect(results[0].score).toBeCloseTo(1.0);
    expect(results[1].document.id).toBe("c");
    expect(results[1].score).toBeGreaterThan(0.9);
  });

  it("searches by euclidean similarity", async () => {
    const store = new InMemoryVectorStore({ metric: "euclidean" });
    await store.upsert([
      { id: "near", vector: [1.1, 0.1] },
      { id: "far", vector: [10, 10] },
    ]);
    const results = await store.search([1, 0], 2);
    expect(results[0].document.id).toBe("near");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("searches by dot product similarity", async () => {
    const store = new InMemoryVectorStore({ metric: "dot" });
    await store.upsert([
      { id: "high", vector: [3, 3] },
      { id: "low", vector: [0.1, 0.1] },
    ]);
    const results = await store.search([1, 1], 2);
    expect(results[0].document.id).toBe("high");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("respects topK limit", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([
      { id: "a", vector: [1, 0] },
      { id: "b", vector: [0.9, 0.1] },
      { id: "c", vector: [0.8, 0.2] },
    ]);
    const results = await store.search([1, 0], 1);
    expect(results).toHaveLength(1);
  });

  it("skips documents with mismatched vector dimensions", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([
      { id: "a", vector: [1, 0, 0] },
      { id: "b", vector: [1, 0] }, // different dimension
    ]);
    const results = await store.search([1, 0, 0], 10);
    expect(results).toHaveLength(1);
    expect(results[0].document.id).toBe("a");
  });

  it("close clears the store", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([{ id: "a", vector: [1, 0] }]);
    await store.close();
    expect(await store.count()).toBe(0);
  });
});
