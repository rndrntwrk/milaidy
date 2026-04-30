import { afterEach, describe, expect, it, vi } from "vitest";
import { KernelStateMachine } from "../state-machine/kernel-state-machine.js";
import type {
  PipelineResult,
  ToolActionHandler,
} from "../workflow/types.js";
import { LocalWorkflowEngine } from "../adapters/workflow/local-engine.js";
import type { WorkflowEngine } from "../adapters/workflow/types.js";
import {
  KernelOrchestrator,
  type RoleCallAuthzPolicy,
  type RoleCallPolicy,
} from "./orchestrator.js";
import { SafeModeControllerImpl } from "./safe-mode.js";
import type {
  AuditorRole,
  AuditReport,
  ExecutorRole,
  ExecutionPlan,
  MemoryWriterRole,
  OrchestratedRequest,
  PlannerRole,
  SafeModeController,
  VerifierRole,
} from "./types.js";

// --- Mocks ---

function createMockPlan(
  steps: Array<{ toolName: string }> = [{ toolName: "RUN_IN_TERMINAL" }],
): ExecutionPlan {
  return {
    id: "plan-test",
    goals: [],
    steps: steps.map((s, i) => ({
      id: `step-${i}`,
      toolName: s.toolName,
      params: {},
    })),
    createdAt: Date.now(),
    status: "pending",
  };
}

function createMockPlanner(
  plan?: ExecutionPlan,
  validationValid = true,
): PlannerRole {
  const p = plan ?? createMockPlan();
  return {
    createPlan: vi.fn(async () => p),
    validatePlan: vi.fn(async () => ({
      valid: validationValid,
      issues: validationValid ? [] : ["Invalid plan"],
    })),
    getActivePlan: vi.fn(() => p),
    cancelPlan: vi.fn(async () => {}),
  };
}

function createMockPipeline(success = true): ExecutorRole {
  return {
    execute: vi.fn(async (call) => ({
      requestId: call.requestId,
      toolName: call.tool,
      success,
      result: success ? "executed" : undefined,
      validation: { valid: true, errors: [] },
      durationMs: 50,
      error: success ? undefined : "execution failed",
    })),
  };
}

function createMockMemoryWriter(): MemoryWriterRole {
  return {
    write: vi.fn(async () => ({
      action: "allow" as const,
      trustScore: {
        score: 0.9,
        dimensions: {
          sourceReliability: 0.9,
          contentConsistency: 0.9,
          temporalCoherence: 0.9,
          instructionAlignment: 0.9,
        },
        reasoning: [],
        computedAt: Date.now(),
      },
      reason: "ok",
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

function createMockAuditor(driftScore = 0.05): AuditorRole {
  return {
    audit: vi.fn(async () => ({
      driftReport: {
        driftScore,
        dimensions: {
          valueAlignment: 1,
          styleConsistency: 1,
          boundaryRespect: 1,
          topicFocus: 1,
        },
        windowSize: 5,
        severity: "none" as const,
        corrections: [],
        analyzedAt: Date.now(),
      },
      eventCount: 2,
      anomalies: [],
      recommendations: [],
      auditedAt: Date.now(),
    })),
    getDriftReport: vi.fn(() => null),
    queryEvents: vi.fn(async () => []),
  };
}

function createMockVerifier(overallPassed = true): VerifierRole {
  return {
    verify: vi.fn(async () => ({
      schema: { valid: true, errors: [] },
      postConditions: { status: "passed", hasCriticalFailure: false },
      invariants: { status: "passed", hasCriticalViolation: false },
      overallPassed,
    })),
    checkInvariants: vi.fn(async () => ({
      status: "passed",
      checks: [],
      hasCriticalViolation: false,
    })),
  };
}

const mockActionHandler: ToolActionHandler = async () => ({
  result: "done",
  durationMs: 10,
});

function createRequest(
  overrides?: Partial<OrchestratedRequest>,
): OrchestratedRequest {
  return {
    description: "Test request",
    source: "user",
    sourceTrust: 0.9,
    agentId: "agent-1",
    actionHandler: mockActionHandler,
    identityConfig: {
      coreValues: ["helpfulness"],
      communicationStyle: {
        tone: "casual",
        verbosity: "balanced",
        personaVoice: "default",
      },
      hardBoundaries: [],
      softPreferences: {},
      identityVersion: 1,
    } as any,
    recentOutputs: ["Hello"],
    ...overrides,
  };
}

describe("KernelOrchestrator", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function createOrchestrator(overrides?: {
    planner?: PlannerRole;
    pipeline?: ExecutorRole;
    verifier?: VerifierRole;
    memoryWriter?: MemoryWriterRole;
    auditor?: AuditorRole;
    safeMode?: SafeModeController;
    workflowEngine?: WorkflowEngine;
    roleCallPolicy?: Partial<RoleCallPolicy>;
    roleCallAuthzPolicy?: Partial<RoleCallAuthzPolicy>;
  }) {
    const sm = new KernelStateMachine();
    return {
      orchestrator: new KernelOrchestrator(
        overrides?.planner ?? createMockPlanner(),
        overrides?.pipeline ?? createMockPipeline(),
        overrides?.verifier ?? createMockVerifier(),
        overrides?.memoryWriter ?? createMockMemoryWriter(),
        overrides?.auditor ?? createMockAuditor(),
        sm,
        overrides?.safeMode ?? new SafeModeControllerImpl(),
        overrides?.workflowEngine,
        overrides?.roleCallPolicy,
        overrides?.roleCallAuthzPolicy,
      ),
      sm,
    };
  }

  describe("execute()", () => {
    it("full lifecycle succeeds end-to-end", async () => {
      const { orchestrator, sm } = createOrchestrator();

      const result = await orchestrator.execute(createRequest());

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan.status).toBe("complete");
      expect(result.executions).toHaveLength(1);
      expect(result.verificationReports).toHaveLength(1);
      expect(result.auditReport).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(sm.currentState).toBe("idle");
    });

    it("fails closed on malformed orchestrated requests", async () => {
      const planner = createMockPlanner();
      const { orchestrator } = createOrchestrator({ planner });

      const result = await orchestrator.execute(
        createRequest({ sourceTrust: 2 as unknown as number }),
      );

      expect(result.success).toBe(false);
      expect(result.auditReport.anomalies[0]).toContain(
        "Role boundary validation failed for RoleOrchestrator.execute request",
      );
      expect(planner.createPlan).not.toHaveBeenCalled();
    });

    it("fails closed when source trust is below role-call auth floor", async () => {
      const planner = createMockPlanner();
      const { orchestrator } = createOrchestrator({
        planner,
        roleCallAuthzPolicy: {
          minSourceTrust: 0.95,
        },
      });

      const result = await orchestrator.execute(createRequest({ sourceTrust: 0.9 }));

      expect(result.success).toBe(false);
      expect(result.auditReport.anomalies[0]).toContain(
        "Role call denied: planner.createPlan source trust",
      );
      expect(planner.createPlan).not.toHaveBeenCalled();
    });

    it("fails closed when source is not in role-call allowlist", async () => {
      const planner = createMockPlanner();
      const { orchestrator } = createOrchestrator({
        planner,
        roleCallAuthzPolicy: {
          allowedSources: ["system"],
        },
      });

      const result = await orchestrator.execute(createRequest({ source: "user" }));

      expect(result.success).toBe(false);
      expect(result.auditReport.anomalies[0]).toContain(
        'Role call denied: planner.createPlan source "user" is not allowed',
      );
      expect(planner.createPlan).not.toHaveBeenCalled();
    });

    it("plan rejection stops lifecycle early", async () => {
      const planner = createMockPlanner(undefined, false);
      const pipeline = createMockPipeline();
      const { orchestrator } = createOrchestrator({ planner, pipeline });

      const result = await orchestrator.execute(createRequest());

      expect(result.success).toBe(false);
      expect(pipeline.execute).not.toHaveBeenCalled();
    });

    it("execution failure results in success=false", async () => {
      const pipeline = createMockPipeline(false);
      const { orchestrator } = createOrchestrator({ pipeline });

      const result = await orchestrator.execute(createRequest());

      expect(result.success).toBe(false);
      expect(result.executions[0].success).toBe(false);
    });

    it("verification failure sets orchestration success=false", async () => {
      const verifier = createMockVerifier(false);
      const { orchestrator } = createOrchestrator({ verifier });

      const result = await orchestrator.execute(createRequest());

      expect(result.executions[0].success).toBe(true);
      expect(result.verificationReports?.[0]?.overallPassed).toBe(false);
      expect(result.success).toBe(false);
    });

    it("memory write failure still allows audit to complete", async () => {
      const memoryWriter: MemoryWriterRole = {
        write: vi.fn(async () => {
          throw new Error("write boom");
        }),
        writeBatch: vi.fn(async () => {
          throw new Error("batch boom");
        }),
        getStats: vi.fn(() => ({
          allowed: 0,
          quarantined: 0,
          rejected: 0,
          pendingReview: 0,
        })),
      };
      const auditor = createMockAuditor();
      const { orchestrator, sm } = createOrchestrator({
        memoryWriter,
        auditor,
      });

      const result = await orchestrator.execute(createRequest());

      expect(auditor.audit).toHaveBeenCalled();
      expect(result.auditReport).toBeDefined();
      expect(sm.currentState).toBe("idle");
    });

    it("audit failure still completes (non-fatal)", async () => {
      const auditor: AuditorRole = {
        audit: vi.fn(async () => {
          throw new Error("audit boom");
        }),
        getDriftReport: vi.fn(() => null),
        queryEvents: vi.fn(async () => []),
      };
      const { orchestrator, sm } = createOrchestrator({ auditor });

      const result = await orchestrator.execute(createRequest());

      expect(result.success).toBe(true);
      expect(sm.currentState).toBe("idle");
    });

    it("returns comprehensive OrchestratedResult", async () => {
      const { orchestrator } = createOrchestrator();

      const result = await orchestrator.execute(createRequest());

      expect(result).toHaveProperty("plan");
      expect(result).toHaveProperty("executions");
      expect(result).toHaveProperty("memoryReport");
      expect(result).toHaveProperty("auditReport");
      expect(result).toHaveProperty("durationMs");
      expect(result).toHaveProperty("success");
      expect(result.memoryReport?.total).toBe(1);
      expect(result.memoryReport?.allowed).toBe(1);
    });

    it("FSM transitions in correct order during lifecycle", async () => {
      const sm = new KernelStateMachine();
      const transitions: string[] = [];
      sm.onStateChange((_from, to, trigger) => {
        transitions.push(`${trigger}→${to}`);
      });

      const orchestrator = new KernelOrchestrator(
        createMockPlanner(),
        createMockPipeline(),
        createMockVerifier(),
        createMockMemoryWriter(),
        createMockAuditor(),
        sm,
        new SafeModeControllerImpl(),
      );

      await orchestrator.execute(createRequest());

      // Expect: plan_requested, plan_approved, [pipeline internal: tool_validated, execution_complete, verification_passed], write_memory, memory_written, audit_requested, audit_complete
      expect(transitions).toContain("plan_requested→planning");
      expect(transitions).toContain("plan_approved→idle");
      expect(transitions).toContain("write_memory→writing_memory");
      expect(transitions).toContain("memory_written→idle");
      expect(transitions).toContain("audit_requested→auditing");
      expect(transitions).toContain("audit_complete→idle");
    });

    it("multiple sequential executions work (idle between each)", async () => {
      const { orchestrator, sm } = createOrchestrator();

      const result1 = await orchestrator.execute(createRequest());
      expect(result1.success).toBe(true);
      expect(sm.currentState).toBe("idle");

      const result2 = await orchestrator.execute(createRequest());
      expect(result2.success).toBe(true);
      expect(sm.currentState).toBe("idle");
    });

    it("plan step dependencies respected (ordered execution)", async () => {
      const plan = createMockPlan([
        { toolName: "TOOL_A" },
        { toolName: "TOOL_B" },
        { toolName: "TOOL_C" },
      ]);
      const planner = createMockPlanner(plan);
      const executedTools: string[] = [];
      const pipeline: ExecutorRole = {
        execute: vi.fn(async (call) => {
          executedTools.push(call.tool);
          return {
            requestId: call.requestId,
            toolName: call.tool,
            success: true,
            result: "ok",
            validation: { valid: true, errors: [] },
            durationMs: 10,
          };
        }),
      };

      const { orchestrator } = createOrchestrator({ planner, pipeline });
      await orchestrator.execute(createRequest());

      expect(executedTools).toEqual(["TOOL_A", "TOOL_B", "TOOL_C"]);
    });

    it("executes via workflow engine when provided", async () => {
      const planner = createMockPlanner(
        createMockPlan([{ toolName: "TOOL_A" }, { toolName: "TOOL_B" }]),
      );
      const pipeline = createMockPipeline(true);
      const workflowEngine = new LocalWorkflowEngine();

      const { orchestrator } = createOrchestrator({
        planner,
        pipeline,
        workflowEngine,
      });
      const result = await orchestrator.execute(createRequest());

      expect(result.success).toBe(true);
      expect(result.executions).toHaveLength(2);
      expect(pipeline.execute).toHaveBeenCalledTimes(2);
      expect(workflowEngine.listWorkflows()).toContain("plan-plan-test");
    });

    it("fails execution when workflow engine returns failure", async () => {
      const workflowEngine: WorkflowEngine = {
        register: vi.fn(),
        execute: vi.fn(async () => ({
          executionId: "wf-1",
          success: false,
          error: "workflow failed",
          durationMs: 5,
        })),
        getStatus: vi.fn(async () => undefined),
        listWorkflows: vi.fn(() => []),
        close: vi.fn(async () => {}),
      };

      const { orchestrator } = createOrchestrator({ workflowEngine });
      const result = await orchestrator.execute(createRequest());

      expect(result.success).toBe(false);
      expect(result.auditReport?.anomalies).toContain(
        "Workflow execution failed: workflow failed",
      );
      expect(workflowEngine.register).toHaveBeenCalledTimes(1);
      expect(workflowEngine.execute).toHaveBeenCalledTimes(1);
    });

    it("retries transient role failures and succeeds", async () => {
      const planner = createMockPlanner(createMockPlan([{ toolName: "TOOL_A" }]));
      let attempts = 0;
      const pipeline: ExecutorRole = {
        execute: vi.fn(async (call) => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("transient executor failure");
          }
          return {
            requestId: call.requestId,
            toolName: call.tool,
            success: true,
            result: "ok",
            validation: { valid: true, errors: [] },
            durationMs: 10,
          };
        }),
      };

      const { orchestrator } = createOrchestrator({
        planner,
        pipeline,
        roleCallPolicy: {
          timeoutMs: 500,
          maxRetries: 1,
          backoffMs: 0,
          circuitBreakerThreshold: 5,
          circuitBreakerResetMs: 5_000,
        },
      });

      const result = await orchestrator.execute(createRequest());

      expect(result.success).toBe(true);
      expect(pipeline.execute).toHaveBeenCalledTimes(2);
    });

    it("fails fast when role call times out", async () => {
      const planner: PlannerRole = {
        createPlan: vi.fn(() => new Promise<ExecutionPlan>(() => {})),
        validatePlan: vi.fn(async () => ({ valid: true, issues: [] })),
        getActivePlan: vi.fn(() => null),
        cancelPlan: vi.fn(async () => {}),
      };
      const { orchestrator } = createOrchestrator({
        planner,
        roleCallPolicy: {
          timeoutMs: 25,
          maxRetries: 0,
          backoffMs: 0,
          circuitBreakerThreshold: 5,
          circuitBreakerResetMs: 5_000,
        },
      });

      const result = await orchestrator.execute(createRequest());

      expect(result.success).toBe(false);
      expect(result.auditReport.anomalies[0]).toContain(
        "Role call timeout: planner.createPlan exceeded 25ms",
      );
      expect(planner.createPlan).toHaveBeenCalledTimes(1);
    });

    it("opens circuit breaker after threshold and blocks subsequent role calls", async () => {
      const planner: PlannerRole = {
        createPlan: vi.fn(async () => {
          throw new Error("planner unavailable");
        }),
        validatePlan: vi.fn(async () => ({ valid: true, issues: [] })),
        getActivePlan: vi.fn(() => null),
        cancelPlan: vi.fn(async () => {}),
      };
      const { orchestrator } = createOrchestrator({
        planner,
        roleCallPolicy: {
          timeoutMs: 100,
          maxRetries: 0,
          backoffMs: 0,
          circuitBreakerThreshold: 1,
          circuitBreakerResetMs: 60_000,
        },
      });

      const first = await orchestrator.execute(createRequest());
      const second = await orchestrator.execute(createRequest());

      expect(first.success).toBe(false);
      expect(second.success).toBe(false);
      expect(planner.createPlan).toHaveBeenCalledTimes(1);
      expect(second.auditReport.anomalies[0]).toContain(
        "Role call blocked: planner.createPlan circuit breaker open until",
      );
    });
  });

  describe("safe mode", () => {
    it("triggers safe mode after consecutive errors", async () => {
      const failPipeline: ExecutorRole = {
        execute: vi.fn(async (call) => ({
          requestId: call.requestId,
          toolName: call.tool,
          success: false,
          validation: { valid: true, errors: [] },
          durationMs: 10,
          error: "failed",
        })),
      };

      // Use a low threshold for testing
      const safeModeCtrl = new SafeModeControllerImpl({ errorThreshold: 1 });
      const sm = new KernelStateMachine();

      // Pre-load some errors so consecutiveErrors >= 1 after the pipeline
      sm.transition("tool_validated");
      sm.transition("execution_complete");
      sm.transition("verification_failed"); // error 1
      sm.transition("recover");

      const orchestrator = new KernelOrchestrator(
        createMockPlanner(),
        failPipeline,
        createMockVerifier(),
        createMockMemoryWriter(),
        createMockAuditor(),
        sm,
        safeModeCtrl,
      );

      const result = await orchestrator.execute(createRequest());

      expect(safeModeCtrl.getStatus().active).toBe(true);
    });
  });

  describe("getCurrentPhase()", () => {
    it("tracks FSM state correctly", async () => {
      const { orchestrator } = createOrchestrator();
      expect(orchestrator.getCurrentPhase()).toBe("idle");
    });
  });

  describe("isInSafeMode()", () => {
    it("reflects FSM state", () => {
      const sm = new KernelStateMachine();
      const orchestrator = new KernelOrchestrator(
        createMockPlanner(),
        createMockPipeline(),
        createMockVerifier(),
        createMockMemoryWriter(),
        createMockAuditor(),
        sm,
        new SafeModeControllerImpl(),
      );

      expect(orchestrator.isInSafeMode()).toBe(false);
      sm.transition("escalate_safe_mode");
      expect(orchestrator.isInSafeMode()).toBe(true);
    });
  });
});
