/**
 * Post-Condition Verifier — runs checks after tool execution.
 *
 * Each tool can have registered post-conditions that verify the
 * execution result meets expectations. Checks run sequentially
 * with per-check timeouts.
 *
 * @module autonomy/verification/postcondition-verifier
 */

import { logger } from "@elizaos/core";
import type {
  PostCondition,
  PostConditionCheckResult,
  PostConditionVerifierInterface,
  VerificationFailureCode,
  VerificationFailureTaxonomy,
  VerificationResult,
  VerificationStatus,
  VerifierContext,
} from "./types.js";

/** Default per-check timeout in milliseconds. */
const DEFAULT_CHECK_TIMEOUT_MS = 5_000;

/**
 * Post-condition verifier that runs registered checks after tool execution.
 */
export class PostConditionVerifier implements PostConditionVerifierInterface {
  private conditions = new Map<string, PostCondition[]>();
  private checkTimeoutMs: number;

  constructor(checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS) {
    this.checkTimeoutMs = checkTimeoutMs;
  }

  /**
   * Register post-conditions for a tool. Appends to existing conditions.
   */
  registerConditions(toolName: string, conditions: PostCondition[]): void {
    const existing = this.conditions.get(toolName) ?? [];
    this.conditions.set(toolName, [...existing, ...conditions]);
  }

  /**
   * Run all registered post-conditions for the given tool execution.
   *
   * - No registered conditions → auto-pass.
   * - Checks run sequentially with per-check timeout via Promise.race.
   * - A check that throws counts as failed.
   */
  async verify(ctx: VerifierContext): Promise<VerificationResult> {
    const conditions = this.conditions.get(ctx.toolName);

    // No conditions registered → auto-pass
    if (!conditions || conditions.length === 0) {
      return {
        status: "passed",
        checks: [],
        hasCriticalFailure: false,
        failureTaxonomy: emptyFailureTaxonomy(),
      };
    }

    const checks: PostConditionCheckResult[] = [];
    let hasCriticalFailure = false;

    for (const condition of conditions) {
      let passed = false;
      let error: string | undefined;
      let failureCode: VerificationFailureCode | undefined;

      let timerId: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timerId = setTimeout(
            () =>
              reject(new Error(`Post-condition "${condition.id}" timed out`)),
            this.checkTimeoutMs,
          );
        });
        passed = await Promise.race([condition.check(ctx), timeout]);
      } catch (err) {
        passed = false;
        error = err instanceof Error ? err.message : String(err);
        logger.warn(
          `[postcondition-verifier] Check "${condition.id}" failed for ${ctx.toolName}: ${error}`,
        );
      } finally {
        if (timerId !== undefined) clearTimeout(timerId);
      }

      if (!passed) {
        if (error) {
          failureCode = error.toLowerCase().includes("timed out")
            ? "timeout"
            : "check_error";
        } else {
          failureCode = "check_failed";
        }
      }

      if (!passed && condition.severity === "critical") {
        hasCriticalFailure = true;
      }

      checks.push({
        conditionId: condition.id,
        passed,
        severity: condition.severity,
        ...(failureCode ? { failureCode } : {}),
        ...(error ? { error } : {}),
      });
    }

    const allPassed = checks.every((c) => c.passed);
    const allFailed = checks.every((c) => !c.passed);
    let status: VerificationStatus;
    if (allPassed) {
      status = "passed";
    } else if (allFailed) {
      status = "failed";
    } else {
      status = "partial";
    }

    return {
      status,
      checks,
      hasCriticalFailure,
      failureTaxonomy: summarizeFailureTaxonomy(checks),
    };
  }
}

function emptyFailureTaxonomy(): VerificationFailureTaxonomy {
  return {
    totalFailures: 0,
    criticalFailures: 0,
    warningFailures: 0,
    infoFailures: 0,
    checkFailures: 0,
    errorFailures: 0,
    timeoutFailures: 0,
  };
}

function summarizeFailureTaxonomy(
  checks: PostConditionCheckResult[],
): VerificationFailureTaxonomy {
  const taxonomy = emptyFailureTaxonomy();
  for (const check of checks) {
    if (check.passed) continue;
    taxonomy.totalFailures += 1;
    if (check.severity === "critical") taxonomy.criticalFailures += 1;
    else if (check.severity === "warning") taxonomy.warningFailures += 1;
    else taxonomy.infoFailures += 1;

    if (check.failureCode === "timeout") taxonomy.timeoutFailures += 1;
    else if (check.failureCode === "check_error") taxonomy.errorFailures += 1;
    else taxonomy.checkFailures += 1;
  }
  return taxonomy;
}
