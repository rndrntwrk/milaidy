/**
 * Shared types for the Milaidy Autonomy Kernel.
 *
 * @module autonomy/types
 */

// ---------- Trust Types ----------

/**
 * Identifies the source of content for trust evaluation.
 */
export interface TrustSource {
  /** Unique identifier for this source. */
  id: string;
  /** Source category. */
  type: "user" | "agent" | "plugin" | "system" | "external";
  /** Channel the content arrived through. */
  channel?: string;
  /** Historical reliability score (0-1), updated over time. */
  reliability: number;
}

/**
 * Context provided to the trust scorer for richer analysis.
 */
export interface TrustContext {
  /** Agent ID evaluating this content. */
  agentId: string;
  /** Recent interaction history (last N messages). */
  recentMessages?: string[];
  /** Current active goals. */
  activeGoals?: string[];
  /** Current conversation topic. */
  topic?: string;
}

/**
 * Multi-dimensional trust score.
 */
export interface TrustScore {
  /** Overall trust (0-1). */
  score: number;
  /** Per-dimension breakdown. */
  dimensions: {
    /** Is the source known and trusted? */
    sourceReliability: number;
    /** Does content align with existing knowledge? */
    contentConsistency: number;
    /** Is the timing/sequence plausible? */
    temporalCoherence: number;
    /** Does it align with agent's instructions? */
    instructionAlignment: number;
  };
  /** Explanation chain for auditability. */
  reasoning: string[];
  /** Timestamp of computation. */
  computedAt: number;
}

// ---------- Memory Types ----------

/**
 * Classification of memory objects.
 */
export type MemoryType =
  | "message"
  | "fact"
  | "document"
  | "relationship"
  | "goal"
  | "task"
  | "action"
  | "instruction"
  | "preference"
  | "observation"
  | "system";

/**
 * Verifiability class for memory entries.
 */
export type VerifiabilityClass =
  | "unverified"
  | "self_reported"
  | "system_verified"
  | "external_verified";

/**
 * Provenance chain — who wrote a memory and why.
 */
export interface MemoryProvenance {
  /** Source identifier. */
  source: string;
  /** Source category. */
  sourceType: TrustSource["type"];
  /** Action that produced this memory. */
  action: string;
  /** When the memory was written. */
  timestamp: number;
  /** Trust score at write time. */
  trustScoreAtWrite: number;
}

// ---------- Goal Types ----------

/**
 * Priority levels for goals.
 */
export type GoalPriority = "critical" | "high" | "medium" | "low";

/**
 * Status of a goal.
 */
export type GoalStatus = "active" | "completed" | "paused" | "failed";

// ---------- Kernel State Types ----------

/**
 * Autonomy Kernel operating states.
 */
export type KernelState =
  | "idle"
  | "planning"
  | "executing"
  | "verifying"
  | "writing_memory"
  | "auditing"
  | "awaiting_approval"
  | "safe_mode"
  | "error";

// ---------- Drift Types ----------

/**
 * Severity of persona drift detection.
 */
export type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";

// ---------- Reward Types ----------

/**
 * Dimensions that reward signals can measure.
 */
export type RewardDimension =
  | "task_completion"
  | "safety"
  | "preference_alignment"
  | "efficiency";

// ---------- Utility Types ----------

/**
 * Validation result used across all validators.
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string; severity: "error" | "warning" }>;
}
