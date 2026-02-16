/**
 * Role separation barrel exports.
 * @module autonomy/roles
 */

export { DriftAwareAuditor } from "./auditor.js";
export { GatedMemoryWriter } from "./memory-writer.js";
export { KernelOrchestrator } from "./orchestrator.js";
// Implementations
export { GoalDrivenPlanner, type PlannerConfig } from "./planner.js";
export { type SafeModeConfig, SafeModeControllerImpl } from "./safe-mode.js";
// Role interfaces and types
export type {
  AuditContext,
  AuditorRole,
  AuditReport,
  ExecutionPlan,
  ExecutorRole,
  MemoryWriteReport,
  MemoryWriteRequest,
  MemoryWriterRole,
  OrchestratedRequest,
  OrchestratedResult,
  PlannerRole,
  PlanRequest,
  PlanStep,
  PlanValidation,
  RoleOrchestrator,
  SafeModeController,
  SafeModeExitResult,
  SafeModeStatus,
  VerificationContext,
  VerificationReport,
  VerifierRole,
} from "./types.js";
export { UnifiedVerifier } from "./verifier.js";
