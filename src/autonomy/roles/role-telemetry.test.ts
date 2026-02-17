import { describe, expect, it, vi } from "vitest";
import { metrics } from "../../telemetry/setup.js";
import { InMemoryGoalManager } from "../goals/manager.js";
import { KernelStateMachine } from "../state-machine/kernel-state-machine.js";
import { ToolRegistry } from "../tools/registry.js";
import { GoalDrivenPlanner } from "./planner.js";
import { PipelineExecutor } from "./executor.js";
import { KernelOrchestrator } from "./orchestrator.js";
import { SafeModeControllerImpl } from "./safe-mode.js";
import type {
  AuditorRole,
  MemoryWriterRole,
  OrchestratedRequest,
  VerifierRole,
} from "./types.js";

describe("Role telemetry", () => {
  it("records planner role telemetry", async () => {
    const planner = new GoalDrivenPlanner(new InMemoryGoalManager(), new ToolRegistry());
    const before = metrics.getSnapshot();

    await planner.createPlan({
      description: "plan telemetry",
      source: "user",
      sourceTrust: 0.9,
      constraints: [],
    });

    const after = metrics.getSnapshot();
    const counterKey = 'autonomy_role_executions_total:{"role":"planner","outcome":"success"}';
    const histKey = 'autonomy_role_latency_ms:{"role":"planner"}';
    expect((after.counters[counterKey] ?? 0) - (before.counters[counterKey] ?? 0)).toBe(1);
    expect((after.histograms[histKey]?.count ?? 0) - (before.histograms[histKey]?.count ?? 0)).toBe(1);
  });

  it("records executor failure telemetry", async () => {
    const executor = new PipelineExecutor({
      execute: vi.fn(async () => ({
        requestId: "req-exec-fail",
        toolName: "PLAY_EMOTE",
        success: false,
        validation: { valid: true, errors: [] },
        durationMs: 1,
        error: "failed",
      })),
    });
    const before = metrics.getSnapshot();

    await executor.execute(
      {
        tool: "PLAY_EMOTE",
        params: { emote: "wave" },
        source: "user",
        requestId: "req-exec-fail",
      },
      vi.fn(async () => ({ result: {}, durationMs: 1 })),
    );

    const after = metrics.getSnapshot();
    const counterKey = 'autonomy_role_executions_total:{"role":"executor","outcome":"failure"}';
    expect((after.counters[counterKey] ?? 0) - (before.counters[counterKey] ?? 0)).toBe(1);
  });

  it("records orchestrator role telemetry", async () => {
    const planner = {
      createPlan: vi.fn(async () => ({
        id: "plan-telemetry",
        goals: [],
        steps: [{ id: "step-1", toolName: "PLAY_EMOTE", params: { emote: "wave" } }],
        createdAt: Date.now(),
        status: "pending" as const,
      })),
      validatePlan: vi.fn(async () => ({ valid: true, issues: [] })),
      getActivePlan: vi.fn(() => null),
      cancelPlan: vi.fn(async () => {}),
    };
    const executor = {
      execute: vi.fn(async (call) => ({
        requestId: call.requestId,
        toolName: call.tool,
        success: true,
        result: { ok: true },
        validation: { valid: true, errors: [] },
        durationMs: 1,
      })),
    };
    const verifier: VerifierRole = {
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
    const memoryWriter: MemoryWriterRole = {
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
    const auditor: AuditorRole = {
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

    const orchestrator = new KernelOrchestrator(
      planner,
      executor,
      verifier,
      memoryWriter,
      auditor,
      new KernelStateMachine(),
      new SafeModeControllerImpl(),
    );

    const request: OrchestratedRequest = {
      description: "orchestrator telemetry",
      source: "user",
      sourceTrust: 0.9,
      agentId: "agent-telemetry",
      actionHandler: async () => ({ result: { ok: true }, durationMs: 1 }),
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
        identityHash: "test-hash",
      },
      recentOutputs: [],
    };

    const before = metrics.getSnapshot();
    const result = await orchestrator.execute(request);
    expect(result.success).toBe(true);
    const after = metrics.getSnapshot();

    const counterKey = 'autonomy_role_executions_total:{"role":"orchestrator","outcome":"success"}';
    expect((after.counters[counterKey] ?? 0) - (before.counters[counterKey] ?? 0)).toBe(1);
  });
});
