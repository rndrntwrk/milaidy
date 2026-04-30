import { describe, expect, it } from "vitest";
import type {
  KernelComponents,
  ScenarioEvaluator,
  ScenarioResult,
} from "../../metrics/evaluator-types.js";
import type { EvaluationScenario } from "../../metrics/types.js";
import { DomainPackRegistry } from "../registry.js";
import type { DomainPack } from "../types.js";
import { PilotRunner } from "./pilot-runner.js";

// ---------- Helpers ----------

function makeScenario(
  id: string,
  overrides?: Partial<EvaluationScenario>,
): EvaluationScenario {
  return {
    id,
    metric: "instructionCompletionRate",
    description: `Scenario ${id}`,
    prompts: ["test prompt"],
    expectedBehavior: "test behavior",
    turns: 1,
    ...overrides,
  };
}

function makePack(overrides?: Partial<DomainPack>): DomainPack {
  return {
    id: "test-domain",
    name: "Test Domain",
    version: "1.0.0",
    description: "Test domain pack",
    toolContracts: [],
    invariants: [],
    benchmarks: [
      {
        id: "bench:safety",
        description: "Safety benchmark",
        scenarios: [makeScenario("s1"), makeScenario("s2")],
        passThreshold: 0.9,
      },
      {
        id: "bench:quality",
        description: "Quality benchmark",
        scenarios: [makeScenario("s3")],
        passThreshold: 0.8,
      },
    ],
    tags: ["test"],
    safeModeTriggers: [],
    ...overrides,
  };
}

function makeComponents(): KernelComponents {
  return {
    trustScorer: {} as KernelComponents["trustScorer"],
    memoryGate: {} as KernelComponents["memoryGate"],
    driftMonitor: {} as KernelComponents["driftMonitor"],
    goalManager: {} as KernelComponents["goalManager"],
  };
}

function makeEvaluator(
  scoreMap?: Record<string, number>,
): ScenarioEvaluator {
  return {
    evaluate: async (scenario: EvaluationScenario): Promise<ScenarioResult> => {
      const score = scoreMap?.[scenario.id] ?? 1.0;
      return {
        scenarioId: scenario.id,
        metric: scenario.metric,
        score,
        details: `Score: ${score}`,
      };
    },
  };
}

// ---------- Tests ----------

describe("PilotRunner", () => {
  it("throws for unknown domain", async () => {
    const registry = new DomainPackRegistry();
    const runner = new PilotRunner(
      registry,
      makeEvaluator(),
      makeComponents(),
    );

    await expect(
      runner.run({ domainId: "nonexistent" }),
    ).rejects.toThrow('Domain pack "nonexistent" not found');
  });

  it("produces a report with all benchmarks", async () => {
    const registry = new DomainPackRegistry();
    registry.register(makePack());
    const runner = new PilotRunner(
      registry,
      makeEvaluator(),
      makeComponents(),
    );

    const report = await runner.run({ domainId: "test-domain" });

    expect(report.domainId).toBe("test-domain");
    expect(report.domainVersion).toBe("1.0.0");
    expect(report.totalScenarios).toBe(3);
    expect(report.passedScenarios).toBe(3);
    expect(report.failedScenarios).toBe(0);
    expect(report.passRate).toBe(1);
    expect(report.overallPassed).toBe(true);
    expect(report.benchmarkResults).toHaveLength(2);
  });

  it("marks failing scenarios correctly", async () => {
    const registry = new DomainPackRegistry();
    registry.register(makePack());
    const runner = new PilotRunner(
      registry,
      makeEvaluator({ s1: 0.5, s2: 1.0, s3: 1.0 }),
      makeComponents(),
    );

    const report = await runner.run({ domainId: "test-domain" });

    expect(report.passedScenarios).toBe(2);
    expect(report.failedScenarios).toBe(1);
    // s1 scored 0.5, below benchmark threshold of 0.9
    const safeBench = report.benchmarkResults.find(
      (b) => b.benchmarkId === "bench:safety",
    );
    expect(safeBench?.scenarios[0].passed).toBe(false);
    expect(safeBench?.scenarios[1].passed).toBe(true);
  });

  it("calculates benchmark averages correctly", async () => {
    const registry = new DomainPackRegistry();
    registry.register(makePack());
    const runner = new PilotRunner(
      registry,
      makeEvaluator({ s1: 0.8, s2: 1.0, s3: 0.9 }),
      makeComponents(),
    );

    const report = await runner.run({ domainId: "test-domain" });

    const safeBench = report.benchmarkResults.find(
      (b) => b.benchmarkId === "bench:safety",
    );
    expect(safeBench?.averageScore).toBe(0.9);
    expect(safeBench?.passed).toBe(true);

    const qualBench = report.benchmarkResults.find(
      (b) => b.benchmarkId === "bench:quality",
    );
    expect(qualBench?.averageScore).toBe(0.9);
    expect(qualBench?.passed).toBe(true);
  });

  it("respects maxScenarios limit", async () => {
    const registry = new DomainPackRegistry();
    registry.register(makePack());
    const runner = new PilotRunner(
      registry,
      makeEvaluator(),
      makeComponents(),
    );

    const report = await runner.run({
      domainId: "test-domain",
      maxScenarios: 2,
    });

    expect(report.totalScenarios).toBe(2);
  });

  it("handles evaluator errors gracefully", async () => {
    const registry = new DomainPackRegistry();
    registry.register(makePack());
    const errorEvaluator: ScenarioEvaluator = {
      evaluate: async () => {
        throw new Error("eval failed");
      },
    };
    const runner = new PilotRunner(
      registry,
      errorEvaluator,
      makeComponents(),
    );

    const report = await runner.run({ domainId: "test-domain" });

    expect(report.totalScenarios).toBe(3);
    expect(report.passedScenarios).toBe(0);
    expect(report.failedScenarios).toBe(3);
    expect(report.overallPassed).toBe(false);

    const firstScenario = report.benchmarkResults[0].scenarios[0];
    expect(firstScenario.error).toBe("eval failed");
    expect(firstScenario.score).toBe(0);
  });

  it("sets complianceStatus to not_evaluated", async () => {
    const registry = new DomainPackRegistry();
    registry.register(makePack());
    const runner = new PilotRunner(
      registry,
      makeEvaluator(),
      makeComponents(),
    );

    const report = await runner.run({ domainId: "test-domain" });
    expect(report.complianceStatus).toBe("not_evaluated");
  });

  it("includes timing data in report", async () => {
    const registry = new DomainPackRegistry();
    registry.register(makePack());
    const runner = new PilotRunner(
      registry,
      makeEvaluator(),
      makeComponents(),
    );

    const report = await runner.run({ domainId: "test-domain" });

    expect(report.startedAt).toBeGreaterThan(0);
    expect(report.completedAt).toBeGreaterThanOrEqual(report.startedAt);

    for (const bench of report.benchmarkResults) {
      for (const scenario of bench.scenarios) {
        expect(scenario.durationMs).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
