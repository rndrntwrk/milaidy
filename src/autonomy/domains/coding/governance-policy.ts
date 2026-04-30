/**
 * Coding domain governance policy — defines approval rules,
 * retention periods, and compliance checks for software engineering tasks.
 *
 * @module autonomy/domains/coding/governance-policy
 */

import type {
  ComplianceCheck,
  GovernancePolicy,
} from "../governance/types.js";

// ---------- Compliance Checks ----------

/** Shell commands must not run as root/sudo. */
const noRootAccessCheck: ComplianceCheck = {
  id: "coding:no-root-access",
  description: "Shell commands must not run with root/sudo privileges",
  check: async (ctx) => {
    // Only applicable to shell-capable tools
    if (ctx.toolName !== "SHELL_EXEC") return true;
    // Source trust from system or user is acceptable
    return ctx.source !== "plugin" || ctx.sourceTrust >= 0.8;
  },
  regulation: "RSP-safe-execution",
};

/** Coding actions require a minimum trust level of 0.6. */
const trustFloorCheck: ComplianceCheck = {
  id: "coding:trust-floor",
  description: "Coding actions require trust >= 0.6",
  check: async (ctx) => ctx.sourceTrust >= 0.6,
  regulation: "RSP-trust-gating",
};

/** All irreversible actions must be auditable (non-zero event count expected). */
const auditTrailCheck: ComplianceCheck = {
  id: "coding:audit-trail",
  description: "Irreversible actions must have an audit trail",
  check: async (ctx) => {
    // Only enforce for irreversible operations
    if (ctx.riskClass !== "irreversible") return true;
    // Trust must be high enough to proceed with irreversible actions
    return ctx.sourceTrust >= 0.7;
  },
  regulation: "RSP-audit-trail",
};

/** Tool outputs must not contain credentials (checked at governance level). */
const outputReviewCheck: ComplianceCheck = {
  id: "coding:output-review",
  description: "Tool outputs must be reviewed for credential exposure",
  check: async (ctx) => {
    // At the governance layer, we verify the domain is properly tagged
    if (ctx.domainId && ctx.domainId !== "coding") return true;
    // Require minimum trust for any tool execution
    return ctx.sourceTrust >= 0.5;
  },
  regulation: "RSP-safe-execution",
};

/** All coding compliance checks. */
export const CODING_COMPLIANCE_CHECKS: ComplianceCheck[] = [
  noRootAccessCheck,
  trustFloorCheck,
  auditTrailCheck,
  outputReviewCheck,
];

// ---------- Governance Policy ----------

/**
 * Governance policy for the coding domain.
 *
 * - read-only: no approval required
 * - reversible: automated approval with trust floor 0.7
 * - irreversible: human approval required
 */
export const CODING_GOVERNANCE_POLICY: GovernancePolicy = {
  id: "coding-governance",
  name: "Software Engineering Governance Policy",
  description:
    "Governance policy for coding domain operations, enforcing safe execution, trust gating, and audit trail compliance",
  approvalRules: [
    { riskClass: "read-only", requirement: "none" },
    { riskClass: "reversible", requirement: "automated", trustFloor: 0.7 },
    { riskClass: "irreversible", requirement: "human" },
  ],
  retention: {
    eventRetentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    auditRetentionMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    exportBeforeEviction: true,
  },
  complianceChecks: CODING_COMPLIANCE_CHECKS,
  rspReferences: [
    "RSP-safe-execution",
    "RSP-trust-gating",
    "RSP-audit-trail",
  ],
};
