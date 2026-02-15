/**
 * Memory Gate — controls what gets written to agent memory.
 *
 * Intercepts memory writes, evaluates trust, and routes to:
 * - Allow: write to persistent memory with provenance
 * - Quarantine: hold for review
 * - Reject: discard with audit log
 *
 * @module autonomy/memory/gate
 */

import { logger } from "@elizaos/core";
import type { Memory } from "@elizaos/core";
import type { AutonomyMemoryGateConfig, AutonomyTrustConfig } from "../config.js";
import type { TrustScore, TrustSource, MemoryType, MemoryProvenance } from "../types.js";
import type { TrustScorer } from "../trust/scorer.js";

/**
 * A memory object enriched with trust and provenance metadata.
 */
export interface TypedMemoryObject extends Memory {
  /** Trust score at write time. */
  trustScore: number;
  /** Provenance chain. */
  provenance: MemoryProvenance;
  /** Memory classification. */
  memoryType: MemoryType;
  /** Whether this memory has been verified. */
  verified: boolean;
}

/**
 * Decision made by the memory gate.
 */
export interface MemoryGateDecision {
  action: "allow" | "quarantine" | "reject";
  trustScore: TrustScore;
  reason: string;
  /** If quarantined, when to auto-review (ms from now). */
  reviewAfterMs?: number;
}

/**
 * Interface for the memory gate.
 */
export interface MemoryGate {
  /** Evaluate whether a memory write should proceed. */
  evaluate(memory: Memory, source: TrustSource): Promise<MemoryGateDecision>;
  /** Get all quarantined memories pending review. */
  getQuarantined(): Promise<TypedMemoryObject[]>;
  /** Approve or reject a quarantined memory. Returns the memory if approved. */
  reviewQuarantined(memoryId: string, decision: "approve" | "reject"): Promise<TypedMemoryObject | null>;
  /** Get gate statistics. */
  getStats(): MemoryGateStats;
}

/** Maximum content size (bytes) accepted by the gate to prevent OOM/ReDoS. */
const MAX_CONTENT_SIZE = 1_000_000; // 1MB

/**
 * Gate statistics.
 */
export interface MemoryGateStats {
  allowed: number;
  quarantined: number;
  rejected: number;
  /** Currently in quarantine buffer. */
  pendingReview: number;
}

// ---------- Implementation ----------

/**
 * In-memory implementation of the Memory Gate.
 *
 * Uses a TrustScorer to evaluate incoming memory writes and routes
 * them based on configurable trust thresholds.
 */
export class MemoryGateImpl implements MemoryGate {
  private scorer: TrustScorer;
  private trustConfig: Required<AutonomyTrustConfig>;
  private gateConfig: Required<AutonomyMemoryGateConfig>;

  /** Quarantined memories awaiting review. */
  private quarantineBuffer = new Map<string, TypedMemoryObject>();
  /** Quarantine expiry timers. */
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Counters for gate statistics. */
  private stats: MemoryGateStats = {
    allowed: 0,
    quarantined: 0,
    rejected: 0,
    pendingReview: 0,
  };

  /** Callback for when quarantined items expire. */
  private onExpiry?: (memory: TypedMemoryObject) => void;

  constructor(
    scorer: TrustScorer,
    trustConfig?: Partial<AutonomyTrustConfig>,
    gateConfig?: Partial<AutonomyMemoryGateConfig>,
  ) {
    this.scorer = scorer;
    this.trustConfig = {
      writeThreshold: trustConfig?.writeThreshold ?? 0.7,
      quarantineThreshold: trustConfig?.quarantineThreshold ?? 0.3,
      llmAnalysis: trustConfig?.llmAnalysis ?? false,
      historyWindow: trustConfig?.historyWindow ?? 100,
    };
    this.gateConfig = {
      enabled: gateConfig?.enabled ?? true,
      quarantineReviewMs: gateConfig?.quarantineReviewMs ?? 3_600_000,
      maxQuarantineSize: gateConfig?.maxQuarantineSize ?? 1000,
    };
  }

  /**
   * Register a callback for when quarantined memories auto-expire.
   * Expired memories are rejected by default unless this callback
   * handles them differently.
   */
  onQuarantineExpiry(handler: (memory: TypedMemoryObject) => void): void {
    this.onExpiry = handler;
  }

  async evaluate(memory: Memory, source: TrustSource): Promise<MemoryGateDecision> {
    // If gate is disabled, allow but mark as unscored (no fabricated trust)
    if (!this.gateConfig.enabled) {
      return {
        action: "allow",
        trustScore: {
          score: -1, // Sentinel: -1 means "not evaluated"
          dimensions: {
            sourceReliability: -1,
            contentConsistency: -1,
            temporalCoherence: -1,
            instructionAlignment: -1,
          },
          reasoning: ["Memory gate disabled — content not evaluated"],
          computedAt: Date.now(),
        },
        reason: "Gate disabled — no trust evaluation performed",
      };
    }

    // Extract content text
    const contentText = typeof memory.content === "string"
      ? memory.content
      : memory.content?.text ?? JSON.stringify(memory.content);

    // Input size limit — reject oversized content to prevent OOM/ReDoS
    if (contentText.length > MAX_CONTENT_SIZE) {
      this.stats.rejected++;
      logger.warn(
        `[memory-gate] REJECT oversized content from ${source.id} ` +
        `(${contentText.length} bytes > ${MAX_CONTENT_SIZE} limit)`,
      );
      return {
        action: "reject",
        trustScore: {
          score: 0,
          dimensions: {
            sourceReliability: 0,
            contentConsistency: 0,
            temporalCoherence: 0,
            instructionAlignment: 0,
          },
          reasoning: [`Content too large: ${contentText.length} bytes exceeds ${MAX_CONTENT_SIZE} limit`],
          computedAt: Date.now(),
        },
        reason: `Content size ${contentText.length} exceeds maximum ${MAX_CONTENT_SIZE}`,
      };
    }

    const trustScore = await this.scorer.score(contentText, source, {
      agentId: memory.agentId ?? "unknown",
    });

    // Route based on trust thresholds
    if (trustScore.score >= this.trustConfig.writeThreshold) {
      this.stats.allowed++;
      logger.debug(
        `[memory-gate] ALLOW memory from ${source.id} (trust=${trustScore.score.toFixed(3)})`,
      );
      return {
        action: "allow",
        trustScore,
        reason: `Trust ${trustScore.score.toFixed(3)} >= write threshold ${this.trustConfig.writeThreshold}`,
      };
    }

    if (trustScore.score >= this.trustConfig.quarantineThreshold) {
      // Quarantine: hold for review
      // Always generate a new UUID for quarantine to prevent ID collision replacement attacks
      const memoryId = crypto.randomUUID();
      const typed = this.createTypedMemory(memory, memoryId, trustScore, source);

      this.addToQuarantine(memoryId, typed);
      this.stats.quarantined++;

      logger.info(
        `[memory-gate] QUARANTINE memory ${memoryId} from ${source.id} ` +
        `(trust=${trustScore.score.toFixed(3)})`,
      );

      return {
        action: "quarantine",
        trustScore,
        reason: `Trust ${trustScore.score.toFixed(3)} between quarantine (${this.trustConfig.quarantineThreshold}) and write (${this.trustConfig.writeThreshold}) thresholds`,
        reviewAfterMs: this.gateConfig.quarantineReviewMs,
      };
    }

    // Reject: trust too low
    this.stats.rejected++;
    logger.warn(
      `[memory-gate] REJECT memory from ${source.id} ` +
      `(trust=${trustScore.score.toFixed(3)}): ${trustScore.reasoning.join("; ")}`,
    );

    return {
      action: "reject",
      trustScore,
      reason: `Trust ${trustScore.score.toFixed(3)} < quarantine threshold ${this.trustConfig.quarantineThreshold}`,
    };
  }

  async getQuarantined(): Promise<TypedMemoryObject[]> {
    return Array.from(this.quarantineBuffer.values());
  }

  async reviewQuarantined(
    memoryId: string,
    decision: "approve" | "reject",
  ): Promise<TypedMemoryObject | null> {
    const memory = this.quarantineBuffer.get(memoryId);
    if (!memory) {
      throw new Error(`Memory ${memoryId} not found in quarantine`);
    }

    // Clear expiry timer
    const timer = this.expiryTimers.get(memoryId);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(memoryId);
    }

    this.quarantineBuffer.delete(memoryId);
    this.stats.pendingReview = this.quarantineBuffer.size;

    if (decision === "approve") {
      memory.verified = true;
      this.stats.allowed++;
      logger.info(`[memory-gate] Quarantined memory ${memoryId} APPROVED`);
      return memory; // Return approved memory so caller can persist it
    } else {
      this.stats.rejected++;
      logger.info(`[memory-gate] Quarantined memory ${memoryId} REJECTED`);
      return null;
    }
  }

  getStats(): MemoryGateStats {
    return { ...this.stats, pendingReview: this.quarantineBuffer.size };
  }

  /**
   * Clear all quarantined memories and timers. For testing.
   */
  clearQuarantine(): void {
    for (const timer of this.expiryTimers.values()) {
      clearTimeout(timer);
    }
    this.expiryTimers.clear();
    this.quarantineBuffer.clear();
    this.stats.pendingReview = 0;
  }

  /**
   * Dispose all timers. Call on shutdown.
   */
  dispose(): void {
    this.clearQuarantine();
  }

  // ---------- Private Helpers ----------

  private createTypedMemory(
    memory: Memory,
    memoryId: string,
    trustScore: TrustScore,
    source: TrustSource,
  ): TypedMemoryObject {
    return {
      ...memory,
      id: memoryId as Memory["id"],
      trustScore: trustScore.score,
      provenance: {
        source: source.id,
        sourceType: source.type,
        action: "memory_write",
        timestamp: Date.now(),
        trustScoreAtWrite: trustScore.score,
      },
      memoryType: this.inferMemoryType(memory),
      verified: false,
    };
  }

  private inferMemoryType(memory: Memory): MemoryType {
    // Use metadata.type if available
    const metaType = memory.metadata?.type;
    if (metaType === "document" || metaType === "fragment") return "fact";
    if (metaType === "message") return "observation";
    if (metaType === "description") return "fact";

    // Default heuristic based on content
    const text = typeof memory.content === "string"
      ? memory.content
      : memory.content?.text ?? "";

    if (/\b(always|never|must|should|rule)\b/i.test(text)) return "instruction";
    if (/\b(prefer|like|dislike|favorite)\b/i.test(text)) return "preference";
    if (/\b(goal|objective|target|achieve)\b/i.test(text)) return "goal";

    return "observation";
  }

  private addToQuarantine(memoryId: string, memory: TypedMemoryObject): void {
    // Evict oldest if at capacity
    if (this.quarantineBuffer.size >= this.gateConfig.maxQuarantineSize) {
      this.evictOldestQuarantined();
    }

    this.quarantineBuffer.set(memoryId, memory);
    this.stats.pendingReview = this.quarantineBuffer.size;

    // Set auto-expiry timer
    const timer = setTimeout(() => {
      this.handleQuarantineExpiry(memoryId);
    }, this.gateConfig.quarantineReviewMs);

    // Prevent timer from keeping the process alive
    if (timer.unref) {
      timer.unref();
    }

    this.expiryTimers.set(memoryId, timer);
  }

  private handleQuarantineExpiry(memoryId: string): void {
    const memory = this.quarantineBuffer.get(memoryId);
    if (!memory) return;

    this.expiryTimers.delete(memoryId);
    this.quarantineBuffer.delete(memoryId);
    this.stats.pendingReview = this.quarantineBuffer.size;

    if (this.onExpiry) {
      this.onExpiry(memory);
    } else {
      // Default: reject expired quarantined memories
      this.stats.rejected++;
      logger.info(`[memory-gate] Quarantined memory ${memoryId} expired and rejected`);
    }
  }

  private evictOldestQuarantined(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, memory] of this.quarantineBuffer) {
      if (memory.provenance.timestamp < oldestTime) {
        oldestTime = memory.provenance.timestamp;
        oldestId = id;
      }
    }

    if (oldestId) {
      const timer = this.expiryTimers.get(oldestId);
      if (timer) {
        clearTimeout(timer);
        this.expiryTimers.delete(oldestId);
      }
      this.quarantineBuffer.delete(oldestId);
      this.stats.rejected++;
      logger.debug(`[memory-gate] Evicted oldest quarantined memory ${oldestId}`);
    }
  }
}
