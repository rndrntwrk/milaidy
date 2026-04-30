/**
 * SafeModeController implementation.
 *
 * Manages safe mode triggers, entry, and exit with trust-gated
 * exit requirements.
 *
 * @module autonomy/roles/safe-mode
 */

import { recordSafeModeEvent } from "../metrics/prometheus-metrics.js";
import type { ToolCallSource } from "../tools/types.js";
import type {
  SafeModeController,
  SafeModeExitResult,
  SafeModeStatus,
} from "./types.js";

/**
 * Configuration for the safe mode controller.
 */
export interface SafeModeConfig {
  /** Number of consecutive errors before triggering safe mode (default: 3). */
  errorThreshold?: number;
  /** Minimum trust level required to exit safe mode (default: 0.8). */
  exitTrustFloor?: number;
  /** Optional event bus used for safe-mode entry/exit notifications. */
  eventBus?: {
    emit: (event: string, payload: unknown) => void;
  };
}

/**
 * Concrete SafeModeController implementation.
 */
export class SafeModeControllerImpl implements SafeModeController {
  private readonly errorThreshold: number;
  private readonly exitTrustFloor: number;
  private active = false;
  private enteredAt?: number;
  private reason?: string;
  private _consecutiveErrors = 0;
  private readonly eventBus?: {
    emit: (event: string, payload: unknown) => void;
  };

  constructor(config?: SafeModeConfig) {
    this.errorThreshold = config?.errorThreshold ?? 3;
    this.exitTrustFloor = config?.exitTrustFloor ?? 0.8;
    this.eventBus = config?.eventBus;
  }

  shouldTrigger(consecutiveErrors: number, _lastError?: string): boolean {
    this._consecutiveErrors = consecutiveErrors;
    return consecutiveErrors >= this.errorThreshold;
  }

  enter(reason: string): void {
    const wasActive = this.active;
    this.active = true;
    this.enteredAt = Date.now();
    this.reason = reason;

    if (wasActive) return;

    recordSafeModeEvent("enter");
    this.eventBus?.emit("autonomy:safe-mode:entered", {
      enteredAt: this.enteredAt,
      reason: this.reason,
      consecutiveErrors: this._consecutiveErrors,
    });
  }

  requestExit(
    approverSource: ToolCallSource,
    approverTrust: number,
  ): SafeModeExitResult {
    if (!this.active) {
      return { allowed: true, reason: "Safe mode is not active" };
    }

    // Only user or system sources can exit safe mode
    if (approverSource !== "user" && approverSource !== "system") {
      const result = {
        allowed: false,
        reason: `Source "${approverSource}" is not authorized to exit safe mode (requires "user" or "system")`,
      };
      this.eventBus?.emit("autonomy:safe-mode:exit-denied", {
        attemptedAt: Date.now(),
        reason: result.reason,
        approverSource,
        approverTrust,
        enteredAt: this.enteredAt,
        active: true,
      });
      return result;
    }

    if (approverTrust < this.exitTrustFloor) {
      const result = {
        allowed: false,
        reason: `Trust level ${approverTrust} is below the required floor of ${this.exitTrustFloor}`,
      };
      this.eventBus?.emit("autonomy:safe-mode:exit-denied", {
        attemptedAt: Date.now(),
        reason: result.reason,
        approverSource,
        approverTrust,
        enteredAt: this.enteredAt,
        active: true,
      });
      return result;
    }

    // Exit safe mode
    const enteredAt = this.enteredAt;
    const reason = this.reason;
    const consecutiveErrors = this._consecutiveErrors;
    const exitedAt = Date.now();
    this.active = false;
    this.enteredAt = undefined;
    this.reason = undefined;
    this._consecutiveErrors = 0;

    recordSafeModeEvent("exit");
    this.eventBus?.emit("autonomy:safe-mode:exited", {
      exitedAt,
      enteredAt,
      reason,
      consecutiveErrors,
      approverSource,
      approverTrust,
    });

    return { allowed: true, reason: "Safe mode exited successfully" };
  }

  getStatus(): SafeModeStatus {
    return {
      active: this.active,
      enteredAt: this.enteredAt,
      reason: this.reason,
      consecutiveErrors: this._consecutiveErrors,
    };
  }
}
