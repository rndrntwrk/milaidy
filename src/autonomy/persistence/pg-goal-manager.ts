/**
 * Postgres-backed Goal Manager — durable hierarchical goal storage.
 *
 * Implements {@link GoalManager} using the autonomy_goals table
 * via {@link AutonomyDbAdapter}.
 *
 * @module autonomy/persistence/pg-goal-manager
 */

import { logger } from "@elizaos/core";

import type {
  Goal,
  GoalEvaluationResult,
  GoalManager,
  MutationContext,
} from "../goals/manager.js";
import type { GoalPriority, GoalStatus } from "../types.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";

// ---------- Constants ----------

const GOAL_TRUST_FLOORS: Record<Goal["source"], number> = {
  system: 0.0,
  user: 0.3,
  agent: 0.6,
};

const VALID_STATUS_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  active: ["paused", "completed", "failed"],
  paused: ["active", "failed"],
  completed: [],
  failed: ["active"],
};

// ---------- Implementation ----------

export class PgGoalManager implements GoalManager {
  private adapter: AutonomyDbAdapter;
  private criteriaEvaluator?: (criterion: string) => Promise<boolean>;

  constructor(adapter: AutonomyDbAdapter) {
    this.adapter = adapter;
  }

  setCriteriaEvaluator(evaluator: (criterion: string) => Promise<boolean>): void {
    this.criteriaEvaluator = evaluator;
  }

  async addGoal(input: Omit<Goal, "id" | "createdAt" | "updatedAt">): Promise<Goal> {
    // Trust gate
    const trustFloor = GOAL_TRUST_FLOORS[input.source] ?? 0.6;
    if (input.sourceTrust < trustFloor) {
      throw new Error(
        `Goal from "${input.source}" rejected: trust ${input.sourceTrust.toFixed(3)} below floor ${trustFloor}`,
      );
    }

    // Validate parent
    if (input.parentGoalId) {
      const parent = await this.getGoalById(input.parentGoalId);
      if (!parent) throw new Error(`Parent goal ${input.parentGoalId} not found`);
      if (parent.status === "completed" || parent.status === "failed") {
        throw new Error(`Cannot add child to ${parent.status} parent goal ${input.parentGoalId}`);
      }
    }

    const now = new Date().toISOString();
    const { rows } = await this.adapter.executeRaw(
      `INSERT INTO autonomy_goals (description, priority, status, parent_goal_id, success_criteria, source, source_trust, created_at, updated_at)
       VALUES ('${esc(input.description)}', '${esc(input.priority)}', '${esc(input.status)}', ${input.parentGoalId ? `'${esc(input.parentGoalId)}'` : "NULL"}, '${esc(JSON.stringify(input.successCriteria))}'::jsonb, '${esc(input.source)}', '${input.sourceTrust}'::jsonb, '${now}'::timestamptz, '${now}'::timestamptz)
       RETURNING *`,
    );

    const goal = rowToGoal(rows[0]);
    logger.info(`[goal-manager:pg] Created goal ${goal.id}: "${goal.description}"`);
    return goal;
  }

  async updateGoal(goalId: string, update: Partial<Goal>, caller?: MutationContext): Promise<Goal> {
    const goal = await this.getGoalById(goalId);
    if (!goal) throw new Error(`Goal ${goalId} not found`);

    // Trust gate
    if (caller) {
      const trustFloor = GOAL_TRUST_FLOORS[caller.source] ?? 0.6;
      if (caller.sourceTrust < trustFloor) {
        throw new Error(
          `Update from "${caller.source}" rejected: trust ${caller.sourceTrust.toFixed(3)} below floor ${trustFloor}`,
        );
      }
      if (update.status && (update.status === "completed" || update.status === "failed")) {
        if (caller.sourceTrust < goal.sourceTrust) {
          throw new Error(
            `Cannot ${update.status} goal: caller trust ${caller.sourceTrust.toFixed(3)} below goal creator trust ${goal.sourceTrust.toFixed(3)}`,
          );
        }
      }
    }

    // Status transition validation
    if (update.status && update.status !== goal.status) {
      const allowed = VALID_STATUS_TRANSITIONS[goal.status];
      if (!allowed.includes(update.status)) {
        throw new Error(
          `Invalid status transition: "${goal.status}" -> "${update.status}". Allowed: [${allowed.join(", ")}]`,
        );
      }
    }

    // Build SET clause for mutable fields
    const sets: string[] = [];
    const now = new Date().toISOString();
    sets.push(`updated_at = '${now}'::timestamptz`);

    if (update.description !== undefined) sets.push(`description = '${esc(update.description)}'`);
    if (update.priority !== undefined) sets.push(`priority = '${esc(update.priority)}'`);
    if (update.status !== undefined) sets.push(`status = '${esc(update.status)}'`);
    if (update.successCriteria !== undefined) {
      sets.push(`success_criteria = '${esc(JSON.stringify(update.successCriteria))}'::jsonb`);
    }

    // Terminal status → set completed_at
    if (update.status === "completed" || update.status === "failed") {
      if (!goal.completedAt) {
        sets.push(`completed_at = '${now}'::timestamptz`);
      }
    }

    const { rows } = await this.adapter.executeRaw(
      `UPDATE autonomy_goals SET ${sets.join(", ")} WHERE id = '${esc(goalId)}' RETURNING *`,
    );

    return rowToGoal(rows[0]);
  }

  async getActiveGoals(): Promise<Goal[]> {
    const { rows } = await this.adapter.executeRaw(
      `SELECT * FROM autonomy_goals WHERE status = 'active' ORDER BY
       CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END ASC`,
    );
    return rows.map(rowToGoal);
  }

  async getGoalTree(rootGoalId: string): Promise<Goal[]> {
    // Recursive CTE for tree traversal
    const { rows } = await this.adapter.executeRaw(
      `WITH RECURSIVE tree AS (
         SELECT * FROM autonomy_goals WHERE id = '${esc(rootGoalId)}'
         UNION ALL
         SELECT g.* FROM autonomy_goals g
         INNER JOIN tree t ON g.parent_goal_id = t.id
       )
       SELECT * FROM tree`,
    );
    return rows.map(rowToGoal);
  }

  async getGoalById(goalId: string): Promise<Goal | undefined> {
    const { rows } = await this.adapter.executeRaw(
      `SELECT * FROM autonomy_goals WHERE id = '${esc(goalId)}'`,
    );
    if (rows.length === 0) return undefined;
    return rowToGoal(rows[0]);
  }

  async evaluateGoal(goalId: string, caller?: MutationContext): Promise<GoalEvaluationResult> {
    const goal = await this.getGoalById(goalId);
    if (!goal) throw new Error(`Goal ${goalId} not found`);

    if (caller) {
      const trustFloor = GOAL_TRUST_FLOORS[caller.source] ?? 0.6;
      if (caller.sourceTrust < trustFloor) {
        throw new Error(
          `Evaluate from "${caller.source}" rejected: trust ${caller.sourceTrust.toFixed(3)} below floor ${trustFloor}`,
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

    if (allMet && goal.status === "active") {
      await this.updateGoal(goalId, { status: "completed" });
      evidence.push("Goal auto-completed: all criteria met");
    }

    return { met: allMet, evidence };
  }

  private async evaluateCriterion(criterion: string): Promise<{ met: boolean; reason: string }> {
    if (this.criteriaEvaluator) {
      try {
        const met = await this.criteriaEvaluator(criterion);
        return { met, reason: met ? "Custom evaluator: passed" : "Custom evaluator: not met" };
      } catch {
        // Fall through
      }
    }

    if (/\b(TODO|pending|not started|in progress)\b/i.test(criterion)) {
      return { met: false, reason: "Criterion appears incomplete" };
    }
    if (/\b(done|complete|finished|achieved|verified)\b/i.test(criterion)) {
      return { met: true, reason: "Criterion appears complete" };
    }
    return { met: false, reason: "Cannot evaluate — needs human review or custom evaluator" };
  }
}

// ---------- Helpers ----------

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function rowToGoal(row: Record<string, unknown>): Goal {
  return {
    id: String(row.id ?? ""),
    description: String(row.description ?? ""),
    priority: String(row.priority ?? "medium") as GoalPriority,
    status: String(row.status ?? "active") as GoalStatus,
    parentGoalId: row.parent_goal_id ? String(row.parent_goal_id) : undefined,
    successCriteria: parseJsonb<string[]>(row.success_criteria, []),
    source: String(row.source ?? "system") as Goal["source"],
    sourceTrust: parseJsonb<number>(row.source_trust, 0),
    createdAt: toEpochMs(row.created_at),
    updatedAt: toEpochMs(row.updated_at),
    completedAt: row.completed_at ? toEpochMs(row.completed_at) : undefined,
  };
}

function parseJsonb<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

function toEpochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  if (typeof value === "number") return value;
  return 0;
}
