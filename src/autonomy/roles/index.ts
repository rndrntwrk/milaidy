/**
 * Role separation barrel exports.
 * @module autonomy/roles
 */

export { DriftAwareAuditor } from "./auditor.js";
export { PipelineExecutor } from "./executor.js";
export { GatedMemoryWriter } from "./memory-writer.js";
export {
  createRoleModuleRegistry,
  RoleModuleRegistry,
  type RoleModuleHealth,
  type RoleModuleInstances,
  type RoleModuleName,
  type RoleModuleRegistrySnapshot,
} from "./modules.js";
export { KernelOrchestrator } from "./orchestrator.js";
// Implementations
export { GoalDrivenPlanner, type PlannerConfig } from "./planner.js";
export { type SafeModeConfig, SafeModeControllerImpl } from "./safe-mode.js";
export {
  DEFAULT_SAFE_MODE_TOOL_CLASS_RESTRICTIONS,
  evaluateSafeModeToolRestriction,
  type SafeModeToolClassDecision,
  type SafeModeToolClassRestriction,
  type SafeModeToolRestrictionDecision,
  type SafeModeToolRestrictionInput,
} from "./safe-mode-policy.js";
export {
  parseAuditorAuditRequest,
  parseAuditorAuditResponse,
  parseExecutorExecuteRequest,
  parseExecutorExecuteResponse,
  parseMemoryWriteBatchRequest,
  parseMemoryWriteBatchResponse,
  parseOrchestratedRequest,
  parsePlannerCreatePlanRequest,
  parsePlannerCreatePlanResponse,
  parsePlannerValidatePlanResponse,
  parseVerifierVerifyRequest,
  parseVerifierVerifyResponse,
} from "./schemas.js";
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
