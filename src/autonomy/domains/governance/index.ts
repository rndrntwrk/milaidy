/**
 * Governance barrel exports.
 *
 * @module autonomy/domains/governance
 */

// Policy engine
export { PolicyEngine, type PolicyEngineInterface } from "./policy-engine.js";
// Retention manager
export {
  AuditRetentionManager,
  type AuditRetentionManagerInterface,
  type ComplianceSummary,
  type RetentionExport,
  type RetentionRecord,
} from "./retention-manager.js";
// Types
export type {
  ApprovalRequirement,
  ApprovalRule,
  ComplianceCheck,
  ComplianceCheckResult,
  ComplianceContext,
  GovernancePolicy,
  PolicyEvaluation,
  RetentionPolicy,
} from "./types.js";
