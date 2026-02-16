/**
 * Invariants barrel export and registration.
 *
 * @module autonomy/verification/invariants
 */

import { builtinInvariants } from "./builtin-invariants.js";
import type { InvariantCheckerInterface } from "./types.js";

export {
  builtinInvariants,
  eventStoreIntegrityInvariant,
  noOrphanedApprovalsInvariant,
  stateMachineConsistencyInvariant,
} from "./builtin-invariants.js";
export { InvariantChecker } from "./invariant-checker.js";
export type {
  Invariant,
  InvariantCheckerInterface,
  InvariantCheckResult,
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
