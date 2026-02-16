/**
 * Built-in cross-system invariants.
 *
 * @module autonomy/verification/invariants/builtin-invariants
 */

import type { Invariant } from "./types.js";

/**
 * After a successful pipeline run the state machine should be in `idle`.
 * After a failed run it should be in `idle` (recovered), `error`, or `safe_mode`.
 */
export const stateMachineConsistencyInvariant: Invariant = {
  id: "invariant:state-machine:consistency",
  description:
    "State machine is in a valid state after pipeline execution",
  check: async (ctx) => {
    if (ctx.executionSucceeded) {
      return ctx.currentState === "idle";
    }
    return ["idle", "error", "safe_mode"].includes(ctx.currentState);
  },
  severity: "critical",
};

/**
 * Every completed pipeline run should have at least a `tool:proposed`
 * and a `tool:validated` event (minimum 2).
 */
export const eventStoreIntegrityInvariant: Invariant = {
  id: "invariant:event-store:integrity",
  description:
    "Pipeline execution produced at least proposed and validated events",
  check: async (ctx) => {
    return ctx.eventCount >= 2;
  },
  severity: "warning",
};

/**
 * After a pipeline run completes there should be no pending approval
 * requests left dangling.
 */
export const noOrphanedApprovalsInvariant: Invariant = {
  id: "invariant:approval:no-orphans",
  description: "No orphaned approval requests after pipeline completion",
  check: async (ctx) => {
    return ctx.pendingApprovalCount === 0;
  },
  severity: "warning",
};

/**
 * All built-in invariants.
 */
export const builtinInvariants: Invariant[] = [
  stateMachineConsistencyInvariant,
  eventStoreIntegrityInvariant,
  noOrphanedApprovalsInvariant,
];
