/**
 * Entity-scoped memory store with tiered storage and TTL management.
 *
 * Provides CRUD for entity memories (mid-term and long-term tiers)
 * and implements the EntityMemoryProvider interface for the retriever.
 *
 * @module autonomy/memory/entity-memory-store
 */

import type { Memory, UUID } from "@elizaos/core";
import type { MemoryType } from "../types.js";
import type { EntityMemoryProvider } from "./retriever.js";

// ---------- Types ----------

export type MemoryTier = "mid-term" | "long-term";

export interface EntityMemory {
  id: string;
  canonicalEntityId: string;
  tier: MemoryTier;
  memoryType: MemoryType;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  trustScore: number;
  provenance: {
    sourcePlatform: string;
    sourceRoomId: string;
    createdBy: string;
    promotedFrom?: MemoryTier;
    promotedAt?: number;
  };
  embedding?: number[];
  expiresAt: number | null; // epoch ms; null = permanent (long-term)
  sessionCount: number;
  superseded: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EntityMemoryInput {
  canonicalEntityId: string;
  tier: MemoryTier;
  memoryType: MemoryType;
  content: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  trustScore: number;
  provenance: EntityMemory["provenance"];
  embedding?: number[];
  expiresAt?: number | null;
}

export interface EntityMemoryQuery {
  canonicalEntityId: string;
  tiers?: MemoryTier[];
  memoryTypes?: MemoryType[];
  includeSuperseded?: boolean;
  includeExpired?: boolean;
  limit?: number;
}

// ---------- Constants ----------

/** Default TTL for mid-term memories: 30 days. */
export const MID_TERM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ---------- Interface ----------

export interface EntityMemoryStore extends EntityMemoryProvider {
  /** Insert a new entity memory. */
  insert(input: EntityMemoryInput): Promise<EntityMemory>;

  /** Get a memory by ID. */
  getById(id: string): Promise<EntityMemory | null>;

  /** Query entity memories with filters. */
  query(q: EntityMemoryQuery): Promise<EntityMemory[]>;

  /** Increment the session count for a memory. */
  bumpSessionCount(id: string): Promise<void>;

  /** Mark a memory as superseded (replaced by a newer version). */
  markSuperseded(id: string): Promise<void>;

  /** Promote a memory to a new tier. */
  promoteTier(id: string, newTier: MemoryTier): Promise<EntityMemory>;

  /** Delete expired mid-term memories. Returns count of deleted entries. */
  purgeExpired(now?: number): Promise<number>;

  /** Count memories for an entity, optionally filtered by tier. */
  count(canonicalEntityId: string, tier?: MemoryTier): Promise<number>;
}

// ---------- In-Memory Implementation ----------

export class InMemoryEntityMemoryStore implements EntityMemoryStore {
  private memories = new Map<string, EntityMemory>();

  async insert(input: EntityMemoryInput): Promise<EntityMemory> {
    const now = Date.now();
    const id = crypto.randomUUID();

    let expiresAt = input.expiresAt;
    if (expiresAt === undefined) {
      expiresAt = input.tier === "mid-term" ? now + MID_TERM_TTL_MS : null;
    }

    const memory: EntityMemory = {
      id,
      canonicalEntityId: input.canonicalEntityId,
      tier: input.tier,
      memoryType: input.memoryType,
      content: input.content,
      metadata: input.metadata ?? {},
      trustScore: input.trustScore,
      provenance: input.provenance,
      embedding: input.embedding,
      expiresAt,
      sessionCount: 1,
      superseded: false,
      createdAt: now,
      updatedAt: now,
    };

    this.memories.set(id, memory);
    return memory;
  }

  async getById(id: string): Promise<EntityMemory | null> {
    return this.memories.get(id) ?? null;
  }

  async query(q: EntityMemoryQuery): Promise<EntityMemory[]> {
    const now = Date.now();
    let results = Array.from(this.memories.values()).filter(
      (m) => m.canonicalEntityId === q.canonicalEntityId,
    );

    if (q.tiers && q.tiers.length > 0) {
      results = results.filter((m) => q.tiers!.includes(m.tier));
    }

    if (q.memoryTypes && q.memoryTypes.length > 0) {
      results = results.filter((m) =>
        q.memoryTypes!.includes(m.memoryType),
      );
    }

    if (!q.includeSuperseded) {
      results = results.filter((m) => !m.superseded);
    }

    if (!q.includeExpired) {
      results = results.filter(
        (m) => m.expiresAt === null || m.expiresAt > now,
      );
    }

    // Sort by createdAt descending (newest first)
    results.sort((a, b) => b.createdAt - a.createdAt);

    if (q.limit && q.limit > 0) {
      results = results.slice(0, q.limit);
    }

    return results;
  }

  async bumpSessionCount(id: string): Promise<void> {
    const m = this.memories.get(id);
    if (m) {
      m.sessionCount += 1;
      m.updatedAt = Date.now();
    }
  }

  async markSuperseded(id: string): Promise<void> {
    const m = this.memories.get(id);
    if (m) {
      m.superseded = true;
      m.updatedAt = Date.now();
    }
  }

  async promoteTier(id: string, newTier: MemoryTier): Promise<EntityMemory> {
    const m = this.memories.get(id);
    if (!m) throw new Error(`Entity memory ${id} not found`);

    const now = Date.now();
    m.provenance.promotedFrom = m.tier;
    m.provenance.promotedAt = now;
    m.tier = newTier;
    m.expiresAt = newTier === "long-term" ? null : m.expiresAt;
    m.updatedAt = now;

    return m;
  }

  async purgeExpired(now?: number): Promise<number> {
    const cutoff = now ?? Date.now();
    let count = 0;

    for (const [id, m] of this.memories) {
      if (m.expiresAt !== null && m.expiresAt <= cutoff) {
        this.memories.delete(id);
        count++;
      }
    }

    return count;
  }

  async count(canonicalEntityId: string, tier?: MemoryTier): Promise<number> {
    let count = 0;
    for (const m of this.memories.values()) {
      if (m.canonicalEntityId !== canonicalEntityId) continue;
      if (m.superseded) continue;
      if (tier && m.tier !== tier) continue;
      count++;
    }
    return count;
  }

  // ---------- EntityMemoryProvider (retriever interface) ----------

  async getEntityMemories(
    canonicalEntityId: string,
    opts?: {
      tiers?: Array<"mid-term" | "long-term">;
      memoryTypes?: MemoryType[];
      limit?: number;
    },
  ): Promise<Memory[]> {
    const results = await this.query({
      canonicalEntityId,
      tiers: opts?.tiers,
      memoryTypes: opts?.memoryTypes,
      limit: opts?.limit,
    });

    return results.map((em) => this.toElizaMemory(em));
  }

  async searchEntityMemories(
    canonicalEntityId: string,
    embedding: number[],
    opts?: { limit?: number; matchThreshold?: number },
  ): Promise<Memory[]> {
    // Simple cosine similarity search over stored embeddings
    const all = await this.query({
      canonicalEntityId,
      limit: (opts?.limit ?? 20) * 3, // over-fetch, then rank
    });

    const threshold = opts?.matchThreshold ?? 0.3;
    const withScores = all
      .filter((m) => m.embedding && m.embedding.length === embedding.length)
      .map((m) => ({
        memory: m,
        similarity: cosineSimilarity(embedding, m.embedding!),
      }))
      .filter((s) => s.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, opts?.limit ?? 20);

    return withScores.map((s) => {
      const elizaMemory = this.toElizaMemory(s.memory);
      (elizaMemory.metadata as Record<string, unknown>).similarity =
        s.similarity;
      return elizaMemory;
    });
  }

  // ---------- Helpers ----------

  private toElizaMemory(em: EntityMemory): Memory {
    return {
      id: em.id as UUID,
      entityId: em.canonicalEntityId as UUID,
      roomId: (em.provenance.sourceRoomId ?? em.canonicalEntityId) as UUID,
      content: em.content as Memory["content"],
      metadata: {
        type: "entity_memory",
        memoryType: em.memoryType,
        memoryTier: em.tier,
        trustScore: em.trustScore,
        sourcePlatform: em.provenance.sourcePlatform,
        sourceRoomId: em.provenance.sourceRoomId,
        sessionCount: em.sessionCount,
        ...(em.metadata ?? {}),
      } as unknown as Memory["metadata"],
      createdAt: em.createdAt,
    } as Memory;
  }
}

// ---------- Utility ----------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}
