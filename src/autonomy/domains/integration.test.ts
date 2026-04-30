/**
 * Phase 5 integration tests — domain pack lifecycle, governance,
 * retention, and pilot evaluation working together.
 */

import { describe, expect, it } from "vitest";
import type {
  KernelComponents,
  ScenarioEvaluator,
  ScenarioResult,
} from "../metrics/evaluator-types.js";
import type { EvaluationScenario } from "../metrics/types.js";
import { ToolRegistry } from "../tools/registry.js";
import { InvariantChecker } from "../verification/invariants/invariant-checker.js";
import type { ComplianceContext } from "./governance/types.js";
import { CODING_GOVERNANCE_POLICY } from "./coding/governance-policy.js";
import { CODING_DOMAIN_PACK } from "./coding/pack.js";
import { PolicyEngine } from "./governance/policy-engine.js";
import { AuditRetentionManager } from "./governance/retention-manager.js";
import { PilotEvaluator } from "./pilot/pilot-evaluator.js";
import { PilotRunner } from "./pilot/pilot-runner.js";
import { DomainPackRegistry } from "./registry.js";

// ---------- Helpers ----------

function makeComponents(): KernelComponents {
  return {
    trustScorer: {} as KernelComponents["trustScorer"],
    memoryGate: {} as KernelComponents["memoryGate"],
    driftMonitor: {} as KernelComponents["driftMonitor"],
    goalManager: {} as KernelComponents["goalManager"],
  };
}

function makeEvaluator(score = 1.0): ScenarioEvaluator {
  return {
    evaluate: async (scenario: EvaluationScenario): Promise<ScenarioResult> => ({
      scenarioId: scenario.id,
      metric: scenario.metric,
      score,
      details: `Score: ${score}`,
    }),
  };
}

// ---------- Tests ----------

describe("Phase 5 integration", () => {
  it("full lifecycle: register → load → tools appear → unload → tools removed", () => {
    const registry = new DomainPackRegistry();
    const toolRegistry = new ToolRegistry();
    const invariantChecker = new InvariantChecker();

    // Register the coding domain pack
    registry.register(CODING_DOMAIN_PACK);
    expect(registry.has("coding")).toBe(true);

    // Load — tools and invariants should be registered
    registry.load("coding", toolRegistry, invariantChecker);

    expect(toolRegistry.has("READ_FILE")).toBe(true);
    expect(toolRegistry.has("WRITE_FILE")).toBe(true);
    expect(toolRegistry.has("SHELL_EXEC")).toBe(true);
    expect(toolRegistry.getByTag("coding")).toHaveLength(6);

    const loaded = registry.getLoaded();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("coding");

    // Unload — tools removed
    registry.unload("coding", toolRegistry);
    expect(toolRegistry.has("READ_FILE")).toBe(false);
    expect(toolRegistry.getByTag("coding")).toHaveLength(0);

    const info = registry.getAll();
    expect(info[0].status).toBe("unloaded");
  });

  it("PolicyEngine evaluates coding governance for different risk classes", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(CODING_GOVERNANCE_POLICY);

    const baseCtx: ComplianceContext = {
      toolName: "READ_FILE",
      riskClass: "read-only",
      source: "system",
      sourceTrust: 0.8,
      domainId: "coding",
    };

    // read-only — approved, no requirement
    const readResult = await engine.evaluate(baseCtx, "coding-governance");
    expect(readResult.approved).toBe(true);
    expect(readResult.approvalRequirement).toBe("none");

    // reversible with high trust — auto-approved
    const revResult = await engine.evaluate(
      { ...baseCtx, riskClass: "reversible", toolName: "WRITE_FILE", sourceTrust: 0.9 },
      "coding-governance",
    );
    expect(revResult.approved).toBe(true);

    // irreversible — requires human
    const irrevResult = await engine.evaluate(
      { ...baseCtx, riskClass: "irreversible", toolName: "SHELL_EXEC" },
      "coding-governance",
    );
    expect(irrevResult.approved).toBe(false);
    expect(irrevResult.approvalRequirement).toBe("human");
  });

  it("AuditRetentionManager JSONL round-trip", async () => {
    const manager = new AuditRetentionManager();

    await manager.addEvents(
      [
        { sequenceId: 1, requestId: "r1", type: "tool:executed", payload: { tool: "READ_FILE" }, timestamp: Date.now() } as any,
      ],
      { eventRetentionMs: 60_000, auditRetentionMs: 120_000, exportBeforeEviction: true },
    );
    await manager.addAuditReport(
      { policyId: "coding-governance", passed: true },
      { eventRetentionMs: 60_000, auditRetentionMs: 120_000, exportBeforeEviction: true },
    );

    expect(manager.size).toBe(2);

    const jsonl = await manager.toJsonl();
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(2);

    // Parse each line and verify structure
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.type).toBeDefined();
      expect(parsed.data).toBeDefined();
      expect(parsed.retainUntil).toBeGreaterThan(0);
    }

    const summary = await manager.getComplianceSummary();
    expect(summary.totalRecords).toBe(2);
    expect(summary.eventRecords).toBe(1);
    expect(summary.auditRecords).toBe(1);
  });

  it("PilotRunner produces valid PilotReport with mock evaluator", async () => {
    const domainRegistry = new DomainPackRegistry();
    domainRegistry.register(CODING_DOMAIN_PACK);

    const runner = new PilotRunner(
      domainRegistry,
      makeEvaluator(0.96),
      makeComponents(),
    );

    const report = await runner.run({ domainId: "coding" });

    expect(report.domainId).toBe("coding");
    expect(report.domainVersion).toBe("1.0.0");
    expect(report.totalScenarios).toBe(6);
    expect(report.passedScenarios).toBe(6);
    expect(report.passRate).toBe(1);
    expect(report.overallPassed).toBe(true);
    expect(report.benchmarkResults).toHaveLength(2);

    // Safety benchmark: 4 scenarios
    const safety = report.benchmarkResults.find((b) => b.benchmarkId === "coding:safety");
    expect(safety?.scenarios).toHaveLength(4);
    expect(safety?.passed).toBe(true);

    // Quality benchmark: 2 scenarios
    const quality = report.benchmarkResults.find((b) => b.benchmarkId === "coding:quality");
    expect(quality?.scenarios).toHaveLength(2);
    expect(quality?.passed).toBe(true);
  });

  it("PilotEvaluator produces ComplianceReport with RSP references", async () => {
    const domainRegistry = new DomainPackRegistry();
    domainRegistry.register(CODING_DOMAIN_PACK);

    const runner = new PilotRunner(
      domainRegistry,
      makeEvaluator(0.98),
      makeComponents(),
    );

    const report = await runner.run({ domainId: "coding" });

    const evaluator = new PilotEvaluator();
    const compliance = evaluator.evaluate(report, CODING_GOVERNANCE_POLICY);

    expect(compliance.domainId).toBe("coding");
    expect(compliance.policyId).toBe("coding-governance");
    expect(compliance.overallCompliant).toBe(true);
    expect(compliance.rspReferences).toContain("RSP-safe-execution");
    expect(compliance.rspReferences).toContain("RSP-trust-gating");
    expect(compliance.rspReferences).toContain("RSP-audit-trail");

    // JSONL export should work
    const jsonl = evaluator.toJsonl(report);
    expect(jsonl.split("\n").length).toBeGreaterThan(3);

    // Summary should contain key info
    const summary = evaluator.summarize(report);
    expect(summary).toContain("PASSED");
    expect(summary).toContain("coding");
  });

  it("end-to-end: load domain → run pilot → evaluate compliance", async () => {
    // Setup domain registry and tool registry
    const domainRegistry = new DomainPackRegistry();
    const toolRegistry = new ToolRegistry();
    const invariantChecker = new InvariantChecker();

    // Register and load domain
    domainRegistry.register(CODING_DOMAIN_PACK);
    domainRegistry.load("coding", toolRegistry, invariantChecker);

    // Setup governance
    const policyEngine = new PolicyEngine();
    policyEngine.registerPolicy(CODING_GOVERNANCE_POLICY);

    // Verify tools are loaded
    expect(toolRegistry.getByTag("coding")).toHaveLength(6);

    // Run pilot
    const runner = new PilotRunner(
      domainRegistry,
      makeEvaluator(0.97),
      makeComponents(),
    );
    const report = await runner.run({ domainId: "coding" });

    // Evaluate compliance
    const pilotEvaluator = new PilotEvaluator();
    const compliance = pilotEvaluator.evaluate(report, CODING_GOVERNANCE_POLICY);

    // Everything should pass
    expect(report.overallPassed).toBe(true);
    expect(report.passRate).toBe(1);
    expect(compliance.overallCompliant).toBe(true);
    expect(compliance.complianceResults.every((r) => r.passed)).toBe(true);

    // Retention manager should accept the audit data
    const retention = new AuditRetentionManager();
    await retention.addAuditReport(
      { compliance, report: report.benchmarkResults },
      CODING_GOVERNANCE_POLICY.retention,
    );
    expect(retention.size).toBe(1);
    expect((await retention.getComplianceSummary()).auditRecords).toBe(1);
  });
});
