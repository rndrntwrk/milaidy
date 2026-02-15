/**
 * MilaidyAutonomyService — bridge between ElizaOS service infrastructure
 * and the Milaidy Autonomy Kernel components.
 *
 * Takes the "AUTONOMY" service slot (the core AutonomyService is disabled
 * via `enableAutonomy: false` in the runtime config). This allows the
 * API server's `getAutonomySvc(runtime)` to resolve our service.
 *
 * Config plumbing:
 *   MilaidyConfig.autonomy → createMilaidyPlugin({ autonomyConfig })
 *   → setAutonomyConfig() → MilaidyAutonomyService.start(runtime)
 *
 * The plugin calls `setAutonomyConfig()` before ElizaOS calls `start()`,
 * so the service reads the config without serialization round-trips.
 *
 * @module autonomy/service
 */

import { type IAgentRuntime, Service, logger } from "@elizaos/core";
import {
  type AutonomyConfig,
  resolveAutonomyConfig,
  validateAutonomyConfig,
} from "./config.js";
import type { GoalManager } from "./goals/manager.js";
import type { PersonaDriftMonitor } from "./identity/drift-monitor.js";
import type {
  AutonomyIdentityConfig,
} from "./identity/schema.js";
import type { MemoryGate } from "./memory/gate.js";
import type { TrustScorer } from "./trust/scorer.js";

// ---------- Config Handoff ----------

/**
 * Module-level config set by the plugin before ElizaOS calls start().
 * This avoids serializing structured config through runtime.getSetting().
 */
let _pendingConfig: AutonomyConfig | undefined;

/**
 * Set the autonomy config for the next service initialization.
 * Called by createMilaidyPlugin() before the runtime processes services.
 */
export function setAutonomyConfig(config: AutonomyConfig | undefined): void {
  _pendingConfig = config;
}

/**
 * Read and consume the pending config (one-shot).
 */
function consumePendingConfig(): AutonomyConfig | undefined {
  const cfg = _pendingConfig;
  _pendingConfig = undefined;
  return cfg;
}

// ---------- Lazy Implementation Loading ----------

let _RuleBasedTrustScorer: typeof import("./trust/scorer.js").RuleBasedTrustScorer;
let _MemoryGateImpl: typeof import("./memory/gate.js").MemoryGateImpl;
let _RuleBasedDriftMonitor: typeof import("./identity/drift-monitor.js").RuleBasedDriftMonitor;
let _InMemoryGoalManager: typeof import("./goals/manager.js").InMemoryGoalManager;

async function loadImplementations() {
  const [trustMod, memMod, driftMod, goalMod] = await Promise.all([
    import("./trust/scorer.js"),
    import("./memory/gate.js"),
    import("./identity/drift-monitor.js"),
    import("./goals/manager.js"),
  ]);
  _RuleBasedTrustScorer = trustMod.RuleBasedTrustScorer;
  _MemoryGateImpl = memMod.MemoryGateImpl;
  _RuleBasedDriftMonitor = driftMod.RuleBasedDriftMonitor;
  _InMemoryGoalManager = goalMod.InMemoryGoalManager;
}

// ---------- Service ----------

export class MilaidyAutonomyService extends Service {
  static override serviceType = "AUTONOMY" as const;

  capabilityDescription = "Milaidy Autonomy Kernel — trust scoring, memory gating, drift monitoring, and goal management";

  private trustScorer: TrustScorer | null = null;
  private memoryGate: (MemoryGate & { dispose(): void }) | null = null;
  private driftMonitor: PersonaDriftMonitor | null = null;
  private goalManager: GoalManager | null = null;
  private identityConfig: AutonomyIdentityConfig | null = null;
  private resolvedRetrievalConfig: import("./config.js").AutonomyRetrievalConfig | null = null;
  private enabled = false;

  /**
   * ElizaOS calls this static method during plugin initialization.
   * It must return a Service instance.
   */
  static override async start(runtime: IAgentRuntime): Promise<Service> {
    const instance = new MilaidyAutonomyService(runtime);
    await instance.initialize(runtime);
    return instance;
  }

  private async initialize(runtime: IAgentRuntime): Promise<void> {
    // Config resolution order:
    // 1. Module-level config set by plugin (preferred — no serialization)
    // 2. Runtime setting AUTONOMY_CONFIG (JSON string fallback)
    // 3. Defaults (disabled)
    const rawConfig = consumePendingConfig() ?? this.readConfigFromSetting(runtime);
    const config = resolveAutonomyConfig(rawConfig);

    if (!config.enabled) {
      logger.debug("[autonomy-service] Autonomy kernel disabled by config");
      this.enabled = false;
      return;
    }

    // Validate
    const issues = validateAutonomyConfig(config);
    if (issues.length > 0) {
      for (const issue of issues) {
        logger.warn(`[autonomy-service] Config issue at ${issue.path}: ${issue.message}`);
      }
    }

    // Store resolved retrieval config for later use by retriever
    this.resolvedRetrievalConfig = config.retrieval;

    // Load implementation classes
    await loadImplementations();

    // Initialize identity config
    const { createDefaultAutonomyIdentity } = await import("./identity/schema.js");
    this.identityConfig = config.identity ?? createDefaultAutonomyIdentity();

    // Instantiate components
    this.trustScorer = new _RuleBasedTrustScorer(config.trust);
    this.memoryGate = new _MemoryGateImpl(
      this.trustScorer,
      config.trust,
      config.memoryGate,
    );
    this.driftMonitor = new _RuleBasedDriftMonitor(config.driftMonitor);
    this.goalManager = new _InMemoryGoalManager();
    this.enabled = true;

    // Register into DI container (single source of truth for components)
    await this.registerInContainer();

    logger.info(
      `[autonomy-service] Kernel initialized (issues: ${issues.length})`,
    );

    // Emit kernel initialized event via Milaidy event bus if available
    try {
      const { getEventBus } = await import("../events/event-bus.js");
      const bus = getEventBus();
      bus.emit("autonomy:kernel:initialized", {
        enabled: true,
        configIssues: issues.length,
      });
    } catch {
      // Event bus not available — non-fatal
    }
  }

  /**
   * Fallback: read autonomy config from runtime settings (JSON string).
   */
  private readConfigFromSetting(runtime: IAgentRuntime): AutonomyConfig | undefined {
    try {
      const raw = runtime.getSetting("AUTONOMY_CONFIG");
      if (raw && typeof raw === "string") {
        return JSON.parse(raw) as AutonomyConfig;
      }
    } catch {
      // Ignore parse errors — fall through to defaults
    }
    return undefined;
  }

  /**
   * Register component instances into the DI container so other parts
   * of the system (e.g. future pipeline hooks) resolve the same instances.
   */
  private async registerInContainer(): Promise<void> {
    try {
      const { getContainer, TOKENS } = await import("../di/container.js");
      const container = getContainer();
      if (this.trustScorer) container.registerValue(TOKENS.TrustScorer, this.trustScorer);
      if (this.memoryGate) container.registerValue(TOKENS.MemoryGate, this.memoryGate);
      if (this.driftMonitor) container.registerValue(TOKENS.DriftMonitor, this.driftMonitor);
      if (this.goalManager) container.registerValue(TOKENS.GoalManager, this.goalManager);

      // Register trust-aware retriever
      try {
        const { TrustAwareRetrieverImpl } = await import("./memory/retriever.js");
        const { DEFAULT_RETRIEVAL_CONFIG } = await import("./config.js");
        const retrievalConfig = this.resolvedRetrievalConfig ?? DEFAULT_RETRIEVAL_CONFIG;
        const retriever = new TrustAwareRetrieverImpl(retrievalConfig as Required<import("./config.js").AutonomyRetrievalConfig>, this.trustScorer);
        container.registerValue(TOKENS.TrustAwareRetriever, retriever);
      } catch (err) {
        logger.debug(`[autonomy-service] Retriever registration skipped: ${err instanceof Error ? err.message : err}`);
      }
    } catch {
      // DI container not available — non-fatal
    }
  }

  // ---------- AutonomyServiceLike interface (used by API server) ----------

  async enableAutonomy(): Promise<void> {
    if (this.enabled) return;
    // Re-initialize with enabled override
    await loadImplementations();
    this.trustScorer = new _RuleBasedTrustScorer();
    this.memoryGate = new _MemoryGateImpl(this.trustScorer);
    this.driftMonitor = new _RuleBasedDriftMonitor();
    this.goalManager = new _InMemoryGoalManager();

    // Initialize identity if not already set
    const { createDefaultAutonomyIdentity } = await import("./identity/schema.js");
    this.identityConfig = createDefaultAutonomyIdentity();

    this.enabled = true;
    logger.info("[autonomy-service] Autonomy enabled");
  }

  async disableAutonomy(): Promise<void> {
    if (!this.enabled) return;
    this.memoryGate?.dispose();
    this.trustScorer = null;
    this.memoryGate = null;
    this.driftMonitor = null;
    this.goalManager = null;
    this.identityConfig = null;
    this.enabled = false;
    logger.info("[autonomy-service] Autonomy disabled");
  }

  isLoopRunning(): boolean {
    return this.enabled;
  }

  // ---------- Identity Accessors ----------

  getIdentityConfig(): AutonomyIdentityConfig | null {
    return this.identityConfig ? { ...this.identityConfig } : null;
  }

  async updateIdentityConfig(
    update: Partial<AutonomyIdentityConfig>,
  ): Promise<AutonomyIdentityConfig> {
    const { computeIdentityHash, validateAutonomyIdentity } = await import("./identity/schema.js");

    if (!this.identityConfig) {
      const { createDefaultAutonomyIdentity } = await import("./identity/schema.js");
      this.identityConfig = createDefaultAutonomyIdentity();
    }

    // Apply partial update
    const updated: AutonomyIdentityConfig = {
      ...this.identityConfig,
      ...update,
      communicationStyle: {
        ...this.identityConfig.communicationStyle,
        ...(update.communicationStyle ?? {}),
      },
      softPreferences: {
        ...this.identityConfig.softPreferences,
        ...(update.softPreferences ?? {}),
      },
    };

    // Increment version
    updated.identityVersion = this.identityConfig.identityVersion + 1;

    // Recompute hash
    updated.identityHash = computeIdentityHash(updated);

    // Validate
    const issues = validateAutonomyIdentity(updated);
    if (issues.length > 0) {
      throw new Error(`Identity validation failed: ${issues.map((i) => `${i.field}: ${i.message}`).join("; ")}`);
    }

    this.identityConfig = updated;
    logger.info(
      `[autonomy-service] Identity updated to v${updated.identityVersion}`,
    );

    return { ...updated };
  }

  // ---------- Component Accessors ----------

  getTrustScorer(): TrustScorer | null {
    return this.trustScorer;
  }

  getMemoryGate(): MemoryGate | null {
    return this.memoryGate;
  }

  getDriftMonitor(): PersonaDriftMonitor | null {
    return this.driftMonitor;
  }

  getGoalManager(): GoalManager | null {
    return this.goalManager;
  }

  // ---------- Lifecycle ----------

  async stop(): Promise<void> {
    this.memoryGate?.dispose();
    this.trustScorer = null;
    this.memoryGate = null;
    this.driftMonitor = null;
    this.goalManager = null;
    this.identityConfig = null;
    this.enabled = false;

    // Emit shutdown event
    try {
      const { getEventBus } = await import("../events/event-bus.js");
      const bus = getEventBus();
      bus.emit("autonomy:kernel:shutdown", { reason: "service stopped" });
    } catch {
      // Event bus not available — non-fatal
    }

    logger.info("[autonomy-service] Kernel shut down");
  }
}
