import { describe, expect, it } from "vitest";
import {
  createHackDetectionInvariants,
  HackDetector,
} from "./hack-detection.js";
import type { Episode, RewardSignal, TrainingExample } from "./types.js";

// ---------- Helpers ----------

function makeReward(total = 0.5): RewardSignal {
  return {
    total,
    breakdown: { task_completion: total },
    dimensions: ["task_completion"],
    computedAt: Date.now(),
  };
}

function makeStep(overrides?: Partial<TrainingExample>): TrainingExample {
  return {
    id: "step-1",
    toolName: "test_tool",
    input: { params: { key: "value" }, source: { type: "system" } },
    output: { result: { data: "meaningful output" }, durationMs: 50 },
    verification: {
      passed: true,
      checks: [{ id: "check-1", passed: true, severity: "warning" }],
    },
    reward: makeReward(),
    metadata: {
      agentId: "agent-1",
      requestId: "req-1",
      timestamp: Date.now(),
    },
    ...overrides,
  } as TrainingExample;
}

function makeEpisode(overrides?: Partial<Episode>): Episode {
  return {
    id: "episode-1",
    description: "Test task description",
    steps: [makeStep()],
    planSteps: 1,
    totalReward: makeReward(),
    driftScore: 0.05,
    auditAnomalies: [],
    durationMs: 100,
    success: true,
    completedAt: Date.now(),
    ...overrides,
  };
}

// ---------- Tests ----------

describe("createHackDetectionInvariants", () => {
  it("returns 3 invariants with correct IDs", () => {
    const invariants = createHackDetectionInvariants();
    expect(invariants).toHaveLength(3);
    const ids = invariants.map((i) => i.id);
    expect(ids).toContain("hack:superficial-pass");
    expect(ids).toContain("hack:step-inflation");
    expect(ids).toContain("hack:trust-gaming");
  });
});

describe("superficialPassInvariant", () => {
  const invariants = createHackDetectionInvariants();
  const invariant = invariants.find((i) => i.id === "hack:superficial-pass")!;

  it("flags empty/null tool output with success=true", async () => {
    const result = await invariant.check({
      requestId: "req-1",
      toolName: "test",
      executionSucceeded: true,
      currentState: "idle",
      pendingApprovalCount: 0,
      eventCount: 1,
      pipelineResult: {
        toolName: "test",
        result: null,
        durationMs: 10,
        error: "",
      },
    } as any);
    expect(result).toBe(false);
  });

  it("passes when output is meaningful", async () => {
    const result = await invariant.check({
      requestId: "req-1",
      toolName: "test",
      executionSucceeded: true,
      currentState: "idle",
      pendingApprovalCount: 0,
      eventCount: 1,
      pipelineResult: {
        toolName: "test",
        result: { data: "real output" },
        durationMs: 10,
        error: "",
      },
    } as any);
    expect(result).toBe(true);
  });

  it("passes when execution failed (only checks successes)", async () => {
    const result = await invariant.check({
      requestId: "req-1",
      toolName: "test",
      executionSucceeded: false,
      currentState: "idle",
      pendingApprovalCount: 0,
      eventCount: 1,
      pipelineResult: {
        toolName: "test",
        result: null,
        durationMs: 10,
        error: "",
      },
    } as any);
    expect(result).toBe(true);
  });
});

describe("stepInflationInvariant", () => {
  const invariants = createHackDetectionInvariants();
  const invariant = invariants.find((i) => i.id === "hack:step-inflation")!;

  it("flags plans with excessive steps", async () => {
    const result = await invariant.check({
      requestId: "req-1",
      toolName: "greet",
      executionSucceeded: true,
      currentState: "idle",
      pendingApprovalCount: 0,
      eventCount: 1,
      pipelineResult: {
        toolName: "greet",
        result: "hi",
        durationMs: 10,
        error: "Executed plan with 20 steps",
      },
    } as any);
    expect(result).toBe(false);
  });

  it("passes for reasonably-sized plans", async () => {
    const result = await invariant.check({
      requestId: "req-1",
      toolName: "complex analysis tool",
      executionSucceeded: true,
      currentState: "idle",
      pendingApprovalCount: 0,
      eventCount: 1,
      pipelineResult: {
        toolName: "complex analysis tool",
        result: "done",
        durationMs: 100,
        error: "Executed plan with 5 steps",
      },
    } as any);
    expect(result).toBe(true);
  });
});

describe("HackDetector", () => {
  const detector = new HackDetector();

  it("returns 0 hackLikelihood for clean episode", () => {
    const report = detector.analyze(makeEpisode());
    expect(report.hackLikelihood).toBe(0);
    expect(report.signals).toHaveLength(0);
    expect(report.episodeId).toBe("episode-1");
  });

  it("detects superficial passes", () => {
    const episode = makeEpisode({
      steps: [
        makeStep({ output: { result: null, durationMs: 50 } }),
        makeStep({
          id: "step-2",
          output: { result: "", durationMs: 30 },
        }),
        makeStep({
          id: "step-3",
          output: { result: {}, durationMs: 20 },
        }),
      ],
    });

    const report = detector.analyze(episode);
    const superficial = report.signals.filter(
      (s) => s.type === "superficial_pass",
    );
    expect(superficial.length).toBeGreaterThan(0);
    expect(superficial[0].severity).toBe("high"); // 3 superficial > 2
    expect(report.hackLikelihood).toBeGreaterThan(0);
  });

  it("detects step inflation", () => {
    // 2-word description with 10 steps = ratio 5
    const steps = Array.from({ length: 10 }, (_, i) =>
      makeStep({ id: `step-${i}` }),
    );
    const episode = makeEpisode({
      description: "Simple task",
      steps,
      planSteps: 2,
    });

    const report = detector.analyze(episode);
    const inflation = report.signals.filter((s) => s.type === "step_inflation");
    expect(inflation.length).toBeGreaterThan(0);
    expect(report.hackLikelihood).toBeGreaterThan(0);
  });

  it("detects trust gaming via fast trivial steps", () => {
    const steps = Array.from({ length: 5 }, (_, i) =>
      makeStep({
        id: `step-${i}`,
        output: { result: "ok", durationMs: 0 },
      }),
    );
    const episode = makeEpisode({ steps });

    const report = detector.analyze(episode);
    const gaming = report.signals.filter((s) => s.type === "trust_gaming");
    expect(gaming.length).toBeGreaterThan(0);
  });

  it("returns high hackLikelihood for multi-signal episode", () => {
    const steps = Array.from({ length: 10 }, (_, i) =>
      makeStep({
        id: `step-${i}`,
        output: { result: null, durationMs: 0 },
      }),
    );
    const episode = makeEpisode({
      description: "Hi",
      steps,
      planSteps: 1,
      totalReward: makeReward(0.9),
      success: false,
    });

    const report = detector.analyze(episode);
    expect(report.hackLikelihood).toBeGreaterThan(0.5);
    expect(report.signals.length).toBeGreaterThan(1);
  });

  it("maps signal types to correct severity levels", () => {
    // Superficial pass with > 2 occurrences should be high severity
    const steps = Array.from({ length: 4 }, (_, i) =>
      makeStep({
        id: `step-${i}`,
        output: { result: null, durationMs: 50 },
      }),
    );
    const episode = makeEpisode({ steps });

    const report = detector.analyze(episode);
    const superficial = report.signals.find(
      (s) => s.type === "superficial_pass",
    );
    expect(superficial).toBeDefined();
    expect(superficial!.severity).toBe("high");
  });

  it("aggregates multiple signals correctly", () => {
    const episode = makeEpisode({
      steps: [makeStep({ output: { result: null, durationMs: 0 } })],
      success: false,
    });

    const report = detector.analyze(episode);
    // Should have at least superficial_pass
    expect(report.signals.length).toBeGreaterThanOrEqual(1);
    expect(report.details.length).toBeGreaterThanOrEqual(1);
  });
});
