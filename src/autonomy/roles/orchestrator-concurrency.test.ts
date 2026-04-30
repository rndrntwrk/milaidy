import { describe, expect, it, vi } from "vitest";
import { KernelStateMachine } from "../state-machine/kernel-state-machine.js";
import { KernelOrchestrator } from "./orchestrator.js";
import { SafeModeControllerImpl } from "./safe-mode.js";
import type {
  AuditorRole,
  MemoryWriterRole,
  OrchestratedRequest,
  PlannerRole,
  VerifierRole,
} from "./types.js";

function identityConfig(): OrchestratedRequest["identityConfig"] {
  return {
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
  };
}

describe("KernelOrchestrator concurrency consistency", () => {
  it("P3-035: keeps lifecycle state consistent under concurrent executes", async () => {
    let planCounter = 0;
    const planner: PlannerRole = {
      createPlan: vi.fn(async (request) => {
        planCounter += 1;
        return {
          id: `plan-${planCounter}`,
          goals: [],
          steps: [
            {
              id: "step-1",
              toolName: "PLAY_EMOTE",
              params: { emote: "wave" },
            },
          ],
          createdAt: Date.now(),
          status: "pending",
        };
      }),
      validatePlan: vi.fn(async () => ({ valid: true, issues: [] })),
      getActivePlan: vi.fn(() => null),
      cancelPlan: vi.fn(async () => {}),
    };

    const executor = {
      execute: vi.fn(async (call) => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return {
          requestId: call.requestId,
          toolName: call.tool,
          success: true,
          result: { ok: true },
          validation: { valid: true, errors: [] },
          durationMs: 15,
        };
      }),
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

    const stateMachine = new KernelStateMachine();
    const orchestrator = new KernelOrchestrator(
      planner,
      executor,
      verifier,
      memoryWriter,
      auditor,
      stateMachine,
      new SafeModeControllerImpl({ errorThreshold: 3 }),
    );

    const actionHandler: OrchestratedRequest["actionHandler"] = async () => ({
      result: { ok: true },
      durationMs: 5,
    });

    const makeRequest = (index: number): OrchestratedRequest => ({
      description: `concurrent-${index}`,
      constraints: ["PLAY_EMOTE"],
      source: "user",
      sourceTrust: 0.9,
      agentId: `agent-${index}`,
      actionHandler,
      identityConfig: identityConfig(),
      recentOutputs: [],
    });

    const results = await Promise.all([
      orchestrator.execute(makeRequest(1)),
      orchestrator.execute(makeRequest(2)),
      orchestrator.execute(makeRequest(3)),
      orchestrator.execute(makeRequest(4)),
      orchestrator.execute(makeRequest(5)),
    ]);

    expect(results).toHaveLength(5);
    expect(results.every((result) => result.success)).toBe(true);
    expect(new Set(results.map((result) => result.plan.id)).size).toBe(5);
    expect(executor.execute).toHaveBeenCalledTimes(5);
    expect(stateMachine.currentState).toBe("idle");
  });
});
