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
let _PersistentApprovalGate: typeof import("./approval/persistent-approval-gate.js").PersistentApprovalGate;
let _InMemoryEventStore: typeof import("./workflow/event-store.js").InMemoryEventStore;
let _CompensationRegistry: typeof import("./workflow/compensation-registry.js").CompensationRegistry;
let _ToolExecutionPipeline: typeof import("./workflow/execution-pipeline.js").ToolExecutionPipeline;
let _registerBuiltinCompensations: typeof import("./workflow/compensations/index.js").registerBuiltinCompensations;
let _LocalWorkflowEngine: typeof import("./adapters/workflow/local-engine.js").LocalWorkflowEngine;
let _TemporalWorkflowEngine: typeof import("./adapters/workflow/temporal-engine.js").TemporalWorkflowEngine;
let _InvariantChecker: typeof import("./verification/invariants/invariant-checker.js").InvariantChecker;
let _registerBuiltinInvariants: typeof import("./verification/invariants/index.js").registerBuiltinInvariants;
let _InMemoryBaselineHarness: typeof import("./metrics/baseline-harness.js").InMemoryBaselineHarness;
let _KernelScenarioEvaluator: typeof import("./metrics/kernel-evaluator.js").KernelScenarioEvaluator;
let _GoalDrivenPlanner: typeof import("./roles/planner.js").GoalDrivenPlanner;
let _PipelineExecutor: typeof import("./roles/executor.js").PipelineExecutor;
let _UnifiedVerifier: typeof import("./roles/verifier.js").UnifiedVerifier;
let _GatedMemoryWriter: typeof import("./roles/memory-writer.js").GatedMemoryWriter;
let _DriftAwareAuditor: typeof import("./roles/auditor.js").DriftAwareAuditor;
let _SafeModeControllerImpl: typeof import("./roles/safe-mode.js").SafeModeControllerImpl;
let _KernelOrchestrator: typeof import("./roles/orchestrator.js").KernelOrchestrator;

// Phase 5 — Domains & Governance
let _DomainPackRegistry: typeof import("./domains/registry.js").DomainPackRegistry;
let _PolicyEngine: typeof import("./domains/governance/policy-engine.js").PolicyEngine;
let _AuditRetentionManager: typeof import("./domains/governance/retention-manager.js").AuditRetentionManager;
let _PilotRunner: typeof import("./domains/pilot/pilot-runner.js").PilotRunner;
let _createCodingDomainPack: typeof import("./domains/coding/pack.js").createCodingDomainPack;
let _CODING_GOVERNANCE_POLICY: typeof import("./domains/coding/governance-policy.js").CODING_GOVERNANCE_POLICY;

// Persistence
let _AutonomyDbAdapter: typeof import("./persistence/db-adapter.js").AutonomyDbAdapter;
let _PgEventStore: typeof import("./persistence/pg-event-store.js").PgEventStore;
let _PgGoalManager: typeof import("./persistence/pg-goal-manager.js").PgGoalManager;
let _PgRetentionManager: typeof import("./persistence/pg-retention-manager.js").PgRetentionManager;
let _PersistentStateMachine: typeof import("./persistence/persistent-state-machine.js").PersistentStateMachine;
let _PgApprovalLog: typeof import("./persistence/pg-approval-log.js").PgApprovalLog;
let _PgIdentityStore: typeof import("./persistence/pg-identity-store.js").PgIdentityStore;
let _PgMemoryStore: typeof import("./persistence/pg-memory-store.js").PgMemoryStore;

// Phase 4 — Learning
let _CheckpointReward: typeof import("./learning/reward.js").CheckpointReward;
let _EpisodeReward: typeof import("./learning/reward.js").EpisodeReward;
let _TraceCollector: typeof import("./learning/trace-collector.js").TraceCollector;
let _HackDetector: typeof import("./learning/hack-detection.js").HackDetector;
let _createHackDetectionInvariants: typeof import("./learning/hack-detection.js").createHackDetectionInvariants;
let _RolloutCollector: typeof import("./learning/rollout.js").RolloutCollector;
let _CheckpointManager: typeof import("./learning/rollout.js").CheckpointManager;
let _StubModelProvider: typeof import("./learning/model-provider.js").StubModelProvider;
let _HttpModelProvider: typeof import("./learning/model-provider.js").HttpModelProvider;
let _SystemPromptBuilder: typeof import("./learning/prompt-builder.js").SystemPromptBuilder;
let _AdversarialScenarioGenerator: typeof import("./learning/adversarial.js").AdversarialScenarioGenerator;

async function loadImplementations() {
  const [trustMod, memMod, driftMod, goalMod, toolRegMod, schemaValMod, pcvMod, toolSchemasMod, pcMod, smMod, approvalMod, approvalPersistentMod, esMod, compRegMod, pipelineMod, compsMod, localWorkflowMod, temporalWorkflowMod, invMod, invRegMod, harnMod, evalMod, plannerMod, executorMod, verifierMod, memWriterMod, auditorMod, safeModeMod, orchestratorMod] = await Promise.all([
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
    import("./approval/persistent-approval-gate.js"),
    import("./workflow/event-store.js"),
    import("./workflow/compensation-registry.js"),
    import("./workflow/execution-pipeline.js"),
    import("./workflow/compensations/index.js"),
    import("./adapters/workflow/local-engine.js"),
    import("./adapters/workflow/temporal-engine.js"),
    import("./verification/invariants/invariant-checker.js"),
    import("./verification/invariants/index.js"),
    import("./metrics/baseline-harness.js"),
    import("./metrics/kernel-evaluator.js"),
    import("./roles/planner.js"),
    import("./roles/executor.js"),
    import("./roles/verifier.js"),
    import("./roles/memory-writer.js"),
    import("./roles/auditor.js"),
    import("./roles/safe-mode.js"),
    import("./roles/orchestrator.js"),
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
  _PersistentApprovalGate = approvalPersistentMod.PersistentApprovalGate;
  _InMemoryEventStore = esMod.InMemoryEventStore;
  _CompensationRegistry = compRegMod.CompensationRegistry;
  _ToolExecutionPipeline = pipelineMod.ToolExecutionPipeline;
  _registerBuiltinCompensations = compsMod.registerBuiltinCompensations;
  _LocalWorkflowEngine = localWorkflowMod.LocalWorkflowEngine;
  _TemporalWorkflowEngine = temporalWorkflowMod.TemporalWorkflowEngine;
  _InvariantChecker = invMod.InvariantChecker;
  _registerBuiltinInvariants = invRegMod.registerBuiltinInvariants;
  _InMemoryBaselineHarness = harnMod.InMemoryBaselineHarness;
  _KernelScenarioEvaluator = evalMod.KernelScenarioEvaluator;
  _GoalDrivenPlanner = plannerMod.GoalDrivenPlanner;
  _PipelineExecutor = executorMod.PipelineExecutor;
  _UnifiedVerifier = verifierMod.UnifiedVerifier;
  _GatedMemoryWriter = memWriterMod.GatedMemoryWriter;
  _DriftAwareAuditor = auditorMod.DriftAwareAuditor;
  _SafeModeControllerImpl = safeModeMod.SafeModeControllerImpl;
  _KernelOrchestrator = orchestratorMod.KernelOrchestrator;

  // Phase 4 — Learning (lazy, non-blocking)
  const [rewardMod, traceMod, hackMod, rolloutMod, modelMod, promptMod, advMod] = await Promise.all([
    import("./learning/reward.js"),
    import("./learning/trace-collector.js"),
    import("./learning/hack-detection.js"),
    import("./learning/rollout.js"),
    import("./learning/model-provider.js"),
    import("./learning/prompt-builder.js"),
    import("./learning/adversarial.js"),
  ]);
  _CheckpointReward = rewardMod.CheckpointReward;
  _EpisodeReward = rewardMod.EpisodeReward;
  _TraceCollector = traceMod.TraceCollector;
  _HackDetector = hackMod.HackDetector;
  _createHackDetectionInvariants = hackMod.createHackDetectionInvariants;
  _RolloutCollector = rolloutMod.RolloutCollector;
  _CheckpointManager = rolloutMod.CheckpointManager;
  _StubModelProvider = modelMod.StubModelProvider;
  _HttpModelProvider = modelMod.HttpModelProvider;
  _SystemPromptBuilder = promptMod.SystemPromptBuilder;
  _AdversarialScenarioGenerator = advMod.AdversarialScenarioGenerator;

  // Phase 5 — Domains & Governance (lazy, non-blocking)
  const [domRegMod, polEngMod, retMgrMod, pilotMod, codingPackMod, codingGovMod] = await Promise.all([
    import("./domains/registry.js"),
    import("./domains/governance/policy-engine.js"),
    import("./domains/governance/retention-manager.js"),
    import("./domains/pilot/pilot-runner.js"),
    import("./domains/coding/pack.js"),
    import("./domains/coding/governance-policy.js"),
  ]);
  _DomainPackRegistry = domRegMod.DomainPackRegistry;
  _PolicyEngine = polEngMod.PolicyEngine;
  _AuditRetentionManager = retMgrMod.AuditRetentionManager;
  _PilotRunner = pilotMod.PilotRunner;
  _createCodingDomainPack = codingPackMod.createCodingDomainPack;
  _CODING_GOVERNANCE_POLICY = codingGovMod.CODING_GOVERNANCE_POLICY;

  // Persistence (lazy — only used when persistence.enabled)
  const [dbAdapterMod, pgEventMod, pgGoalMod, pgRetentionMod, psmMod, pgApprovalMod, pgIdentityMod, pgMemoryMod] = await Promise.all([
    import("./persistence/db-adapter.js"),
    import("./persistence/pg-event-store.js"),
    import("./persistence/pg-goal-manager.js"),
    import("./persistence/pg-retention-manager.js"),
    import("./persistence/persistent-state-machine.js"),
    import("./persistence/pg-approval-log.js"),
    import("./persistence/pg-identity-store.js"),
    import("./persistence/pg-memory-store.js"),
  ]);
  _AutonomyDbAdapter = dbAdapterMod.AutonomyDbAdapter;
  _PgEventStore = pgEventMod.PgEventStore;
  _PgGoalManager = pgGoalMod.PgGoalManager;
  _PgRetentionManager = pgRetentionMod.PgRetentionManager;
  _PersistentStateMachine = psmMod.PersistentStateMachine;
  _PgApprovalLog = pgApprovalMod.PgApprovalLog;
  _PgIdentityStore = pgIdentityMod.PgIdentityStore;
  _PgMemoryStore = pgMemoryMod.PgMemoryStore;
}

// ---------- Service ----------

export class MilaidyAutonomyService extends Service {
  static override serviceType = "AUTONOMY" as const;

  capabilityDescription = "Milaidy Autonomy Kernel — trust scoring, memory gating, drift monitoring, and goal management";

  private trustScorer: TrustScorer | null = null;
  private memoryGate: (MemoryGate & { dispose(): void }) | null = null;
  private memoryStore: import("./memory/store.js").MemoryStore | null = null;
  private driftMonitor: PersonaDriftMonitor | null = null;
  private goalManager: GoalManager | null = null;
  private toolRegistry: import("./tools/types.js").ToolRegistryInterface | null = null;
  private schemaValidator: import("./verification/schema-validator.js").SchemaValidator | null = null;
  private postConditionVerifier: import("./verification/postcondition-verifier.js").PostConditionVerifier | null = null;
  private stateMachine: import("./state-machine/types.js").KernelStateMachineInterface | null = null;
  private approvalGate: import("./approval/types.js").ApprovalGateInterface | null = null;
  private eventStore: import("./workflow/types.js").EventStoreInterface | null = null;
  private compensationRegistry: import("./workflow/types.js").CompensationRegistryInterface | null = null;
  private executionPipeline: import("./workflow/types.js").ToolExecutionPipelineInterface | null = null;
  private workflowEngine: import("./adapters/workflow/types.js").WorkflowEngine | null = null;
  private invariantChecker: import("./verification/invariants/invariant-checker.js").InvariantChecker | null = null;
  private baselineHarness: import("./metrics/baseline-harness.js").BaselineHarness | null = null;
  private planner: import("./roles/types.js").PlannerRole | null = null;
  private executorRole: import("./roles/types.js").ExecutorRole | null = null;
  private verifier: import("./roles/types.js").VerifierRole | null = null;
  private memoryWriterRole: import("./roles/types.js").MemoryWriterRole | null = null;
  private auditorRole: import("./roles/types.js").AuditorRole | null = null;
  private safeModeController: import("./roles/types.js").SafeModeController | null = null;
  private orchestrator: import("./roles/types.js").RoleOrchestrator | null = null;
  private identityConfig: AutonomyIdentityConfig | null = null;
  private resolvedRetrievalConfig: import("./config.js").AutonomyRetrievalConfig | null = null;
  private enabled = false;

  // Phase 5 — Domains & Governance components
  private domainPackRegistry: import("./domains/registry.js").DomainPackRegistry | null = null;
  private policyEngine: import("./domains/governance/policy-engine.js").PolicyEngine | null = null;
  private auditRetentionManager: import("./domains/governance/retention-manager.js").AuditRetentionManager | null = null;
  private pilotRunner: import("./domains/pilot/pilot-runner.js").PilotRunner | null = null;

  // Persistence components
  private dbAdapter: import("./persistence/db-adapter.js").AutonomyDbAdapter | null = null;
  private approvalLog: import("./persistence/pg-approval-log.js").ApprovalLogInterface | null = null;
  private identityStore: import("./persistence/pg-identity-store.js").IdentityStoreInterface | null = null;

  // Phase 4 — Learning components
  private traceCollector: import("./learning/trace-collector.js").TraceCollector | null = null;
  private hackDetector: import("./learning/hack-detection.js").HackDetector | null = null;
  private rolloutCollector: import("./learning/rollout.js").RolloutCollector | null = null;
  private modelProvider: import("./learning/types.js").ModelProvider | null = null;
  private promptBuilder: import("./learning/prompt-builder.js").SystemPromptBuilder | null = null;
  private checkpointManager: import("./learning/rollout.js").CheckpointManager | null = null;
  private adversarialGenerator: import("./learning/adversarial.js").AdversarialScenarioGenerator | null = null;

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

    // ---------- Persistence Setup ----------
    const persistenceEnabled = config.persistence?.enabled ?? false;
    if (persistenceEnabled) {
      try {
        const db = (runtime as unknown as { adapter?: { db?: unknown } }).adapter?.db;
        if (db) {
          this.dbAdapter = new _AutonomyDbAdapter(
            db as import("./persistence/db-adapter.js").DrizzleDb,
            { autoMigrate: config.persistence?.autoMigrate ?? true, agentId: runtime.agentId },
          );
          await this.dbAdapter.initialize();
          logger.info("[autonomy-service] Persistence layer initialized");
        } else {
          logger.warn("[autonomy-service] persistence.enabled but no database available — falling back to in-memory");
        }
      } catch (err) {
        logger.error(`[autonomy-service] Persistence init failed — falling back to in-memory: ${err instanceof Error ? err.message : err}`);
        this.dbAdapter = null;
      }
    }

    // Instantiate components
    this.trustScorer = new _RuleBasedTrustScorer(config.trust);
    if (this.dbAdapter) {
      this.memoryStore = new _PgMemoryStore(this.dbAdapter);
    }
    this.memoryGate = new _MemoryGateImpl(
      this.trustScorer,
      config.trust,
      config.memoryGate,
      this.memoryStore ?? undefined,
    );
    if (typeof (this.memoryGate as { hydrateQuarantine?: () => Promise<void> }).hydrateQuarantine === "function") {
      await (this.memoryGate as { hydrateQuarantine: () => Promise<void> }).hydrateQuarantine();
    }
    this.driftMonitor = new _RuleBasedDriftMonitor(config.driftMonitor);

    // Goal manager: Pg-backed or in-memory
    this.goalManager = this.dbAdapter
      ? new _PgGoalManager(this.dbAdapter)
      : new _InMemoryGoalManager();

    // Instantiate tool contracts & verification components
    this.toolRegistry = new _ToolRegistry();
    _registerBuiltinToolContracts(this.toolRegistry);
    this.schemaValidator = new _SchemaValidator(this.toolRegistry);
    this.postConditionVerifier = new _PostConditionVerifier(
      config.tools?.checkTimeoutMs,
    );
    _registerBuiltinPostConditions(this.postConditionVerifier);

    // Instantiate workflow engine components
    const innerStateMachine = new _KernelStateMachine();
    this.stateMachine = this.dbAdapter
      ? new _PersistentStateMachine(innerStateMachine, this.dbAdapter)
      : innerStateMachine;

    const workflowEngineProvider = config.workflowEngine?.provider ?? "local";
    const workflowTimeoutMs = config.workflow?.defaultTimeoutMs ?? 30_000;
    if (workflowEngineProvider === "temporal") {
      try {
        this.workflowEngine = new _TemporalWorkflowEngine(
          {
            ...(config.workflowEngine?.temporal ?? {}),
            defaultTimeoutMs:
              config.workflowEngine?.temporal?.defaultTimeoutMs ??
              workflowTimeoutMs,
          },
        );
      } catch (err) {
        logger.warn(
          `[autonomy-service] Temporal workflow engine unavailable — falling back to local: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        this.workflowEngine = new _LocalWorkflowEngine({
          defaultTimeoutMs: workflowTimeoutMs,
        });
      }
    } else {
      this.workflowEngine = new _LocalWorkflowEngine({
        defaultTimeoutMs: workflowTimeoutMs,
      });
    }

    let eventBusRef: { emit: (event: string, payload: unknown) => void } | undefined;
    try {
      const { getEventBus } = await import("../events/event-bus.js");
      eventBusRef = getEventBus() as unknown as { emit: (event: string, payload: unknown) => void };
    } catch {
      // Event bus not available — non-fatal
    }
    if (this.dbAdapter) {
      const gate = new _PersistentApprovalGate(this.dbAdapter, {
        timeoutMs: config.approval?.timeoutMs ?? 300_000,
        eventBus: eventBusRef,
      });
      this.approvalGate = gate;
      await gate.hydratePending();
    } else {
      this.approvalGate = new _ApprovalGate({
        timeoutMs: config.approval?.timeoutMs ?? 300_000,
        eventBus: eventBusRef,
      });
    }

    // Event store: Pg-backed or in-memory
    this.eventStore = this.dbAdapter
      ? new _PgEventStore(this.dbAdapter, {
          retentionMs: config.eventStore?.retentionMs ?? 0,
        })
      : new _InMemoryEventStore({
          maxEvents: config.eventStore?.maxEvents ?? 10_000,
          retentionMs: config.eventStore?.retentionMs ?? 0,
        });

    this.compensationRegistry = new _CompensationRegistry();
    _registerBuiltinCompensations(this.compensationRegistry);

    // Approval log and identity store (Pg-only, null when in-memory)
    if (this.dbAdapter) {
      this.approvalLog = new _PgApprovalLog(this.dbAdapter);
      this.identityStore = new _PgIdentityStore(this.dbAdapter);
    }

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

    // Instantiate role implementations (Phase 3)
    this.planner = new _GoalDrivenPlanner(
      this.goalManager,
      this.toolRegistry,
      config.roles?.planner,
    );
    this.executorRole = new _PipelineExecutor(this.executionPipeline);
    this.verifier = new _UnifiedVerifier(
      this.schemaValidator,
      this.postConditionVerifier,
      this.invariantChecker ?? undefined,
    );
    this.memoryWriterRole = new _GatedMemoryWriter(this.memoryGate);
    this.auditorRole = new _DriftAwareAuditor(this.driftMonitor, this.eventStore);
    this.safeModeController = new _SafeModeControllerImpl(config.roles?.safeMode);
    this.orchestrator = new _KernelOrchestrator(
      this.planner,
      this.executorRole,
      this.verifier,
      this.memoryWriterRole,
      this.auditorRole,
      this.stateMachine,
      this.safeModeController,
      this.workflowEngine ?? undefined,
    );

    // Initialize learning infrastructure (Phase 4)
    this.promptBuilder = new _SystemPromptBuilder();
    const learningConfig = config.learning;
    if (learningConfig?.enabled) {
      const checkpointReward = new _CheckpointReward();
      const episodeReward = new _EpisodeReward(checkpointReward);
      this.traceCollector = new _TraceCollector(this.eventStore!, checkpointReward, episodeReward);
      this.hackDetector = new _HackDetector(_createHackDetectionInvariants());
      if (learningConfig.modelProvider?.baseUrl && learningConfig.modelProvider?.model) {
        this.modelProvider = new _HttpModelProvider({
          baseUrl: learningConfig.modelProvider.baseUrl,
          model: learningConfig.modelProvider.model,
          timeoutMs: learningConfig.modelProvider.timeoutMs,
        });
      } else {
        this.modelProvider = new _StubModelProvider();
      }
      this.rolloutCollector = new _RolloutCollector(
        this.orchestrator!,
        this.traceCollector,
        this.hackDetector,
        learningConfig.hackDetection?.threshold ?? 0.5,
      );
      this.checkpointManager = new _CheckpointManager(this.baselineHarness!);
      this.adversarialGenerator = new _AdversarialScenarioGenerator();
    }

    // Initialize domain packs (Phase 5)
    const domainsConfig = config.domains;
    if (domainsConfig?.enabled) {
      this.domainPackRegistry = new _DomainPackRegistry();
      this.policyEngine = new _PolicyEngine();
      this.auditRetentionManager = this.dbAdapter
        ? new _PgRetentionManager(this.dbAdapter) as unknown as import("./domains/governance/retention-manager.js").AuditRetentionManager
        : new _AuditRetentionManager();

      // Register coding domain pack
      const codingPack = _createCodingDomainPack(domainsConfig.coding);
      this.domainPackRegistry.register(codingPack);
      this.policyEngine.registerPolicy(_CODING_GOVERNANCE_POLICY);

      // Auto-load configured domains
      for (const domainId of domainsConfig.autoLoadDomains ?? []) {
        if (this.domainPackRegistry.has(domainId)) {
          this.domainPackRegistry.load(domainId, this.toolRegistry!, this.invariantChecker!);
        }
      }

      // Create pilot runner
      this.pilotRunner = new _PilotRunner(
        this.domainPackRegistry,
        evaluator,
        {
          trustScorer: this.trustScorer!,
          memoryGate: this.memoryGate!,
          driftMonitor: this.driftMonitor!,
          goalManager: this.goalManager!,
        },
      );
    }

    this.enabled = true;

    // Emit kernel-up metric
    try {
      const { recordKernelUp } = await import("./metrics/prometheus-metrics.js");
      recordKernelUp();
    } catch {
      // Metrics not available — non-fatal
    }

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
      if (this.memoryStore) container.registerValue(TOKENS.MemoryStore, this.memoryStore);
      if (this.driftMonitor) container.registerValue(TOKENS.DriftMonitor, this.driftMonitor);
      if (this.goalManager) container.registerValue(TOKENS.GoalManager, this.goalManager);
      if (this.toolRegistry) container.registerValue(TOKENS.ToolRegistry, this.toolRegistry);
      if (this.schemaValidator) container.registerValue(TOKENS.SchemaValidator, this.schemaValidator);
      if (this.postConditionVerifier) container.registerValue(TOKENS.PostConditionVerifier, this.postConditionVerifier);
      if (this.stateMachine) container.registerValue(TOKENS.StateMachine, this.stateMachine);
      if (this.workflowEngine) container.registerValue(TOKENS.WorkflowEngine, this.workflowEngine);
      if (this.approvalGate) container.registerValue(TOKENS.ApprovalGate, this.approvalGate);
      if (this.eventStore) container.registerValue(TOKENS.EventStore, this.eventStore);
      if (this.compensationRegistry) container.registerValue(TOKENS.CompensationRegistry, this.compensationRegistry);
      if (this.executionPipeline) container.registerValue(TOKENS.ExecutionPipeline, this.executionPipeline);
      if (this.invariantChecker) container.registerValue(TOKENS.InvariantChecker, this.invariantChecker);
      if (this.baselineHarness) container.registerValue(TOKENS.BaselineHarness, this.baselineHarness);
      if (this.planner) container.registerValue(TOKENS.Planner, this.planner);
      if (this.executorRole) container.registerValue(TOKENS.Executor, this.executorRole);
      if (this.verifier) container.registerValue(TOKENS.Verifier, this.verifier);
      if (this.memoryWriterRole) container.registerValue(TOKENS.MemoryWriter, this.memoryWriterRole);
      if (this.auditorRole) container.registerValue(TOKENS.Auditor, this.auditorRole);
      if (this.safeModeController) container.registerValue(TOKENS.SafeMode, this.safeModeController);
      if (this.orchestrator) container.registerValue(TOKENS.Orchestrator, this.orchestrator);

      // Persistence components
      if (this.dbAdapter) container.registerValue(TOKENS.AutonomyDbAdapter, this.dbAdapter);
      if (this.approvalLog) container.registerValue(TOKENS.ApprovalLog, this.approvalLog);
      if (this.identityStore) container.registerValue(TOKENS.IdentityStore, this.identityStore);

      // Phase 4 — Learning components
      if (this.traceCollector) container.registerValue(TOKENS.TraceCollector, this.traceCollector);
      if (this.hackDetector) container.registerValue(TOKENS.HackDetector, this.hackDetector);
      if (this.rolloutCollector) container.registerValue(TOKENS.RolloutCollector, this.rolloutCollector);
      if (this.modelProvider) container.registerValue(TOKENS.ModelProvider, this.modelProvider);
      if (this.promptBuilder) container.registerValue(TOKENS.PromptBuilder, this.promptBuilder);
      if (this.checkpointManager) container.registerValue(TOKENS.CheckpointManager, this.checkpointManager);
      if (this.adversarialGenerator) container.registerValue(TOKENS.AdversarialGenerator, this.adversarialGenerator);

      // Phase 5 — Domain & Governance components
      if (this.domainPackRegistry) container.registerValue(TOKENS.DomainPackRegistry, this.domainPackRegistry);
      if (this.policyEngine) container.registerValue(TOKENS.PolicyEngine, this.policyEngine);
      if (this.auditRetentionManager) container.registerValue(TOKENS.AuditRetentionManager, this.auditRetentionManager);
      if (this.pilotRunner) container.registerValue(TOKENS.PilotRunner, this.pilotRunner);

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
    this.workflowEngine = new _LocalWorkflowEngine();
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

    // Initialize role implementations (Phase 3)
    this.planner = new _GoalDrivenPlanner(this.goalManager, this.toolRegistry);
    this.executorRole = new _PipelineExecutor(this.executionPipeline);
    this.verifier = new _UnifiedVerifier(
      this.schemaValidator,
      this.postConditionVerifier,
      this.invariantChecker,
    );
    this.memoryWriterRole = new _GatedMemoryWriter(this.memoryGate);
    this.auditorRole = new _DriftAwareAuditor(this.driftMonitor, this.eventStore);
    this.safeModeController = new _SafeModeControllerImpl();
    this.orchestrator = new _KernelOrchestrator(
      this.planner,
      this.executorRole,
      this.verifier,
      this.memoryWriterRole,
      this.auditorRole,
      this.stateMachine,
      this.safeModeController,
      this.workflowEngine ?? undefined,
    );

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
    await this.workflowEngine?.close();
    this.trustScorer = null;
    this.memoryGate = null;
    this.memoryStore = null;
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
    this.workflowEngine = null;
    this.invariantChecker = null;
    this.baselineHarness = null;
    this.planner = null;
    this.executorRole = null;
    this.verifier = null;
    this.memoryWriterRole = null;
    this.auditorRole = null;
    this.safeModeController = null;
    this.orchestrator = null;
    this.traceCollector = null;
    this.hackDetector = null;
    this.rolloutCollector = null;
    this.modelProvider = null;
    this.promptBuilder = null;
    this.checkpointManager = null;
    this.adversarialGenerator = null;
    this.domainPackRegistry = null;
    this.policyEngine = null;
    this.auditRetentionManager = null;
    this.pilotRunner = null;
    this.dbAdapter = null;
    this.approvalLog = null;
    this.identityStore = null;
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

    // Persist to identity store if available
    if (this.identityStore) {
      try {
        await this.identityStore.saveVersion(updated);
      } catch (err) {
        logger.warn(`[autonomy-service] Failed to persist identity version: ${err instanceof Error ? err.message : err}`);
      }
    }

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

  getWorkflowEngine(): import("./adapters/workflow/types.js").WorkflowEngine | null {
    return this.workflowEngine;
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

  getPlanner(): import("./roles/types.js").PlannerRole | null {
    return this.planner;
  }

  getExecutor(): import("./roles/types.js").ExecutorRole | null {
    return this.executorRole;
  }

  getVerifier(): import("./roles/types.js").VerifierRole | null {
    return this.verifier;
  }

  getMemoryWriter(): import("./roles/types.js").MemoryWriterRole | null {
    return this.memoryWriterRole;
  }

  getAuditor(): import("./roles/types.js").AuditorRole | null {
    return this.auditorRole;
  }

  getSafeModeController(): import("./roles/types.js").SafeModeController | null {
    return this.safeModeController;
  }

  getOrchestrator(): import("./roles/types.js").RoleOrchestrator | null {
    return this.orchestrator;
  }

  // ---------- Persistence Accessors ----------

  getDbAdapter(): import("./persistence/db-adapter.js").AutonomyDbAdapter | null {
    return this.dbAdapter;
  }

  getApprovalLog(): import("./persistence/pg-approval-log.js").ApprovalLogInterface | null {
    return this.approvalLog;
  }

  getIdentityStore(): import("./persistence/pg-identity-store.js").IdentityStoreInterface | null {
    return this.identityStore;
  }

  // ---------- Phase 4 — Learning Accessors ----------

  getTraceCollector(): import("./learning/trace-collector.js").TraceCollector | null {
    return this.traceCollector;
  }

  getHackDetector(): import("./learning/hack-detection.js").HackDetector | null {
    return this.hackDetector;
  }

  getRolloutCollector(): import("./learning/rollout.js").RolloutCollector | null {
    return this.rolloutCollector;
  }

  getModelProvider(): import("./learning/types.js").ModelProvider | null {
    return this.modelProvider;
  }

  getPromptBuilder(): import("./learning/prompt-builder.js").SystemPromptBuilder | null {
    return this.promptBuilder;
  }

  getCheckpointManager(): import("./learning/rollout.js").CheckpointManager | null {
    return this.checkpointManager;
  }

  getAdversarialGenerator(): import("./learning/adversarial.js").AdversarialScenarioGenerator | null {
    return this.adversarialGenerator;
  }

  // ---------- Phase 5 — Domains & Governance Accessors ----------

  getDomainPackRegistry(): import("./domains/registry.js").DomainPackRegistry | null {
    return this.domainPackRegistry;
  }

  getPolicyEngine(): import("./domains/governance/policy-engine.js").PolicyEngine | null {
    return this.policyEngine;
  }

  getAuditRetentionManager(): import("./domains/governance/retention-manager.js").AuditRetentionManager | null {
    return this.auditRetentionManager;
  }

  getPilotRunner(): import("./domains/pilot/pilot-runner.js").PilotRunner | null {
    return this.pilotRunner;
  }

  // ---------- Lifecycle ----------

  async stop(): Promise<void> {
    this.memoryGate?.dispose();
    this.approvalGate?.dispose();
    await this.workflowEngine?.close();
    this.trustScorer = null;
    this.memoryGate = null;
    this.memoryStore = null;
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
    this.workflowEngine = null;
    this.invariantChecker = null;
    this.baselineHarness = null;
    this.planner = null;
    this.executorRole = null;
    this.verifier = null;
    this.memoryWriterRole = null;
    this.auditorRole = null;
    this.safeModeController = null;
    this.orchestrator = null;
    this.traceCollector = null;
    this.hackDetector = null;
    this.rolloutCollector = null;
    this.modelProvider = null;
    this.promptBuilder = null;
    this.checkpointManager = null;
    this.adversarialGenerator = null;
    this.domainPackRegistry = null;
    this.policyEngine = null;
    this.auditRetentionManager = null;
    this.pilotRunner = null;
    this.dbAdapter = null;
    this.approvalLog = null;
    this.identityStore = null;
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
