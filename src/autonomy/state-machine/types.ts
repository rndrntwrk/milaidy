/**
 * State machine types for the Autonomy Kernel.
 *
 * Defines the deterministic state machine that governs kernel
 * lifecycle transitions during tool execution.
 *
 * @module autonomy/state-machine/types
 */

import type { KernelState } from "../types.js";

// ---------- Trigger Constants ----------

/**
 * All valid state transition triggers.
 */
export type StateTrigger =
  | "tool_validated"
  | "approval_required"
  | "approval_granted"
  | "approval_denied"
  | "approval_expired"
  | "execution_complete"
  | "verification_passed"
  | "verification_failed"
  | "fatal_error"
  | "escalate_safe_mode"
  | "recover";

// ---------- Transition Types ----------

/**
 * A single row in the state machine transition table.
 */
export interface StateTransition {
  /** The trigger that causes this transition. */
  trigger: StateTrigger;
  /** The state the machine must be in (or "*" for any state). */
  from: KernelState | "*";
  /** The state the machine transitions to. */
  to: KernelState;
}

/**
 * Result of attempting a state transition.
 */
export interface TransitionResult {
  /** Whether the transition was accepted. */
  accepted: boolean;
  /** The previous state (before transition attempt). */
  from: KernelState;
  /** The current state (after transition attempt). */
  to: KernelState;
  /** The trigger that was attempted. */
  trigger: StateTrigger;
  /** Reason for rejection (if not accepted). */
  reason?: string;
}

/**
 * Callback for state change notifications.
 */
export type StateChangeListener = (
  from: KernelState,
  to: KernelState,
  trigger: StateTrigger,
) => void;

// ---------- Interface ----------

/**
 * Interface for the kernel state machine (for dependency injection).
 */
export interface KernelStateMachineInterface {
  /** The current state. */
  readonly currentState: KernelState;
  /** Number of consecutive errors (resets on recover). */
  readonly consecutiveErrors: number;
  /** Attempt a state transition. Never throws. */
  transition(trigger: StateTrigger): TransitionResult;
  /** Register a listener for state changes. Returns unsubscribe function. */
  onStateChange(listener: StateChangeListener): () => void;
  /** Reset to idle state with zero error count. */
  reset(): void;
}
