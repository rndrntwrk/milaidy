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

// Re-export types and config
export type { AutonomyConfig } from "./config.js";
export {
  resolveAutonomyConfig,
  validateAutonomyConfig,
} from "./config.js";
export type * from "./types.js";

// Re-export service
export { MilaidyAutonomyService, setAutonomyConfig } from "./service.js";

// Re-export evaluators
export { createTrustGateEvaluator } from "./evaluators/trust-gate.js";
export { createDriftWatchEvaluator } from "./evaluators/drift-watch.js";

// Re-export component classes and interfaces
export { RuleBasedTrustScorer, type TrustScorer } from "./trust/scorer.js";
export { MemoryGateImpl, type MemoryGate, type MemoryGateDecision, type MemoryGateStats } from "./memory/gate.js";
export { RuleBasedDriftMonitor, type PersonaDriftMonitor, type DriftReport } from "./identity/drift-monitor.js";
export { InMemoryGoalManager, type GoalManager, type Goal, type GoalEvaluationResult, type MutationContext } from "./goals/manager.js";

// Re-export retriever types
export {
  TrustAwareRetrieverImpl,
  type TrustAwareRetriever,
  type RankedMemory,
  type RetrievalOptions,
} from "./memory/retriever.js";

// Re-export identity schema
export {
  type AutonomyIdentityConfig,
  type CommunicationStyle,
  createDefaultAutonomyIdentity,
  computeIdentityHash,
  verifyIdentityIntegrity,
  validateAutonomyIdentity,
} from "./identity/schema.js";

// Re-export retrieval config
export { DEFAULT_RETRIEVAL_CONFIG, type AutonomyRetrievalConfig } from "./config.js";

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
export function getAutonomyConfig(): ReturnType<typeof resolveAutonomyConfig> | null {
  return _resolvedConfig;
}

/**
 * Initialize the Autonomy Kernel.
 *
 * This should be called once during agent startup, after the main
 * config has been loaded. If `config.enabled` is false, the kernel
 * remains dormant and all feature gates return early.
 */
export async function initAutonomyKernel(
  config?: AutonomyConfig,
): Promise<{ enabled: boolean; issues: Array<{ path: string; message: string }> }> {
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
