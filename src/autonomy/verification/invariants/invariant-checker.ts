/**
 * Invariant Checker — runs system-wide checks after pipeline execution.
 *
 * Checks run sequentially with per-check timeouts, mirroring
 * the PostConditionVerifier pattern.
 *
 * @module autonomy/verification/invariants/invariant-checker
 */

import { logger } from "@elizaos/core";
import type {
  Invariant,
  InvariantCheckResult,
  InvariantCheckerInterface,
  InvariantContext,
  InvariantResult,
  InvariantStatus,
} from "./types.js";

/** Default per-check timeout in milliseconds. */
const DEFAULT_CHECK_TIMEOUT_MS = 5_000;

/**
 * Cross-system invariant checker that runs registered invariants
 * after pipeline execution completes.
 */
export class InvariantChecker implements InvariantCheckerInterface {
  private invariants: Invariant[] = [];
  private checkTimeoutMs: number;

  constructor(checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS) {
    this.checkTimeoutMs = checkTimeoutMs;
  }

  /**
   * Register a single invariant.
   */
  register(invariant: Invariant): void {
    this.invariants.push(invariant);
  }

  /**
   * Register multiple invariants.
   */
  registerMany(invariants: Invariant[]): void {
    this.invariants.push(...invariants);
  }

  /**
   * Run all registered invariants against the given context.
   *
   * - No registered invariants → auto-pass.
   * - Checks run sequentially with per-check timeout via Promise.race.
   * - A check that throws counts as failed.
   */
  async check(ctx: InvariantContext): Promise<InvariantResult> {
    if (this.invariants.length === 0) {
      return { status: "passed", checks: [], hasCriticalViolation: false };
    }

    const checks: InvariantCheckResult[] = [];
    let hasCriticalViolation = false;

    for (const invariant of this.invariants) {
      let passed = false;
      let error: string | undefined;

      let timerId: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timerId = setTimeout(
            () =>
              reject(new Error(`Invariant "${invariant.id}" timed out`)),
            this.checkTimeoutMs,
          );
        });
        passed = await Promise.race([invariant.check(ctx), timeout]);
      } catch (err) {
        passed = false;
        error = err instanceof Error ? err.message : String(err);
        logger.warn(
          `[invariant-checker] Check "${invariant.id}" failed: ${error}`,
        );
      } finally {
        if (timerId !== undefined) clearTimeout(timerId);
      }

      if (!passed && invariant.severity === "critical") {
        hasCriticalViolation = true;
      }

      checks.push({
        invariantId: invariant.id,
        passed,
        severity: invariant.severity,
        ...(error ? { error } : {}),
      });
    }

    const allPassed = checks.every((c) => c.passed);
    const allFailed = checks.every((c) => !c.passed);
    let status: InvariantStatus;
    if (allPassed) {
      status = "passed";
    } else if (allFailed) {
      status = "failed";
    } else {
      status = "partial";
    }

    return { status, checks, hasCriticalViolation };
  }
}
