import { describe, expect, it } from "vitest";
import { PolicyEngine } from "../governance/policy-engine.js";
import type { ComplianceContext } from "../governance/types.js";
import {
  CODING_COMPLIANCE_CHECKS,
  CODING_GOVERNANCE_POLICY,
} from "./governance-policy.js";

// ---------- Helpers ----------

function makeCtx(overrides?: Partial<ComplianceContext>): ComplianceContext {
  return {
    toolName: "READ_FILE",
    riskClass: "read-only",
    source: "system",
    sourceTrust: 0.8,
    domainId: "coding",
    ...overrides,
  };
}

// ---------- Tests ----------

describe("CODING_GOVERNANCE_POLICY", () => {
  it("has correct id and name", () => {
    expect(CODING_GOVERNANCE_POLICY.id).toBe("coding-governance");
    expect(CODING_GOVERNANCE_POLICY.name).toBe(
      "Software Engineering Governance Policy",
    );
  });

  it("has 3 approval rules", () => {
    expect(CODING_GOVERNANCE_POLICY.approvalRules).toHaveLength(3);
  });

  it("has 4 compliance checks", () => {
    expect(CODING_COMPLIANCE_CHECKS).toHaveLength(4);
  });

  it("has 3 RSP references", () => {
    expect(CODING_GOVERNANCE_POLICY.rspReferences).toHaveLength(3);
  });

  it("has 7-day event retention and 30-day audit retention", () => {
    expect(CODING_GOVERNANCE_POLICY.retention.eventRetentionMs).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
    expect(CODING_GOVERNANCE_POLICY.retention.auditRetentionMs).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
    expect(CODING_GOVERNANCE_POLICY.retention.exportBeforeEviction).toBe(true);
  });
});

describe("Coding governance with PolicyEngine", () => {
  it("approves read-only with no requirement", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(CODING_GOVERNANCE_POLICY);

    const result = await engine.evaluate(
      makeCtx({ riskClass: "read-only" }),
      "coding-governance",
    );
    expect(result.approved).toBe(true);
    expect(result.approvalRequirement).toBe("none");
  });

  it("auto-approves reversible with high trust", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(CODING_GOVERNANCE_POLICY);

    const result = await engine.evaluate(
      makeCtx({ riskClass: "reversible", sourceTrust: 0.9 }),
      "coding-governance",
    );
    expect(result.approved).toBe(true);
    expect(result.approvalRequirement).toBe("none");
  });

  it("escalates reversible to human with low trust", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(CODING_GOVERNANCE_POLICY);

    const result = await engine.evaluate(
      makeCtx({ riskClass: "reversible", sourceTrust: 0.5 }),
      "coding-governance",
    );
    expect(result.approved).toBe(false);
    expect(result.approvalRequirement).toBe("human");
  });

  it("requires human approval for irreversible", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(CODING_GOVERNANCE_POLICY);

    const result = await engine.evaluate(
      makeCtx({ riskClass: "irreversible", sourceTrust: 0.9 }),
      "coding-governance",
    );
    expect(result.approved).toBe(false);
    expect(result.approvalRequirement).toBe("human");
  });

  it("fails compliance with trust below 0.6", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(CODING_GOVERNANCE_POLICY);

    const result = await engine.evaluate(
      makeCtx({ sourceTrust: 0.4 }),
      "coding-governance",
    );
    expect(result.overallCompliant).toBe(false);
    expect(result.approved).toBe(false);
  });

  it("passes all compliance checks with sufficient trust", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(CODING_GOVERNANCE_POLICY);

    const result = await engine.evaluate(
      makeCtx({ sourceTrust: 0.8 }),
      "coding-governance",
    );
    expect(result.overallCompliant).toBe(true);
    expect(result.complianceResults.every((r) => r.passed)).toBe(true);
  });
});
