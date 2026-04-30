/**
 * Local policy evaluator — delegates to the in-process governance PolicyEngine.
 *
 * @module autonomy/adapters/policy/local-evaluator
 */

import type { PolicyEvaluator, PolicyInput, PolicyDecision } from "./types.js";

/** Rule-based policy definition for the local evaluator. */
export interface LocalPolicyRule {
  /** Unique ID. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Actions this rule applies to (glob-like matching or exact). */
  actions: string[];
  /** Risk classes this rule applies to. Empty = all. */
  riskClasses?: string[];
  /** Decision: allow or deny. */
  effect: "allow" | "deny";
  /** Whether to require approval even if allowed. */
  requiresApproval?: boolean;
}

/**
 * In-process policy evaluator using configurable rules.
 * This is the default when no external policy engine (OPA, etc.) is configured.
 */
export class LocalPolicyEvaluator implements PolicyEvaluator {
  private readonly rules: LocalPolicyRule[];

  constructor(rules: LocalPolicyRule[] = []) {
    this.rules = [...rules];
  }

  async evaluate(input: PolicyInput): Promise<PolicyDecision> {
    const matched = this.findMatchingRules(input);
    if (matched.length === 0) {
      return { allowed: true, reason: "No matching policy — default allow" };
    }
    // Deny takes precedence
    const deny = matched.find((r) => r.effect === "deny");
    if (deny) {
      return {
        allowed: false,
        reason: `Denied by policy: ${deny.name}`,
        policyId: deny.id,
      };
    }
    const first = matched[0];
    return {
      allowed: true,
      reason: `Allowed by policy: ${first.name}`,
      policyId: first.id,
      requiresApproval: first.requiresApproval,
    };
  }

  async evaluateAll(input: PolicyInput): Promise<PolicyDecision[]> {
    const matched = this.findMatchingRules(input);
    if (matched.length === 0) {
      return [{ allowed: true, reason: "No matching policy — default allow" }];
    }
    return matched.map((rule) => ({
      allowed: rule.effect === "allow",
      reason: `${rule.effect === "allow" ? "Allowed" : "Denied"} by policy: ${rule.name}`,
      policyId: rule.id,
      requiresApproval: rule.requiresApproval,
    }));
  }

  async close(): Promise<void> {
    // No resources to release
  }

  private findMatchingRules(input: PolicyInput): LocalPolicyRule[] {
    return this.rules.filter((rule) => {
      const actionMatch = rule.actions.some((a) =>
        a === "*" || a === input.action || (a.endsWith("*") && input.action.startsWith(a.slice(0, -1))),
      );
      if (!actionMatch) return false;
      if (rule.riskClasses && rule.riskClasses.length > 0) {
        return rule.riskClasses.includes(input.riskClass);
      }
      return true;
    });
  }
}
