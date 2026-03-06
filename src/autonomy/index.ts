/**
 * Autonomy Kernel — entry point and feature gate.
 *
 * The Autonomy Kernel provides governed state machines for identity,
 * memory, tool invocation, and reward shaping. It is entirely opt-in:
 * when `autonomy.enabled` is false (default), this module is a no-op.
 *
 * @module autonomy
 */

import { logger } from "@elizaos/core";
import {
  type AutonomyConfig,
  resolveAutonomyConfig,
  validateAutonomyConfig,
} from "./config.js";

// Re-export workflow engine adapters
export {
  LocalWorkflowEngine,
  TemporalWorkflowEngine,
  type WorkflowDeadLetter,
  type WorkflowDefinition,
  type WorkflowEngine,
  type WorkflowResult,
} from "./adapters/workflow/index.js";
// Re-export approval gate
export {
  type ApprovalDecision,
  ApprovalGate,
  type ApprovalGateInterface,
  type ApprovalRequest,
  type ApprovalResult,
  PersistentApprovalGate,
} from "./approval/index.js";
// Re-export types and config
// Re-export workflow config types
// Re-export role config
export type {
  AutonomyApprovalConfig,
  AutonomyConfig,
  AutonomyDomainsConfig,
  AutonomyEventStoreConfig,
  AutonomyInvariantsConfig,
  AutonomyLearningConfig,
  AutonomyRolesConfig,
  AutonomyWorkflowConfig,
  AutonomyWorkflowEngineConfig,
} from "./config.js";
// Re-export retrieval config
export {
  type AutonomyRetrievalConfig,
  DEFAULT_RETRIEVAL_CONFIG,
  resolveAutonomyConfig,
  validateAutonomyConfig,
} from "./config.js";
// Re-export domains infrastructure (Phase 5)
export * from "./domains/index.js";
export { createDriftWatchEvaluator } from "./evaluators/drift-watch.js";
// Re-export evaluators
export { createTrustGateEvaluator } from "./evaluators/trust-gate.js";
export {
  type Goal,
  type GoalEvaluationResult,
  type GoalManager,
  InMemoryGoalManager,
  type MutationContext,
} from "./goals/manager.js";
export {
  type DriftReport,
  type PersonaDriftMonitor,
  RuleBasedDriftMonitor,
} from "./identity/drift-monitor.js";

// Re-export identity schema
export {
  type AutonomyIdentityConfig,
  type CommunicationStyle,
  computeIdentityHash,
  createDefaultAutonomyIdentity,
  validateAutonomyIdentity,
  verifyIdentityIntegrity,
} from "./identity/schema.js";
// Re-export learning infrastructure (Phase 4)
export * from "./learning/index.js";
export {
  type MemoryGate,
  type MemoryGateDecision,
  MemoryGateImpl,
  type MemoryGateStats,
} from "./memory/gate.js";
// Re-export retriever types
export {
  type RankedMemory,
  type RetrievalOptions,
  type TrustAwareRetriever,
  TrustAwareRetrieverImpl,
} from "./memory/retriever.js";
export type { MemoryStore } from "./memory/store.js";
// Re-export metrics
export {
  type BaselineHarness,
  type BaselineMetrics,
  BUILTIN_SCENARIOS,
  type EvaluationScenario,
  FileBaselineHarness,
  InMemoryBaselineHarness,
  type KernelComponents,
  KernelScenarioEvaluator,
  type MetricsDelta,
  SCENARIOS_BY_METRIC,
  type ScenarioEvaluator,
  type ScenarioResult,
  SOW_TARGETS,
} from "./metrics/index.js";
// Re-export roles (Phase 3)
export {
  type AuditContext,
  type AuditorRole,
  type AuditReport,
  DriftAwareAuditor,
  type ExecutionPlan,
  type ExecutorRole,
  GatedMemoryWriter,
  GoalDrivenPlanner,
  KernelOrchestrator,
  type MemoryWriteReport,
  type MemoryWriteRequest,
  type MemoryWriterRole,
  type OrchestratedRequest,
  type OrchestratedResult,
  PipelineExecutor,
  type PlannerConfig,
  type PlannerRole,
  type PlanRequest,
  type PlanStep,
  type PlanValidation,
  type RoleOrchestrator,
  type SafeModeConfig,
  type SafeModeController,
  SafeModeControllerImpl,
  type SafeModeExitResult,
  type SafeModeStatus,
  UnifiedVerifier,
  type VerificationContext,
  type VerificationReport,
  type VerifierRole,
} from "./roles/index.js";
// Re-export service
export { MilaidyAutonomyService, setAutonomyConfig } from "./service.js";
// Re-export state machine
export {
  KernelStateMachine,
  type KernelStateMachineInterface,
  type StateChangeListener,
  type StateTransition,
  type StateTrigger,
  type TransitionResult,
} from "./state-machine/index.js";
// Re-export component classes and interfaces
export { RuleBasedTrustScorer, type TrustScorer } from "./trust/scorer.js";
export type * from "./types.js";
// Re-export verification invariants
export {
  type Invariant,
  InvariantChecker,
  type InvariantCheckerInterface,
  type InvariantCheckResult,
  type InvariantContext,
  type InvariantResult,
  type InvariantSeverity,
  type InvariantStatus,
  registerBuiltinInvariants,
} from "./verification/index.js";
// Re-export workflow engine
export {
  BUILTIN_COMPENSATION_ELIGIBILITY,
  type CompensationContext,
  type CompensationEligibility,
  type CompensationFn,
  type CompensationIncident,
  CompensationIncidentManager,
  type CompensationIncidentManagerInterface,
  type CompensationIncidentReason,
  type CompensationIncidentStatus,
  CompensationRegistry,
  type CompensationRegistryInterface,
  type EventStoreInterface,
  type ExecutionEvent,
  type ExecutionEventType,
  InMemoryEventStore,
  listBuiltinCompensationEligibility,
  listBuiltinCompensationTools,
  type PipelineConfig,
  type PipelineResult,
  registerBuiltinCompensations,
  type ToolActionHandler,
  ToolExecutionPipeline,
  type ToolExecutionPipelineInterface,
} from "./workflow/index.js";

// ---------- Kernel State ----------

let _kernelInitialized = false;
let _resolvedConfig: ReturnType<typeof resolveAutonomyConfig> | null = null;

/**
 * Check whether the Autonomy Kernel is enabled and initialized.
 */
export function isAutonomyEnabled(): boolean {
  return _kernelInitialized && (_resolvedConfig?.enabled ?? false);
}

/**
 * Get the resolved autonomy configuration.
 * Returns null if the kernel has not been initialized.
 */
export function getAutonomyConfig(): ReturnType<
  typeof resolveAutonomyConfig
> | null {
  return _resolvedConfig;
}

/**
 * Initialize the Autonomy Kernel.
 *
 * This should be called once during agent startup, after the main
 * config has been loaded. If `config.enabled` is false, the kernel
 * remains dormant and all feature gates return early.
 */
export async function initAutonomyKernel(config?: AutonomyConfig): Promise<{
  enabled: boolean;
  issues: Array<{ path: string; message: string }>;
}> {
  if (_kernelInitialized) {
    logger.warn("[autonomy] Kernel already initialized, skipping re-init");
    return { enabled: _resolvedConfig?.enabled ?? false, issues: [] };
  }

  const resolved = resolveAutonomyConfig(config);
  _resolvedConfig = resolved;

  if (!resolved.enabled) {
    logger.debug("[autonomy] Kernel disabled by config");
    _kernelInitialized = true;
    return { enabled: false, issues: [] };
  }

  // Validate config
  const issues = validateAutonomyConfig(resolved);
  if (issues.length > 0) {
    for (const issue of issues) {
      logger.warn(`[autonomy] Config issue at ${issue.path}: ${issue.message}`);
    }
  }

  _kernelInitialized = true;
  logger.info("[autonomy] Kernel initialized");

  return { enabled: true, issues };
}

/**
 * Shut down the Autonomy Kernel.
 */
export async function shutdownAutonomyKernel(): Promise<void> {
  if (!_kernelInitialized) return;

  _kernelInitialized = false;
  _resolvedConfig = null;

  logger.info("[autonomy] Kernel shut down");
}

/**
 * Reset kernel state (for testing).
 */
export function resetAutonomyKernel(): void {
  _kernelInitialized = false;
  _resolvedConfig = null;
}
