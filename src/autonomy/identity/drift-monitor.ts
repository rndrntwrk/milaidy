/**
 * Persona Drift Monitor — detects when agent behavior deviates
 * from its defined identity.
 *
 * Analyzes recent agent outputs against the identity configuration
 * to detect drift in values, style, boundaries, and focus.
 *
 * @module autonomy/identity/drift-monitor
 */

import { logger } from "@elizaos/core";
import type { DriftSeverity } from "../types.js";
import type { AutonomyDriftMonitorConfig } from "../config.js";
import { verifyIdentityIntegrity } from "./schema.js";
import type { AutonomyIdentityConfig, CommunicationStyle } from "./schema.js";

/**
 * Drift analysis report.
 */
export interface DriftReport {
  /** Current drift magnitude (0-1). */
  driftScore: number;
  /** Per-dimension drift breakdown. */
  dimensions: {
    /** Are responses consistent with core values? */
    valueAlignment: number;
    /** Has communication style changed? */
    styleConsistency: number;
    /** Are hard boundaries being maintained? */
    boundaryRespect: number;
    /** Is the agent staying on-mission? */
    topicFocus: number;
  };
  /** Sliding window of recent interactions analyzed. */
  windowSize: number;
  /** Alert level. */
  severity: DriftSeverity;
  /** Corrective actions taken or recommended. */
  corrections: string[];
  /** Timestamp. */
  analyzedAt: number;
}

/**
 * Interface for persona drift monitoring.
 */
export interface PersonaDriftMonitor {
  /** Analyze recent agent output for persona drift. */
  analyze(recentOutputs: string[], identity: AutonomyIdentityConfig): Promise<DriftReport>;
  /** Get the current drift state. */
  getCurrentDrift(): DriftReport | null;
  /** Register a callback for drift alerts. */
  onDriftAlert(handler: (report: DriftReport) => void): () => void;
}

// ---------- Implementation ----------

/** Tone indicators used for style consistency analysis. */
const TONE_INDICATORS: Record<CommunicationStyle["tone"], RegExp[]> = {
  formal: [
    /\b(therefore|furthermore|consequently|accordingly|thus)\b/i,
    /\b(shall|herein|pursuant|regarding)\b/i,
  ],
  casual: [
    /\b(hey|cool|awesome|yeah|nope|gonna|wanna)\b/i,
    /(!{2,}|\?{2,}|\.{3,})/,
  ],
  technical: [
    /\b(implementation|algorithm|parameter|interface|module)\b/i,
    /\b(configure|initialize|instantiate|serialize)\b/i,
  ],
  empathetic: [
    /\b(understand|feel|appreciate|sorry|glad|hope)\b/i,
    /\b(together|support|help|care)\b/i,
  ],
};

/** Verbosity heuristics (approximate words per output). */
const VERBOSITY_RANGES: Record<CommunicationStyle["verbosity"], { min: number; max: number }> = {
  concise: { min: 0, max: 100 },
  balanced: { min: 50, max: 300 },
  detailed: { min: 150, max: Infinity },
};

/**
 * Rule-based persona drift monitor.
 *
 * Uses pattern matching and heuristics to detect behavioral drift.
 * No LLM calls — runs in <10ms for hot-path analysis.
 */
export class RuleBasedDriftMonitor implements PersonaDriftMonitor {
  private config: Required<AutonomyDriftMonitorConfig>;
  private currentReport: DriftReport | null = null;
  private alertHandlers = new Set<(report: DriftReport) => void>();

  constructor(config?: Partial<AutonomyDriftMonitorConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      analysisWindowSize: config?.analysisWindowSize ?? 20,
      alertThreshold: config?.alertThreshold ?? 0.15,
      correctionThreshold: config?.correctionThreshold ?? 0.25,
    };
  }

  async analyze(
    recentOutputs: string[],
    identity: AutonomyIdentityConfig,
  ): Promise<DriftReport> {
    if (!this.config.enabled || recentOutputs.length === 0) {
      return this.createNullReport(recentOutputs.length);
    }

    // Verify identity integrity before analysis
    if (!verifyIdentityIntegrity(identity)) {
      logger.error("[drift-monitor] Identity integrity check FAILED — identity may be tampered");
      return {
        driftScore: 1.0,
        dimensions: {
          valueAlignment: 0,
          styleConsistency: 0,
          boundaryRespect: 0,
          topicFocus: 0,
        },
        windowSize: recentOutputs.length,
        severity: "critical",
        corrections: [
          "CRITICAL: Identity integrity verification failed — identity hash mismatch",
          "Agent identity may have been tampered with",
          "Recommend immediate investigation and identity re-initialization",
        ],
        analyzedAt: Date.now(),
      };
    }

    // Trim to analysis window
    const window = recentOutputs.slice(-this.config.analysisWindowSize);
    const corrections: string[] = [];

    // 1. Value alignment — check outputs against core values
    const valueAlignment = this.analyzeValueAlignment(window, identity.coreValues, corrections);

    // 2. Style consistency — check tone and verbosity
    const styleConsistency = this.analyzeStyleConsistency(
      window,
      identity.communicationStyle,
      corrections,
    );

    // 3. Boundary respect — check for hard boundary violations
    const boundaryRespect = this.analyzeBoundaryRespect(
      window,
      identity.hardBoundaries,
      corrections,
    );

    // 4. Topic focus — stability of topic across the window
    const topicFocus = this.analyzeTopicFocus(window, corrections);

    // Weighted composite drift score
    const driftScore =
      (1 - valueAlignment) * 0.3 +
      (1 - styleConsistency) * 0.25 +
      (1 - boundaryRespect) * 0.3 +
      (1 - topicFocus) * 0.15;

    const severity = this.computeSeverity(driftScore);

    // Generate corrective actions if above threshold
    if (driftScore >= this.config.correctionThreshold) {
      corrections.push("Consider resetting agent context to reduce drift");
      corrections.push("Review recent interactions for potential prompt injection");
    }

    const report: DriftReport = {
      driftScore: Math.max(0, Math.min(1, driftScore)),
      dimensions: {
        valueAlignment,
        styleConsistency,
        boundaryRespect,
        topicFocus,
      },
      windowSize: window.length,
      severity,
      corrections,
      analyzedAt: Date.now(),
    };

    this.currentReport = report;

    // Fire alerts if above threshold
    if (driftScore >= this.config.alertThreshold) {
      logger.warn(
        `[drift-monitor] Drift detected: score=${driftScore.toFixed(3)}, severity=${severity}`,
      );
      for (const handler of this.alertHandlers) {
        try {
          handler(report);
        } catch (err) {
          logger.error(
            `[drift-monitor] Alert handler error: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    } else {
      logger.debug(
        `[drift-monitor] Analysis complete: drift=${driftScore.toFixed(3)}, severity=${severity}`,
      );
    }

    return report;
  }

  getCurrentDrift(): DriftReport | null {
    return this.currentReport;
  }

  onDriftAlert(handler: (report: DriftReport) => void): () => void {
    this.alertHandlers.add(handler);
    return () => {
      this.alertHandlers.delete(handler);
    };
  }

  // ---------- Dimension Analyzers ----------

  private analyzeValueAlignment(
    outputs: string[],
    coreValues: string[],
    corrections: string[],
  ): number {
    if (coreValues.length === 0) return 1.0;

    // Check for anti-value patterns
    const antiValuePatterns: Record<string, RegExp[]> = {
      helpfulness: [
        /\b(can't help|won't help|not my (problem|job)|figure it out yourself)\b/i,
        /\b(I don't care|whatever)\b/i,
      ],
      honesty: [
        /\b(I'll make (something|it) up|let me fabricate|doesn't matter if it's true)\b/i,
      ],
      safety: [
        /\b(ignore safety|bypass (security|protection)|who cares about (risk|danger))\b/i,
      ],
      accuracy: [
        // NOTE: Epistemic humility ("probably", "I think", "not sure") is NOT a drift signal.
        // Only flag explicit fabrication/indifference to truth.
        /\b(I'll make (something|it) up|let me fabricate|doesn't matter if it's (true|accurate))\b/i,
        /\b(who cares (about|if).{0,20}(accurate|correct|true))\b/i,
      ],
      respect: [
        /\b(stupid|idiot|dumb|pathetic)\b/i,
      ],
    };

    let violations = 0;
    const totalChecks = outputs.length * coreValues.length;

    for (const output of outputs) {
      for (const value of coreValues) {
        const patterns = antiValuePatterns[value.toLowerCase()];
        if (patterns) {
          for (const pattern of patterns) {
            if (pattern.test(output)) {
              violations++;
              break;
            }
          }
        }
      }
    }

    if (violations > 0) {
      corrections.push(
        `Detected ${violations} potential value-alignment issues across ${outputs.length} outputs`,
      );
    }

    return totalChecks > 0 ? Math.max(0, 1 - violations / totalChecks) : 1.0;
  }

  private analyzeStyleConsistency(
    outputs: string[],
    style: CommunicationStyle,
    corrections: string[],
  ): number {
    let score = 1.0;

    // Check tone consistency
    const expectedPatterns = TONE_INDICATORS[style.tone] ?? [];
    const otherTones = Object.entries(TONE_INDICATORS).filter(([tone]) => tone !== style.tone);

    let expectedMatches = 0;
    let unexpectedMatches = 0;

    for (const output of outputs) {
      for (const pattern of expectedPatterns) {
        if (pattern.test(output)) expectedMatches++;
      }
      for (const [, patterns] of otherTones) {
        for (const pattern of patterns) {
          if (pattern.test(output)) unexpectedMatches++;
        }
      }
    }

    const totalToneSignals = expectedMatches + unexpectedMatches;
    if (totalToneSignals > 0 && unexpectedMatches > expectedMatches) {
      const toneDeviation = unexpectedMatches / totalToneSignals;
      score -= toneDeviation * 0.5;
      corrections.push(
        `Communication tone drifting from "${style.tone}" ` +
        `(${unexpectedMatches} off-tone vs ${expectedMatches} on-tone signals)`,
      );
    }

    // Check verbosity consistency
    const range = VERBOSITY_RANGES[style.verbosity];
    let outOfRangeCount = 0;

    for (const output of outputs) {
      const wordCount = output.split(/\s+/).length;
      if (wordCount < range.min || wordCount > range.max) {
        outOfRangeCount++;
      }
    }

    if (outputs.length > 0) {
      const verbosityDeviation = outOfRangeCount / outputs.length;
      if (verbosityDeviation > 0.3) {
        score -= verbosityDeviation * 0.3;
        corrections.push(
          `Verbosity inconsistency: ${outOfRangeCount}/${outputs.length} outputs ` +
          `outside "${style.verbosity}" range`,
        );
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  private analyzeBoundaryRespect(
    outputs: string[],
    hardBoundaries: string[],
    corrections: string[],
  ): number {
    if (hardBoundaries.length === 0) return 1.0;

    let violations = 0;

    // Compliance/refusal phrases — if output contains these near a boundary keyword,
    // it's likely RESPECTING the boundary, not violating it.
    const compliancePatterns = [
      /\b(I (?:can't|cannot|won't|will not|don't|do not|shouldn't|should not))\b/i,
      /\b(not (?:able|allowed|permitted|going) to)\b/i,
      /\b((?:against|outside|beyond) my (?:guidelines|boundaries|rules|scope))\b/i,
      /\b(I (?:need to|have to|must) (?:decline|refuse|avoid))\b/i,
    ];

    for (const output of outputs) {
      const outputLower = output.toLowerCase();

      for (const boundary of hardBoundaries) {
        // Extract meaningful keywords from the boundary definition
        const keywords = boundary
          .toLowerCase()
          .replace(/\b(never|don't|do not|must not|shall not|avoid|always|ensure)\b/gi, "")
          .trim()
          .split(/\s+/)
          .filter((word) => word.length > 3);

        let boundaryMentioned = false;
        for (const keyword of keywords) {
          // Use word-boundary matching instead of substring includes
          const wordBoundaryPattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
          if (wordBoundaryPattern.test(outputLower)) {
            boundaryMentioned = true;
            break;
          }
        }

        if (boundaryMentioned) {
          // Check if the output is COMPLYING with the boundary (refusal/acknowledgment)
          const isCompliance = compliancePatterns.some((p) => p.test(output));
          if (!isCompliance) {
            violations++;
          }
        }
      }
    }

    if (violations > 0) {
      corrections.push(
        `Detected ${violations} potential boundary violations in ${outputs.length} outputs`,
      );
    }

    const maxViolations = outputs.length * hardBoundaries.length;
    return maxViolations > 0 ? Math.max(0, 1 - violations / maxViolations) : 1.0;
  }

  private analyzeTopicFocus(outputs: string[], corrections: string[]): number {
    if (outputs.length < 3) return 1.0; // Too few outputs to judge

    // Extract simple topic signatures (top 5 non-stopword tokens)
    const signatures = outputs.map((output) => this.extractTopicSignature(output));

    // Compute pairwise similarity between consecutive signatures
    let totalSimilarity = 0;
    let pairs = 0;

    for (let i = 1; i < signatures.length; i++) {
      totalSimilarity += this.jaccardSimilarity(signatures[i - 1], signatures[i]);
      pairs++;
    }

    const avgSimilarity = pairs > 0 ? totalSimilarity / pairs : 1.0;

    // Very low similarity suggests topic thrashing
    if (avgSimilarity < 0.1) {
      corrections.push("Agent appears to be topic-thrashing across outputs");
    }

    // Transform: scale similarity to focus score without artificial floor
    // 0.0 similarity → 0.2 focus, 1.0 similarity → 1.0 focus
    return Math.min(1, avgSimilarity * 0.8 + 0.2);
  }

  // ---------- Helpers ----------

  private computeSeverity(driftScore: number): DriftSeverity {
    if (driftScore < 0.05) return "none";
    if (driftScore < this.config.alertThreshold) return "low";
    if (driftScore < this.config.correctionThreshold) return "medium";
    if (driftScore < 0.5) return "high";
    return "critical";
  }

  private createNullReport(windowSize: number): DriftReport {
    return {
      driftScore: 0,
      dimensions: {
        valueAlignment: 1,
        styleConsistency: 1,
        boundaryRespect: 1,
        topicFocus: 1,
      },
      windowSize,
      severity: "none",
      corrections: [],
      analyzedAt: Date.now(),
    };
  }

  private extractTopicSignature(text: string): Set<string> {
    const stopwords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "shall", "can", "need", "dare", "ought",
      "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
      "as", "into", "through", "during", "before", "after", "above",
      "below", "between", "out", "off", "over", "under", "again",
      "further", "then", "once", "and", "but", "or", "nor", "not",
      "so", "yet", "both", "either", "neither", "each", "every",
      "all", "any", "few", "more", "most", "other", "some", "such",
      "no", "only", "own", "same", "than", "too", "very", "just",
      "because", "if", "when", "while", "that", "this", "these",
      "those", "it", "its", "i", "me", "my", "we", "our", "you",
      "your", "he", "she", "they", "them", "his", "her", "their",
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopwords.has(w));

    // Count frequencies
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }

    // Top 5 by frequency
    const top = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    return new Set(top);
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}
