/**
 * Trust-aware memory retrieval with multi-dimensional ranking.
 *
 * Ranks candidate memories by trust, recency, relevance, and type
 * to produce a sorted, filtered list for context injection.
 *
 * @module autonomy/memory/retriever
 */

import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import {
  DEFAULT_RETRIEVAL_CONFIG,
  type AutonomyRetrievalConfig,
} from "../config.js";
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
  trustOverridePolicy?: {
    actor?: string;
    source?: "system" | "api" | "user" | "plugin";
    approvedBy?: string;
    reason?: string;
    requestId?: string;
  };
  memoryTypes?: MemoryType[];
  tableName?: string;
  /**
   * Optional canonical entity ID for cross-platform retrieval.
   * When provided, the retriever executes two-phase retrieval:
   *   Phase 1: Room-scoped short-term memories (existing behavior)
   *   Phase 2: Entity-scoped mid-term + long-term memories
   * Results are merged, deduplicated, and ranked through the same scoring pipeline.
   */
  canonicalEntityId?: string;
}

/**
 * Provider for entity-scoped memories (mid-term + long-term).
 * Injected into the retriever to decouple from the specific store implementation.
 */
export interface EntityMemoryProvider {
  /** Fetch entity-scoped memories for a canonical entity. */
  getEntityMemories(
    canonicalEntityId: string,
    opts?: {
      tiers?: Array<"mid-term" | "long-term">;
      memoryTypes?: MemoryType[];
      limit?: number;
    },
  ): Promise<Memory[]>;
  /** Semantic search across entity memories. */
  searchEntityMemories?(
    canonicalEntityId: string,
    embedding: number[],
    opts?: { limit?: number; matchThreshold?: number },
  ): Promise<Memory[]>;
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

export interface TrustOverrideAuditRecord {
  roomId: UUID;
  requestId?: string;
  source: "system" | "api" | "user" | "plugin";
  actor: string;
  requestedOverride: number;
  appliedOverride: number | null;
  decision: "applied" | "clamped" | "rejected";
  highRisk: boolean;
  approvedBy?: string;
  reason?: string;
  violations: string[];
  timestamp: number;
}

export interface RetrievalRankGuardrailRecord {
  adjustments: string[];
  weights: {
    trustWeight: number;
    recencyWeight: number;
    relevanceWeight: number;
    typeWeight: number;
  };
  maxResults: number;
  minTrustThreshold: number;
  timestamp: number;
}

// ---------- Constants ----------

const DEFAULT_TYPE_BOOSTS: Record<MemoryType, number> = {
  instruction: 1.0,
  system: 1.0,
  fact: 0.9,
  document: 0.85,
  goal: 0.85,
  task: 0.85,
  action: 0.8,
  preference: 0.8,
  relationship: 0.75,
  message: 0.6,
  observation: 0.6,
};

/** Exponential decay half-life in milliseconds (24 hours). */
const RECENCY_HALF_LIFE_MS = 24 * 60 * 60 * 1000;
const TRUST_OVERRIDE_APPROVAL_THRESHOLD = 0.9;
const RETRIEVAL_MAX_RESULTS_GUARDRAIL = 200;
const RETRIEVAL_MIN_WEIGHT_GUARDRAIL = 0.05;
const RETRIEVAL_MAX_WEIGHT_GUARDRAIL = 0.8;
const TYPE_BOOST_MIN_GUARDRAIL = 0;
const TYPE_BOOST_MAX_GUARDRAIL = 2;
const NON_PERSON_ACTORS = new Set([
  "",
  "anonymous",
  "unknown",
  "bypass",
  "non-autonomy",
]);

// ---------- Implementation ----------

export class TrustAwareRetrieverImpl implements TrustAwareRetriever {
  private readonly config: Required<AutonomyRetrievalConfig>;
  private readonly scorer: TrustScorer | null;
  private readonly eventBus: { emit: (event: string, payload: unknown) => void } | null;
  private readonly entityMemoryProvider: EntityMemoryProvider | null;

  constructor(
    config: Required<AutonomyRetrievalConfig>,
    scorer?: TrustScorer | null,
    eventBus?: { emit: (event: string, payload: unknown) => void } | null,
    entityMemoryProvider?: EntityMemoryProvider | null,
  ) {
    this.scorer = scorer ?? null;
    this.eventBus = eventBus ?? null;
    this.entityMemoryProvider = entityMemoryProvider ?? null;
    const guarded = this.applyRetrievalGuardrails(config);
    this.config = guarded.config;
    this.emitRankGuardrailAudit(guarded.adjustments);
  }

  async retrieve(
    runtime: IAgentRuntime,
    options: RetrievalOptions,
  ): Promise<RankedMemory[]> {
    const tableName = options.tableName ?? "memories";
    const maxResults = options.maxResults ?? this.config.maxResults;

    // Phase 1: Room-scoped short-term candidates (existing behavior)
    const candidates = await this.fetchCandidates(runtime, options, tableName);

    // Phase 2: Entity-scoped mid-term + long-term candidates (cross-platform)
    if (options.canonicalEntityId && this.entityMemoryProvider) {
      const entityCandidates = await this.fetchEntityCandidates(
        options.canonicalEntityId,
        options,
      );
      // Merge entity candidates into the candidate pool, deduplicating by content hash
      const seenContentHashes = new Set<string>();
      for (const m of candidates) {
        const hash = this.contentHash(m);
        if (hash) seenContentHashes.add(hash);
      }
      for (const m of entityCandidates) {
        const hash = this.contentHash(m);
        if (!hash || !seenContentHashes.has(hash)) {
          candidates.push(m);
          if (hash) seenContentHashes.add(hash);
        }
      }
    }

    const trustOverride = this.resolveTrustOverride(options);

    // Score each candidate through the same ranking pipeline
    const now = Date.now();
    const scored: RankedMemory[] = [];

    for (const memory of candidates) {
      const memoryType = this.inferMemoryType(memory);

      // Filter by requested memory types
      if (options.memoryTypes && options.memoryTypes.length > 0) {
        if (!options.memoryTypes.includes(memoryType)) continue;
      }

      const trustScore = this.computeTrustScore(memory, trustOverride);
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

    // Sort descending by rank score
    scored.sort((a, b) => b.rankScore - a.rankScore);

    // Trim to maxResults
    return scored.slice(0, maxResults);
  }

  // ---------- Private Helpers ----------

  private resolveTrustOverride(options: RetrievalOptions): number | undefined {
    if (options.trustOverride === undefined) return undefined;

    const requested = options.trustOverride;
    const clamped = Math.max(0, Math.min(1, requested));
    const policy = options.trustOverridePolicy;
    const source = policy?.source ?? "user";
    const actor = this.normalizeActor(policy?.actor, source);
    const approvedBy = this.normalizeOptionalText(policy?.approvedBy);
    const reason = this.normalizeOptionalText(policy?.reason);
    const highRisk = clamped >= TRUST_OVERRIDE_APPROVAL_THRESHOLD;
    const violations: string[] = [];

    if (source !== "system" && NON_PERSON_ACTORS.has(actor)) {
      violations.push(
        "a named actor is required for non-system trust overrides",
      );
    }

    if (source !== "system" && highRisk) {
      if (!approvedBy || NON_PERSON_ACTORS.has(approvedBy)) {
        violations.push(
          `approvedBy is required for trust overrides >= ${TRUST_OVERRIDE_APPROVAL_THRESHOLD.toFixed(2)}`,
        );
      } else if (approvedBy === actor) {
        violations.push("approvedBy must be different from actor");
      }
      if (!reason) {
        violations.push(
          `reason is required for trust overrides >= ${TRUST_OVERRIDE_APPROVAL_THRESHOLD.toFixed(2)}`,
        );
      }
    }

    const allowed = violations.length === 0;
    const decision: TrustOverrideAuditRecord["decision"] = !allowed
      ? "rejected"
      : clamped !== requested
        ? "clamped"
        : "applied";

    const appliedOverride = allowed ? clamped : null;
    this.emitTrustOverrideAudit({
      roomId: options.roomId,
      ...(policy?.requestId ? { requestId: policy.requestId } : {}),
      source,
      actor,
      requestedOverride: requested,
      appliedOverride,
      decision,
      highRisk,
      ...(approvedBy ? { approvedBy } : {}),
      ...(reason ? { reason } : {}),
      violations,
      timestamp: Date.now(),
    });

    return appliedOverride ?? undefined;
  }

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

  /**
   * Fetch entity-scoped memories (mid-term + long-term) for cross-platform retrieval.
   * Uses semantic search when an embedding is available, otherwise fetches by recency.
   */
  private async fetchEntityCandidates(
    canonicalEntityId: string,
    options: RetrievalOptions,
  ): Promise<Memory[]> {
    if (!this.entityMemoryProvider) return [];

    try {
      // Prefer semantic search if embedding is available and provider supports it
      if (
        options.embedding &&
        options.embedding.length > 0 &&
        this.entityMemoryProvider.searchEntityMemories
      ) {
        return await this.entityMemoryProvider.searchEntityMemories(
          canonicalEntityId,
          options.embedding,
          {
            limit: this.config.maxResults * 2,
            matchThreshold: 0.3,
          },
        );
      }

      // Fall back to recency-based fetch
      return await this.entityMemoryProvider.getEntityMemories(
        canonicalEntityId,
        {
          tiers: ["mid-term", "long-term"],
          memoryTypes: options.memoryTypes,
          limit: this.config.maxResults * 2,
        },
      );
    } catch {
      // Entity memory fetch failure is non-fatal — fall back to room-only retrieval
      return [];
    }
  }

  /**
   * Compute a content-based deduplication hash for a memory.
   * Uses the text content + optional metadata fingerprint to detect duplicates
   * across room-scoped and entity-scoped pools.
   */
  contentHash(memory: Memory): string | null {
    const text = (memory.content as { text?: string })?.text;
    if (!text || text.length === 0) return null;

    // Simple but effective: use first 200 chars of normalized text as hash key.
    // This catches exact duplicates and near-duplicates where only whitespace differs.
    const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
    const truncated = normalized.slice(0, 200);

    // Include memory type in hash to avoid collisions between different types
    // with the same text (e.g., a "fact" vs an "observation" with identical content).
    const meta = memory.metadata as Record<string, unknown> | undefined;
    const memType = (meta?.memoryType as string) ?? "";
    return `${memType}::${truncated}`;
  }

  private emitTrustOverrideAudit(record: TrustOverrideAuditRecord): void {
    if (!this.eventBus) return;
    try {
      this.eventBus.emit("autonomy:retrieval:trust-override", record);
    } catch {
      // Non-fatal: retrieval must still proceed even if audit emission fails.
    }
  }

  private normalizeOptionalText(value: string | undefined): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private emitRankGuardrailAudit(adjustments: string[]): void {
    if (!this.eventBus || adjustments.length === 0) return;
    const record: RetrievalRankGuardrailRecord = {
      adjustments,
      weights: this.getRankingWeights(),
      maxResults: this.config.maxResults,
      minTrustThreshold: this.config.minTrustThreshold,
      timestamp: Date.now(),
    };
    try {
      this.eventBus.emit("autonomy:retrieval:rank-guardrail", record);
    } catch {
      // Non-fatal: retrieval guardrail auditing must not block startup.
    }
  }

  private applyRetrievalGuardrails(
    rawConfig: Required<AutonomyRetrievalConfig>,
  ): {
    config: Required<AutonomyRetrievalConfig>;
    adjustments: string[];
  } {
    const adjustments: string[] = [];
    const config: Required<AutonomyRetrievalConfig> = {
      ...rawConfig,
      typeBoosts: { ...(rawConfig.typeBoosts ?? {}) },
    };

    const rawMaxResults = Number.isFinite(config.maxResults)
      ? Math.floor(config.maxResults)
      : DEFAULT_RETRIEVAL_CONFIG.maxResults;
    const guardedMaxResults = Math.max(
      1,
      Math.min(RETRIEVAL_MAX_RESULTS_GUARDRAIL, rawMaxResults),
    );
    if (guardedMaxResults !== config.maxResults) {
      adjustments.push(
        `maxResults clamped to ${guardedMaxResults} (requested ${config.maxResults})`,
      );
      config.maxResults = guardedMaxResults;
    }

    const guardedMinTrust = Math.max(
      0,
      Math.min(1, config.minTrustThreshold),
    );
    if (guardedMinTrust !== config.minTrustThreshold) {
      adjustments.push(
        `minTrustThreshold clamped to ${guardedMinTrust.toFixed(3)} (requested ${config.minTrustThreshold})`,
      );
      config.minTrustThreshold = guardedMinTrust;
    }

    const normalizedTypeBoosts: Record<string, number> = {};
    for (const [key, value] of Object.entries(config.typeBoosts ?? {})) {
      if (!Number.isFinite(value)) {
        adjustments.push(`typeBoosts.${key} dropped due to non-finite value`);
        continue;
      }
      const guarded = Math.max(
        TYPE_BOOST_MIN_GUARDRAIL,
        Math.min(TYPE_BOOST_MAX_GUARDRAIL, value),
      );
      if (guarded !== value) {
        adjustments.push(
          `typeBoosts.${key} clamped to ${guarded.toFixed(3)} (requested ${value})`,
        );
      }
      normalizedTypeBoosts[key] = guarded;
    }
    config.typeBoosts = normalizedTypeBoosts;

    const rawWeights = {
      trustWeight: config.trustWeight,
      recencyWeight: config.recencyWeight,
      relevanceWeight: config.relevanceWeight,
      typeWeight: config.typeWeight,
    };
    const invalidRawWeight = Object.values(rawWeights).some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1,
    );
    if (invalidRawWeight) {
      adjustments.push("retrieval weights invalid; reverted to defaults");
      config.trustWeight = DEFAULT_RETRIEVAL_CONFIG.trustWeight;
      config.recencyWeight = DEFAULT_RETRIEVAL_CONFIG.recencyWeight;
      config.relevanceWeight = DEFAULT_RETRIEVAL_CONFIG.relevanceWeight;
      config.typeWeight = DEFAULT_RETRIEVAL_CONFIG.typeWeight;
      return { config, adjustments };
    }

    const sum =
      rawWeights.trustWeight +
      rawWeights.recencyWeight +
      rawWeights.relevanceWeight +
      rawWeights.typeWeight;
    if (sum <= 0) {
      adjustments.push("retrieval weights sum to zero; reverted to defaults");
      config.trustWeight = DEFAULT_RETRIEVAL_CONFIG.trustWeight;
      config.recencyWeight = DEFAULT_RETRIEVAL_CONFIG.recencyWeight;
      config.relevanceWeight = DEFAULT_RETRIEVAL_CONFIG.relevanceWeight;
      config.typeWeight = DEFAULT_RETRIEVAL_CONFIG.typeWeight;
      return { config, adjustments };
    }

    const normalized = {
      trustWeight: rawWeights.trustWeight / sum,
      recencyWeight: rawWeights.recencyWeight / sum,
      relevanceWeight: rawWeights.relevanceWeight / sum,
      typeWeight: rawWeights.typeWeight / sum,
    };
    const outOfGuardrailBand = Object.values(normalized).some(
      (value) =>
        value < RETRIEVAL_MIN_WEIGHT_GUARDRAIL ||
        value > RETRIEVAL_MAX_WEIGHT_GUARDRAIL,
    );
    if (outOfGuardrailBand) {
      adjustments.push(
        `retrieval weights violate guardrail band [${RETRIEVAL_MIN_WEIGHT_GUARDRAIL.toFixed(2)}, ${RETRIEVAL_MAX_WEIGHT_GUARDRAIL.toFixed(2)}]; reverted to defaults`,
      );
      config.trustWeight = DEFAULT_RETRIEVAL_CONFIG.trustWeight;
      config.recencyWeight = DEFAULT_RETRIEVAL_CONFIG.recencyWeight;
      config.relevanceWeight = DEFAULT_RETRIEVAL_CONFIG.relevanceWeight;
      config.typeWeight = DEFAULT_RETRIEVAL_CONFIG.typeWeight;
      return { config, adjustments };
    }

    if (Math.abs(sum - 1) > 0.0001) {
      adjustments.push("retrieval weights normalized to sum to 1.0");
    }
    config.trustWeight = normalized.trustWeight;
    config.recencyWeight = normalized.recencyWeight;
    config.relevanceWeight = normalized.relevanceWeight;
    config.typeWeight = normalized.typeWeight;
    return { config, adjustments };
  }

  private normalizeActor(
    value: string | undefined,
    source: TrustOverrideAuditRecord["source"],
  ): string {
    const actor = this.normalizeOptionalText(value);
    if (actor) return actor;
    return source === "system" ? "system" : "unknown";
  }

  getRankingWeights(): {
    trustWeight: number;
    recencyWeight: number;
    relevanceWeight: number;
    typeWeight: number;
  } {
    return {
      trustWeight: this.config.trustWeight,
      recencyWeight: this.config.recencyWeight,
      relevanceWeight: this.config.relevanceWeight,
      typeWeight: this.config.typeWeight,
    };
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
      const valid: MemoryType[] = [
        "message",
        "fact",
        "document",
        "relationship",
        "goal",
        "task",
        "action",
        "instruction",
        "preference",
        "observation",
        "system",
      ];
      if (valid.includes(meta.memoryType as MemoryType)) {
        return meta.memoryType as MemoryType;
      }
    }

    // Content-based heuristics
    const text = (memory.content as { text?: string })?.text?.toLowerCase() ?? "";
    if (text.includes("task") || text.includes("todo") || text.includes("to-do")) {
      return "task";
    }
    if (text.includes("action") || text.includes("executed") || text.includes("performed")) {
      return "action";
    }
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
