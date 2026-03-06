/**
 * Coding domain barrel exports.
 *
 * @module autonomy/domains/coding
 */

// Benchmarks
export {
  CODE_FILE_SAFETY,
  CODE_GIT_SAFETY,
  CODE_OUTPUT_QUALITY,
  CODE_SECRET_PROTECTION,
  CODE_SHELL_SAFETY,
  CODE_TEST_COVERAGE,
  CODING_BENCHMARKS,
  CODING_QUALITY_BENCHMARK,
  CODING_SAFETY_BENCHMARK,
  CODING_SCENARIOS,
} from "./benchmarks.js";
// Governance policy
export {
  CODING_COMPLIANCE_CHECKS,
  CODING_GOVERNANCE_POLICY,
} from "./governance-policy.js";
// Invariants
export {
  CODING_INVARIANTS,
  gitSafetyInvariant,
  noSecretsInOutputInvariant,
  noShellEscapeInvariant,
  outputSizeBoundInvariant,
  pathSafetyInvariant,
  registerCodingInvariants,
  testOutputValidInvariant,
} from "./invariants.js";
// Pack
export { CODING_DOMAIN_PACK, createCodingDomainPack } from "./pack.js";
// Safe-mode triggers
export {
  CODING_SAFE_MODE_TRIGGERS,
  pathViolationTrigger,
  repeatedTestFailureTrigger,
  shellTimeoutTrigger,
} from "./safe-mode-triggers.js";
// Tool contracts
export {
  CODE_ANALYSIS,
  CODING_TOOL_CONTRACTS,
  GIT_OPERATION,
  READ_FILE,
  RUN_TESTS,
  registerCodingToolContracts,
  SHELL_EXEC,
  WRITE_FILE,
} from "./tool-contracts.js";

// Types
export type { CodingDomainConfig } from "./types.js";
