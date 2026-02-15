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
 * Interface for goal lifecycle management.
 */
export interface GoalManager {
  addGoal(goal: Omit<Goal, "id" | "createdAt" | "updatedAt">): Promise<Goal>;
  updateGoal(goalId: string, update: Partial<Goal>): Promise<Goal>;
  getActiveGoals(): Promise<Goal[]>;
  getGoalTree(rootGoalId: string): Promise<Goal[]>;
  getGoalById(goalId: string): Promise<Goal | undefined>;
  /** Evaluate whether a goal's success criteria have been met. */
  evaluateGoal(goalId: string): Promise<GoalEvaluationResult>;
}

// ---------- Implementation ----------

/** Minimum trust required for agent-proposed goals (lower trust = needs review). */
const AGENT_GOAL_TRUST_FLOOR = 0.6;

/** Priority ordering for sorting. */
const PRIORITY_ORDER: Record<GoalPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

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
    // Trust gate: agent-proposed goals need minimum trust
    if (input.source === "agent" && input.sourceTrust < AGENT_GOAL_TRUST_FLOOR) {
      throw new Error(
        `Agent-proposed goal rejected: trust ${input.sourceTrust.toFixed(3)} ` +
        `below floor ${AGENT_GOAL_TRUST_FLOOR}`,
      );
    }

    // Validate parent exists if specified
    if (input.parentGoalId && !this.goals.has(input.parentGoalId)) {
      throw new Error(`Parent goal ${input.parentGoalId} not found`);
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
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.goals.set(goal.id, goal);

    logger.info(
      `[goal-manager] Created goal ${goal.id}: "${goal.description}" ` +
      `(priority=${goal.priority}, source=${goal.source})`,
    );

    return { ...goal };
  }

  async updateGoal(goalId: string, update: Partial<Goal>): Promise<Goal> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }

    // Prevent updating immutable fields
    const { id: _id, createdAt: _ca, source: _src, sourceTrust: _st, ...mutableUpdate } = update;

    const updated: Goal = {
      ...goal,
      ...mutableUpdate,
      updatedAt: Date.now(),
    };

    // If completing, set completedAt
    if (update.status === "completed" && !goal.completedAt) {
      updated.completedAt = Date.now();
    }

    this.goals.set(goalId, updated);

    logger.debug(
      `[goal-manager] Updated goal ${goalId}: status=${updated.status}`,
    );

    return { ...updated };
  }

  async getActiveGoals(): Promise<Goal[]> {
    return Array.from(this.goals.values())
      .filter((g) => g.status === "active")
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }

  async getGoalTree(rootGoalId: string): Promise<Goal[]> {
    const root = this.goals.get(rootGoalId);
    if (!root) return [];

    const tree: Goal[] = [{ ...root }];
    const queue = [rootGoalId];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const goal of this.goals.values()) {
        if (goal.parentGoalId === parentId) {
          tree.push({ ...goal });
          queue.push(goal.id);
        }
      }
    }

    return tree;
  }

  async getGoalById(goalId: string): Promise<Goal | undefined> {
    const goal = this.goals.get(goalId);
    return goal ? { ...goal } : undefined;
  }

  async evaluateGoal(goalId: string): Promise<GoalEvaluationResult> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
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
    return Array.from(this.goals.values()).map((g) => ({ ...g }));
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

  private async checkParentCompletion(parentGoalId: string): Promise<void> {
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

  private pruneCompletedGoals(): void {
    const completed = Array.from(this.goals.entries())
      .filter(([, g]) => g.status === "completed" || g.status === "failed")
      .sort((a, b) => (a[1].completedAt ?? a[1].updatedAt) - (b[1].completedAt ?? b[1].updatedAt));

    // Remove oldest 25% of completed goals
    const toRemove = Math.ceil(completed.length * 0.25);
    for (let i = 0; i < toRemove; i++) {
      this.goals.delete(completed[i][0]);
    }

    if (toRemove > 0) {
      logger.debug(`[goal-manager] Pruned ${toRemove} completed goals`);
    }
  }
}
