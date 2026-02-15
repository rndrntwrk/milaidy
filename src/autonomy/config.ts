/**
 * Autonomy Kernel configuration types and validation.
 *
 * @module autonomy/config
 */

// ---------- Config Types ----------

/**
 * Trust scoring configuration.
 */
export interface AutonomyTrustConfig {
  /** Minimum trust for automatic memory writes (default: 0.7). */
  writeThreshold?: number;
  /** Trust below this triggers quarantine (default: 0.3). */
  quarantineThreshold?: number;
  /** Enable LLM-based content analysis (default: false). */
  llmAnalysis?: boolean;
  /** Historical window for source reliability in messages (default: 100). */
  historyWindow?: number;
}

/**
 * Memory gate configuration.
 */
export interface AutonomyMemoryGateConfig {
  /** Enable the memory gate (default: true when autonomy.enabled). */
  enabled?: boolean;
  /** Time before quarantined memories auto-expire in ms (default: 3600000). */
  quarantineReviewMs?: number;
  /** Maximum quarantine buffer size (default: 1000). */
  maxQuarantineSize?: number;
}

/**
 * Persona drift monitoring configuration.
 */
export interface AutonomyDriftMonitorConfig {
  /** Enable drift monitoring (default: true when autonomy.enabled). */
  enabled?: boolean;
  /** Number of recent outputs to analyze (default: 20). */
  analysisWindowSize?: number;
  /** Drift score that triggers alerts (default: 0.15). */
  alertThreshold?: number;
  /** Drift score that triggers corrective action (default: 0.25). */
  correctionThreshold?: number;
}

/**
 * Baseline metrics configuration.
 */
export interface AutonomyMetricsConfig {
  /** Path to store baseline snapshots. */
  storagePath?: string;
  /** How often to auto-measure in ms (0 = manual only, default: 0). */
  autoMeasureIntervalMs?: number;
}

/**
 * Top-level Autonomy Kernel configuration.
 */
export interface AutonomyConfig {
  /** Enable the Autonomy Kernel (default: false). */
  enabled?: boolean;
  /** Trust scoring settings. */
  trust?: AutonomyTrustConfig;
  /** Memory gate settings. */
  memoryGate?: AutonomyMemoryGateConfig;
  /** Persona drift monitoring settings. */
  driftMonitor?: AutonomyDriftMonitorConfig;
  /** Baseline metrics settings. */
  metrics?: AutonomyMetricsConfig;
}

// ---------- Defaults ----------

export const DEFAULT_AUTONOMY_CONFIG: Required<AutonomyConfig> = {
  enabled: false,
  trust: {
    writeThreshold: 0.7,
    quarantineThreshold: 0.3,
    llmAnalysis: false,
    historyWindow: 100,
  },
  memoryGate: {
    enabled: true,
    quarantineReviewMs: 3_600_000,
    maxQuarantineSize: 1000,
  },
  driftMonitor: {
    enabled: true,
    analysisWindowSize: 20,
    alertThreshold: 0.15,
    correctionThreshold: 0.25,
  },
  metrics: {
    storagePath: undefined as unknown as string,
    autoMeasureIntervalMs: 0,
  },
};

// ---------- Validation ----------

/**
 * Resolve an autonomy config by merging user values with defaults.
 */
export function resolveAutonomyConfig(
  userConfig?: AutonomyConfig,
): Required<AutonomyConfig> {
  if (!userConfig) return { ...DEFAULT_AUTONOMY_CONFIG };

  return {
    enabled: userConfig.enabled ?? DEFAULT_AUTONOMY_CONFIG.enabled,
    trust: { ...DEFAULT_AUTONOMY_CONFIG.trust, ...userConfig.trust },
    memoryGate: { ...DEFAULT_AUTONOMY_CONFIG.memoryGate, ...userConfig.memoryGate },
    driftMonitor: { ...DEFAULT_AUTONOMY_CONFIG.driftMonitor, ...userConfig.driftMonitor },
    metrics: { ...DEFAULT_AUTONOMY_CONFIG.metrics, ...userConfig.metrics },
  };
}

/**
 * Validate an autonomy config. Returns an array of issues (empty = valid).
 */
export function validateAutonomyConfig(
  config: AutonomyConfig,
): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];

  if (config.trust?.writeThreshold !== undefined) {
    if (config.trust.writeThreshold < 0 || config.trust.writeThreshold > 1) {
      issues.push({ path: "autonomy.trust.writeThreshold", message: "Must be between 0 and 1" });
    }
  }

  if (config.trust?.quarantineThreshold !== undefined) {
    if (config.trust.quarantineThreshold < 0 || config.trust.quarantineThreshold > 1) {
      issues.push({ path: "autonomy.trust.quarantineThreshold", message: "Must be between 0 and 1" });
    }
  }

  if (
    config.trust?.writeThreshold !== undefined &&
    config.trust?.quarantineThreshold !== undefined &&
    config.trust.quarantineThreshold >= config.trust.writeThreshold
  ) {
    issues.push({
      path: "autonomy.trust",
      message: "quarantineThreshold must be less than writeThreshold",
    });
  }

  if (config.trust?.historyWindow !== undefined && config.trust.historyWindow < 1) {
    issues.push({ path: "autonomy.trust.historyWindow", message: "Must be at least 1" });
  }

  if (config.memoryGate?.maxQuarantineSize !== undefined && config.memoryGate.maxQuarantineSize < 1) {
    issues.push({ path: "autonomy.memoryGate.maxQuarantineSize", message: "Must be at least 1" });
  }

  if (config.driftMonitor?.analysisWindowSize !== undefined && config.driftMonitor.analysisWindowSize < 1) {
    issues.push({ path: "autonomy.driftMonitor.analysisWindowSize", message: "Must be at least 1" });
  }

  if (config.driftMonitor?.alertThreshold !== undefined) {
    if (config.driftMonitor.alertThreshold < 0 || config.driftMonitor.alertThreshold > 1) {
      issues.push({ path: "autonomy.driftMonitor.alertThreshold", message: "Must be between 0 and 1" });
    }
  }

  return issues;
}
