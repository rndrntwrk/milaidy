/**
 * SafeModeController implementation.
 *
 * Manages safe mode triggers, entry, and exit with trust-gated
 * exit requirements.
 *
 * @module autonomy/roles/safe-mode
 */

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

  constructor(config?: SafeModeConfig) {
    this.errorThreshold = config?.errorThreshold ?? 3;
    this.exitTrustFloor = config?.exitTrustFloor ?? 0.8;
  }

  shouldTrigger(consecutiveErrors: number, _lastError?: string): boolean {
    this._consecutiveErrors = consecutiveErrors;
    return consecutiveErrors >= this.errorThreshold;
  }

  enter(reason: string): void {
    this.active = true;
    this.enteredAt = Date.now();
    this.reason = reason;
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
      return {
        allowed: false,
        reason: `Source "${approverSource}" is not authorized to exit safe mode (requires "user" or "system")`,
      };
    }

    if (approverTrust < this.exitTrustFloor) {
      return {
        allowed: false,
        reason: `Trust level ${approverTrust} is below the required floor of ${this.exitTrustFloor}`,
      };
    }

    // Exit safe mode
    this.active = false;
    this.enteredAt = undefined;
    this.reason = undefined;
    this._consecutiveErrors = 0;

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
