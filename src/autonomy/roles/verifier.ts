/**
 * UnifiedVerifier — VerifierRole facade.
 *
 * Aggregates SchemaValidator, PostConditionVerifier, and InvariantChecker
 * into a single VerifierRole interface.
 *
 * @module autonomy/roles/verifier
 */

import type {
  ProposedToolCall,
  SchemaValidatorInterface,
} from "../tools/types.js";
import {
  recordRoleExecution,
  recordRoleLatencyMs,
} from "../metrics/prometheus-metrics.js";
import type {
  InvariantCheckerInterface,
  InvariantContext,
  InvariantResult,
} from "../verification/invariants/types.js";
import type {
  PostConditionVerifierInterface,
  VerifierContext,
} from "../verification/types.js";
import type {
  VerificationContext,
  VerificationReport,
  VerifierRole,
} from "./types.js";

export class UnifiedVerifier implements VerifierRole {
  constructor(
    private readonly schemaValidator: SchemaValidatorInterface,
    private readonly postConditionVerifier: PostConditionVerifierInterface,
    private readonly invariantChecker?: InvariantCheckerInterface,
  ) {}

  async verify(context: VerificationContext): Promise<VerificationReport> {
    const startedAt = Date.now();
    try {
      // 1. Schema validation
      const proposedCall: ProposedToolCall = {
        tool: context.toolName,
        params: context.params,
        source: "system",
        requestId: context.requestId,
      };
      const schemaResult = this.schemaValidator.validate(proposedCall);

      // 2. Post-condition verification
      const verifierCtx: VerifierContext = {
        toolName: context.toolName,
        params: context.params,
        result: context.result,
        durationMs: context.durationMs,
        agentId: context.agentId,
        requestId: context.requestId,
      };
      const postCondResult = await this.postConditionVerifier.verify(verifierCtx);

      // 3. Invariant check (optional)
      let invariantsResult:
        | { status: string; hasCriticalViolation: boolean }
        | undefined;
      if (this.invariantChecker) {
        // Build a minimal InvariantContext for the invariant checker
        const invCtx: InvariantContext = {
          requestId: context.requestId,
          toolName: context.toolName,
          executionSucceeded: true,
          currentState: "verifying",
          pendingApprovalCount: 0,
          eventCount: 0,
          pipelineResult: {
            requestId: context.requestId,
            toolName: context.toolName,
            success: true,
            result: context.result,
            validation: {
              valid: schemaResult.valid,
              errors: schemaResult.errors.map((e) => ({
                field: e.field,
                message: e.message,
              })),
            },
            verification: {
              status: postCondResult.status,
              hasCriticalFailure: postCondResult.hasCriticalFailure,
            },
            durationMs: context.durationMs,
          },
        };
        const invResult = await this.invariantChecker.check(invCtx);
        invariantsResult = {
          status: invResult.status,
          hasCriticalViolation: invResult.hasCriticalViolation,
        };
      }

      // Determine overall pass/fail
      const overallPassed =
        schemaResult.valid &&
        !postCondResult.hasCriticalFailure &&
        (!invariantsResult || !invariantsResult.hasCriticalViolation);

      const report = {
        schema: {
          valid: schemaResult.valid,
          errors: schemaResult.errors,
        },
        postConditions: {
          status: postCondResult.status,
          hasCriticalFailure: postCondResult.hasCriticalFailure,
        },
        invariants: invariantsResult,
        overallPassed,
      };
      recordRoleLatencyMs("verifier", Date.now() - startedAt);
      recordRoleExecution("verifier", overallPassed ? "success" : "failure");
      return report;
    } catch (error) {
      recordRoleLatencyMs("verifier", Date.now() - startedAt);
      recordRoleExecution("verifier", "failure");
      throw error;
    }
  }

  async checkInvariants(context: InvariantContext): Promise<InvariantResult> {
    const startedAt = Date.now();
    try {
      let result: InvariantResult;
      if (!this.invariantChecker) {
        result = {
          status: "passed",
          checks: [],
          hasCriticalViolation: false,
        };
      } else {
        result = await this.invariantChecker.check(context);
      }

      recordRoleLatencyMs("verifier", Date.now() - startedAt);
      recordRoleExecution(
        "verifier",
        result.hasCriticalViolation ? "failure" : "success",
      );
      return result;
    } catch (error) {
      recordRoleLatencyMs("verifier", Date.now() - startedAt);
      recordRoleExecution("verifier", "failure");
      throw error;
    }
  }
}
