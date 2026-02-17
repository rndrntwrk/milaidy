import { describe, expect, it, vi } from "vitest";
import { ApprovalGate } from "../approval/approval-gate.js";
import { KernelStateMachine } from "../state-machine/kernel-state-machine.js";
import { ToolRegistry } from "../tools/registry.js";
import { registerBuiltinToolContracts } from "../tools/schemas/index.js";
import { InvariantChecker } from "../verification/invariants/invariant-checker.js";
import { registerBuiltinInvariants } from "../verification/invariants/index.js";
import { PostConditionVerifier } from "../verification/postcondition-verifier.js";
import { registerBuiltinPostConditions } from "../verification/postconditions/index.js";
import { SchemaValidator } from "../verification/schema-validator.js";
import { CompensationRegistry } from "../workflow/compensation-registry.js";
import { registerBuiltinCompensations } from "../workflow/compensations/index.js";
import { InMemoryEventStore } from "../workflow/event-store.js";
import { ToolExecutionPipeline } from "../workflow/execution-pipeline.js";
import type {
  ToolActionHandler,
  ToolExecutionPipelineInterface,
} from "../workflow/types.js";
import { PipelineExecutor } from "./executor.js";
import { KernelOrchestrator } from "./orchestrator.js";
import { SafeModeControllerImpl } from "./safe-mode.js";
import type {
  AuditorRole,
  ExecutionPlan,
  MemoryWriterRole,
  OrchestratedRequest,
  PlannerRole,
  VerifierRole,
} from "./types.js";

function createPlan(
  toolName: string,
  params: Record<string, unknown>,
): ExecutionPlan {
  return {
    id: `plan-${toolName.toLowerCase()}`,
    goals: [],
    steps: [{ id: "step-1", toolName, params }],
    createdAt: Date.now(),
    status: "pending",
  };
}

function createPlanner(plan: ExecutionPlan): PlannerRole {
  return {
    createPlan: vi.fn(async () => plan),
    // Intentionally return valid=true to ensure executor/pipeline remains the enforcement boundary.
    validatePlan: vi.fn(async () => ({ valid: true, issues: [] })),
    getActivePlan: vi.fn(() => plan),
    cancelPlan: vi.fn(async () => {}),
  };
}

function createVerifier(): VerifierRole {
  return {
    verify: vi.fn(async () => ({
      schema: { valid: true, errors: [] },
      postConditions: { status: "passed", hasCriticalFailure: false },
      invariants: { status: "passed", hasCriticalViolation: false },
      overallPassed: true,
    })),
    checkInvariants: vi.fn(async () => ({
      status: "passed",
      checks: [],
      hasCriticalViolation: false,
    })),
  };
}

function createMemoryWriter(): MemoryWriterRole {
  return {
    write: vi.fn(async () => ({
      action: "allow",
      reason: "ok",
      trustScore: {
        score: 1,
        dimensions: {
          sourceReliability: 1,
          contentConsistency: 1,
          temporalCoherence: 1,
          instructionAlignment: 1,
        },
        reasoning: [],
        computedAt: Date.now(),
      },
    })),
    writeBatch: vi.fn(async (requests) => ({
      total: requests.length,
      allowed: requests.length,
      quarantined: 0,
      rejected: 0,
    })),
    getStats: vi.fn(() => ({
      allowed: 0,
      quarantined: 0,
      rejected: 0,
      pendingReview: 0,
    })),
  };
}

function createAuditor(): AuditorRole {
  return {
    audit: vi.fn(async () => ({
      driftReport: {
        driftScore: 0,
        dimensions: {
          valueAlignment: 1,
          styleConsistency: 1,
          boundaryRespect: 1,
          topicFocus: 1,
        },
        windowSize: 0,
        severity: "none",
        corrections: [],
        analyzedAt: Date.now(),
      },
      eventCount: 0,
      anomalies: [],
      recommendations: [],
      auditedAt: Date.now(),
    })),
    getDriftReport: vi.fn(() => null),
    queryEvents: vi.fn(async () => []),
  };
}

function createPipelineStack(): {
  pipeline: ToolExecutionPipelineInterface;
  approvalGate: ApprovalGate;
} {
  const toolRegistry = new ToolRegistry();
  registerBuiltinToolContracts(toolRegistry);

  const schemaValidator = new SchemaValidator(toolRegistry);
  const postConditionVerifier = new PostConditionVerifier();
  registerBuiltinPostConditions(postConditionVerifier);

  const stateMachine = new KernelStateMachine();
  const approvalGate = new ApprovalGate({ timeoutMs: 10_000 });
  const eventStore = new InMemoryEventStore();
  const compensationRegistry = new CompensationRegistry();
  registerBuiltinCompensations(compensationRegistry);
  const invariantChecker = new InvariantChecker();
  registerBuiltinInvariants(invariantChecker);

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

  return { pipeline, approvalGate };
}

function createRequest(
  actionHandler: ToolActionHandler,
  overrides: Partial<OrchestratedRequest> = {},
): OrchestratedRequest {
  return {
    description: "authz test request",
    source: "user",
    sourceTrust: 0.9,
    agentId: "agent-authz",
    actionHandler,
    identityConfig: {
      coreValues: ["helpfulness"],
      communicationStyle: {
        tone: "neutral",
        verbosity: "balanced",
        personaVoice: "default",
      },
      hardBoundaries: [],
      softPreferences: {},
      identityVersion: 1,
    } as OrchestratedRequest["identityConfig"],
    recentOutputs: [],
    ...overrides,
  };
}

describe("KernelOrchestrator contract/authz enforcement", () => {
  it("does not bypass contract validation for unknown tools", async () => {
    const plan = createPlan("NONEXISTENT_TOOL", { any: "value" });
    const planner = createPlanner(plan);
    const { pipeline } = createPipelineStack();
    const executor = new PipelineExecutor(pipeline);
    const actionHandler = vi.fn(async () => ({
      result: { shouldNotRun: true },
      durationMs: 1,
    }));

    const orchestrator = new KernelOrchestrator(
      planner,
      executor,
      createVerifier(),
      createMemoryWriter(),
      createAuditor(),
      new KernelStateMachine(),
      new SafeModeControllerImpl(),
    );

    const result = await orchestrator.execute(createRequest(actionHandler));

    expect(result.success).toBe(false);
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0].validation.valid).toBe(false);
    expect(actionHandler).not.toHaveBeenCalled();
  });

  it("does not bypass approval authz for irreversible tools", async () => {
    const plan = createPlan("RUN_IN_TERMINAL", { command: "echo guarded" });
    const planner = createPlanner(plan);
    const { pipeline, approvalGate } = createPipelineStack();
    const executor = new PipelineExecutor(pipeline);
    const actionHandler = vi.fn(async () => ({
      result: { shouldNotRun: true },
      durationMs: 1,
    }));

    const orchestrator = new KernelOrchestrator(
      planner,
      executor,
      createVerifier(),
      createMemoryWriter(),
      createAuditor(),
      new KernelStateMachine(),
      new SafeModeControllerImpl(),
    );

    const run = orchestrator.execute(createRequest(actionHandler));

    await vi.waitFor(() => {
      expect(approvalGate.getPending().length).toBeGreaterThan(0);
    }, { timeout: 1_000 });
    const pending = approvalGate.getPending()[0];
    approvalGate.resolve(pending.id, "denied", "authz-test");

    const result = await run;

    expect(result.success).toBe(false);
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0].error).toBe("Approval denied");
    expect(actionHandler).not.toHaveBeenCalled();
  });
});
