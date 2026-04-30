/**
 * In-memory vector store — brute-force similarity search for development/testing.
 *
 * @module autonomy/adapters/vector/in-memory-vector-store
 */

import type { VectorStore, VectorDocument, VectorSearchResult, InMemoryVectorConfig } from "./types.js";

type DistanceFn = (a: number[], b: number[]) => number;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function euclideanSimilarity(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  // Convert distance to similarity (0-1 range)
  return 1 / (1 + Math.sqrt(sum));
}

function dotProductSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * In-memory vector store using brute-force linear search.
 * Suitable for small datasets and testing.
 */
export class InMemoryVectorStore implements VectorStore {
  private readonly store = new Map<string, VectorDocument>();
  private readonly similarity: DistanceFn;

  constructor(config: InMemoryVectorConfig = {}) {
    switch (config.metric ?? "cosine") {
      case "euclidean":
        this.similarity = euclideanSimilarity;
        break;
      case "dot":
        this.similarity = dotProductSimilarity;
        break;
      default:
        this.similarity = cosineSimilarity;
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      this.store.set(doc.id, doc);
    }
  }

  async search(vector: number[], topK: number): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];
    for (const doc of this.store.values()) {
      if (doc.vector.length !== vector.length) continue;
      const score = this.similarity(vector, doc.vector);
      results.push({ document: doc, score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.store.delete(id);
    }
  }

  async get(id: string): Promise<VectorDocument | undefined> {
    return this.store.get(id);
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}
