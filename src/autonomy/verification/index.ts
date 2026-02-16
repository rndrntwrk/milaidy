/**
 * Verification barrel export.
 *
 * @module autonomy/verification
 */

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
  VerificationResult,
  VerificationStatus,
  VerifierContext,
} from "./types.js";
