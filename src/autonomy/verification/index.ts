/**
 * Verification barrel export.
 *
 * @module autonomy/verification
 */

export {
  InvariantChecker,
  registerBuiltinInvariants,
} from "./invariants/index.js";
export type {
  Invariant,
  InvariantCheckResult,
  InvariantCheckerInterface,
  InvariantContext,
  InvariantOwner,
  InvariantResult,
  InvariantSeverity,
  InvariantStatus,
} from "./invariants/index.js";
export { PostConditionVerifier } from "./postcondition-verifier.js";
export {
  installPluginPostConditions,
  registerBuiltinPostConditions,
  terminalPostConditions,
} from "./postconditions/index.js";
export { SchemaValidator } from "./schema-validator.js";
export type {
  PostCondition,
  PostConditionCheckResult,
  PostConditionSeverity,
  PostConditionVerifierInterface,
  VerificationFailureCode,
  VerificationFailureTaxonomy,
  VerificationResult,
  VerificationStatus,
  VerifierContext,
} from "./types.js";
