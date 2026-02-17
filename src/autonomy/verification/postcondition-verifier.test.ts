/**
 * Tests for postcondition-verifier.ts
 */

import { describe, expect, it } from "vitest";
import { PostConditionVerifier } from "./postcondition-verifier.js";
import type { PostCondition, VerifierContext } from "./types.js";

function makeCtx(overrides: Partial<VerifierContext> = {}): VerifierContext {
  return {
    toolName: "RUN_IN_TERMINAL",
    params: { command: "echo hello" },
    result: { success: true, exitCode: 0, output: "hello\n" },
    durationMs: 150,
    agentId: "agent-1",
    requestId: "req-1",
    ...overrides,
  };
}

function passingCondition(id = "pass"): PostCondition {
  return {
    id,
    description: "Always passes",
    check: async () => true,
    severity: "critical",
  };
}

function failingCondition(
  id = "fail",
  severity: PostCondition["severity"] = "critical",
): PostCondition {
  return {
    id,
    description: "Always fails",
    check: async () => false,
    severity,
  };
}

describe("PostConditionVerifier", () => {
  it("auto-passes when no conditions are registered", async () => {
    const verifier = new PostConditionVerifier();
    const result = await verifier.verify(makeCtx());

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(0);
    expect(result.hasCriticalFailure).toBe(false);
    expect(result.failureTaxonomy.totalFailures).toBe(0);
  });

  it("passes when all conditions pass", async () => {
    const verifier = new PostConditionVerifier();
    verifier.registerConditions("RUN_IN_TERMINAL", [
      passingCondition("a"),
      passingCondition("b"),
    ]);

    const result = await verifier.verify(makeCtx());

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(2);
    expect(result.checks.every((c) => c.passed)).toBe(true);
    expect(result.hasCriticalFailure).toBe(false);
    expect(result.failureTaxonomy.totalFailures).toBe(0);
  });

  it("fails when all conditions fail", async () => {
    const verifier = new PostConditionVerifier();
    verifier.registerConditions("RUN_IN_TERMINAL", [
      failingCondition("a"),
      failingCondition("b"),
    ]);

    const result = await verifier.verify(makeCtx());

    expect(result.status).toBe("failed");
    expect(result.hasCriticalFailure).toBe(true);
    expect(result.failureTaxonomy.totalFailures).toBe(2);
    expect(result.failureTaxonomy.checkFailures).toBe(2);
  });

  it("returns partial when some pass and some fail", async () => {
    const verifier = new PostConditionVerifier();
    verifier.registerConditions("RUN_IN_TERMINAL", [
      passingCondition("a"),
      failingCondition("b", "warning"),
    ]);

    const result = await verifier.verify(makeCtx());

    expect(result.status).toBe("partial");
    expect(result.hasCriticalFailure).toBe(false);
  });

  it("marks hasCriticalFailure when a critical condition fails", async () => {
    const verifier = new PostConditionVerifier();
    verifier.registerConditions("RUN_IN_TERMINAL", [
      passingCondition("ok"),
      failingCondition("bad", "critical"),
    ]);

    const result = await verifier.verify(makeCtx());

    expect(result.hasCriticalFailure).toBe(true);
  });

  it("handles checks that throw errors", async () => {
    const verifier = new PostConditionVerifier();
    verifier.registerConditions("RUN_IN_TERMINAL", [
      {
        id: "throws",
        description: "Throws an error",
        check: async () => {
          throw new Error("boom");
        },
        severity: "critical",
      },
    ]);

    const result = await verifier.verify(makeCtx());

    expect(result.status).toBe("failed");
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].failureCode).toBe("check_error");
    expect(result.checks[0].error).toBe("boom");
    expect(result.hasCriticalFailure).toBe(true);
    expect(result.failureTaxonomy.errorFailures).toBe(1);
  });

  it("times out slow checks", async () => {
    const verifier = new PostConditionVerifier(50); // 50ms timeout
    verifier.registerConditions("RUN_IN_TERMINAL", [
      {
        id: "slow",
        description: "Very slow check",
        check: () =>
          new Promise((resolve) => setTimeout(() => resolve(true), 500)),
        severity: "warning",
      },
    ]);

    const result = await verifier.verify(makeCtx());

    expect(result.status).toBe("failed");
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].failureCode).toBe("timeout");
    expect(result.checks[0].error).toContain("timed out");
    expect(result.failureTaxonomy.timeoutFailures).toBe(1);
  });

  it("appends conditions for the same tool", async () => {
    const verifier = new PostConditionVerifier();
    verifier.registerConditions("RUN_IN_TERMINAL", [passingCondition("a")]);
    verifier.registerConditions("RUN_IN_TERMINAL", [passingCondition("b")]);

    const result = await verifier.verify(makeCtx());

    expect(result.checks).toHaveLength(2);
  });

  it("isolates conditions per tool", async () => {
    const verifier = new PostConditionVerifier();
    verifier.registerConditions("RUN_IN_TERMINAL", [passingCondition("a")]);
    verifier.registerConditions("INSTALL_PLUGIN", [failingCondition("b")]);

    const termResult = await verifier.verify(makeCtx());
    expect(termResult.status).toBe("passed");

    const pluginResult = await verifier.verify(
      makeCtx({ toolName: "INSTALL_PLUGIN" }),
    );
    expect(pluginResult.status).toBe("failed");
  });
});
