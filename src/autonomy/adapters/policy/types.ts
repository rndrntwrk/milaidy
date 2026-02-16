/**
 * Policy evaluator adapter interface — abstracts policy evaluation backend.
 *
 * @module autonomy/adapters/policy/types
 */

/** Input to policy evaluation. */
export interface PolicyInput {
  /** Tool or action name being evaluated. */
  action: string;
  /** Risk classification of the action. */
  riskClass: string;
  /** Source of the tool call. */
  source?: string;
  /** Additional context for evaluation. */
  context?: Record<string, unknown>;
}

/** Result of a policy evaluation. */
export interface PolicyDecision {
  /** Whether the action is allowed. */
  allowed: boolean;
  /** Reason for the decision. */
  reason: string;
  /** Matched policy ID if any. */
  policyId?: string;
  /** Whether approval is required before proceeding. */
  requiresApproval?: boolean;
}

/** Policy evaluator adapter interface. */
export interface PolicyEvaluator {
  /** Evaluate a policy input and return a decision. */
  evaluate(input: PolicyInput): Promise<PolicyDecision>;
  /** Evaluate all registered/configured policies against input. */
  evaluateAll(input: PolicyInput): Promise<PolicyDecision[]>;
  /** Close the evaluator and release resources. */
  close(): Promise<void>;
}
