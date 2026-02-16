import { describe, expect, it } from "vitest";
import type { InvariantContext } from "../../verification/invariants/types.js";
import type { PipelineResult } from "../../workflow/types.js";
import {
  CODING_INVARIANTS,
  gitSafetyInvariant,
  noSecretsInOutputInvariant,
  noShellEscapeInvariant,
  outputSizeBoundInvariant,
  pathSafetyInvariant,
  testOutputValidInvariant,
} from "./invariants.js";

// ---------- Helpers ----------

function makeResult(overrides?: Partial<PipelineResult>): PipelineResult {
  return {
    requestId: "req-1",
    toolName: "SHELL_EXEC",
    success: true,
    result: "ok",
    validation: { valid: true, errors: [] },
    durationMs: 100,
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<InvariantContext>): InvariantContext {
  return {
    requestId: "req-1",
    toolName: "SHELL_EXEC",
    executionSucceeded: true,
    currentState: "idle",
    pendingApprovalCount: 0,
    eventCount: 3,
    pipelineResult: makeResult(),
    ...overrides,
  };
}

// ---------- Tests ----------

describe("Coding invariants", () => {
  it("exports exactly 6 invariants", () => {
    expect(CODING_INVARIANTS).toHaveLength(6);
  });

  it("all invariants have unique ids", () => {
    const ids = CODING_INVARIANTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // noShellEscapeInvariant
  it("noShellEscape passes for clean output", async () => {
    const result = await noShellEscapeInvariant.check(
      makeCtx({ pipelineResult: makeResult({ result: "hello world" }) }),
    );
    expect(result).toBe(true);
  });

  it("noShellEscape fails for ANSI escape sequences", async () => {
    const result = await noShellEscapeInvariant.check(
      makeCtx({
        pipelineResult: makeResult({ result: "text \x1b[31mred\x1b[0m" }),
      }),
    );
    expect(result).toBe(false);
  });

  // outputSizeBoundInvariant
  it("outputSizeBound passes for small output", async () => {
    const result = await outputSizeBoundInvariant.check(
      makeCtx({ pipelineResult: makeResult({ result: "small" }) }),
    );
    expect(result).toBe(true);
  });

  it("outputSizeBound fails for output > 1MB", async () => {
    const largeOutput = "x".repeat(1_048_577);
    const result = await outputSizeBoundInvariant.check(
      makeCtx({ pipelineResult: makeResult({ result: largeOutput }) }),
    );
    expect(result).toBe(false);
  });

  // pathSafetyInvariant
  it("pathSafety passes for workspace paths", async () => {
    const result = await pathSafetyInvariant.check(
      makeCtx({
        toolName: "WRITE_FILE",
        pipelineResult: makeResult({
          toolName: "WRITE_FILE",
          result: "/home/user/project/src/file.ts",
        }),
      }),
    );
    expect(result).toBe(true);
  });

  it("pathSafety fails for /etc path in writable tool", async () => {
    const result = await pathSafetyInvariant.check(
      makeCtx({
        toolName: "WRITE_FILE",
        pipelineResult: makeResult({
          toolName: "WRITE_FILE",
          result: "wrote to /etc/passwd",
        }),
      }),
    );
    expect(result).toBe(false);
  });

  it("pathSafety skips for read-only tools", async () => {
    const result = await pathSafetyInvariant.check(
      makeCtx({
        toolName: "READ_FILE",
        pipelineResult: makeResult({
          toolName: "READ_FILE",
          result: "contents of /etc/hosts",
        }),
      }),
    );
    expect(result).toBe(true);
  });

  // testOutputValidInvariant
  it("testOutputValid passes for non-empty test output", async () => {
    const result = await testOutputValidInvariant.check(
      makeCtx({
        toolName: "RUN_TESTS",
        pipelineResult: makeResult({
          toolName: "RUN_TESTS",
          result: "5 tests passed",
        }),
      }),
    );
    expect(result).toBe(true);
  });

  it("testOutputValid fails for empty test output", async () => {
    const result = await testOutputValidInvariant.check(
      makeCtx({
        toolName: "RUN_TESTS",
        pipelineResult: makeResult({
          toolName: "RUN_TESTS",
          result: "",
        }),
      }),
    );
    expect(result).toBe(false);
  });

  it("testOutputValid skips for non-test tools", async () => {
    const result = await testOutputValidInvariant.check(
      makeCtx({
        toolName: "SHELL_EXEC",
        pipelineResult: makeResult({
          toolName: "SHELL_EXEC",
          result: "",
        }),
      }),
    );
    expect(result).toBe(true);
  });

  // gitSafetyInvariant
  it("gitSafety passes for normal git operations", async () => {
    const result = await gitSafetyInvariant.check(
      makeCtx({
        toolName: "GIT_OPERATION",
        pipelineResult: makeResult({
          toolName: "GIT_OPERATION",
          result: "push origin feature-branch",
        }),
      }),
    );
    expect(result).toBe(true);
  });

  it("gitSafety fails for force-push to main", async () => {
    const result = await gitSafetyInvariant.check(
      makeCtx({
        toolName: "GIT_OPERATION",
        pipelineResult: makeResult({
          toolName: "GIT_OPERATION",
          result: "push --force origin main",
        }),
      }),
    );
    expect(result).toBe(false);
  });

  it("gitSafety fails for force-push to master", async () => {
    const result = await gitSafetyInvariant.check(
      makeCtx({
        toolName: "GIT_OPERATION",
        pipelineResult: makeResult({
          toolName: "GIT_OPERATION",
          result: "push --force origin master",
        }),
      }),
    );
    expect(result).toBe(false);
  });

  // noSecretsInOutputInvariant
  it("noSecrets passes for clean output", async () => {
    const result = await noSecretsInOutputInvariant.check(
      makeCtx({
        pipelineResult: makeResult({ result: "build succeeded" }),
      }),
    );
    expect(result).toBe(true);
  });

  it("noSecrets fails for API key pattern", async () => {
    const result = await noSecretsInOutputInvariant.check(
      makeCtx({
        pipelineResult: makeResult({
          result: "api_key=sk-abc123def456ghi789jklmnopqrstuvwxyz",
        }),
      }),
    );
    expect(result).toBe(false);
  });

  it("noSecrets fails for GitHub token", async () => {
    const result = await noSecretsInOutputInvariant.check(
      makeCtx({
        pipelineResult: makeResult({
          result: "token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",
        }),
      }),
    );
    expect(result).toBe(false);
  });

  it("noSecrets fails for private key", async () => {
    const result = await noSecretsInOutputInvariant.check(
      makeCtx({
        pipelineResult: makeResult({
          result: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...",
        }),
      }),
    );
    expect(result).toBe(false);
  });
});
