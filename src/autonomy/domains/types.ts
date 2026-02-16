/**
 * Domain Capability Pack types — defines the shape of domain packs,
 * benchmarks, safe-mode triggers, and registry metadata.
 *
 * @module autonomy/domains/types
 */

import type { EvaluationScenario } from "../metrics/types.js";
import type { ToolContract } from "../tools/types.js";
import type { Invariant } from "../verification/invariants/types.js";

// ---------- Domain Identifiers ----------

/** Unique domain identifier. */
export type DomainId = string;

/** Status of a registered domain pack. */
export type DomainPackStatus = "loaded" | "unloaded" | "error";

// ---------- Safe-Mode Triggers ----------

/** Severity levels for domain-specific safe-mode triggers. */
export type DomainTriggerSeverity = "warning" | "critical";

/** Context provided to domain safe-mode trigger checks. */
export interface DomainTriggerContext {
  requestId: string;
  toolName: string;
  result: unknown;
  durationMs: number;
  consecutiveErrors: number;
}

/** A domain-specific condition that may trigger safe mode. */
export interface DomainSafeModeTrigger {
  id: string;
  description: string;
  /** Returns true if safe mode should be entered. */
  check: (ctx: DomainTriggerContext) => Promise<boolean>;
  severity: DomainTriggerSeverity;
}

// ---------- Domain Benchmarks ----------

/**
 * A domain-specific benchmark that groups evaluation scenarios
 * with a pass threshold.
 */
export interface DomainBenchmark {
  id: string;
  description: string;
  /** Scenarios to run as part of this benchmark. */
  scenarios: EvaluationScenario[];
  /** Pass threshold (0-1). Benchmark passes if average score >= threshold. */
  passThreshold: number;
}

// ---------- Domain Pack ----------

/**
 * A complete domain capability pack — everything needed to safely
 * apply the autonomy kernel to a specific business context.
 */
export interface DomainPack {
  /** Unique domain identifier. */
  id: DomainId;
  /** Human-readable name. */
  name: string;
  /** Semantic version. */
  version: string;
  /** Description of the domain. */
  description: string;
  /** Tool contracts specific to this domain. */
  toolContracts: ToolContract[];
  /** Domain-specific invariants. */
  invariants: Invariant[];
  /** Domain-specific benchmarks. */
  benchmarks: DomainBenchmark[];
  /** Tags applied to all domain tools for filtering. */
  tags: string[];
  /** Domain-specific safe-mode triggers. */
  safeModeTriggers: DomainSafeModeTrigger[];
  /** Governance policy ID (references a GovernancePolicy). */
  governancePolicyId?: string;
}

// ---------- Registry Metadata ----------

/** Summary info about a registered domain pack. */
export interface DomainPackInfo {
  id: DomainId;
  name: string;
  version: string;
  status: DomainPackStatus;
  toolCount: number;
  invariantCount: number;
  benchmarkCount: number;
  loadedAt?: number;
}
