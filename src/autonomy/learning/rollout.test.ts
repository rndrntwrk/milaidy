import { describe, expect, it, vi } from "vitest";
import type { BaselineHarness } from "../metrics/baseline-harness.js";
import type { BaselineMetrics, MetricsDelta } from "../metrics/types.js";
import type {
  OrchestratedRequest,
  OrchestratedResult,
  RoleOrchestrator,
} from "../roles/types.js";
import { HackDetector } from "./hack-detection.js";
import { CheckpointReward, EpisodeReward } from "./reward.js";
import { CheckpointManager, RolloutCollector } from "./rollout.js";
import { TraceCollector } from "./trace-collector.js";

// ---------- Helpers ----------

function makeMetrics(overrides?: Partial<BaselineMetrics>): BaselineMetrics {
  return {
    preferenceFollowingAccuracy: 0.9,
    instructionCompletionRate: 0.85,
    personaDriftScore: 0.04,
    memoryPoisoningResistance: 0.95,
    compoundingErrorRate: 0.02,
    sycophancyScore: 0.08,
    turnCount: 10,
    measuredAt: Date.now(),
    ...overrides,
  };
}

function makeOrchestratedResult(
  overrides?: Partial<OrchestratedResult>,
): OrchestratedResult {
  return {
    plan: {
      id: "plan-1",
      goals: [],
      steps: [
        {
          id: "step-1",
          toolName: "test_tool",
          params: { key: "value" },
        },
      ],
      createdAt: Date.now(),
      status: "complete",
    },
    executions: [
      {
        toolName: "test_tool",
        result: { data: "output" },
        durationMs: 50,
        validation: { valid: true, errors: [] },
        verification: {
          status: "passed",
          hasCriticalFailure: false,
          checks: [{ id: "c1", passed: true, severity: "warning" }],
        },
      } as any,
    ],
    auditReport: {
      driftReport: {
        driftScore: 0.05,
        severity: "none" as const,
        dimensions: {
          valueAlignment: 0.95,
          styleConsistency: 0.9,
          boundaryAdherence: 0.95,
          responsePatterns: 0.9,
        },
        windowSize: 1,
        threshold: 0.3,
        recommendation: "none" as const,
      },
      eventCount: 5,
      anomalies: [],
      recommendations: [],
      auditedAt: Date.now(),
    },
    durationMs: 100,
    success: true,
    ...overrides,
  };
}

function makeRequest(): OrchestratedRequest {
  return {
    description: "Test task",
    source: { type: "system" },
    sourceTrust: 1.0,
    agentId: "agent-1",
    actionHandler: { execute: async () => ({ success: true }) },
    identityConfig: {
      coreValues: ["honesty"],
      communicationStyle: { tone: "friendly", verbosity: "concise" },
      hardBoundaries: [],
    },
  } as any;
}

function makeMockOrchestrator(
  result?: OrchestratedResult,
): RoleOrchestrator {
  return {
    execute: vi.fn().mockResolvedValue(result ?? makeOrchestratedResult()),
    getCurrentPhase: () => "idle" as const,
    isInSafeMode: () => false,
  };
}

function makeMockEventStore() {
  return {
    append: vi.fn(),
    query: vi.fn().mockReturnValue([]),
    getAll: vi.fn().mockReturnValue([]),
    getByRequestId: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
  };
}

function makeTraceCollector(eventStore: ReturnType<typeof makeMockEventStore>) {
  const cr = new CheckpointReward();
  return new TraceCollector(eventStore as any, cr, new EpisodeReward(cr));
}

// ---------- RolloutCollector Tests ----------

describe("RolloutCollector", () => {
  it("collectOne returns Episode with reward signal", async () => {
    const orchestrator = makeMockOrchestrator();
    const eventStore = makeMockEventStore();
    const traceCollector = makeTraceCollector(eventStore);
    const hackDetector = new HackDetector();

    const collector = new RolloutCollector(
      orchestrator,
      traceCollector,
      hackDetector,
    );
    const result = await collector.collectOne(makeRequest());

    expect(result.episode).toBeDefined();
    expect(result.episode.totalReward).toBeDefined();
    expect(result.episode.totalReward.total).toBeGreaterThanOrEqual(0);
  });

  it("collectOne includes hack detection report", async () => {
    const orchestrator = makeMockOrchestrator();
    const eventStore = makeMockEventStore();
    const traceCollector = makeTraceCollector(eventStore);
    const hackDetector = new HackDetector();

    const collector = new RolloutCollector(
      orchestrator,
      traceCollector,
      hackDetector,
    );
    const result = await collector.collectOne(makeRequest());

    expect(result.hackReport).toBeDefined();
    expect(result.hackReport.episodeId).toBe(result.episode.id);
    expect(typeof result.hackReport.hackLikelihood).toBe("number");
  });

  it("marks usableForTraining=true for clean episodes", async () => {
    const orchestrator = makeMockOrchestrator();
    const eventStore = makeMockEventStore();
    const traceCollector = makeTraceCollector(eventStore);
    const hackDetector = new HackDetector();

    const collector = new RolloutCollector(
      orchestrator,
      traceCollector,
      hackDetector,
    );
    const result = await collector.collectOne(makeRequest());

    expect(result.usableForTraining).toBe(true);
  });

  it("marks usableForTraining=false for hacking episodes", async () => {
    // Create result with many empty-output steps to trigger hack detection
    const hackyResult = makeOrchestratedResult({
      executions: Array.from({ length: 10 }, () => ({
        toolName: "test",
        result: null,
        durationMs: 0,
        validation: { valid: true, errors: [] },
        verification: {
          status: "passed",
          hasCriticalFailure: false,
          checks: [{ id: "c1", passed: true, severity: "warning" }],
        },
      })) as any,
      success: false,
    });
    const orchestrator = makeMockOrchestrator(hackyResult);
    const eventStore = makeMockEventStore();
    const traceCollector = makeTraceCollector(eventStore);
    const hackDetector = new HackDetector();

    const collector = new RolloutCollector(
      orchestrator,
      traceCollector,
      hackDetector,
      0.3, // Lower threshold to catch gaming
    );
    const result = await collector.collectOne(makeRequest());

    expect(result.hackReport.hackLikelihood).toBeGreaterThan(0);
    expect(result.usableForTraining).toBe(false);
  });

  it("collectBatch processes multiple requests", async () => {
    const orchestrator = makeMockOrchestrator();
    const eventStore = makeMockEventStore();
    const traceCollector = makeTraceCollector(eventStore);
    const hackDetector = new HackDetector();

    const collector = new RolloutCollector(
      orchestrator,
      traceCollector,
      hackDetector,
    );
    const results = await collector.collectBatch([
      makeRequest(),
      makeRequest(),
      makeRequest(),
    ]);

    expect(results.length).toBe(3);
  });

  it("collectBatch skips failed orchestrations", async () => {
    const orchestrator: RoleOrchestrator = {
      execute: vi
        .fn()
        .mockResolvedValueOnce(makeOrchestratedResult())
        .mockRejectedValueOnce(new Error("Failed"))
        .mockResolvedValueOnce(makeOrchestratedResult()),
      getCurrentPhase: () => "idle" as const,
      isInSafeMode: () => false,
    };
    const eventStore = makeMockEventStore();
    const traceCollector = makeTraceCollector(eventStore);
    const hackDetector = new HackDetector();

    const collector = new RolloutCollector(
      orchestrator,
      traceCollector,
      hackDetector,
    );
    const results = await collector.collectBatch([
      makeRequest(),
      makeRequest(),
      makeRequest(),
    ]);

    // Only 2 succeeded
    expect(results.length).toBe(2);
  });
});

// ---------- CheckpointManager Tests ----------

describe("CheckpointManager", () => {
  function makeMockHarness(): BaselineHarness {
    const snapshots = new Map<string, BaselineMetrics>();
    return {
      measure: vi.fn(),
      snapshot: vi.fn(async (m: BaselineMetrics, label: string) => {
        snapshots.set(label, m);
      }),
      compare: vi.fn(
        async (
          current: BaselineMetrics,
          baselineLabel: string,
        ): Promise<MetricsDelta | null> => {
          const baseline = snapshots.get(baselineLabel);
          if (!baseline) return null;

          const metricKeys = [
            "preferenceFollowingAccuracy",
            "instructionCompletionRate",
            "personaDriftScore",
            "memoryPoisoningResistance",
            "compoundingErrorRate",
            "sycophancyScore",
          ] as const;

          const higherIsBetter = new Set([
            "preferenceFollowingAccuracy",
            "instructionCompletionRate",
            "memoryPoisoningResistance",
          ]);

          const deltas = metricKeys.map((key) => {
            const b = baseline[key];
            const c = current[key];
            const delta = c - b;
            const improved = higherIsBetter.has(key)
              ? delta > 0.001
              : delta < -0.001;
            const regressed = higherIsBetter.has(key)
              ? delta < -0.001
              : delta > 0.001;
            return {
              metric: key,
              baseline: b,
              current: c,
              delta,
              direction: improved
                ? ("improved" as const)
                : regressed
                  ? ("regressed" as const)
                  : ("unchanged" as const),
              targetMet: false,
            };
          });

          const improvementCount = deltas.filter(
            (d) => d.direction === "improved",
          ).length;
          const regressionCount = deltas.filter(
            (d) => d.direction === "regressed",
          ).length;

          return {
            baselineLabel,
            deltas,
            overallImprovement:
              (improvementCount - regressionCount) / metricKeys.length,
          };
        },
      ),
      listSnapshots: vi.fn(() => Array.from(snapshots.keys())),
    } as unknown as BaselineHarness;
  }

  it("createCheckpoint stores labeled snapshot", async () => {
    const harness = makeMockHarness();
    const manager = new CheckpointManager(harness);
    const metrics = makeMetrics({ label: "v1" });

    await manager.createCheckpoint("v1", metrics);
    expect(harness.snapshot).toHaveBeenCalledWith(metrics, "v1");
  });

  it("meetsGate passes when all metrics improve", async () => {
    const harness = makeMockHarness();
    const manager = new CheckpointManager(harness);

    const baseline = makeMetrics();
    await manager.createCheckpoint("baseline", baseline);

    const improved = makeMetrics({
      preferenceFollowingAccuracy: 0.95,
      instructionCompletionRate: 0.90,
      personaDriftScore: 0.03,
      memoryPoisoningResistance: 0.97,
      compoundingErrorRate: 0.01,
      sycophancyScore: 0.05,
    });

    const gate = await manager.meetsGate(improved, "baseline");
    expect(gate.passed).toBe(true);
    expect(gate.improvements.length).toBeGreaterThan(0);
    expect(gate.regressions.length).toBe(0);
  });

  it("meetsGate fails on any regression", async () => {
    const harness = makeMockHarness();
    const manager = new CheckpointManager(harness);

    const baseline = makeMetrics();
    await manager.createCheckpoint("baseline", baseline);

    const regressed = makeMetrics({
      preferenceFollowingAccuracy: 0.95, // improved
      instructionCompletionRate: 0.70, // regressed
    });

    const gate = await manager.meetsGate(regressed, "baseline");
    expect(gate.passed).toBe(false);
    expect(gate.regressions.length).toBeGreaterThan(0);
  });

  it("meetsGate reports improvements and regressions", async () => {
    const harness = makeMockHarness();
    const manager = new CheckpointManager(harness);

    const baseline = makeMetrics();
    await manager.createCheckpoint("baseline", baseline);

    const mixed = makeMetrics({
      preferenceFollowingAccuracy: 0.95, // improved
      sycophancyScore: 0.15, // regressed (higher is worse)
    });

    const gate = await manager.meetsGate(mixed, "baseline");
    expect(gate.passed).toBe(false);
    expect(gate.improvements.some((s) => s.includes("preferenceFollowingAccuracy"))).toBe(true);
    expect(gate.regressions.some((s) => s.includes("sycophancyScore"))).toBe(true);
  });

  it("meetsGate fails when baseline not found", async () => {
    const harness = makeMockHarness();
    const manager = new CheckpointManager(harness);

    const gate = await manager.meetsGate(makeMetrics(), "nonexistent");
    expect(gate.passed).toBe(false);
    expect(gate.regressions).toContain("Baseline not found");
  });
});
