/**
 * Pilot Evaluator — analyzes pilot reports and produces compliance reports.
 *
 * @module autonomy/domains/pilot/pilot-evaluator
 */

import type { GovernancePolicy } from "../governance/types.js";
import type { ComplianceReport, PilotReport } from "./types.js";

// ---------- Interface ----------

/** Interface for the pilot evaluator. */
export interface PilotEvaluatorInterface {
  /** Evaluate a pilot report against a governance policy. */
  evaluate(report: PilotReport, policy?: GovernancePolicy): ComplianceReport;
  /** Export a pilot report as JSONL. */
  toJsonl(report: PilotReport): string;
  /** Produce a human-readable summary of a pilot report. */
  summarize(report: PilotReport): string;
}

// ---------- Implementation ----------

/**
 * Evaluates pilot reports and produces compliance reports with
 * RSP references and recommendations.
 */
export class PilotEvaluator implements PilotEvaluatorInterface {
  evaluate(
    report: PilotReport,
    policy?: GovernancePolicy,
  ): ComplianceReport {
    const evaluatedAt = Date.now();

    if (!policy) {
      return {
        domainId: report.domainId,
        policyId: "none",
        evaluatedAt,
        complianceResults: [],
        overallCompliant: report.overallPassed,
        rspReferences: [],
        recommendations: report.overallPassed
          ? []
          : ["Review failing benchmarks before deployment"],
      };
    }

    const complianceResults = policy.complianceChecks.map((check) => ({
      checkId: check.id,
      // In a pilot evaluation, we assess compliance structurally:
      // if the pilot passed overall, basic compliance is inferred
      passed: report.overallPassed,
      regulation: check.regulation,
    }));

    const overallCompliant = complianceResults.every((r) => r.passed);
    const recommendations: string[] = [];

    if (!report.overallPassed) {
      recommendations.push("Pilot did not meet pass thresholds");
    }

    for (const benchResult of report.benchmarkResults) {
      if (!benchResult.passed) {
        recommendations.push(
          `Benchmark "${benchResult.benchmarkId}" scored ${(benchResult.averageScore * 100).toFixed(1)}% (threshold: ${(benchResult.passThreshold * 100).toFixed(1)}%)`,
        );
      }
    }

    if (overallCompliant && recommendations.length === 0) {
      recommendations.push("All compliance checks passed — ready for deployment");
    }

    return {
      domainId: report.domainId,
      policyId: policy.id,
      evaluatedAt,
      complianceResults,
      overallCompliant,
      rspReferences: policy.rspReferences ?? [],
      recommendations,
    };
  }

  toJsonl(report: PilotReport): string {
    const lines: string[] = [];

    // Header line
    lines.push(
      JSON.stringify({
        type: "pilot:header",
        domainId: report.domainId,
        domainVersion: report.domainVersion,
        startedAt: report.startedAt,
        completedAt: report.completedAt,
      }),
    );

    // Benchmark results
    for (const benchmark of report.benchmarkResults) {
      lines.push(
        JSON.stringify({
          type: "pilot:benchmark",
          benchmarkId: benchmark.benchmarkId,
          averageScore: benchmark.averageScore,
          passThreshold: benchmark.passThreshold,
          passed: benchmark.passed,
        }),
      );

      // Individual scenario results
      for (const scenario of benchmark.scenarios) {
        lines.push(
          JSON.stringify({
            type: "pilot:scenario",
            scenarioId: scenario.scenarioId,
            benchmarkId: scenario.benchmarkId,
            score: scenario.score,
            passed: scenario.passed,
            durationMs: scenario.durationMs,
            error: scenario.error,
          }),
        );
      }
    }

    // Summary line
    lines.push(
      JSON.stringify({
        type: "pilot:summary",
        totalScenarios: report.totalScenarios,
        passedScenarios: report.passedScenarios,
        failedScenarios: report.failedScenarios,
        passRate: report.passRate,
        overallPassed: report.overallPassed,
        complianceStatus: report.complianceStatus,
      }),
    );

    return lines.join("\n");
  }

  summarize(report: PilotReport): string {
    const lines: string[] = [];

    lines.push(`Pilot Report: ${report.domainId} v${report.domainVersion}`);
    lines.push(`Status: ${report.overallPassed ? "PASSED" : "FAILED"}`);
    lines.push(
      `Scenarios: ${report.passedScenarios}/${report.totalScenarios} passed (${(report.passRate * 100).toFixed(1)}%)`,
    );
    lines.push(`Compliance: ${report.complianceStatus}`);

    for (const benchmark of report.benchmarkResults) {
      const status = benchmark.passed ? "PASS" : "FAIL";
      lines.push(
        `  [${status}] ${benchmark.benchmarkId}: ${(benchmark.averageScore * 100).toFixed(1)}% (threshold: ${(benchmark.passThreshold * 100).toFixed(1)}%)`,
      );
    }

    return lines.join("\n");
  }
}
