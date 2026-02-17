/**
 * Tests for invariant-checker.ts
 */

import { describe, expect, it } from "vitest";
import type { PipelineResult } from "../../workflow/types.js";
import { InvariantChecker } from "./invariant-checker.js";
import type { Invariant, InvariantContext } from "./types.js";

function makeCtx(overrides: Partial<InvariantContext> = {}): InvariantContext {
  const pipelineResult: PipelineResult = {
    requestId: "req-1",
    toolName: "PLAY_EMOTE",
    success: true,
    validation: { valid: true, errors: [] },
    durationMs: 100,
  };
  return {
    requestId: "req-1",
    toolName: "PLAY_EMOTE",
    executionSucceeded: true,
    currentState: "idle",
    pendingApprovalCount: 0,
    eventCount: 5,
    pipelineResult,
    ...overrides,
  };
}

function passingInvariant(id = "pass"): Invariant {
  return {
    id,
    description: "Always passes",
    check: async () => true,
    severity: "critical",
    owner: "test:invariants",
  };
}

function failingInvariant(
  id = "fail",
  severity: Invariant["severity"] = "critical",
): Invariant {
  return {
    id,
    description: "Always fails",
    check: async () => false,
    severity,
    owner: "test:invariants",
  };
}

describe("InvariantChecker", () => {
  it("auto-passes when no invariants are registered", async () => {
    const checker = new InvariantChecker();
    const result = await checker.check(makeCtx());

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(0);
    expect(result.hasCriticalViolation).toBe(false);
  });

  it("passes when all invariants pass", async () => {
    const checker = new InvariantChecker();
    checker.registerMany([passingInvariant("a"), passingInvariant("b")]);

    const result = await checker.check(makeCtx());

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(2);
    expect(result.checks.every((c) => c.passed)).toBe(true);
    expect(result.checks.every((c) => c.owner === "test:invariants")).toBe(true);
    expect(result.hasCriticalViolation).toBe(false);
  });

  it("fails when all invariants fail", async () => {
    const checker = new InvariantChecker();
    checker.registerMany([failingInvariant("a"), failingInvariant("b")]);

    const result = await checker.check(makeCtx());

    expect(result.status).toBe("failed");
    expect(result.hasCriticalViolation).toBe(true);
  });

  it("returns partial when some pass and some fail", async () => {
    const checker = new InvariantChecker();
    checker.register(passingInvariant("a"));
    checker.register(failingInvariant("b", "warning"));

    const result = await checker.check(makeCtx());

    expect(result.status).toBe("partial");
    expect(result.hasCriticalViolation).toBe(false);
  });

  it("marks hasCriticalViolation when a critical invariant fails", async () => {
    const checker = new InvariantChecker();
    checker.register(passingInvariant("ok"));
    checker.register(failingInvariant("bad", "critical"));

    const result = await checker.check(makeCtx());

    expect(result.hasCriticalViolation).toBe(true);
  });

  it("does not mark hasCriticalViolation for warning-only failures", async () => {
    const checker = new InvariantChecker();
    checker.register(failingInvariant("warn", "warning"));

    const result = await checker.check(makeCtx());

    expect(result.status).toBe("failed");
    expect(result.hasCriticalViolation).toBe(false);
  });

  it("handles invariants that throw errors", async () => {
    const checker = new InvariantChecker();
    checker.register({
      id: "throws",
      description: "Throws an error",
      check: async () => {
        throw new Error("boom");
      },
      severity: "critical",
      owner: "test:throws",
    });

    const result = await checker.check(makeCtx());

    expect(result.status).toBe("failed");
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].error).toBe("boom");
    expect(result.hasCriticalViolation).toBe(true);
  });

  it("times out slow invariants", async () => {
    const checker = new InvariantChecker(50); // 50ms timeout
    checker.register({
      id: "slow",
      description: "Very slow invariant",
      check: () =>
        new Promise((resolve) => setTimeout(() => resolve(true), 500)),
      severity: "warning",
      owner: "test:slow",
    });

    const result = await checker.check(makeCtx());

    expect(result.status).toBe("failed");
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].error).toContain("timed out");
  });

  it("registers via register() and registerMany()", async () => {
    const checker = new InvariantChecker();
    checker.register(passingInvariant("single"));
    checker.registerMany([
      passingInvariant("batch-1"),
      passingInvariant("batch-2"),
    ]);

    const result = await checker.check(makeCtx());

    expect(result.checks).toHaveLength(3);
  });

  it("receives context values in check function", async () => {
    const checker = new InvariantChecker();
    let receivedCtx: InvariantContext | undefined;
    checker.register({
      id: "ctx-check",
      description: "Captures context",
      check: async (ctx) => {
        receivedCtx = ctx;
        return true;
      },
      severity: "info",
      owner: "test:context",
    });

    const ctx = makeCtx({
      requestId: "ctx-test",
      currentState: "verifying",
      pendingApprovalCount: 2,
    });
    await checker.check(ctx);

    expect(receivedCtx?.requestId).toBe("ctx-test");
    expect(receivedCtx?.currentState).toBe("verifying");
    expect(receivedCtx?.pendingApprovalCount).toBe(2);
  });
});
