/**
 * Pilot Runner — executes domain benchmarks and produces a pilot report.
 *
 * @module autonomy/domains/pilot/pilot-runner
 */

import type {
  KernelComponents,
  ScenarioEvaluator,
} from "../../metrics/evaluator-types.js";
import type { DomainPackRegistryInterface } from "../registry.js";
import type {
  PilotBenchmarkResult,
  PilotConfig,
  PilotReport,
  PilotScenarioResult,
} from "./types.js";

// ---------- Interface ----------

/** Interface for the pilot runner. */
export interface PilotRunnerInterface {
  run(config: PilotConfig): Promise<PilotReport>;
}

// ---------- Implementation ----------

/**
 * Runs domain benchmarks using the scenario evaluator and produces
 * a comprehensive pilot report with per-benchmark results.
 */
export class PilotRunner implements PilotRunnerInterface {
  constructor(
    private readonly domainRegistry: DomainPackRegistryInterface,
    private readonly evaluator: ScenarioEvaluator,
    private readonly components: KernelComponents,
  ) {}

  async run(config: PilotConfig): Promise<PilotReport> {
    const pack = this.domainRegistry.get(config.domainId);
    if (!pack) {
      throw new Error(`Domain pack "${config.domainId}" not found`);
    }

    const startedAt = Date.now();
    const timeoutMs = config.scenarioTimeoutMs ?? 30_000;
    const maxScenarios = config.maxScenarios ?? 0;

    const benchmarkResults: PilotBenchmarkResult[] = [];
    let totalScenarios = 0;
    let passedScenarios = 0;

    for (const benchmark of pack.benchmarks) {
      let scenarios = benchmark.scenarios;
      if (maxScenarios > 0) {
        const remaining = maxScenarios - totalScenarios;
        if (remaining <= 0) break;
        scenarios = scenarios.slice(0, remaining);
      }

      const scenarioResults: PilotScenarioResult[] = [];

      for (const scenario of scenarios) {
        const scenarioStart = Date.now();
        let result: PilotScenarioResult;

        try {
          const evalResult = await Promise.race([
            this.evaluator.evaluate(scenario, this.components),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Scenario timed out")),
                timeoutMs,
              ),
            ),
          ]);

          const durationMs = Date.now() - scenarioStart;
          const passed = evalResult.score >= benchmark.passThreshold;

          result = {
            scenarioId: scenario.id,
            benchmarkId: benchmark.id,
            score: evalResult.score,
            passed,
            durationMs,
            details: evalResult.details,
          };
        } catch (error) {
          const durationMs = Date.now() - scenarioStart;
          result = {
            scenarioId: scenario.id,
            benchmarkId: benchmark.id,
            score: 0,
            passed: false,
            durationMs,
            error: error instanceof Error ? error.message : String(error),
          };
        }

        scenarioResults.push(result);
        totalScenarios++;
        if (result.passed) passedScenarios++;
      }

      const averageScore =
        scenarioResults.length > 0
          ? scenarioResults.reduce((sum, r) => sum + r.score, 0) /
            scenarioResults.length
          : 0;

      benchmarkResults.push({
        benchmarkId: benchmark.id,
        passThreshold: benchmark.passThreshold,
        averageScore,
        passed: averageScore >= benchmark.passThreshold,
        scenarios: scenarioResults,
      });
    }

    const completedAt = Date.now();
    const failedScenarios = totalScenarios - passedScenarios;
    const passRate = totalScenarios > 0 ? passedScenarios / totalScenarios : 0;
    const overallPassed = benchmarkResults.every((b) => b.passed);

    return {
      domainId: pack.id,
      domainVersion: pack.version,
      startedAt,
      completedAt,
      totalScenarios,
      passedScenarios,
      failedScenarios,
      passRate,
      benchmarkResults,
      overallPassed,
      complianceStatus: "not_evaluated",
    };
  }
}
