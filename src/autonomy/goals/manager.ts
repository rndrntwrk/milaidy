/**
 * Goal Manager — hierarchical goal lifecycle management.
 *
 * Manages agent goals with trust-gated creation, hierarchical
 * decomposition, and completion evaluation.
 *
 * @module autonomy/goals/manager
 */

import { logger } from "@elizaos/core";
import type { GoalPriority, GoalStatus } from "../types.js";

/**
 * A goal in the agent's goal hierarchy.
 */
export interface Goal {
  id: string;
  description: string;
  priority: GoalPriority;
  status: GoalStatus;
  /** Parent goal for hierarchical decomposition. */
  parentGoalId?: string;
  /** Success criteria (machine-evaluable when possible). */
  successCriteria: string[];
  /** Created by (user, system, or agent-proposed). */
  source: "user" | "system" | "agent";
  /** Trust score of the source at creation time. */
  sourceTrust: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * Result of goal evaluation.
 */
export interface GoalEvaluationResult {
  met: boolean;
  evidence: string[];
}

/**
 * Caller identity for mutation operations.
 *
 * Omit to indicate a system-level (internal) operation — these bypass
 * trust gates entirely. When provided, the caller's trust is enforced
 * against per-source-type floors and, for terminal status transitions,
 * against the goal creator's trust level.
 */
export interface MutationContext {
  source: "user" | "system" | "agent";
  sourceTrust: number;
}

/**
 * Interface for goal lifecycle management.
 */
export interface GoalManager {
  addGoal(goal: Omit<Goal, "id" | "createdAt" | "updatedAt">): Promise<Goal>;
  updateGoal(goalId: string, update: Partial<Goal>, caller?: MutationContext): Promise<Goal>;
  getActiveGoals(): Promise<Goal[]>;
  getGoalTree(rootGoalId: string): Promise<Goal[]>;
  getGoalById(goalId: string): Promise<Goal | undefined>;
  /** Evaluate whether a goal's success criteria have been met. */
  evaluateGoal(goalId: string, caller?: MutationContext): Promise<GoalEvaluationResult>;
}

// ---------- Implementation ----------

/**
 * Trust floors per source type. Goals below these thresholds are rejected.
 * System goals are always trusted. Agent goals need moderate trust.
 * User goals have a lower bar (users are the principal) but still gated
 * because source identity is caller-supplied and unverified.
 */
const GOAL_TRUST_FLOORS: Record<Goal["source"], number> = {
  system: 0.0,  // System goals always accepted
  user: 0.3,    // Users are the principal, low bar but not zero
  agent: 0.6,   // Agent-proposed goals need demonstrated trust
};

/** Priority ordering for sorting. */
const PRIORITY_ORDER: Record<GoalPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Valid status transitions. Prevents impossible state changes
 * (e.g., completed -> active) unless going through proper channels.
 */
const VALID_STATUS_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  active: ["paused", "completed", "failed"],
  paused: ["active", "failed"],
  completed: [], // Terminal state — no transitions allowed
  failed: ["active"], // Can retry a failed goal
};

/** Deep clone a goal to prevent mutation of nested objects. */
function deepCloneGoal(goal: Goal): Goal {
  return {
    ...goal,
    successCriteria: [...goal.successCriteria],
  };
}

/**
 * In-memory goal manager implementation.
 *
 * Provides hierarchical goal management with trust-gated creation
 * and rule-based completion evaluation.
 */
export class InMemoryGoalManager implements GoalManager {
  private goals = new Map<string, Goal>();
  private maxGoals: number;

  /** Optional evaluator function for custom success criteria checks. */
  private criteriaEvaluator?: (criterion: string) => Promise<boolean>;

  constructor(options?: { maxGoals?: number }) {
    this.maxGoals = options?.maxGoals ?? 500;
  }

  /**
   * Register a custom criteria evaluator for machine-evaluable success criteria.
   */
  setCriteriaEvaluator(evaluator: (criterion: string) => Promise<boolean>): void {
    this.criteriaEvaluator = evaluator;
  }

  async addGoal(input: Omit<Goal, "id" | "createdAt" | "updatedAt">): Promise<Goal> {
    // Trust gate: enforce per-source-type minimum trust
    const trustFloor = GOAL_TRUST_FLOORS[input.source] ?? 0.6;
    if (input.sourceTrust < trustFloor) {
      throw new Error(
        `Goal from "${input.source}" rejected: trust ${input.sourceTrust.toFixed(3)} ` +
        `below floor ${trustFloor}`,
      );
    }

    // Validate parent exists if specified and isn't in a terminal state
    if (input.parentGoalId) {
      const parent = this.goals.get(input.parentGoalId);
      if (!parent) {
        throw new Error(`Parent goal ${input.parentGoalId} not found`);
      }
      if (parent.status === "completed" || parent.status === "failed") {
        throw new Error(`Cannot add child to ${parent.status} parent goal ${input.parentGoalId}`);
      }
    }

    // Capacity check
    if (this.goals.size >= this.maxGoals) {
      this.pruneCompletedGoals();
      if (this.goals.size >= this.maxGoals) {
        throw new Error(`Goal capacity reached (${this.maxGoals})`);
      }
    }

    const now = Date.now();
    const goal: Goal = {
      ...input,
      successCriteria: [...input.successCriteria], // Deep copy
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.goals.set(goal.id, goal);

    logger.info(
      `[goal-manager] Created goal ${goal.id}: "${goal.description}" ` +
      `(priority=${goal.priority}, source=${goal.source})`,
    );

    return deepCloneGoal(goal);
  }

  async updateGoal(goalId: string, update: Partial<Goal>, caller?: MutationContext): Promise<Goal> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }

    // Trust gate: enforce caller authority (omitted caller = system/internal → always allowed)
    if (caller) {
      const trustFloor = GOAL_TRUST_FLOORS[caller.source] ?? 0.6;
      if (caller.sourceTrust < trustFloor) {
        throw new Error(
          `Update from "${caller.source}" rejected: trust ${caller.sourceTrust.toFixed(3)} ` +
          `below floor ${trustFloor}`,
        );
      }
      // Terminal transitions require at least the goal creator's trust level.
      // This prevents a low-trust agent from closing a high-trust user's goal.
      if (update.status && (update.status === "completed" || update.status === "failed")) {
        if (caller.sourceTrust < goal.sourceTrust) {
          throw new Error(
            `Cannot ${update.status} goal: caller trust ${caller.sourceTrust.toFixed(3)} ` +
            `below goal creator trust ${goal.sourceTrust.toFixed(3)}`,
          );
        }
      }
    }

    // Prevent updating immutable fields (including completedAt and parentGoalId)
    const {
      id: _id,
      createdAt: _ca,
      source: _src,
      sourceTrust: _st,
      completedAt: _cAt,
      parentGoalId: _pid,
      ...mutableUpdate
    } = update;

    // Enforce status state machine
    if (update.status && update.status !== goal.status) {
      const allowed = VALID_STATUS_TRANSITIONS[goal.status];
      if (!allowed.includes(update.status)) {
        throw new Error(
          `Invalid status transition: "${goal.status}" -> "${update.status}". ` +
          `Allowed: [${allowed.join(", ")}]`,
        );
      }
    }

    const updated: Goal = {
      ...goal,
      ...mutableUpdate,
      // Deep copy successCriteria if provided
      successCriteria: update.successCriteria
        ? [...update.successCriteria]
        : [...goal.successCriteria],
      updatedAt: Date.now(),
    };

    // If completing, set completedAt
    if (update.status === "completed" && !goal.completedAt) {
      updated.completedAt = Date.now();
    }
    // If failing, also set completedAt as terminal timestamp
    if (update.status === "failed" && !goal.completedAt) {
      updated.completedAt = Date.now();
    }

    this.goals.set(goalId, updated);

    logger.debug(
      `[goal-manager] Updated goal ${goalId}: status=${updated.status}`,
    );

    return deepCloneGoal(updated);
  }

  async getActiveGoals(): Promise<Goal[]> {
    return Array.from(this.goals.values())
      .filter((g) => g.status === "active")
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
      .map(deepCloneGoal);
  }

  async getGoalTree(rootGoalId: string): Promise<Goal[]> {
    const root = this.goals.get(rootGoalId);
    if (!root) return [];

    const tree: Goal[] = [deepCloneGoal(root)];
    const queue = [rootGoalId];
    const visited = new Set<string>([rootGoalId]); // Cycle protection

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const goal of this.goals.values()) {
        if (goal.parentGoalId === parentId && !visited.has(goal.id)) {
          visited.add(goal.id);
          tree.push(deepCloneGoal(goal));
          queue.push(goal.id);
        }
      }
    }

    return tree;
  }

  async getGoalById(goalId: string): Promise<Goal | undefined> {
    const goal = this.goals.get(goalId);
    return goal ? deepCloneGoal(goal) : undefined;
  }

  async evaluateGoal(goalId: string, caller?: MutationContext): Promise<GoalEvaluationResult> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }

    // Trust gate: enforce caller authority (omitted caller = system/internal → always allowed)
    if (caller) {
      const trustFloor = GOAL_TRUST_FLOORS[caller.source] ?? 0.6;
      if (caller.sourceTrust < trustFloor) {
        throw new Error(
          `Evaluate from "${caller.source}" rejected: trust ${caller.sourceTrust.toFixed(3)} ` +
          `below floor ${trustFloor}`,
        );
      }
    }

    if (goal.successCriteria.length === 0) {
      return { met: false, evidence: ["No success criteria defined"] };
    }

    const evidence: string[] = [];
    let metCount = 0;

    for (const criterion of goal.successCriteria) {
      const result = await this.evaluateCriterion(criterion);
      if (result.met) {
        metCount++;
        evidence.push(`PASS: ${criterion} — ${result.reason}`);
      } else {
        evidence.push(`FAIL: ${criterion} — ${result.reason}`);
      }
    }

    const allMet = metCount === goal.successCriteria.length;

    // Auto-complete if all criteria met
    if (allMet && goal.status === "active") {
      await this.updateGoal(goalId, { status: "completed" });
      evidence.push("Goal auto-completed: all criteria met");

      // Check if parent goal can also be completed
      if (goal.parentGoalId) {
        await this.checkParentCompletion(goal.parentGoalId);
      }
    }

    logger.debug(
      `[goal-manager] Evaluated goal ${goalId}: ${metCount}/${goal.successCriteria.length} criteria met`,
    );

    return { met: allMet, evidence };
  }

  /**
   * Get all goals (all statuses). For diagnostics.
   */
  getAllGoals(): Goal[] {
    return Array.from(this.goals.values()).map(deepCloneGoal);
  }

  /**
   * Get count of goals by status.
   */
  getStatusCounts(): Record<GoalStatus, number> {
    const counts: Record<GoalStatus, number> = {
      active: 0,
      completed: 0,
      paused: 0,
      failed: 0,
    };
    for (const goal of this.goals.values()) {
      counts[goal.status]++;
    }
    return counts;
  }

  /**
   * Clear all goals. For testing.
   */
  clear(): void {
    this.goals.clear();
  }

  // ---------- Private Helpers ----------

  private async evaluateCriterion(
    criterion: string,
  ): Promise<{ met: boolean; reason: string }> {
    // Try custom evaluator first
    if (this.criteriaEvaluator) {
      try {
        const met = await this.criteriaEvaluator(criterion);
        return { met, reason: met ? "Custom evaluator: passed" : "Custom evaluator: not met" };
      } catch {
        // Fall through to heuristic evaluation
      }
    }

    // Heuristic: criteria with "TODO" or "pending" are not met
    if (/\b(TODO|pending|not started|in progress)\b/i.test(criterion)) {
      return { met: false, reason: "Criterion appears incomplete" };
    }

    // Heuristic: criteria with "done" or "complete" are met
    if (/\b(done|complete|finished|achieved|verified)\b/i.test(criterion)) {
      return { met: true, reason: "Criterion appears complete" };
    }

    // Default: unresolvable without more context
    return { met: false, reason: "Cannot evaluate — needs human review or custom evaluator" };
  }

  /**
   * Check if a parent goal can be completed after a child completes.
   * Includes cycle detection to prevent stack overflow.
   */
  private async checkParentCompletion(
    parentGoalId: string,
    visited: Set<string> = new Set(),
  ): Promise<void> {
    // Cycle detection
    if (visited.has(parentGoalId)) {
      logger.error(
        `[goal-manager] Cycle detected in goal hierarchy at ${parentGoalId}`,
      );
      return;
    }
    visited.add(parentGoalId);

    const parent = this.goals.get(parentGoalId);
    if (!parent || parent.status !== "active") return;

    const siblings = Array.from(this.goals.values())
      .filter((g) => g.parentGoalId === parentGoalId);

    const allComplete = siblings.every(
      (g) => g.status === "completed" || g.status === "failed",
    );

    if (allComplete && siblings.length > 0) {
      const allSucceeded = siblings.every((g) => g.status === "completed");
      if (allSucceeded) {
        logger.info(
          `[goal-manager] All sub-goals of ${parentGoalId} completed — evaluating parent`,
        );
        await this.evaluateGoal(parentGoalId);
      }
    }
  }

  /**
   * Prune completed goals, handling orphaned children by
   * clearing their parentGoalId references.
   */
  private pruneCompletedGoals(): void {
    const completed = Array.from(this.goals.entries())
      .filter(([, g]) => g.status === "completed" || g.status === "failed")
      .sort((a, b) => (a[1].completedAt ?? a[1].updatedAt) - (b[1].completedAt ?? b[1].updatedAt));

    // Remove oldest 25% of completed goals
    const toRemove = Math.ceil(completed.length * 0.25);
    const removedIds = new Set<string>();

    for (let i = 0; i < toRemove; i++) {
      const id = completed[i][0];
      removedIds.add(id);
      this.goals.delete(id);
    }

    // Fix orphaned children: clear dangling parentGoalId references
    if (removedIds.size > 0) {
      for (const goal of this.goals.values()) {
        if (goal.parentGoalId && removedIds.has(goal.parentGoalId)) {
          goal.parentGoalId = undefined;
        }
      }
      logger.debug(`[goal-manager] Pruned ${toRemove} completed goals, fixed orphaned children`);
    }
  }
}
