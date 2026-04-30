/**
 * Tests for LocalPolicyEvaluator.
 */

import { describe, expect, it } from "vitest";
import { LocalPolicyEvaluator } from "./local-evaluator.js";
import type { LocalPolicyRule } from "./local-evaluator.js";

const rules: LocalPolicyRule[] = [
  { id: "r1", name: "Allow read-only", actions: ["read_*"], effect: "allow" },
  { id: "r2", name: "Deny deletes", actions: ["delete_*"], effect: "deny" },
  { id: "r3", name: "Approve writes", actions: ["write_*"], riskClasses: ["reversible"], effect: "allow", requiresApproval: true },
  { id: "r4", name: "Deny irreversible writes", actions: ["write_*"], riskClasses: ["irreversible"], effect: "deny" },
  { id: "r5", name: "Allow all safe", actions: ["*"], riskClasses: ["read-only"], effect: "allow" },
];

describe("LocalPolicyEvaluator", () => {
  it("allows actions matching an allow rule", async () => {
    const evaluator = new LocalPolicyEvaluator(rules);
    const result = await evaluator.evaluate({ action: "read_file", riskClass: "read-only" });
    expect(result.allowed).toBe(true);
    expect(result.policyId).toBe("r1");
  });

  it("denies actions matching a deny rule", async () => {
    const evaluator = new LocalPolicyEvaluator(rules);
    const result = await evaluator.evaluate({ action: "delete_record", riskClass: "irreversible" });
    expect(result.allowed).toBe(false);
    expect(result.policyId).toBe("r2");
  });

  it("deny takes precedence over allow", async () => {
    const evaluator = new LocalPolicyEvaluator(rules);
    const result = await evaluator.evaluate({ action: "write_file", riskClass: "irreversible" });
    expect(result.allowed).toBe(false);
    expect(result.policyId).toBe("r4");
  });

  it("sets requiresApproval when rule specifies it", async () => {
    const evaluator = new LocalPolicyEvaluator(rules);
    const result = await evaluator.evaluate({ action: "write_file", riskClass: "reversible" });
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(true);
    expect(result.policyId).toBe("r3");
  });

  it("default allows when no rules match", async () => {
    const evaluator = new LocalPolicyEvaluator(rules);
    const result = await evaluator.evaluate({ action: "custom_action", riskClass: "custom" });
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("default allow");
  });

  it("wildcard action matches everything", async () => {
    const evaluator = new LocalPolicyEvaluator(rules);
    const result = await evaluator.evaluate({ action: "anything", riskClass: "read-only" });
    expect(result.allowed).toBe(true);
    expect(result.policyId).toBe("r5");
  });

  it("evaluateAll returns decisions for all matching rules", async () => {
    const evaluator = new LocalPolicyEvaluator(rules);
    const results = await evaluator.evaluateAll({ action: "read_data", riskClass: "read-only" });
    // Should match r1 (read_*) and r5 (* with read-only)
    expect(results.length).toBe(2);
    expect(results.every((r) => r.allowed)).toBe(true);
  });

  it("evaluateAll returns default allow when no rules match", async () => {
    const evaluator = new LocalPolicyEvaluator([]);
    const results = await evaluator.evaluateAll({ action: "something", riskClass: "unknown" });
    expect(results.length).toBe(1);
    expect(results[0].allowed).toBe(true);
  });

  it("exact action match works", async () => {
    const evaluator = new LocalPolicyEvaluator([
      { id: "exact", name: "Exact", actions: ["send_email"], effect: "deny" },
    ]);
    const result = await evaluator.evaluate({ action: "send_email", riskClass: "irreversible" });
    expect(result.allowed).toBe(false);
    // Should not match other actions
    const result2 = await evaluator.evaluate({ action: "send_email_draft", riskClass: "irreversible" });
    expect(result2.allowed).toBe(true);
  });

  it("close is a no-op", async () => {
    const evaluator = new LocalPolicyEvaluator();
    await expect(evaluator.close()).resolves.toBeUndefined();
  });
});
