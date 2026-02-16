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
let _ToolRegistry: typeof import("./tools/registry.js").ToolRegistry;
let _SchemaValidator: typeof import("./verification/schema-validator.js").SchemaValidator;
let _PostConditionVerifier: typeof import("./verification/postcondition-verifier.js").PostConditionVerifier;
let _registerBuiltinToolContracts: typeof import("./tools/schemas/index.js").registerBuiltinToolContracts;
let _registerBuiltinPostConditions: typeof import("./verification/postconditions/index.js").registerBuiltinPostConditions;
let _KernelStateMachine: typeof import("./state-machine/kernel-state-machine.js").KernelStateMachine;
let _ApprovalGate: typeof import("./approval/approval-gate.js").ApprovalGate;
let _InMemoryEventStore: typeof import("./workflow/event-store.js").InMemoryEventStore;
let _CompensationRegistry: typeof import("./workflow/compensation-registry.js").CompensationRegistry;
let _ToolExecutionPipeline: typeof import("./workflow/execution-pipeline.js").ToolExecutionPipeline;
let _registerBuiltinCompensations: typeof import("./workflow/compensations/index.js").registerBuiltinCompensations;
let _InvariantChecker: typeof import("./verification/invariants/invariant-checker.js").InvariantChecker;
let _registerBuiltinInvariants: typeof import("./verification/invariants/index.js").registerBuiltinInvariants;
let _InMemoryBaselineHarness: typeof import("./metrics/baseline-harness.js").InMemoryBaselineHarness;
let _KernelScenarioEvaluator: typeof import("./metrics/kernel-evaluator.js").KernelScenarioEvaluator;

async function loadImplementations() {
  const [trustMod, memMod, driftMod, goalMod, toolRegMod, schemaValMod, pcvMod, toolSchemasMod, pcMod, smMod, approvalMod, esMod, compRegMod, pipelineMod, compsMod, invMod, invRegMod, harnMod, evalMod] = await Promise.all([
    import("./trust/scorer.js"),
    import("./memory/gate.js"),
    import("./identity/drift-monitor.js"),
    import("./goals/manager.js"),
    import("./tools/registry.js"),
    import("./verification/schema-validator.js"),
    import("./verification/postcondition-verifier.js"),
    import("./tools/schemas/index.js"),
    import("./verification/postconditions/index.js"),
    import("./state-machine/kernel-state-machine.js"),
    import("./approval/approval-gate.js"),
    import("./workflow/event-store.js"),
    import("./workflow/compensation-registry.js"),
    import("./workflow/execution-pipeline.js"),
    import("./workflow/compensations/index.js"),
    import("./verification/invariants/invariant-checker.js"),
    import("./verification/invariants/index.js"),
    import("./metrics/baseline-harness.js"),
    import("./metrics/kernel-evaluator.js"),
  ]);
  _RuleBasedTrustScorer = trustMod.RuleBasedTrustScorer;
  _MemoryGateImpl = memMod.MemoryGateImpl;
  _RuleBasedDriftMonitor = driftMod.RuleBasedDriftMonitor;
  _InMemoryGoalManager = goalMod.InMemoryGoalManager;
  _ToolRegistry = toolRegMod.ToolRegistry;
  _SchemaValidator = schemaValMod.SchemaValidator;
  _PostConditionVerifier = pcvMod.PostConditionVerifier;
  _registerBuiltinToolContracts = toolSchemasMod.registerBuiltinToolContracts;
  _registerBuiltinPostConditions = pcMod.registerBuiltinPostConditions;
  _KernelStateMachine = smMod.KernelStateMachine;
  _ApprovalGate = approvalMod.ApprovalGate;
  _InMemoryEventStore = esMod.InMemoryEventStore;
  _CompensationRegistry = compRegMod.CompensationRegistry;
  _ToolExecutionPipeline = pipelineMod.ToolExecutionPipeline;
  _registerBuiltinCompensations = compsMod.registerBuiltinCompensations;
  _InvariantChecker = invMod.InvariantChecker;
  _registerBuiltinInvariants = invRegMod.registerBuiltinInvariants;
  _InMemoryBaselineHarness = harnMod.InMemoryBaselineHarness;
  _KernelScenarioEvaluator = evalMod.KernelScenarioEvaluator;
}

// ---------- Service ----------

export class MilaidyAutonomyService extends Service {
  static override serviceType = "AUTONOMY" as const;

  capabilityDescription = "Milaidy Autonomy Kernel — trust scoring, memory gating, drift monitoring, and goal management";

  private trustScorer: TrustScorer | null = null;
  private memoryGate: (MemoryGate & { dispose(): void }) | null = null;
  private driftMonitor: PersonaDriftMonitor | null = null;
  private goalManager: GoalManager | null = null;
  private toolRegistry: import("./tools/types.js").ToolRegistryInterface | null = null;
  private schemaValidator: import("./verification/schema-validator.js").SchemaValidator | null = null;
  private postConditionVerifier: import("./verification/postcondition-verifier.js").PostConditionVerifier | null = null;
  private stateMachine: import("./state-machine/types.js").KernelStateMachineInterface | null = null;
  private approvalGate: import("./approval/approval-gate.js").ApprovalGate | null = null;
  private eventStore: import("./workflow/types.js").EventStoreInterface | null = null;
  private compensationRegistry: import("./workflow/types.js").CompensationRegistryInterface | null = null;
  private executionPipeline: import("./workflow/types.js").ToolExecutionPipelineInterface | null = null;
  private invariantChecker: import("./verification/invariants/invariant-checker.js").InvariantChecker | null = null;
  private baselineHarness: import("./metrics/baseline-harness.js").BaselineHarness | null = null;
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

    // Instantiate tool contracts & verification components
    this.toolRegistry = new _ToolRegistry();
    _registerBuiltinToolContracts(this.toolRegistry);
    this.schemaValidator = new _SchemaValidator(this.toolRegistry);
    this.postConditionVerifier = new _PostConditionVerifier(
      config.tools?.checkTimeoutMs,
    );
    _registerBuiltinPostConditions(this.postConditionVerifier);

    // Instantiate workflow engine components
    this.stateMachine = new _KernelStateMachine();
    let eventBusRef: { emit: (event: string, payload: unknown) => void } | undefined;
    try {
      const { getEventBus } = await import("../events/event-bus.js");
      eventBusRef = getEventBus() as unknown as { emit: (event: string, payload: unknown) => void };
    } catch {
      // Event bus not available — non-fatal
    }
    this.approvalGate = new _ApprovalGate({
      timeoutMs: config.approval?.timeoutMs ?? 300_000,
      eventBus: eventBusRef,
    });
    this.eventStore = new _InMemoryEventStore(
      config.eventStore?.maxEvents ?? 10_000,
    );
    this.compensationRegistry = new _CompensationRegistry();
    _registerBuiltinCompensations(this.compensationRegistry);

    // Instantiate invariant checker
    const invariantsConfig = config.invariants;
    if (invariantsConfig?.enabled !== false) {
      this.invariantChecker = new _InvariantChecker(
        invariantsConfig?.checkTimeoutMs,
      );
      _registerBuiltinInvariants(this.invariantChecker);
    }

    this.executionPipeline = new _ToolExecutionPipeline({
      schemaValidator: this.schemaValidator,
      approvalGate: this.approvalGate,
      postConditionVerifier: this.postConditionVerifier,
      compensationRegistry: this.compensationRegistry,
      stateMachine: this.stateMachine,
      eventStore: this.eventStore,
      invariantChecker: this.invariantChecker ?? undefined,
      config: {
        enabled: config.workflow?.enabled ?? true,
        maxConcurrent: config.workflow?.maxConcurrent ?? 1,
        defaultTimeoutMs: config.workflow?.defaultTimeoutMs ?? 30_000,
        approvalTimeoutMs: config.approval?.timeoutMs ?? 300_000,
        autoApproveReadOnly: config.approval?.autoApproveReadOnly ?? true,
        autoApproveSources: config.approval?.autoApproveSources ?? [],
        eventStoreMaxEvents: config.eventStore?.maxEvents ?? 10_000,
      },
      eventBus: eventBusRef,
    });

    // Instantiate baseline harness with evaluator and components
    const evaluator = new _KernelScenarioEvaluator();
    this.baselineHarness = new _InMemoryBaselineHarness(evaluator, {
      trustScorer: this.trustScorer,
      memoryGate: this.memoryGate,
      driftMonitor: this.driftMonitor,
      goalManager: this.goalManager,
    });

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
      if (this.toolRegistry) container.registerValue(TOKENS.ToolRegistry, this.toolRegistry);
      if (this.schemaValidator) container.registerValue(TOKENS.SchemaValidator, this.schemaValidator);
      if (this.postConditionVerifier) container.registerValue(TOKENS.PostConditionVerifier, this.postConditionVerifier);
      if (this.stateMachine) container.registerValue(TOKENS.StateMachine, this.stateMachine);
      if (this.approvalGate) container.registerValue(TOKENS.ApprovalGate, this.approvalGate);
      if (this.eventStore) container.registerValue(TOKENS.EventStore, this.eventStore);
      if (this.compensationRegistry) container.registerValue(TOKENS.CompensationRegistry, this.compensationRegistry);
      if (this.executionPipeline) container.registerValue(TOKENS.ExecutionPipeline, this.executionPipeline);
      if (this.invariantChecker) container.registerValue(TOKENS.InvariantChecker, this.invariantChecker);
      if (this.baselineHarness) container.registerValue(TOKENS.BaselineHarness, this.baselineHarness);

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

    // Initialize tool contracts & verification
    this.toolRegistry = new _ToolRegistry();
    _registerBuiltinToolContracts(this.toolRegistry);
    this.schemaValidator = new _SchemaValidator(this.toolRegistry);
    this.postConditionVerifier = new _PostConditionVerifier();
    _registerBuiltinPostConditions(this.postConditionVerifier);

    // Initialize workflow engine components
    this.stateMachine = new _KernelStateMachine();
    this.approvalGate = new _ApprovalGate();
    this.eventStore = new _InMemoryEventStore();
    this.compensationRegistry = new _CompensationRegistry();
    _registerBuiltinCompensations(this.compensationRegistry);
    this.invariantChecker = new _InvariantChecker();
    _registerBuiltinInvariants(this.invariantChecker);
    this.executionPipeline = new _ToolExecutionPipeline({
      schemaValidator: this.schemaValidator,
      approvalGate: this.approvalGate,
      postConditionVerifier: this.postConditionVerifier,
      compensationRegistry: this.compensationRegistry,
      stateMachine: this.stateMachine,
      eventStore: this.eventStore,
      invariantChecker: this.invariantChecker,
    });

    // Initialize baseline harness
    const evaluator = new _KernelScenarioEvaluator();
    this.baselineHarness = new _InMemoryBaselineHarness(evaluator, {
      trustScorer: this.trustScorer,
      memoryGate: this.memoryGate,
      driftMonitor: this.driftMonitor,
      goalManager: this.goalManager,
    });

    // Initialize identity if not already set
    const { createDefaultAutonomyIdentity } = await import("./identity/schema.js");
    this.identityConfig = createDefaultAutonomyIdentity();

    this.enabled = true;

    // Register newly created components into DI container
    await this.registerInContainer();

    logger.info("[autonomy-service] Autonomy enabled");
  }

  async disableAutonomy(): Promise<void> {
    if (!this.enabled) return;
    this.memoryGate?.dispose();
    this.approvalGate?.dispose();
    this.trustScorer = null;
    this.memoryGate = null;
    this.driftMonitor = null;
    this.goalManager = null;
    this.toolRegistry = null;
    this.schemaValidator = null;
    this.postConditionVerifier = null;
    this.stateMachine = null;
    this.approvalGate = null;
    this.eventStore = null;
    this.compensationRegistry = null;
    this.executionPipeline = null;
    this.invariantChecker = null;
    this.baselineHarness = null;
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

  getStateMachine(): import("./state-machine/types.js").KernelStateMachineInterface | null {
    return this.stateMachine;
  }

  getApprovalGate(): import("./approval/types.js").ApprovalGateInterface | null {
    return this.approvalGate;
  }

  getEventStore(): import("./workflow/types.js").EventStoreInterface | null {
    return this.eventStore;
  }

  getExecutionPipeline(): import("./workflow/types.js").ToolExecutionPipelineInterface | null {
    return this.executionPipeline;
  }

  getInvariantChecker(): import("./verification/invariants/invariant-checker.js").InvariantChecker | null {
    return this.invariantChecker;
  }

  getBaselineHarness(): import("./metrics/baseline-harness.js").BaselineHarness | null {
    return this.baselineHarness;
  }

  // ---------- Lifecycle ----------

  async stop(): Promise<void> {
    this.memoryGate?.dispose();
    this.approvalGate?.dispose();
    this.trustScorer = null;
    this.memoryGate = null;
    this.driftMonitor = null;
    this.goalManager = null;
    this.toolRegistry = null;
    this.schemaValidator = null;
    this.postConditionVerifier = null;
    this.stateMachine = null;
    this.approvalGate = null;
    this.eventStore = null;
    this.compensationRegistry = null;
    this.executionPipeline = null;
    this.invariantChecker = null;
    this.baselineHarness = null;
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
