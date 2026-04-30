/**
 * Policy Engine — evaluates governance policies against tool actions
 * to determine approval requirements and compliance status.
 *
 * @module autonomy/domains/governance/policy-engine
 */

import type {
  ApprovalRequirement,
  ComplianceCheckResult,
  ComplianceContext,
  GovernancePolicy,
  PolicyEvaluation,
} from "./types.js";

// ---------- Interface ----------

/**
 * Interface for the governance policy engine.
 */
export interface PolicyEngineInterface {
  /** Register a governance policy. */
  registerPolicy(policy: GovernancePolicy): void;
  /** Get a registered policy by ID. */
  getPolicy(id: string): GovernancePolicy | undefined;
  /** Evaluate a specific policy against an action context. */
  evaluate(
    ctx: ComplianceContext,
    policyId: string,
  ): Promise<PolicyEvaluation>;
  /** Evaluate all registered policies against an action context. */
  evaluateAll(ctx: ComplianceContext): Promise<PolicyEvaluation[]>;
  /** List all registered policies. */
  listPolicies(): Array<{ id: string; name: string }>;
}

// ---------- Implementation ----------

/**
 * In-memory governance policy engine.
 *
 * Evaluates governance policies by matching risk classes to approval
 * requirements and running compliance checks.
 */
export class PolicyEngine implements PolicyEngineInterface {
  private readonly policies = new Map<string, GovernancePolicy>();

  registerPolicy(policy: GovernancePolicy): void {
    this.policies.set(policy.id, policy);
  }

  getPolicy(id: string): GovernancePolicy | undefined {
    return this.policies.get(id);
  }

  async evaluate(
    ctx: ComplianceContext,
    policyId: string,
  ): Promise<PolicyEvaluation> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Governance policy "${policyId}" not found`);
    }

    // Determine approval requirement from risk class
    const approvalRequirement = this.resolveApproval(policy, ctx);

    // Run compliance checks
    const complianceResults: ComplianceCheckResult[] = [];
    const reasons: string[] = [];

    for (const check of policy.complianceChecks) {
      const passed = await check.check(ctx);
      complianceResults.push({
        checkId: check.id,
        passed,
        regulation: check.regulation,
      });
      if (!passed) {
        reasons.push(
          `Compliance check "${check.id}" failed (${check.regulation})`,
        );
      }
    }

    const overallCompliant = complianceResults.every((r) => r.passed);

    // Approved if compliant and approval requirement doesn't block
    const approved =
      overallCompliant && approvalRequirement !== "human" && approvalRequirement !== "dual";

    if (approvalRequirement === "human") {
      reasons.push("Human approval required for this risk class");
    }
    if (approvalRequirement === "dual") {
      reasons.push("Dual approval (human + automated) required");
    }

    return {
      policyId,
      approved,
      approvalRequirement,
      complianceResults,
      overallCompliant,
      reasons,
    };
  }

  async evaluateAll(ctx: ComplianceContext): Promise<PolicyEvaluation[]> {
    const results: PolicyEvaluation[] = [];
    for (const policyId of this.policies.keys()) {
      results.push(await this.evaluate(ctx, policyId));
    }
    return results;
  }

  listPolicies(): Array<{ id: string; name: string }> {
    const list: Array<{ id: string; name: string }> = [];
    for (const policy of this.policies.values()) {
      list.push({ id: policy.id, name: policy.name });
    }
    return list;
  }

  private resolveApproval(
    policy: GovernancePolicy,
    ctx: ComplianceContext,
  ): ApprovalRequirement {
    const rule = policy.approvalRules.find((r) => r.riskClass === ctx.riskClass);
    if (!rule) return "none";

    // For automated approval, check trust floor
    if (rule.requirement === "automated" && rule.trustFloor !== undefined) {
      if (ctx.sourceTrust >= rule.trustFloor) {
        return "none"; // Auto-approved by sufficient trust
      }
      return "human"; // Escalate to human if trust is insufficient
    }

    return rule.requirement;
  }
}
