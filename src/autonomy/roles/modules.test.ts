import { describe, expect, it } from "vitest";
import { createRoleModuleRegistry } from "./modules.js";

function createValidInstances() {
  return {
    planner: {
      createPlan: async () => ({
        id: "plan-1",
        goals: [],
        steps: [],
        createdAt: Date.now(),
        status: "pending" as const,
      }),
      validatePlan: async () => ({ valid: true, issues: [] }),
      getActivePlan: () => null,
      cancelPlan: async () => {},
    },
    executor: {
      execute: async () => ({
        requestId: "req-1",
        toolName: "READ_FILE",
        success: true,
        validation: { valid: true, errors: [] },
        durationMs: 1,
      }),
    },
    verifier: {
      verify: async () => ({
        schema: { valid: true, errors: [] },
        postConditions: { status: "passed", hasCriticalFailure: false },
        overallPassed: true,
      }),
      checkInvariants: async () => ({
        status: "passed",
        checks: [],
        hasCriticalViolation: false,
      }),
    },
    memory_writer: {
      write: async () => ({
        action: "allow" as const,
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
        reason: "ok",
      }),
      writeBatch: async () => ({
        total: 0,
        allowed: 0,
        quarantined: 0,
        rejected: 0,
      }),
      getStats: () => ({
        allowed: 0,
        quarantined: 0,
        rejected: 0,
        pendingReview: 0,
      }),
    },
    auditor: {
      audit: async () => ({
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
      }),
      getDriftReport: () => null,
      queryEvents: async () => [],
    },
    safe_mode: {
      shouldTrigger: () => false,
      enter: () => {},
      requestExit: () => ({ allowed: true, reason: "ok" }),
      getStatus: () => ({ active: false, consecutiveErrors: 0 }),
    },
    orchestrator: {
      execute: async () => ({
        plan: {
          id: "plan-1",
          goals: [],
          steps: [],
          createdAt: Date.now(),
          status: "complete" as const,
        },
        executions: [],
        verificationReports: [],
        auditReport: {
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
        },
        durationMs: 1,
        success: true,
      }),
      getCurrentPhase: () => "idle" as const,
      isInSafeMode: () => false,
    },
  };
}

describe("RoleModuleRegistry", () => {
  it("reports roles as ready after startAll and not ready after stopAll", () => {
    const registry = createRoleModuleRegistry(createValidInstances());
    registry.startAll();

    const started = registry.getHealthSnapshot();
    expect(started.planner.ready).toBe(true);
    expect(started.executor.ready).toBe(true);
    expect(started.orchestrator.ready).toBe(true);

    registry.stopAll();
    const stopped = registry.getHealthSnapshot();
    expect(stopped.planner.running).toBe(false);
    expect(stopped.planner.ready).toBe(false);
    expect(stopped.orchestrator.ready).toBe(false);
  });

  it("reports unavailable or unhealthy modules fail-closed", () => {
    const registry = createRoleModuleRegistry({
      ...createValidInstances(),
      planner: null,
      verifier: {
        verify: async () => ({
          schema: { valid: true, errors: [] },
          postConditions: { status: "passed", hasCriticalFailure: false },
          overallPassed: true,
        }),
      } as never,
    });
    registry.startAll();

    const snapshot = registry.getHealthSnapshot();
    expect(snapshot.planner.available).toBe(false);
    expect(snapshot.planner.healthy).toBe(false);
    expect(snapshot.verifier.healthy).toBe(false);
    expect(snapshot.verifier.missingMethods).toContain("checkInvariants");
  });
});
