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

// ---------- Content Normalization ----------

/**
 * Unicode homoglyph map — maps visually-similar characters to ASCII equivalents.
 * Prevents attackers from evading regex patterns by substituting lookalike characters.
 */
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic lookalikes
  "\u0430": "a", "\u0435": "e", "\u043E": "o", "\u0440": "p", "\u0441": "c",
  "\u0443": "y", "\u0445": "x", "\u0456": "i", "\u0458": "j", "\u04BB": "h",
  "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u041A": "K", "\u041C": "M",
  "\u041D": "H", "\u041E": "O", "\u0420": "P", "\u0421": "C", "\u0422": "T",
  "\u0425": "X",
  // Greek lookalikes
  "\u03B1": "a", "\u03B5": "e", "\u03BF": "o", "\u03C1": "p", "\u03BA": "k",
  "\u03BD": "v", "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0397": "H",
  "\u0399": "I", "\u039A": "K", "\u039C": "M", "\u039D": "N", "\u039F": "O",
  "\u03A1": "P", "\u03A4": "T", "\u03A7": "X", "\u0396": "Z",
  // Full-width Latin
  "\uFF41": "a", "\uFF42": "b", "\uFF43": "c", "\uFF44": "d", "\uFF45": "e",
  "\uFF46": "f", "\uFF47": "g", "\uFF48": "h", "\uFF49": "i", "\uFF4A": "j",
  "\uFF4B": "k", "\uFF4C": "l", "\uFF4D": "m", "\uFF4E": "n", "\uFF4F": "o",
  "\uFF50": "p", "\uFF51": "q", "\uFF52": "r", "\uFF53": "s", "\uFF54": "t",
  "\uFF55": "u", "\uFF56": "v", "\uFF57": "w", "\uFF58": "x", "\uFF59": "y",
  "\uFF5A": "z",
  // Common substitutions
  "\u00E0": "a", "\u00E1": "a", "\u00E2": "a", "\u00E3": "a", "\u00E4": "a",
  "\u00E8": "e", "\u00E9": "e", "\u00EA": "e", "\u00EB": "e",
  "\u00EC": "i", "\u00ED": "i", "\u00EE": "i", "\u00EF": "i",
  "\u00F2": "o", "\u00F3": "o", "\u00F4": "o", "\u00F5": "o", "\u00F6": "o",
  "\u00F9": "u", "\u00FA": "u", "\u00FB": "u", "\u00FC": "u",
};

/**
 * Zero-width and invisible Unicode characters that can be inserted
 * between letters to evade pattern matching.
 */
const ZERO_WIDTH_PATTERN = /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u2060\u2061\u2062\u2063\u2064\u034F\u180E]/g;

/**
 * Normalize content for security analysis:
 * 1. Strip zero-width/invisible characters
 * 2. Replace homoglyphs with ASCII equivalents
 * 3. Collapse excessive whitespace
 *
 * The original content is preserved for all non-security operations.
 * This normalized form is used ONLY for pattern matching.
 */
function normalizeForAnalysis(content: string): string {
  // Strip zero-width characters
  let normalized = content.replace(ZERO_WIDTH_PATTERN, "");

  // Replace homoglyphs
  let result = "";
  for (const char of normalized) {
    result += HOMOGLYPH_MAP[char] ?? char;
  }

  // Collapse runs of whitespace (but preserve newlines for structure)
  result = result.replace(/[ \t]+/g, " ");

  return result;
}

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
  private sourceHistory = new Map<string, {
    positive: number;
    negative: number;
    lastSeen: number;
    firstType: TrustSource["type"];
  }>();
  private config: Required<AutonomyTrustConfig>;
  /** Maximum number of tracked sources to prevent unbounded memory growth. */
  private static readonly MAX_SOURCE_HISTORY = 50_000;

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

    // Note: lastSeen is updated via touchSource() AFTER temporal coherence
    // reads it, so the gap calculation reflects time since last interaction.

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

    // Update lastSeen AFTER temporal coherence was computed
    this.touchSource(source);

    logger.debug(
      `[trust] Scored content from ${source.id}: ${result.score.toFixed(3)} ` +
      `(src=${sourceReliability.toFixed(2)}, con=${contentConsistency.toFixed(2)}, ` +
      `tmp=${temporalCoherence.toFixed(2)}, ins=${instructionAlignment.toFixed(2)})`,
    );

    return result;
  }

  updateSourceReliability(sourceId: string, feedback: "positive" | "negative"): void {
    const history = this.sourceHistory.get(sourceId) ?? {
      positive: 0, negative: 0, lastSeen: 0, firstType: "external" as const,
    };

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
    this.evictIfOverCapacity();
  }

  /**
   * Touch a source to update its lastSeen and register its type if new.
   * Source type is frozen at first registration to prevent type escalation attacks.
   */
  private touchSource(source: TrustSource): void {
    const existing = this.sourceHistory.get(source.id);
    if (existing) {
      existing.lastSeen = Date.now();
      // Type is frozen — log if caller attempts to change it
      if (source.type !== existing.firstType) {
        logger.warn(
          `[trust] Source ${source.id} attempted type change from ` +
          `"${existing.firstType}" to "${source.type}" — denied`,
        );
      }
    } else {
      this.sourceHistory.set(source.id, {
        positive: 0,
        negative: 0,
        lastSeen: Date.now(),
        firstType: source.type,
      });
      this.evictIfOverCapacity();
    }
  }

  /**
   * Evict oldest sources if history exceeds capacity limit.
   */
  private evictIfOverCapacity(): void {
    if (this.sourceHistory.size <= RuleBasedTrustScorer.MAX_SOURCE_HISTORY) return;

    // Find and remove oldest 10% to amortize eviction cost
    const entries = Array.from(this.sourceHistory.entries());
    entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    const toEvict = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toEvict; i++) {
      this.sourceHistory.delete(entries[i][0]);
    }
  }

  getSourceTrust(sourceId: string): number {
    const history = this.sourceHistory.get(sourceId);
    if (!history) return 0.5; // Unknown source → neutral
    const total = history.positive + history.negative;
    if (total === 0) return 0.5;
    // Bayesian estimate (consistent with computeSourceReliability)
    const alpha = history.positive + 2;
    const beta = history.negative + 2;
    return alpha / (alpha + beta);
  }

  // ---------- Dimension Scorers ----------

  private computeSourceReliability(source: TrustSource, reasoning: string[]): number {
    // Use frozen type if source is already known (prevents type escalation)
    const history = this.sourceHistory.get(source.id);
    const effectiveType = history?.firstType ?? source.type;

    // Start with source type baseline
    let score = SOURCE_TYPE_BASELINES[effectiveType] ?? 0.5;
    reasoning.push(`Source type "${effectiveType}" baseline: ${score.toFixed(2)}`);

    // Flag type mismatch as suspicious
    if (history && source.type !== history.firstType) {
      score -= 0.2;
      reasoning.push(
        `Source type mismatch: claimed "${source.type}" but registered as "${history.firstType}"`,
      );
    }

    // Adjust based on historical reliability (Bayesian: blend with prior)
    if (history) {
      const total = history.positive + history.negative;
      if (total >= 3) {
        // Bayesian update with Beta distribution prior (alpha=2, beta=2 = neutral)
        const alpha = history.positive + 2;
        const beta = history.negative + 2;
        const historyScore = alpha / (alpha + beta);
        // Blend: weight history more as interactions increase (caps at 80%)
        const historyWeight = Math.min(0.8, total / (total + 10));
        score = historyScore * historyWeight + score * (1 - historyWeight);
        reasoning.push(`Historical reliability (${total} interactions, Bayesian): ${historyScore.toFixed(2)}`);
      }
    }

    // NOTE: We deliberately ignore source.reliability (caller-supplied, unverified).
    // Trust is computed server-side from observed behavior only.

    return Math.max(0, Math.min(1, score));
  }

  private computeContentConsistency(content: string, reasoning: string[]): number {
    let score = 1.0;

    // Normalize content to defeat homoglyph and zero-width character evasion
    const normalized = normalizeForAnalysis(content);

    // Flag if normalization changed content significantly (evasion attempt indicator)
    if (normalized.length < content.length * 0.9) {
      score -= 0.15;
      reasoning.push("Content contained significant invisible/zero-width characters");
    }

    // Check for injection patterns — count ALL matches, don't break early
    let injectionHits = 0;
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(normalized)) {
        injectionHits++;
      }
    }
    if (injectionHits > 0) {
      // Scale penalty: more hits = more suspicious
      score -= Math.min(0.6, 0.3 + injectionHits * 0.1);
      reasoning.push(`Injection patterns detected (${injectionHits} match${injectionHits > 1 ? "es" : ""})`);
    }

    // Check for manipulation patterns (less severe) — count ALL matches
    let manipulationHits = 0;
    for (const pattern of MANIPULATION_PATTERNS) {
      if (pattern.test(normalized)) {
        manipulationHits++;
      }
    }
    if (manipulationHits > 0) {
      score -= Math.min(0.4, 0.15 + manipulationHits * 0.05);
      reasoning.push(`Manipulation patterns detected (${manipulationHits} match${manipulationHits > 1 ? "es" : ""})`);
    }

    // Excessive length can be suspicious (context stuffing)
    if (content.length > 10_000) {
      score -= 0.1;
      reasoning.push(`Unusually long content (${content.length} chars)`);
    }

    // High ratio of special characters — use normalized content for fair comparison
    // This avoids penalizing non-Latin scripts; instead we only flag after normalization
    const asciiContent = normalized.replace(/[^\x00-\x7F]/g, "");
    const nonAsciiRatio = 1 - (asciiContent.length / Math.max(normalized.length, 1));
    const specialCharRatio = (normalized.match(/[^\w\s.,!?'"()\-\n]/g)?.length ?? 0) / Math.max(normalized.length, 1);
    if (specialCharRatio > 0.3 && nonAsciiRatio < 0.5) {
      // Only flag high special-char ratio when content is predominantly ASCII
      // (avoids bias against non-Latin scripts)
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
    const normalized = normalizeForAnalysis(content);

    // If the content tries to change the agent's goals
    if (context.activeGoals && context.activeGoals.length > 0) {
      const goalChangePatterns = [
        /stop\s+(doing|working\s+on)/i,
        /forget\s+(about|your)\s+(task|goal|mission)/i,
        /new\s+(priority|objective|mission)/i,
        /change\s+(your|the)\s+(focus|goal|task)/i,
      ];
      for (const pattern of goalChangePatterns) {
        if (pattern.test(normalized)) {
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
      if (pattern.test(normalized)) {
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
