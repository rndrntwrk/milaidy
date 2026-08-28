import { describe, expect, test } from "bun:test";

import { validatePlan } from "../src/plan";

const binding = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};
const deploymentManifestSha256 = `sha256:${"5".repeat(64)}`;
const admissionGeneration = 7;
const admission = { binding, deploymentManifestSha256, admissionGeneration };

const basePlan = {
  schemaVersion: "alice.plan.v1" as const,
  planId: "plan-production-canary",
  sessionId: "session-production-canary",
  actor: `owner:sha256:${"a".repeat(64)}`,
  requestedAt: 1_787_400_000_000,
  binding,
  deploymentManifestSha256,
  admissionGeneration,
  actions: [
    {
      intentId: "intent-plan-research",
      action: "runtime.health",
      target: "alice-production-runtime",
      argumentHash: `sha256:${"4".repeat(64)}`,
      nonce: "nonce-plan-research",
      expiresAt: 1_787_400_060_000,
      ...binding,
    },
  ],
};

describe("Alice production plan admission", () => {
  test("admits a bounded, release-bound autonomous plan", () => {
    expect(validatePlan(basePlan, admission, 1_787_400_001_000)).toEqual({ ok: true });
  });

  test("rejects high-risk, capability, duplicate, expired, and mismatched plans", () => {
    for (const candidate of [
      { ...basePlan, actions: [{ ...basePlan.actions[0], action: "trade.execute" }] },
      { ...basePlan, actions: [{ ...basePlan.actions[0], action: "sandbox.execute" }] },
      { ...basePlan, actions: [basePlan.actions[0], basePlan.actions[0]] },
      { ...basePlan, requestedAt: 1_787_300_000_000 },
      { ...basePlan, binding: { ...binding, releaseDigest: `sha256:${"9".repeat(64)}` } },
      { ...basePlan, deploymentManifestSha256: `sha256:${"9".repeat(64)}` },
      { ...basePlan, admissionGeneration: admissionGeneration + 1 },
      { ...basePlan, actions: [] },
      {
        ...basePlan,
        actions: Array.from({ length: 6 }, (_, index) => ({
          ...basePlan.actions[0],
          intentId: `intent-plan-${index}`,
          nonce: `nonce-plan-${index}`,
        })),
      },
    ]) {
      expect(validatePlan(candidate, admission, 1_787_400_001_000)).toEqual({
        ok: false,
        code: "PLAN_NOT_ADMITTED",
      });
    }
  });

  test("rejects autonomous work whose production executor is not installed", () => {
    for (const action of ["research.read", "research.retrieve", "draft.create"]) {
      expect(validatePlan({
        ...basePlan,
        actions: [{ ...basePlan.actions[0], action }],
      }, admission, 1_787_400_001_000)).toEqual({
        ok: false,
        code: "PLAN_NOT_ADMITTED",
      });
    }
  });
});
