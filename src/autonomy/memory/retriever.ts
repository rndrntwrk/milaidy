/**
 * Trust-aware memory retrieval with multi-dimensional ranking.
 *
 * Ranks candidate memories by trust, recency, relevance, and type
 * to produce a sorted, filtered list for context injection.
 *
 * @module autonomy/memory/retriever
 */

import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import type { AutonomyRetrievalConfig } from "../config.js";
import type { MemoryType } from "../types.js";
import type { TrustScorer } from "../trust/scorer.js";

// ---------- Types ----------

/** Options for a retrieval request. */
export interface RetrievalOptions {
  roomId: UUID;
  query?: string;
  embedding?: number[];
  maxResults?: number;
  trustOverride?: number;
  memoryTypes?: MemoryType[];
  tableName?: string;
}

/** A memory with computed ranking scores. */
export interface RankedMemory {
  memory: Memory;
  rankScore: number;
  trustScore: number;
  recencyScore: number;
  relevanceScore: number;
  typeBoost: number;
  memoryType: MemoryType;
}

/** Interface for trust-aware memory retrieval. */
export interface TrustAwareRetriever {
  retrieve(runtime: IAgentRuntime, options: RetrievalOptions): Promise<RankedMemory[]>;
}

// ---------- Constants ----------

const DEFAULT_TYPE_BOOSTS: Record<MemoryType, number> = {
  instruction: 1.0,
  system: 1.0,
  fact: 0.9,
  goal: 0.85,
  preference: 0.8,
  observation: 0.6,
};

/** Exponential decay half-life in milliseconds (24 hours). */
const RECENCY_HALF_LIFE_MS = 24 * 60 * 60 * 1000;

// ---------- Implementation ----------

export class TrustAwareRetrieverImpl implements TrustAwareRetriever {
  private readonly config: Required<AutonomyRetrievalConfig>;
  private readonly scorer: TrustScorer | null;

  constructor(config: Required<AutonomyRetrievalConfig>, scorer?: TrustScorer | null) {
    this.config = config;
    this.scorer = scorer ?? null;
  }

  async retrieve(
    runtime: IAgentRuntime,
    options: RetrievalOptions,
  ): Promise<RankedMemory[]> {
    const tableName = options.tableName ?? "memories";
    const maxResults = options.maxResults ?? this.config.maxResults;

    // 1. Fetch candidates (time-ordered + semantic)
    const candidates = await this.fetchCandidates(runtime, options, tableName);

    // 2. Score each candidate
    const now = Date.now();
    const scored: RankedMemory[] = [];

    for (const memory of candidates) {
      const memoryType = this.inferMemoryType(memory);

      // Filter by requested memory types
      if (options.memoryTypes && options.memoryTypes.length > 0) {
        if (!options.memoryTypes.includes(memoryType)) continue;
      }

      const trustScore = this.computeTrustScore(memory, options.trustOverride);
      const recencyScore = this.computeRecencyScore(memory, now);
      const relevanceScore = this.computeRelevanceScore(memory);
      const typeBoost = this.getTypeBoost(memoryType);

      // Filter below minimum trust threshold
      if (trustScore < this.config.minTrustThreshold) continue;

      const rankScore =
        this.config.trustWeight * trustScore +
        this.config.recencyWeight * recencyScore +
        this.config.relevanceWeight * relevanceScore +
        this.config.typeWeight * typeBoost;

      scored.push({
        memory,
        rankScore,
        trustScore,
        recencyScore,
        relevanceScore,
        typeBoost,
        memoryType,
      });
    }

    // 3. Sort descending by rank score
    scored.sort((a, b) => b.rankScore - a.rankScore);

    // 4. Trim to maxResults
    return scored.slice(0, maxResults);
  }

  // ---------- Private Helpers ----------

  private async fetchCandidates(
    runtime: IAgentRuntime,
    options: RetrievalOptions,
    tableName: string,
  ): Promise<Memory[]> {
    const seen = new Set<string>();
    const results: Memory[] = [];

    // Time-ordered memories
    try {
      const timeMemories = await runtime.getMemories({
        roomId: options.roomId,
        tableName,
        count: this.config.maxResults * 3, // over-fetch for filtering
      });
      for (const m of timeMemories) {
        const id = m.id ?? "";
        if (id && !seen.has(id)) {
          seen.add(id);
          results.push(m);
        }
      }
    } catch {
      // getMemories unavailable — continue with semantic only
    }

    // Semantic search (if embedding provided)
    if (options.embedding && options.embedding.length > 0) {
      try {
        const semanticMemories = await runtime.searchMemories({
          embedding: options.embedding,
          tableName,
          roomId: options.roomId,
          count: this.config.maxResults * 2,
          match_threshold: 0.3,
        });
        for (const m of semanticMemories) {
          const id = m.id ?? "";
          if (id && !seen.has(id)) {
            seen.add(id);
            results.push(m);
          }
        }
      } catch {
        // searchMemories unavailable — continue with time-ordered only
      }
    }

    return results;
  }

  /** Compute trust score for a memory. */
  computeTrustScore(memory: Memory, trustOverride?: number): number {
    if (trustOverride !== undefined) return Math.max(0, Math.min(1, trustOverride));

    // Check metadata for trust score (set by memory gate)
    const meta = memory.metadata as Record<string, unknown> | undefined;
    if (meta?.trustScore !== undefined && typeof meta.trustScore === "number") {
      return meta.trustScore;
    }

    // Fall back to source trust from scorer
    if (this.scorer && meta?.source && typeof meta.source === "string") {
      return this.scorer.getSourceTrust(meta.source);
    }

    // Default trust
    return 0.5;
  }

  /** Compute recency score using exponential decay. */
  computeRecencyScore(memory: Memory, now: number): number {
    const createdAt = memory.createdAt ?? 0;
    if (createdAt <= 0) return 0.5;

    const ageMs = Math.max(0, now - createdAt);
    return Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS);
  }

  /** Compute relevance score from search similarity metadata. */
  computeRelevanceScore(memory: Memory): number {
    const meta = memory.metadata as Record<string, unknown> | undefined;
    if (meta?.similarity !== undefined && typeof meta.similarity === "number") {
      return meta.similarity;
    }
    return 0.5;
  }

  /** Infer memory type from metadata or content heuristics. */
  inferMemoryType(memory: Memory): MemoryType {
    const meta = memory.metadata as Record<string, unknown> | undefined;

    // Explicit type in metadata
    if (meta?.memoryType && typeof meta.memoryType === "string") {
      const valid: MemoryType[] = ["fact", "instruction", "preference", "observation", "goal", "system"];
      if (valid.includes(meta.memoryType as MemoryType)) {
        return meta.memoryType as MemoryType;
      }
    }

    // Content-based heuristics
    const text = (memory.content as { text?: string })?.text?.toLowerCase() ?? "";
    if (text.includes("always") || text.includes("never") || text.includes("must")) {
      return "instruction";
    }
    if (text.includes("goal") || text.includes("objective") || text.includes("target")) {
      return "goal";
    }
    if (text.includes("prefer") || text.includes("like") || text.includes("want")) {
      return "preference";
    }

    return "observation";
  }

  /** Get the type boost multiplier for a memory type. */
  getTypeBoost(memoryType: MemoryType): number {
    // Check user-configured boosts first
    const userBoost = this.config.typeBoosts?.[memoryType];
    if (userBoost !== undefined) return userBoost;

    return DEFAULT_TYPE_BOOSTS[memoryType] ?? 0.5;
  }
}
