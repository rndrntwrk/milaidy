import { describe, expect, it } from "vitest";
import type { GovernancePolicy } from "../governance/types.js";
import { PilotEvaluator } from "./pilot-evaluator.js";
import type { PilotReport } from "./types.js";

// ---------- Helpers ----------

function makeReport(overrides?: Partial<PilotReport>): PilotReport {
  return {
    domainId: "coding",
    domainVersion: "1.0.0",
    startedAt: 1000,
    completedAt: 2000,
    totalScenarios: 6,
    passedScenarios: 6,
    failedScenarios: 0,
    passRate: 1.0,
    benchmarkResults: [
      {
        benchmarkId: "coding:safety",
        passThreshold: 0.95,
        averageScore: 0.98,
        passed: true,
        scenarios: [
          {
            scenarioId: "s1",
            benchmarkId: "coding:safety",
            score: 0.98,
            passed: true,
            durationMs: 100,
          },
        ],
      },
      {
        benchmarkId: "coding:quality",
        passThreshold: 0.9,
        averageScore: 0.92,
        passed: true,
        scenarios: [
          {
            scenarioId: "s2",
            benchmarkId: "coding:quality",
            score: 0.92,
            passed: true,
            durationMs: 200,
          },
        ],
      },
    ],
    overallPassed: true,
    complianceStatus: "not_evaluated",
    ...overrides,
  };
}

function makePolicy(
  overrides?: Partial<GovernancePolicy>,
): GovernancePolicy {
  return {
    id: "coding-governance",
    name: "Coding Governance",
    description: "Test policy",
    approvalRules: [],
    retention: {
      eventRetentionMs: 604800000,
      auditRetentionMs: 2592000000,
      exportBeforeEviction: true,
    },
    complianceChecks: [
      {
        id: "check-1",
        description: "Test check",
        check: async () => true,
        regulation: "RSP-test",
      },
    ],
    rspReferences: ["RSP-test"],
    ...overrides,
  };
}

// ---------- Tests ----------

describe("PilotEvaluator", () => {
  const evaluator = new PilotEvaluator();

  it("evaluate returns compliance report without policy", () => {
    const report = makeReport();
    const compliance = evaluator.evaluate(report);

    expect(compliance.domainId).toBe("coding");
    expect(compliance.policyId).toBe("none");
    expect(compliance.overallCompliant).toBe(true);
    expect(compliance.complianceResults).toHaveLength(0);
    expect(compliance.rspReferences).toHaveLength(0);
  });

  it("evaluate returns compliance report with policy", () => {
    const report = makeReport();
    const compliance = evaluator.evaluate(report, makePolicy());

    expect(compliance.policyId).toBe("coding-governance");
    expect(compliance.overallCompliant).toBe(true);
    expect(compliance.complianceResults).toHaveLength(1);
    expect(compliance.rspReferences).toContain("RSP-test");
  });

  it("evaluate marks non-compliant when pilot fails", () => {
    const report = makeReport({ overallPassed: false });
    const compliance = evaluator.evaluate(report, makePolicy());

    expect(compliance.overallCompliant).toBe(false);
    expect(compliance.recommendations.length).toBeGreaterThan(0);
  });

  it("evaluate includes failing benchmark recommendations", () => {
    const report = makeReport({
      overallPassed: false,
      benchmarkResults: [
        {
          benchmarkId: "coding:safety",
          passThreshold: 0.95,
          averageScore: 0.7,
          passed: false,
          scenarios: [],
        },
      ],
    });

    const compliance = evaluator.evaluate(report, makePolicy());
    const benchRec = compliance.recommendations.find((r) =>
      r.includes("coding:safety"),
    );
    expect(benchRec).toBeDefined();
    expect(benchRec).toContain("70.0%");
  });

  it("toJsonl produces valid JSONL", () => {
    const report = makeReport();
    const jsonl = evaluator.toJsonl(report);
    const lines = jsonl.split("\n");

    // Header + 2 benchmarks + 2 scenarios + summary = 6 lines
    expect(lines.length).toBeGreaterThanOrEqual(4);

    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.type).toBeDefined();
    }

    const header = JSON.parse(lines[0]);
    expect(header.type).toBe("pilot:header");
    expect(header.domainId).toBe("coding");

    const summary = JSON.parse(lines[lines.length - 1]);
    expect(summary.type).toBe("pilot:summary");
    expect(summary.overallPassed).toBe(true);
  });

  it("summarize produces readable text", () => {
    const report = makeReport();
    const summary = evaluator.summarize(report);

    expect(summary).toContain("coding");
    expect(summary).toContain("PASSED");
    expect(summary).toContain("6/6");
    expect(summary).toContain("coding:safety");
    expect(summary).toContain("coding:quality");
  });
});
