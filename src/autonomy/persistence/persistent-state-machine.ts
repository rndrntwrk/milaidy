/**
 * Persistent State Machine — decorator that snapshots FSM state to Postgres.
 *
 * Wraps a {@link KernelStateMachineInterface} and writes the current
 * state + consecutiveErrors to autonomy_state after every accepted
 * transition. On startup, recovers the last known state from the DB.
 *
 * The transition() call itself remains synchronous — persistence is
 * fire-and-forget to avoid blocking the execution pipeline.
 *
 * @module autonomy/persistence/persistent-state-machine
 */

import { logger } from "@elizaos/core";

import type { KernelState } from "../types.js";
import type {
  KernelStateMachineInterface,
  StateChangeListener,
  StateTrigger,
  TransitionResult,
} from "../state-machine/types.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";

// ---------- Implementation ----------

export class PersistentStateMachine implements KernelStateMachineInterface {
  private inner: KernelStateMachineInterface;
  private adapter: AutonomyDbAdapter;

  constructor(inner: KernelStateMachineInterface, adapter: AutonomyDbAdapter) {
    this.inner = inner;
    this.adapter = adapter;
  }

  get currentState(): KernelState {
    return this.inner.currentState;
  }

  get consecutiveErrors(): number {
    return this.inner.consecutiveErrors;
  }

  transition(trigger: StateTrigger): TransitionResult {
    const result = this.inner.transition(trigger);

    if (result.accepted) {
      // Fire-and-forget snapshot — don't block the transition
      this.snapshot().catch((err) => {
        logger.error(
          `[autonomy:persistent-sm] Snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    return result;
  }

  onStateChange(listener: StateChangeListener): () => void {
    return this.inner.onStateChange(listener);
  }

  reset(): void {
    this.inner.reset();
    // Fire-and-forget snapshot after reset
    this.snapshot().catch((err) => {
      logger.error(
        `[autonomy:persistent-sm] Snapshot after reset failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Recover state from the most recent snapshot in the database.
   * Call this on startup before processing any triggers.
   *
   * If recovery finds a state, the inner FSM is reset and the
   * recovered state is restored via trigger replay.
   */
  async recover(): Promise<{ recovered: boolean; state?: KernelState; consecutiveErrors?: number }> {
    try {
      const { rows } = await this.adapter.executeRaw(
        `SELECT state, consecutive_errors
         FROM autonomy_state
         WHERE agent_id = '${esc(this.adapter.agentId)}'
         ORDER BY id DESC
         LIMIT 1`,
      );

      if (rows.length === 0) {
        return { recovered: false };
      }

      const state = String(rows[0].state ?? "idle") as KernelState;
      const consecutiveErrors = Number(rows[0].consecutive_errors ?? 0);
      this.restoreSnapshot(state, consecutiveErrors);

      logger.info(
        `[autonomy:persistent-sm] Recovered state="${state}" consecutiveErrors=${consecutiveErrors}`,
      );

      return { recovered: true, state, consecutiveErrors };
    } catch (err) {
      logger.error(
        `[autonomy:persistent-sm] Recovery failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { recovered: false };
    }
  }

  restoreSnapshot(state: KernelState, consecutiveErrors: number): void {
    this.inner.reset();
    if (hasRestoreSnapshot(this.inner)) {
      this.inner.restoreSnapshot(state, consecutiveErrors);
      return;
    }
    replayStateFromIdle(this.inner, state);
  }

  // ---------- Private ----------

  private async snapshot(): Promise<void> {
    await this.adapter.executeRaw(
      `INSERT INTO autonomy_state (state, consecutive_errors, agent_id)
       VALUES ('${esc(this.inner.currentState)}', ${this.inner.consecutiveErrors}, '${esc(this.adapter.agentId)}')`,
    );
  }
}

// ---------- Helpers ----------

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function hasRestoreSnapshot(
  machine: KernelStateMachineInterface,
): machine is KernelStateMachineInterface & {
  restoreSnapshot(state: KernelState, consecutiveErrors: number): void;
} {
  return typeof machine.restoreSnapshot === "function";
}

function replayStateFromIdle(
  machine: KernelStateMachineInterface,
  state: KernelState,
): void {
  const replayTriggers: Record<KernelState, StateTrigger[]> = {
    idle: [],
    planning: ["plan_requested"],
    executing: ["tool_validated"],
    verifying: ["tool_validated", "execution_complete"],
    writing_memory: ["write_memory"],
    auditing: ["audit_requested"],
    awaiting_approval: ["approval_required"],
    safe_mode: ["escalate_safe_mode"],
    error: ["fatal_error"],
  };

  for (const trigger of replayTriggers[state]) {
    machine.transition(trigger);
  }
}
