/**
 * Kernel State Machine — deterministic state transitions for tool execution.
 *
 * Implements an explicit transition table with auto-escalation to safe mode
 * after consecutive errors.
 *
 * @module autonomy/state-machine/kernel-state-machine
 */

import type { KernelState } from "../types.js";
import type {
  KernelStateMachineInterface,
  StateChangeListener,
  StateTransition,
  StateTrigger,
  TransitionResult,
} from "./types.js";

// ---------- Transition Table ----------

/** Maximum consecutive errors before auto-escalation to safe_mode. */
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * The complete transition table. Order does not matter — lookups match
 * on (trigger, from) with wildcard "*" as fallback.
 */
const TRANSITION_TABLE: ReadonlyArray<StateTransition> = [
  { trigger: "tool_validated", from: "idle", to: "executing" },
  { trigger: "approval_required", from: "idle", to: "awaiting_approval" },
  { trigger: "approval_granted", from: "awaiting_approval", to: "executing" },
  { trigger: "approval_denied", from: "awaiting_approval", to: "idle" },
  { trigger: "approval_expired", from: "awaiting_approval", to: "idle" },
  { trigger: "execution_complete", from: "executing", to: "verifying" },
  { trigger: "verification_passed", from: "verifying", to: "idle" },
  { trigger: "verification_failed", from: "verifying", to: "error" },
  { trigger: "fatal_error", from: "*", to: "error" },
  { trigger: "escalate_safe_mode", from: "*", to: "safe_mode" },
  { trigger: "recover", from: "error", to: "idle" },
  // Phase 3: planning, memory writing, auditing, and safe-mode exit
  { trigger: "plan_requested", from: "idle", to: "planning" },
  { trigger: "plan_approved", from: "planning", to: "idle" },
  { trigger: "plan_rejected", from: "planning", to: "idle" },
  { trigger: "write_memory", from: "idle", to: "writing_memory" },
  { trigger: "memory_written", from: "writing_memory", to: "idle" },
  { trigger: "memory_write_failed", from: "writing_memory", to: "error" },
  { trigger: "audit_requested", from: "idle", to: "auditing" },
  { trigger: "audit_complete", from: "auditing", to: "idle" },
  { trigger: "audit_failed", from: "auditing", to: "error" },
  { trigger: "safe_mode_exit", from: "safe_mode", to: "idle" },
];

// ---------- Implementation ----------

export class KernelStateMachine implements KernelStateMachineInterface {
  private _currentState: KernelState = "idle";
  private _consecutiveErrors = 0;
  private listeners: Set<StateChangeListener> = new Set();

  get currentState(): KernelState {
    return this._currentState;
  }

  get consecutiveErrors(): number {
    return this._consecutiveErrors;
  }

  transition(trigger: StateTrigger): TransitionResult {
    const from = this._currentState;

    // Find matching transition: exact match first, then wildcard
    const match =
      TRANSITION_TABLE.find((t) => t.trigger === trigger && t.from === from) ??
      TRANSITION_TABLE.find((t) => t.trigger === trigger && t.from === "*");

    if (!match) {
      return {
        accepted: false,
        from,
        to: from,
        trigger,
        reason: `No transition for trigger "${trigger}" from state "${from}"`,
      };
    }

    let targetState = match.to;

    // Track consecutive errors
    if (targetState === "error") {
      this._consecutiveErrors++;
      // Auto-escalate to safe_mode after MAX_CONSECUTIVE_ERRORS
      if (this._consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        targetState = "safe_mode";
      }
    }

    // Reset error count on successful verification or safe mode exit
    if (trigger === "verification_passed" || trigger === "safe_mode_exit") {
      this._consecutiveErrors = 0;
    }

    this._currentState = targetState;

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(from, targetState, trigger);
      } catch {
        // Listener errors are non-fatal
      }
    }

    return {
      accepted: true,
      from,
      to: targetState,
      trigger,
    };
  }

  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this._currentState = "idle";
    this._consecutiveErrors = 0;
  }
}
