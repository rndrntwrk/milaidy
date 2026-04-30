/**
 * Governance types — defines policies, compliance checks, retention rules,
 * and evaluation results for domain governance.
 *
 * @module autonomy/domains/governance/types
 */

import type { RiskClass, ToolCallSource } from "../../tools/types.js";

// ---------- Approval ----------

/** Approval requirement levels for tool actions. */
export type ApprovalRequirement = "none" | "human" | "automated" | "dual";

// ---------- Retention ----------

/** Retention policy for events and audit reports. */
export interface RetentionPolicy {
  /** How long to retain execution events in ms. */
  eventRetentionMs: number;
  /** How long to retain audit reports in ms. */
  auditRetentionMs: number;
  /** Whether to export records before eviction. */
  exportBeforeEviction: boolean;
  /** Path for JSONL export files. */
  exportPath?: string;
}

// ---------- Compliance ----------

/** Context provided to compliance check functions. */
export interface ComplianceContext {
  toolName: string;
  riskClass: RiskClass;
  source: ToolCallSource;
  sourceTrust: number;
  domainId?: string;
}

/** A single compliance check that enforces a regulation or policy. */
export interface ComplianceCheck {
  id: string;
  description: string;
  /** Returns true if the action/state is compliant. */
  check: (ctx: ComplianceContext) => Promise<boolean>;
  /** Regulation or policy this check enforces. */
  regulation: string;
}

// ---------- Governance Policy ----------

/** Approval rule for a specific risk class. */
export interface ApprovalRule {
  riskClass: RiskClass;
  requirement: ApprovalRequirement;
  /** Minimum trust score for auto-approval (when requirement is "automated"). */
  trustFloor?: number;
}

/**
 * A governance policy that defines approval, retention, and compliance
 * requirements for a domain or the kernel as a whole.
 */
export interface GovernancePolicy {
  id: string;
  name: string;
  description: string;
  /** Approval rules per risk class. */
  approvalRules: ApprovalRule[];
  /** Event and audit retention rules. */
  retention: RetentionPolicy;
  /** Compliance checks to enforce. */
  complianceChecks: ComplianceCheck[];
  /** Responsible Scaling Policy references. */
  rspReferences?: string[];
}

// ---------- Evaluation Results ----------

/** Result of a single compliance check. */
export interface ComplianceCheckResult {
  checkId: string;
  passed: boolean;
  regulation: string;
}

/** Result of evaluating a governance policy against an action. */
export interface PolicyEvaluation {
  policyId: string;
  approved: boolean;
  approvalRequirement: ApprovalRequirement;
  complianceResults: ComplianceCheckResult[];
  overallCompliant: boolean;
  reasons: string[];
}
