/**
 * Invariants barrel export and registration.
 *
 * @module autonomy/verification/invariants
 */

import type { InvariantCheckerInterface } from "./types.js";
import { builtinInvariants } from "./builtin-invariants.js";

export { InvariantChecker } from "./invariant-checker.js";
export {
  builtinInvariants,
  eventStoreIntegrityInvariant,
  noOrphanedApprovalsInvariant,
  stateMachineConsistencyInvariant,
} from "./builtin-invariants.js";
export type {
  Invariant,
  InvariantCheckResult,
  InvariantCheckerInterface,
  InvariantContext,
  InvariantResult,
  InvariantSeverity,
  InvariantStatus,
} from "./types.js";

/**
 * Register all built-in invariants into a checker.
 */
export function registerBuiltinInvariants(
  checker: InvariantCheckerInterface,
): void {
  checker.registerMany(builtinInvariants);
}
