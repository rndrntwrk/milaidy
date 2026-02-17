import { describe, expect, it, vi } from "vitest";
import { createDefaultAutonomyIdentity } from "../../identity/schema.js";
import type { ToolActionHandler } from "../../workflow/types.js";
import { createInProcessRoleAdapters } from "./in-process-role-adapter.js";

describe("createInProcessRoleAdapters", () => {
  it("delegates planner/executor/verifier/memory-writer/auditor methods", async () => {
    const plan = {
      id: "plan-1",
      goals: [],
      steps: [],
      createdAt: Date.now(),
      status: "pending" as const,
    };

    const planner = {
      createPlan: vi.fn(async () => plan),
      validatePlan: vi.fn(async () => ({ valid: true, issues: [] })),
      getActivePlan: vi.fn(() => plan),
      cancelPlan: vi.fn(async () => {}),
    };
    const executor = {
      execute: vi.fn(async () => ({
        requestId: "req-1",
        toolName: "READ_FILE",
        success: true,
        validation: { valid: true, errors: [] },
        durationMs: 1,
      })),
    };
    const verifier = {
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
    const memoryWriter = {
      write: vi.fn(async () => ({
        action: "allow" as const,
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
      writeBatch: vi.fn(async () => ({
        total: 1,
        allowed: 1,
        quarantined: 0,
        rejected: 0,
      })),
      getStats: vi.fn(() => ({
        allowed: 1,
        quarantined: 0,
        rejected: 0,
        pendingReview: 0,
      })),
    };
    const auditor = {
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
          severity: "none" as const,
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

    const adapters = createInProcessRoleAdapters({
      planner,
      executor,
      verifier,
      memoryWriter,
      auditor,
    });

    await adapters.planner.createPlan({
      description: "plan",
      source: "system",
      sourceTrust: 1,
    });
    await adapters.planner.validatePlan(plan);
    adapters.planner.getActivePlan();
    await adapters.planner.cancelPlan("done");

    const actionHandler: ToolActionHandler = async () => ({
      result: "ok",
      durationMs: 1,
    });
    await adapters.executor.execute(
      {
        tool: "READ_FILE",
        params: { path: "README.md" },
        source: "system",
        requestId: "req-1",
      },
      actionHandler,
    );

    await adapters.verifier.verify({
      requestId: "req-1",
      toolName: "READ_FILE",
      params: {},
      result: "ok",
      durationMs: 1,
      agentId: "agent-1",
    });
    await adapters.verifier.checkInvariants({
      requestId: "req-1",
      toolName: "READ_FILE",
      executionSucceeded: true,
      currentState: "idle",
      pendingApprovalCount: 0,
      eventCount: 0,
    });

    await adapters.memoryWriter.write({
      content: "hello",
      source: {
        id: "agent-1",
        type: "agent",
        reliability: 1,
      },
      agentId: "agent-1",
    });
    await adapters.memoryWriter.writeBatch([
      {
        content: "hello",
        source: {
          id: "agent-1",
          type: "agent",
          reliability: 1,
        },
        agentId: "agent-1",
      },
    ]);
    adapters.memoryWriter.getStats();

    await adapters.auditor.audit({
      requestId: "req-1",
      correlationId: "req-1",
      identityConfig: createDefaultAutonomyIdentity(),
      recentOutputs: [],
    });
    adapters.auditor.getDriftReport();
    await adapters.auditor.queryEvents("req-1");

    expect(planner.createPlan).toHaveBeenCalledTimes(1);
    expect(planner.validatePlan).toHaveBeenCalledTimes(1);
    expect(planner.getActivePlan).toHaveBeenCalledTimes(1);
    expect(planner.cancelPlan).toHaveBeenCalledTimes(1);
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(verifier.verify).toHaveBeenCalledTimes(1);
    expect(verifier.checkInvariants).toHaveBeenCalledTimes(1);
    expect(memoryWriter.write).toHaveBeenCalledTimes(1);
    expect(memoryWriter.writeBatch).toHaveBeenCalledTimes(1);
    expect(memoryWriter.getStats).toHaveBeenCalledTimes(1);
    expect(auditor.audit).toHaveBeenCalledTimes(1);
    expect(auditor.getDriftReport).toHaveBeenCalledTimes(1);
    expect(auditor.queryEvents).toHaveBeenCalledTimes(1);
  });
});
