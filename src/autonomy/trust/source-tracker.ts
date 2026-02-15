/**
 * Source Tracker — maintains historical reliability data for trust sources.
 *
 * Tracks interaction history per source ID and computes reliability
 * scores based on positive/negative feedback signals.
 *
 * @module autonomy/trust/source-tracker
 */

import type { TrustSource } from "../types.js";

/**
 * Historical record for a single trust source.
 */
export interface SourceRecord {
  id: string;
  type: TrustSource["type"];
  /** Total positive feedback signals. */
  positive: number;
  /** Total negative feedback signals. */
  negative: number;
  /** First seen timestamp. */
  firstSeen: number;
  /** Last interaction timestamp. */
  lastSeen: number;
  /** Computed reliability (0-1). */
  reliability: number;
}

/**
 * Tracks trust source reliability over time.
 */
export class SourceTracker {
  private sources = new Map<string, SourceRecord>();
  private maxSources: number;

  constructor(maxSources: number = 10_000) {
    this.maxSources = maxSources;
  }

  /**
   * Record an interaction with a source.
   *
   * Source type is frozen at first registration to prevent type escalation attacks
   * (e.g., an "external" source claiming to be "system" in later interactions).
   */
  record(source: TrustSource, feedback: "positive" | "negative" | "neutral"): void {
    const now = Date.now();
    let record = this.sources.get(source.id);

    if (!record) {
      // Evict oldest if at capacity
      if (this.sources.size >= this.maxSources) {
        this.evictOldest();
      }

      record = {
        id: source.id,
        type: source.type, // Frozen at registration
        positive: 0,
        negative: 0,
        firstSeen: now,
        lastSeen: now,
        reliability: 0.5, // Start at neutral — don't trust caller-supplied reliability
      };
      this.sources.set(source.id, record);
    }

    record.lastSeen = now;
    // Type is frozen — do NOT update: record.type = source.type;

    if (feedback === "positive") {
      record.positive++;
    } else if (feedback === "negative") {
      record.negative++;
    }

    // Bayesian reliability update (Beta distribution prior: alpha=2, beta=2)
    const total = record.positive + record.negative;
    if (total > 0) {
      const alpha = record.positive + 2;
      const beta = record.negative + 2;
      record.reliability = alpha / (alpha + beta);
    }
  }

  /**
   * Get the record for a source, or undefined if unknown.
   * Updates lastSeen for true LRU eviction behavior.
   */
  get(sourceId: string): SourceRecord | undefined {
    const record = this.sources.get(sourceId);
    if (record) {
      record.lastSeen = Date.now();
    }
    return record;
  }

  /**
   * Get reliability for a source (0.5 for unknown sources).
   * Updates lastSeen for true LRU eviction behavior.
   */
  getReliability(sourceId: string): number {
    const record = this.sources.get(sourceId);
    if (record) {
      record.lastSeen = Date.now();
      return record.reliability;
    }
    return 0.5;
  }

  /**
   * Get all tracked source IDs.
   */
  getTrackedSources(): string[] {
    return Array.from(this.sources.keys());
  }

  /**
   * Get count of tracked sources.
   */
  get size(): number {
    return this.sources.size;
  }

  /**
   * Clear all tracking data.
   */
  clear(): void {
    this.sources.clear();
  }

  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, record] of this.sources) {
      if (record.lastSeen < oldestTime) {
        oldestTime = record.lastSeen;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.sources.delete(oldestId);
    }
  }
}
