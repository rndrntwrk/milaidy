import { describe, expect, it } from "vitest";
import { RuleBasedDriftMonitor } from "../identity/drift-monitor.js";
import { computeIdentityHash } from "../identity/schema.js";
import { MemoryGateImpl } from "../memory/gate.js";
import { KernelStateMachine } from "../state-machine/kernel-state-machine.js";
import { ToolRegistry } from "../tools/registry.js";
import { registerBuiltinToolContracts } from "../tools/schemas/index.js";
import { RuleBasedTrustScorer } from "../trust/scorer.js";
import { InvariantChecker } from "../verification/invariants/invariant-checker.js";
import { registerBuiltinInvariants } from "../verification/invariants/index.js";
import { PostConditionVerifier } from "../verification/postcondition-verifier.js";
import { registerBuiltinPostConditions } from "../verification/postconditions/index.js";
import { SchemaValidator } from "../verification/schema-validator.js";
import { ApprovalGate } from "../approval/approval-gate.js";
import { CompensationRegistry } from "../workflow/compensation-registry.js";
import { registerBuiltinCompensations } from "../workflow/compensations/index.js";
import { InMemoryEventStore } from "../workflow/event-store.js";
import { ToolExecutionPipeline } from "../workflow/execution-pipeline.js";
import { DriftAwareAuditor } from "./auditor.js";
import { PipelineExecutor } from "./executor.js";
import { GatedMemoryWriter } from "./memory-writer.js";
import { KernelOrchestrator } from "./orchestrator.js";
import { SafeModeControllerImpl } from "./safe-mode.js";
import type { OrchestratedRequest, PlannerRole } from "./types.js";
import { UnifiedVerifier } from "./verifier.js";

function createIdentity(): OrchestratedRequest["identityConfig"] {
  const identity = {
    coreValues: ["helpfulness"],
    communicationStyle: {
      tone: "neutral",
      verbosity: "balanced",
      personaVoice: "default",
    },
    hardBoundaries: [],
    softPreferences: {},
    identityVersion: 1,
    identityHash: "",
  };
  identity.identityHash = computeIdentityHash(identity);
  return identity;
}

function createPlanner(): PlannerRole {
  let activePlan: import("./types.js").ExecutionPlan | null = null;

  return {
    createPlan: async (request) => {
      const constraints = request.constraints ?? ["PLAY_EMOTE"];
      const steps = constraints.map((toolName, index) => ({
        id: `step-${index + 1}`,
        toolName,
        params: toolName === "PLAY_EMOTE" ? { emote: "wave" } : {},
      }));
      const plan = {
        id: `plan-${Date.now()}`,
        goals: [],
        steps,
        createdAt: Date.now(),
        status: "pending" as const,
      };
      activePlan = plan;
      return plan;
    },
    validatePlan: async () => ({ valid: true, issues: [] }),
    getActivePlan: () => activePlan,
    cancelPlan: async () => {
      activePlan = null;
    },
  };
}

function createStack(opts: { safeModeErrorThreshold?: number } = {}) {
  const trustScorer = new RuleBasedTrustScorer();
  const memoryGate = new MemoryGateImpl(trustScorer);
  const driftMonitor = new RuleBasedDriftMonitor();
  const toolRegistry = new ToolRegistry();
  registerBuiltinToolContracts(toolRegistry);
  const schemaValidator = new SchemaValidator(toolRegistry);
  const postConditionVerifier = new PostConditionVerifier();
  registerBuiltinPostConditions(postConditionVerifier);
  const invariantChecker = new InvariantChecker();
  registerBuiltinInvariants(invariantChecker);
  const stateMachine = new KernelStateMachine();
  const approvalGate = new ApprovalGate({ timeoutMs: 10_000 });
  const eventStore = new InMemoryEventStore();
  const compensationRegistry = new CompensationRegistry();
  registerBuiltinCompensations(compensationRegistry);

  const pipeline = new ToolExecutionPipeline({
    schemaValidator,
    approvalGate,
    postConditionVerifier,
    compensationRegistry,
    stateMachine,
    eventStore,
    invariantChecker,
    config: {
      autoApproveReadOnly: true,
      autoApproveSources: [],
    },
  });

  const planner = createPlanner();
  const executor = new PipelineExecutor(pipeline);
  const verifier = new UnifiedVerifier(
    schemaValidator,
    postConditionVerifier,
  );
  const memoryWriter = new GatedMemoryWriter(memoryGate);
  const auditor = new DriftAwareAuditor(driftMonitor, eventStore);
  const safeMode = new SafeModeControllerImpl({
    errorThreshold: opts.safeModeErrorThreshold ?? 3,
  });
  const orchestrator = new KernelOrchestrator(
    planner,
    executor,
    verifier,
    memoryWriter,
    auditor,
    stateMachine,
    safeMode,
  );

  return { orchestrator, safeMode };
}

function makeRequest(
  actionHandler: OrchestratedRequest["actionHandler"],
  overrides: Partial<OrchestratedRequest> = {},
): OrchestratedRequest {
  return {
    description: "Execute integration lifecycle",
    constraints: ["PLAY_EMOTE"],
    source: "user",
    sourceTrust: 0.9,
    agentId: "agent-lifecycle",
    actionHandler,
    identityConfig: createIdentity(),
    recentOutputs: ["hello"],
    ...overrides,
  };
}

describe("KernelOrchestrator lifecycle integration", () => {
  it("P3-031: validates full lifecycle under nominal conditions", async () => {
    const { orchestrator } = createStack();
    const result = await orchestrator.execute(
      makeRequest(async () => ({ result: { ok: true }, durationMs: 5 }), {
        constraints: ["PLAY_EMOTE", "PLAY_EMOTE"],
      }),
    );

    expect(result.success).toBe(true);
    expect(result.plan.status).toBe("complete");
    expect(result.executions).toHaveLength(2);
    expect(result.executions.every((step) => step.success)).toBe(true);
    expect(result.verificationReports?.length).toBe(2);
    expect(result.verificationReports?.every((report) => report.overallPassed)).toBe(true);
    expect(result.memoryReport?.allowed).toBe(2);
    expect(result.auditReport).toBeDefined();
  });

  it("P3-032: validates lifecycle behavior under partial failures", async () => {
    const { orchestrator } = createStack();
    let callCount = 0;

    const result = await orchestrator.execute(
      makeRequest(async () => {
        callCount += 1;
        if (callCount === 2) throw new Error("step-2 boom");
        return { result: { ok: true }, durationMs: 5 };
      }, { constraints: ["PLAY_EMOTE", "PLAY_EMOTE"] }),
    );

    expect(result.success).toBe(false);
    expect(result.executions).toHaveLength(2);
    expect(result.executions[0].success).toBe(true);
    expect(result.executions[1].success).toBe(false);
    expect(result.memoryReport).toBeUndefined();
    expect(result.auditReport).toBeDefined();
  });

  it("P3-033: triggers safe mode on repeated execution errors", async () => {
    const { orchestrator, safeMode } = createStack({ safeModeErrorThreshold: 1 });

    const result = await orchestrator.execute(
      makeRequest(async () => {
        throw new Error("fatal execution error");
      }),
    );

    expect(result.success).toBe(false);
    expect(safeMode.getStatus().active).toBe(true);
  });
});
