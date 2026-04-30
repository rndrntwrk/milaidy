import { describe, expect, it, vi } from "vitest";
import type { SchemaValidatorInterface } from "../tools/types.js";
import type { InvariantCheckerInterface } from "../verification/invariants/types.js";
import type { PostConditionVerifierInterface } from "../verification/types.js";
import type { VerificationContext } from "./types.js";
import { UnifiedVerifier } from "./verifier.js";

function createMockSchemaValidator(valid = true): SchemaValidatorInterface {
  return {
    validate: vi.fn(() => ({
      valid,
      errors: valid
        ? []
        : [
            {
              field: "param",
              code: "invalid_value" as const,
              message: "bad value",
              severity: "error" as const,
            },
          ],
      validatedParams: valid ? {} : undefined,
      riskClass: "read-only" as const,
      requiresApproval: false,
    })),
  };
}

function createMockPostCondVerifier(
  hasCriticalFailure = false,
): PostConditionVerifierInterface {
  return {
    registerConditions: vi.fn(),
    verify: vi.fn(async () => ({
      status: hasCriticalFailure ? "failed" : "passed",
      checks: [],
      hasCriticalFailure,
    })),
  };
}

function createMockInvariantChecker(
  hasCriticalViolation = false,
): InvariantCheckerInterface {
  return {
    register: vi.fn(),
    registerMany: vi.fn(),
    check: vi.fn(async () => ({
      status: hasCriticalViolation ? "failed" : "passed",
      checks: [],
      hasCriticalViolation,
    })),
  };
}

const baseContext: VerificationContext = {
  requestId: "req-1",
  toolName: "RUN_IN_TERMINAL",
  params: { command: "echo hello" },
  result: { output: "hello" },
  durationMs: 100,
  agentId: "agent-1",
};

describe("UnifiedVerifier", () => {
  describe("verify()", () => {
    it("runs all three checkers and returns overallPassed=true when all pass", async () => {
      const sv = createMockSchemaValidator(true);
      const pcv = createMockPostCondVerifier(false);
      const ic = createMockInvariantChecker(false);
      const verifier = new UnifiedVerifier(sv, pcv, ic);

      const report = await verifier.verify(baseContext);

      expect(sv.validate).toHaveBeenCalled();
      expect(pcv.verify).toHaveBeenCalled();
      expect(ic.check).toHaveBeenCalled();
      expect(report.overallPassed).toBe(true);
      expect(report.schema.valid).toBe(true);
      expect(report.postConditions.hasCriticalFailure).toBe(false);
      expect(report.invariants?.hasCriticalViolation).toBe(false);
    });

    it("returns overallPassed=false on schema failure", async () => {
      const sv = createMockSchemaValidator(false);
      const pcv = createMockPostCondVerifier(false);
      const verifier = new UnifiedVerifier(sv, pcv);

      const report = await verifier.verify(baseContext);

      expect(report.overallPassed).toBe(false);
      expect(report.schema.valid).toBe(false);
      expect(report.schema.errors).toHaveLength(1);
    });

    it("returns overallPassed=false on postcondition critical failure", async () => {
      const sv = createMockSchemaValidator(true);
      const pcv = createMockPostCondVerifier(true);
      const verifier = new UnifiedVerifier(sv, pcv);

      const report = await verifier.verify(baseContext);

      expect(report.overallPassed).toBe(false);
      expect(report.postConditions.hasCriticalFailure).toBe(true);
    });

    it("returns overallPassed=false on invariant critical violation", async () => {
      const sv = createMockSchemaValidator(true);
      const pcv = createMockPostCondVerifier(false);
      const ic = createMockInvariantChecker(true);
      const verifier = new UnifiedVerifier(sv, pcv, ic);

      const report = await verifier.verify(baseContext);

      expect(report.overallPassed).toBe(false);
      expect(report.invariants?.hasCriticalViolation).toBe(true);
    });

    it("works without InvariantChecker (graceful degradation)", async () => {
      const sv = createMockSchemaValidator(true);
      const pcv = createMockPostCondVerifier(false);
      const verifier = new UnifiedVerifier(sv, pcv);

      const report = await verifier.verify(baseContext);

      expect(report.overallPassed).toBe(true);
      expect(report.invariants).toBeUndefined();
    });

    it("aggregates error details correctly", async () => {
      const sv = createMockSchemaValidator(false);
      const pcv = createMockPostCondVerifier(true);
      const ic = createMockInvariantChecker(true);
      const verifier = new UnifiedVerifier(sv, pcv, ic);

      const report = await verifier.verify(baseContext);

      expect(report.overallPassed).toBe(false);
      expect(report.schema.valid).toBe(false);
      expect(report.schema.errors.length).toBeGreaterThan(0);
      expect(report.postConditions.hasCriticalFailure).toBe(true);
      expect(report.invariants?.hasCriticalViolation).toBe(true);
    });
  });

  describe("checkInvariants()", () => {
    it("delegates to InvariantChecker", async () => {
      const sv = createMockSchemaValidator();
      const pcv = createMockPostCondVerifier();
      const ic = createMockInvariantChecker(false);
      const verifier = new UnifiedVerifier(sv, pcv, ic);

      const ctx = {
        requestId: "req-1",
        toolName: "test",
        executionSucceeded: true,
        currentState: "idle" as const,
        pendingApprovalCount: 0,
        eventCount: 2,
        pipelineResult: {
          requestId: "req-1",
          toolName: "test",
          success: true,
          validation: { valid: true, errors: [] },
          durationMs: 100,
        },
      };

      const result = await verifier.checkInvariants(ctx);
      expect(ic.check).toHaveBeenCalledWith(ctx);
      expect(result.status).toBe("passed");
    });

    it("returns passed when no InvariantChecker configured", async () => {
      const sv = createMockSchemaValidator();
      const pcv = createMockPostCondVerifier();
      const verifier = new UnifiedVerifier(sv, pcv);

      const result = await verifier.checkInvariants({
        requestId: "req-1",
        toolName: "test",
        executionSucceeded: true,
        currentState: "idle" as const,
        pendingApprovalCount: 0,
        eventCount: 0,
        pipelineResult: {
          requestId: "req-1",
          toolName: "test",
          success: true,
          validation: { valid: true, errors: [] },
          durationMs: 100,
        },
      });

      expect(result.status).toBe("passed");
      expect(result.hasCriticalViolation).toBe(false);
    });
  });
});
