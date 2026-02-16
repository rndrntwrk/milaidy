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
 * Cross-system invariant checker configuration.
 */
export interface AutonomyInvariantsConfig {
  /** Enable invariant checking (default: true). */
  enabled?: boolean;
  /** Per-check timeout in ms (default: 5000). */
  checkTimeoutMs?: number;
  /** Fail the pipeline on critical invariant violations (default: false). */
  failOnCritical?: boolean;
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
 * Persistence layer configuration.
 */
export interface AutonomyPersistenceConfig {
  /** Enable durable persistence via Postgres/PGLite (default: false — uses in-memory). */
  enabled?: boolean;
  /** Auto-run schema migrations on startup (default: true). */
  autoMigrate?: boolean;
}

/**
 * Domain capability packs and governance configuration (Phase 5).
 */
export interface AutonomyDomainsConfig {
  /** Enable domain pack infrastructure (default: false). */
  enabled?: boolean;
  /** Domain IDs to auto-load on initialization. */
  autoLoadDomains?: string[];
  /** Coding domain configuration overrides. */
  coding?: import("./domains/coding/types.js").CodingDomainConfig;
  /** Governance settings. */
  governance?: {
    /** Enable governance policy engine (default: true). */
    enabled?: boolean;
    /** Default event retention in ms (default: 604800000 = 7 days). */
    defaultEventRetentionMs?: number;
    /** Default audit retention in ms (default: 2592000000 = 30 days). */
    defaultAuditRetentionMs?: number;
  };
  /** Pilot evaluation settings. */
  pilot?: {
    /** Scenario timeout in ms (default: 30000). */
    scenarioTimeoutMs?: number;
    /** Maximum scenarios to run (0 = all, default: 0). */
    maxScenarios?: number;
  };
}

/**
 * Learning infrastructure configuration (Phase 4).
 */
export interface AutonomyLearningConfig {
  /** Enable learning infrastructure (default: false). */
  enabled?: boolean;
  /** Path for JSONL dataset export. */
  dataPath?: string;
  /** Reward signal weights. */
  reward?: {
    validationWeight?: number;
    verificationWeight?: number;
    efficiencyWeight?: number;
    driftPenalty?: number;
    completionWeight?: number;
  };
  /** Adversarial scenario generation settings. */
  adversarial?: {
    enabled?: boolean;
    injectionRate?: number;
  };
  /** Hack detection settings. */
  hackDetection?: {
    enabled?: boolean;
    threshold?: number;
  };
  /** Model provider settings. */
  modelProvider?: {
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
  };
}

/**
 * Role separation configuration.
 */
export interface AutonomyRolesConfig {
  /** Enable role-based orchestration (default: true). */
  enabled?: boolean;
  /** Planner role settings. */
  planner?: {
    /** Maximum number of steps in a plan (default: 20). */
    maxPlanSteps?: number;
    /** Auto-approve plans with 3 or fewer steps (default: false). */
    autoApproveSimplePlans?: boolean;
  };
  /** Safe mode settings. */
  safeMode?: {
    /** Consecutive error threshold for safe mode (default: 3). */
    errorThreshold?: number;
    /** Minimum trust to exit safe mode (default: 0.8). */
    exitTrustFloor?: number;
  };
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
  /** Cross-system invariant checker settings. */
  invariants?: AutonomyInvariantsConfig;
  /** Role separation settings. */
  roles?: AutonomyRolesConfig;
  /** Learning infrastructure settings (Phase 4). */
  learning?: AutonomyLearningConfig;
  /** Domain capability packs and governance settings (Phase 5). */
  domains?: AutonomyDomainsConfig;
  /** Persistence layer settings (database-backed stores). */
  persistence?: AutonomyPersistenceConfig;
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
    invariants: {
      enabled: userConfig.invariants?.enabled ?? true,
      checkTimeoutMs: userConfig.invariants?.checkTimeoutMs ?? 5_000,
      failOnCritical: userConfig.invariants?.failOnCritical ?? false,
    },
    roles: {
      enabled: userConfig.roles?.enabled ?? true,
      planner: {
        maxPlanSteps: userConfig.roles?.planner?.maxPlanSteps ?? 20,
        autoApproveSimplePlans: userConfig.roles?.planner?.autoApproveSimplePlans ?? false,
      },
      safeMode: {
        errorThreshold: userConfig.roles?.safeMode?.errorThreshold ?? 3,
        exitTrustFloor: userConfig.roles?.safeMode?.exitTrustFloor ?? 0.8,
      },
    },
    learning: {
      enabled: userConfig.learning?.enabled ?? false,
      dataPath: userConfig.learning?.dataPath ?? "",
      reward: {
        validationWeight: userConfig.learning?.reward?.validationWeight ?? 0.2,
        verificationWeight: userConfig.learning?.reward?.verificationWeight ?? 0.3,
        efficiencyWeight: userConfig.learning?.reward?.efficiencyWeight ?? 0.1,
        driftPenalty: userConfig.learning?.reward?.driftPenalty ?? 0.2,
        completionWeight: userConfig.learning?.reward?.completionWeight ?? 0.2,
      },
      adversarial: {
        enabled: userConfig.learning?.adversarial?.enabled ?? false,
        injectionRate: userConfig.learning?.adversarial?.injectionRate ?? 0.1,
      },
      hackDetection: {
        enabled: userConfig.learning?.hackDetection?.enabled ?? true,
        threshold: userConfig.learning?.hackDetection?.threshold ?? 0.5,
      },
      modelProvider: userConfig.learning?.modelProvider,
    },
    domains: {
      enabled: userConfig.domains?.enabled ?? false,
      autoLoadDomains: userConfig.domains?.autoLoadDomains ?? [],
      coding: userConfig.domains?.coding,
      governance: {
        enabled: userConfig.domains?.governance?.enabled ?? true,
        defaultEventRetentionMs: userConfig.domains?.governance?.defaultEventRetentionMs ?? 604_800_000,
        defaultAuditRetentionMs: userConfig.domains?.governance?.defaultAuditRetentionMs ?? 2_592_000_000,
      },
      pilot: {
        scenarioTimeoutMs: userConfig.domains?.pilot?.scenarioTimeoutMs ?? 30_000,
        maxScenarios: userConfig.domains?.pilot?.maxScenarios ?? 0,
      },
    },
    persistence: {
      enabled: userConfig.persistence?.enabled ?? false,
      autoMigrate: userConfig.persistence?.autoMigrate ?? true,
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

  // Validate invariants config
  if (config.invariants?.checkTimeoutMs !== undefined && config.invariants.checkTimeoutMs < 100) {
    issues.push({ path: "autonomy.invariants.checkTimeoutMs", message: "Must be at least 100" });
  }

  // Validate roles config
  if (config.roles?.planner?.maxPlanSteps !== undefined && config.roles.planner.maxPlanSteps < 1) {
    issues.push({ path: "autonomy.roles.planner.maxPlanSteps", message: "Must be at least 1" });
  }
  if (config.roles?.safeMode?.errorThreshold !== undefined && config.roles.safeMode.errorThreshold < 1) {
    issues.push({ path: "autonomy.roles.safeMode.errorThreshold", message: "Must be at least 1" });
  }
  if (config.roles?.safeMode?.exitTrustFloor !== undefined) {
    if (config.roles.safeMode.exitTrustFloor < 0 || config.roles.safeMode.exitTrustFloor > 1) {
      issues.push({ path: "autonomy.roles.safeMode.exitTrustFloor", message: "Must be between 0 and 1" });
    }
  }

  // Validate learning config
  if (config.learning?.hackDetection?.threshold !== undefined) {
    if (config.learning.hackDetection.threshold < 0 || config.learning.hackDetection.threshold > 1) {
      issues.push({ path: "autonomy.learning.hackDetection.threshold", message: "Must be between 0 and 1" });
    }
  }
  if (config.learning?.adversarial?.injectionRate !== undefined) {
    if (config.learning.adversarial.injectionRate < 0 || config.learning.adversarial.injectionRate > 1) {
      issues.push({ path: "autonomy.learning.adversarial.injectionRate", message: "Must be between 0 and 1" });
    }
  }

  // Validate domains config
  if (config.domains?.governance?.defaultEventRetentionMs !== undefined && config.domains.governance.defaultEventRetentionMs < 0) {
    issues.push({ path: "autonomy.domains.governance.defaultEventRetentionMs", message: "Must be non-negative" });
  }
  if (config.domains?.governance?.defaultAuditRetentionMs !== undefined && config.domains.governance.defaultAuditRetentionMs < 0) {
    issues.push({ path: "autonomy.domains.governance.defaultAuditRetentionMs", message: "Must be non-negative" });
  }
  if (config.domains?.pilot?.scenarioTimeoutMs !== undefined && config.domains.pilot.scenarioTimeoutMs < 1000) {
    issues.push({ path: "autonomy.domains.pilot.scenarioTimeoutMs", message: "Must be at least 1000" });
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
