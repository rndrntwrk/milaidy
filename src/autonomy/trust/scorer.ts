/**
 * Trust Scorer — rule-based content trust evaluation.
 *
 * Evaluates incoming content on four dimensions:
 * - Source reliability: Is the source known and historically trustworthy?
 * - Content consistency: Does the content align with existing knowledge?
 * - Temporal coherence: Is the timing/sequence plausible?
 * - Instruction alignment: Does the content align with agent instructions?
 *
 * @module autonomy/trust/scorer
 */

import { logger } from "@elizaos/core";
import type { AutonomyTrustConfig } from "../config.js";
import type { TrustContext, TrustScore, TrustSource } from "../types.js";

/**
 * Interface for trust scoring implementations.
 */
export interface TrustScorer {
  /** Score a piece of content from a given source. */
  score(content: string, source: TrustSource, context: TrustContext): Promise<TrustScore>;
  /** Update source reliability based on feedback. */
  updateSourceReliability(sourceId: string, feedback: "positive" | "negative"): void;
  /** Get current trust level for a source. */
  getSourceTrust(sourceId: string): number;
}

// ---------- Rule-Based Patterns ----------

/** Known prompt injection patterns. */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(your\s+)?instructions/i,
  /you\s+are\s+now\s+/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /forget\s+(everything|all|your)/i,
  /new\s+system\s+prompt/i,
  /override\s+(your\s+)?(system|instructions|rules)/i,
  /\bDAN\b.*\bmode\b/i,
  /\bjailbreak\b/i,
  /act\s+as\s+if\s+you\s+(have\s+)?no\s+(restrictions|rules|limits)/i,
];

/** Patterns suggesting manipulation attempts. */
const MANIPULATION_PATTERNS = [
  /you\s+must\s+(always|never)\s+/i,
  /your\s+(creator|developer|owner)\s+(said|wants|told)/i,
  /this\s+is\s+a\s+test.*you\s+(should|must)/i,
  /admin\s+(override|command|mode)/i,
  /emergency\s+(override|protocol)/i,
];

/** Source type trust baseline values. */
const SOURCE_TYPE_BASELINES: Record<TrustSource["type"], number> = {
  system: 1.0,
  user: 0.7,
  agent: 0.8,
  plugin: 0.6,
  external: 0.4,
};

// ---------- Implementation ----------

/**
 * Rule-based trust scorer.
 *
 * Uses pattern matching and heuristics for fast (<5ms) trust evaluation.
 * No LLM calls — suitable for hot-path gating.
 */
export class RuleBasedTrustScorer implements TrustScorer {
  private sourceHistory = new Map<string, { positive: number; negative: number; lastSeen: number }>();
  private config: Required<AutonomyTrustConfig>;

  constructor(config?: Partial<AutonomyTrustConfig>) {
    this.config = {
      writeThreshold: config?.writeThreshold ?? 0.7,
      quarantineThreshold: config?.quarantineThreshold ?? 0.3,
      llmAnalysis: config?.llmAnalysis ?? false,
      historyWindow: config?.historyWindow ?? 100,
    };
  }

  async score(
    content: string,
    source: TrustSource,
    context: TrustContext,
  ): Promise<TrustScore> {
    const reasoning: string[] = [];

    // 1. Source reliability
    const sourceReliability = this.computeSourceReliability(source, reasoning);

    // 2. Content consistency (injection/manipulation detection)
    const contentConsistency = this.computeContentConsistency(content, reasoning);

    // 3. Temporal coherence
    const temporalCoherence = this.computeTemporalCoherence(source, context, reasoning);

    // 4. Instruction alignment
    const instructionAlignment = this.computeInstructionAlignment(content, context, reasoning);

    // Weighted composite score
    const weights = {
      sourceReliability: 0.25,
      contentConsistency: 0.35,
      temporalCoherence: 0.15,
      instructionAlignment: 0.25,
    };

    const score =
      sourceReliability * weights.sourceReliability +
      contentConsistency * weights.contentConsistency +
      temporalCoherence * weights.temporalCoherence +
      instructionAlignment * weights.instructionAlignment;

    const result: TrustScore = {
      score: Math.max(0, Math.min(1, score)),
      dimensions: {
        sourceReliability,
        contentConsistency,
        temporalCoherence,
        instructionAlignment,
      },
      reasoning,
      computedAt: Date.now(),
    };

    logger.debug(
      `[trust] Scored content from ${source.id}: ${result.score.toFixed(3)} ` +
      `(src=${sourceReliability.toFixed(2)}, con=${contentConsistency.toFixed(2)}, ` +
      `tmp=${temporalCoherence.toFixed(2)}, ins=${instructionAlignment.toFixed(2)})`,
    );

    return result;
  }

  updateSourceReliability(sourceId: string, feedback: "positive" | "negative"): void {
    const history = this.sourceHistory.get(sourceId) ?? { positive: 0, negative: 0, lastSeen: 0 };

    if (feedback === "positive") {
      history.positive++;
    } else {
      history.negative++;
    }
    history.lastSeen = Date.now();

    // Trim history to window size
    const total = history.positive + history.negative;
    if (total > this.config.historyWindow) {
      const ratio = this.config.historyWindow / total;
      history.positive = Math.round(history.positive * ratio);
      history.negative = Math.round(history.negative * ratio);
    }

    this.sourceHistory.set(sourceId, history);
  }

  getSourceTrust(sourceId: string): number {
    const history = this.sourceHistory.get(sourceId);
    if (!history) return 0.5; // Unknown source → neutral
    const total = history.positive + history.negative;
    if (total === 0) return 0.5;
    return history.positive / total;
  }

  // ---------- Dimension Scorers ----------

  private computeSourceReliability(source: TrustSource, reasoning: string[]): number {
    // Start with source type baseline
    let score = SOURCE_TYPE_BASELINES[source.type] ?? 0.5;
    reasoning.push(`Source type "${source.type}" baseline: ${score.toFixed(2)}`);

    // Adjust based on historical reliability
    const history = this.sourceHistory.get(source.id);
    if (history) {
      const total = history.positive + history.negative;
      if (total >= 5) {
        const historyScore = history.positive / total;
        // Blend: 60% history, 40% baseline
        score = historyScore * 0.6 + score * 0.4;
        reasoning.push(`Historical reliability (${total} interactions): ${historyScore.toFixed(2)}`);
      }
    }

    // Factor in the source's own reliability field
    score = (score + source.reliability) / 2;

    return Math.max(0, Math.min(1, score));
  }

  private computeContentConsistency(content: string, reasoning: string[]): number {
    let score = 1.0;

    // Check for injection patterns
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        score -= 0.4;
        reasoning.push(`Injection pattern detected: ${pattern.source}`);
        break; // One hit is enough to flag
      }
    }

    // Check for manipulation patterns (less severe)
    for (const pattern of MANIPULATION_PATTERNS) {
      if (pattern.test(content)) {
        score -= 0.2;
        reasoning.push(`Manipulation pattern detected: ${pattern.source}`);
        break;
      }
    }

    // Excessive length can be suspicious (context stuffing)
    if (content.length > 10_000) {
      score -= 0.1;
      reasoning.push(`Unusually long content (${content.length} chars)`);
    }

    // High ratio of special characters
    const specialCharRatio = (content.match(/[^\w\s.,!?'"()-]/g)?.length ?? 0) / Math.max(content.length, 1);
    if (specialCharRatio > 0.3) {
      score -= 0.1;
      reasoning.push(`High special character ratio: ${(specialCharRatio * 100).toFixed(1)}%`);
    }

    if (score >= 0.9) {
      reasoning.push("No suspicious content patterns detected");
    }

    return Math.max(0, Math.min(1, score));
  }

  private computeTemporalCoherence(
    source: TrustSource,
    _context: TrustContext,
    reasoning: string[],
  ): number {
    let score = 0.8; // Default: mostly coherent

    const history = this.sourceHistory.get(source.id);
    if (history?.lastSeen) {
      const gapMs = Date.now() - history.lastSeen;
      // Very rapid successive messages from same source can be suspicious
      if (gapMs < 100) {
        score -= 0.2;
        reasoning.push(`Rapid-fire from source (${gapMs}ms gap)`);
      }
      // Very long gap is fine, but note it
      if (gapMs > 86_400_000) { // 24 hours
        reasoning.push(`Source re-appeared after ${Math.round(gapMs / 3_600_000)}h absence`);
      }
    } else {
      reasoning.push("First interaction from this source");
    }

    return Math.max(0, Math.min(1, score));
  }

  private computeInstructionAlignment(
    content: string,
    context: TrustContext,
    reasoning: string[],
  ): number {
    let score = 0.8; // Default: mostly aligned

    // If the content tries to change the agent's goals
    if (context.activeGoals && context.activeGoals.length > 0) {
      const goalChangePatterns = [
        /stop\s+(doing|working\s+on)/i,
        /forget\s+(about|your)\s+(task|goal|mission)/i,
        /new\s+(priority|objective|mission)/i,
        /change\s+(your|the)\s+(focus|goal|task)/i,
      ];
      for (const pattern of goalChangePatterns) {
        if (pattern.test(content)) {
          // Not necessarily bad — users can change goals — but flag it
          score -= 0.1;
          reasoning.push("Content attempts to modify active goals");
          break;
        }
      }
    }

    // Content that contradicts the agent's identity
    const identityOverridePatterns = [
      /you\s+are\s+not\s+/i,
      /your\s+(real|true)\s+(name|identity)\s+is/i,
      /stop\s+being\s+/i,
    ];
    for (const pattern of identityOverridePatterns) {
      if (pattern.test(content)) {
        score -= 0.3;
        reasoning.push("Content attempts to override agent identity");
        break;
      }
    }

    if (score >= 0.7) {
      reasoning.push("Content appears instruction-aligned");
    }

    return Math.max(0, Math.min(1, score));
  }
}
