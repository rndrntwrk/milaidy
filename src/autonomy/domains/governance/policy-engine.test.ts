import { describe, expect, it } from "vitest";
import { PolicyEngine } from "./policy-engine.js";
import type { ComplianceContext, GovernancePolicy } from "./types.js";

// ---------- Helpers ----------

function makePolicy(overrides?: Partial<GovernancePolicy>): GovernancePolicy {
  return {
    id: "test-policy",
    name: "Test Policy",
    description: "A test governance policy",
    approvalRules: [
      { riskClass: "read-only", requirement: "none" },
      { riskClass: "reversible", requirement: "automated", trustFloor: 0.7 },
      { riskClass: "irreversible", requirement: "human" },
    ],
    retention: {
      eventRetentionMs: 604800000,
      auditRetentionMs: 2592000000,
      exportBeforeEviction: true,
    },
    complianceChecks: [
      {
        id: "trust-floor",
        description: "Minimum trust required",
        check: async (ctx) => ctx.sourceTrust >= 0.5,
        regulation: "RSP-trust",
      },
    ],
    rspReferences: ["RSP-trust"],
    ...overrides,
  };
}

function makeContext(overrides?: Partial<ComplianceContext>): ComplianceContext {
  return {
    toolName: "test_tool",
    riskClass: "read-only",
    source: "system",
    sourceTrust: 0.8,
    ...overrides,
  };
}

// ---------- Tests ----------

describe("PolicyEngine", () => {
  it("registerPolicy and getPolicy", () => {
    const engine = new PolicyEngine();
    const policy = makePolicy();
    engine.registerPolicy(policy);

    expect(engine.getPolicy("test-policy")).toBe(policy);
  });

  it("getPolicy returns undefined for unregistered", () => {
    const engine = new PolicyEngine();
    expect(engine.getPolicy("nonexistent")).toBeUndefined();
  });

  it("listPolicies returns all registered", () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(makePolicy({ id: "p1", name: "Policy 1" }));
    engine.registerPolicy(makePolicy({ id: "p2", name: "Policy 2" }));

    const list = engine.listPolicies();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id)).toContain("p1");
    expect(list.map((p) => p.id)).toContain("p2");
  });

  it("evaluate returns none approval for read-only", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(makePolicy());

    const result = await engine.evaluate(
      makeContext({ riskClass: "read-only" }),
      "test-policy",
    );

    expect(result.approvalRequirement).toBe("none");
    expect(result.approved).toBe(true);
    expect(result.overallCompliant).toBe(true);
  });

  it("evaluate returns human approval for irreversible", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(makePolicy());

    const result = await engine.evaluate(
      makeContext({ riskClass: "irreversible" }),
      "test-policy",
    );

    expect(result.approvalRequirement).toBe("human");
    expect(result.approved).toBe(false);
    expect(result.reasons).toContain(
      "Human approval required for this risk class",
    );
  });

  it("evaluate auto-approves reversible with high trust", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(makePolicy());

    const result = await engine.evaluate(
      makeContext({ riskClass: "reversible", sourceTrust: 0.9 }),
      "test-policy",
    );

    // Trust 0.9 >= trustFloor 0.7, so auto-approved
    expect(result.approvalRequirement).toBe("none");
    expect(result.approved).toBe(true);
  });

  it("evaluate escalates reversible to human with low trust", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(makePolicy());

    const result = await engine.evaluate(
      makeContext({ riskClass: "reversible", sourceTrust: 0.5 }),
      "test-policy",
    );

    // Trust 0.5 < trustFloor 0.7, so escalated
    expect(result.approvalRequirement).toBe("human");
    expect(result.approved).toBe(false);
  });

  it("evaluate fails compliance check", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(makePolicy());

    const result = await engine.evaluate(
      makeContext({ sourceTrust: 0.3 }), // Below compliance trust floor of 0.5
      "test-policy",
    );

    expect(result.overallCompliant).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.complianceResults[0].passed).toBe(false);
  });

  it("evaluate throws for unknown policy", async () => {
    const engine = new PolicyEngine();

    await expect(
      engine.evaluate(makeContext(), "nonexistent"),
    ).rejects.toThrow('Governance policy "nonexistent" not found');
  });

  it("evaluateAll runs all registered policies", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(makePolicy({ id: "p1", name: "P1" }));
    engine.registerPolicy(makePolicy({ id: "p2", name: "P2" }));

    const results = await engine.evaluateAll(makeContext());
    expect(results).toHaveLength(2);
    expect(results[0].policyId).toBe("p1");
    expect(results[1].policyId).toBe("p2");
  });

  it("defaults to none when no matching approval rule", async () => {
    const engine = new PolicyEngine();
    engine.registerPolicy(
      makePolicy({
        approvalRules: [{ riskClass: "irreversible", requirement: "human" }],
      }),
    );

    const result = await engine.evaluate(
      makeContext({ riskClass: "read-only" }),
      "test-policy",
    );

    expect(result.approvalRequirement).toBe("none");
  });
});
