/**
 * Pilot runner and evaluator types.
 *
 * @module autonomy/domains/pilot/types
 */

import type { PolicyEvaluation } from "../governance/types.js";

// ---------- Configuration ----------

/** Configuration for a pilot run. */
export interface PilotConfig {
  /** Domain to evaluate. */
  domainId: string;
  /** Maximum number of scenarios to run (0 = all). */
  maxScenarios?: number;
  /** Timeout per scenario in milliseconds. */
  scenarioTimeoutMs?: number;
}

// ---------- Results ----------

/** Result of a single pilot scenario. */
export interface PilotScenarioResult {
  scenarioId: string;
  benchmarkId: string;
  score: number;
  passed: boolean;
  durationMs: number;
  details?: string;
  error?: string;
}

/** Results for a single benchmark within the pilot. */
export interface PilotBenchmarkResult {
  benchmarkId: string;
  passThreshold: number;
  averageScore: number;
  passed: boolean;
  scenarios: PilotScenarioResult[];
}

/** Complete pilot report for a domain. */
export interface PilotReport {
  domainId: string;
  domainVersion: string;
  startedAt: number;
  completedAt: number;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  passRate: number;
  benchmarkResults: PilotBenchmarkResult[];
  overallPassed: boolean;
  complianceStatus: "compliant" | "non_compliant" | "not_evaluated";
  governanceEvaluation?: PolicyEvaluation;
}

// ---------- Compliance ----------

/** Compliance report produced by the pilot evaluator. */
export interface ComplianceReport {
  domainId: string;
  policyId: string;
  evaluatedAt: number;
  complianceResults: Array<{
    checkId: string;
    passed: boolean;
    regulation: string;
  }>;
  overallCompliant: boolean;
  rspReferences: string[];
  recommendations: string[];
}
