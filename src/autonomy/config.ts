/**
 * Autonomy Kernel configuration types and validation.
 *
 * @module autonomy/config
 */

import type { AutonomyIdentityConfig } from "./identity/schema.js";
import { validateAutonomyIdentity } from "./identity/schema.js";

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
 * Trust-aware retrieval ranking configuration.
 */
export interface AutonomyRetrievalConfig {
  /** Weight for trust dimension in ranking (default: 0.3). */
  trustWeight?: number;
  /** Weight for recency dimension in ranking (default: 0.25). */
  recencyWeight?: number;
  /** Weight for relevance dimension in ranking (default: 0.3). */
  relevanceWeight?: number;
  /** Weight for memory type dimension in ranking (default: 0.15). */
  typeWeight?: number;
  /** Maximum number of results to return (default: 20). */
  maxResults?: number;
  /** Minimum trust score to include in results (default: 0.1). */
  minTrustThreshold?: number;
  /** Per-type boost multipliers. */
  typeBoosts?: Partial<Record<string, number>>;
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
 * Tool contracts and schema validation configuration.
 */
export interface AutonomyToolsConfig {
  /** Reject unknown fields in tool params (default: true). */
  strictMode?: boolean;
  /** Default execution timeout in ms for tools that don't specify one (default: 30000). */
  defaultTimeoutMs?: number;
  /** Per-check timeout in ms for post-condition verification (default: 5000). */
  checkTimeoutMs?: number;
}

/**
 * Workflow execution pipeline configuration.
 */
export interface AutonomyWorkflowConfig {
  /** Whether the pipeline is enabled (default: true). */
  enabled?: boolean;
  /** Maximum concurrent tool executions (default: 1). */
  maxConcurrent?: number;
  /** Default timeout for tool execution in ms (default: 30000). */
  defaultTimeoutMs?: number;
}

/**
 * Approval gate configuration.
 */
export interface AutonomyApprovalConfig {
  /** Whether approval gating is enabled (default: true). */
  enabled?: boolean;
  /** Timeout for approval requests in ms (default: 300000). */
  timeoutMs?: number;
  /** Auto-approve read-only tools (default: true). */
  autoApproveReadOnly?: boolean;
  /** Tool call sources that are auto-approved (default: []). */
  autoApproveSources?: Array<import("./tools/types.js").ToolCallSource>;
}

/**
 * Event store configuration.
 */
export interface AutonomyEventStoreConfig {
  /** Maximum number of events to retain (default: 10000). */
  maxEvents?: number;
  /** Retention period in ms (0 = no time-based eviction, default: 0). */
  retentionMs?: number;
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
  /** Identity configuration. */
  identity?: AutonomyIdentityConfig;
  /** Trust-aware retrieval ranking settings. */
  retrieval?: AutonomyRetrievalConfig;
  /** Tool contracts and schema validation settings. */
  tools?: AutonomyToolsConfig;
  /** Workflow execution pipeline settings. */
  workflow?: AutonomyWorkflowConfig;
  /** Approval gate settings. */
  approval?: AutonomyApprovalConfig;
  /** Event store settings. */
  eventStore?: AutonomyEventStoreConfig;
}

// ---------- Defaults ----------

export const DEFAULT_RETRIEVAL_CONFIG: Required<AutonomyRetrievalConfig> = {
  trustWeight: 0.3,
  recencyWeight: 0.25,
  relevanceWeight: 0.3,
  typeWeight: 0.15,
  maxResults: 20,
  minTrustThreshold: 0.1,
  typeBoosts: {},
};

export const DEFAULT_AUTONOMY_CONFIG: {
  enabled: boolean;
  trust: Required<AutonomyTrustConfig>;
  memoryGate: Required<AutonomyMemoryGateConfig>;
  driftMonitor: Required<AutonomyDriftMonitorConfig>;
  metrics: Required<AutonomyMetricsConfig>;
  identity: AutonomyIdentityConfig | undefined;
  retrieval: Required<AutonomyRetrievalConfig>;
} = {
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
    storagePath: "",
    autoMeasureIntervalMs: 0,
  },
  identity: undefined,
  retrieval: { ...DEFAULT_RETRIEVAL_CONFIG },
};

// ---------- Validation ----------

/**
 * Resolve an autonomy config by merging user values with defaults.
 */
export function resolveAutonomyConfig(
  userConfig?: AutonomyConfig,
) {
  if (!userConfig) return { ...DEFAULT_AUTONOMY_CONFIG, retrieval: { ...DEFAULT_RETRIEVAL_CONFIG } };

  return {
    enabled: userConfig.enabled ?? DEFAULT_AUTONOMY_CONFIG.enabled,
    trust: { ...DEFAULT_AUTONOMY_CONFIG.trust, ...userConfig.trust },
    memoryGate: { ...DEFAULT_AUTONOMY_CONFIG.memoryGate, ...userConfig.memoryGate },
    driftMonitor: { ...DEFAULT_AUTONOMY_CONFIG.driftMonitor, ...userConfig.driftMonitor },
    metrics: { ...DEFAULT_AUTONOMY_CONFIG.metrics, ...userConfig.metrics },
    identity: userConfig.identity ?? DEFAULT_AUTONOMY_CONFIG.identity,
    retrieval: { ...DEFAULT_RETRIEVAL_CONFIG, ...userConfig.retrieval },
    tools: userConfig.tools,
    workflow: {
      enabled: userConfig.workflow?.enabled ?? true,
      maxConcurrent: userConfig.workflow?.maxConcurrent ?? 1,
      defaultTimeoutMs: userConfig.workflow?.defaultTimeoutMs ?? 30_000,
    },
    approval: {
      enabled: userConfig.approval?.enabled ?? true,
      timeoutMs: userConfig.approval?.timeoutMs ?? 300_000,
      autoApproveReadOnly: userConfig.approval?.autoApproveReadOnly ?? true,
      autoApproveSources: userConfig.approval?.autoApproveSources ?? [],
    },
    eventStore: {
      maxEvents: userConfig.eventStore?.maxEvents ?? 10_000,
      retentionMs: userConfig.eventStore?.retentionMs ?? 0,
    },
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

  if (config.driftMonitor?.correctionThreshold !== undefined) {
    if (config.driftMonitor.correctionThreshold < 0 || config.driftMonitor.correctionThreshold > 1) {
      issues.push({ path: "autonomy.driftMonitor.correctionThreshold", message: "Must be between 0 and 1" });
    }
  }

  if (
    config.driftMonitor?.alertThreshold !== undefined &&
    config.driftMonitor?.correctionThreshold !== undefined &&
    config.driftMonitor.alertThreshold >= config.driftMonitor.correctionThreshold
  ) {
    issues.push({
      path: "autonomy.driftMonitor",
      message: "alertThreshold must be less than correctionThreshold",
    });
  }

  // Validate retrieval weights
  if (config.retrieval) {
    const r = config.retrieval;
    const weightFields = ["trustWeight", "recencyWeight", "relevanceWeight", "typeWeight"] as const;
    for (const field of weightFields) {
      if (r[field] !== undefined && (r[field]! < 0 || r[field]! > 1)) {
        issues.push({ path: `autonomy.retrieval.${field}`, message: "Must be between 0 and 1" });
      }
    }

    const sum =
      (r.trustWeight ?? DEFAULT_RETRIEVAL_CONFIG.trustWeight) +
      (r.recencyWeight ?? DEFAULT_RETRIEVAL_CONFIG.recencyWeight) +
      (r.relevanceWeight ?? DEFAULT_RETRIEVAL_CONFIG.relevanceWeight) +
      (r.typeWeight ?? DEFAULT_RETRIEVAL_CONFIG.typeWeight);
    if (Math.abs(sum - 1.0) > 0.05) {
      issues.push({
        path: "autonomy.retrieval",
        message: `Retrieval weights should sum to ~1.0 (got ${sum.toFixed(3)})`,
      });
    }

    if (r.maxResults !== undefined && r.maxResults < 1) {
      issues.push({ path: "autonomy.retrieval.maxResults", message: "Must be at least 1" });
    }

    if (r.minTrustThreshold !== undefined && (r.minTrustThreshold < 0 || r.minTrustThreshold > 1)) {
      issues.push({ path: "autonomy.retrieval.minTrustThreshold", message: "Must be between 0 and 1" });
    }
  }

  // Validate workflow config
  if (config.workflow?.maxConcurrent !== undefined && config.workflow.maxConcurrent < 1) {
    issues.push({ path: "autonomy.workflow.maxConcurrent", message: "Must be at least 1" });
  }
  if (config.workflow?.defaultTimeoutMs !== undefined && config.workflow.defaultTimeoutMs < 1000) {
    issues.push({ path: "autonomy.workflow.defaultTimeoutMs", message: "Must be at least 1000" });
  }

  // Validate approval config
  if (config.approval?.timeoutMs !== undefined && config.approval.timeoutMs < 5000) {
    issues.push({ path: "autonomy.approval.timeoutMs", message: "Must be at least 5000" });
  }

  // Validate event store config
  if (config.eventStore?.maxEvents !== undefined && config.eventStore.maxEvents < 100) {
    issues.push({ path: "autonomy.eventStore.maxEvents", message: "Must be at least 100" });
  }

  // Validate identity config if present (delegates to canonical validator)
  if (config.identity) {
    const identityIssues = validateAutonomyIdentity(config.identity);
    for (const issue of identityIssues) {
      issues.push({ path: `autonomy.identity.${issue.field}`, message: issue.message });
    }
  }

  return issues;
}
