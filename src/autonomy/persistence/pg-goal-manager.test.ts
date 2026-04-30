/**
 * Tests for PgGoalManager.
 *
 * Uses a mock AutonomyDbAdapter to verify SQL generation,
 * trust gating, and status transitions without a real database.
 */

import { describe, expect, it, vi } from "vitest";

import type { Goal } from "../goals/manager.js";
import { PgGoalManager } from "./pg-goal-manager.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";

// ---------- Mock ----------

function makeMockAdapter(
  execFn?: ReturnType<typeof vi.fn>,
): AutonomyDbAdapter {
  return {
    executeRaw: execFn ?? vi.fn().mockResolvedValue({ rows: [], columns: [] }),
    agentId: "test-agent",
    tables: {} as any,
    raw: {} as any,
    initialize: vi.fn(),
    migrate: vi.fn(),
    tableExists: vi.fn(),
  } as unknown as AutonomyDbAdapter;
}

function makeGoalRow(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: "goal-uuid-1",
    description: "Test goal",
    priority: "medium",
    status: "active",
    parent_goal_id: null,
    success_criteria: ["criterion-1"],
    source: "user",
    source_trust: 0.9,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

// ---------- Tests ----------

describe("PgGoalManager", () => {
  describe("addGoal()", () => {
    it("inserts a goal and returns it", async () => {
      const row = makeGoalRow();
      const exec = vi.fn().mockResolvedValue({ rows: [row], columns: [] });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      const goal = await mgr.addGoal({
        description: "Test goal",
        priority: "medium",
        status: "active",
        successCriteria: ["criterion-1"],
        source: "user",
        sourceTrust: 0.9,
      });

      expect(goal.id).toBe("goal-uuid-1");
      expect(goal.description).toBe("Test goal");
      expect(goal.priority).toBe("medium");
      expect(goal.source).toBe("user");
      expect(goal.successCriteria).toEqual(["criterion-1"]);
      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("INSERT INTO autonomy_goals");
    });

    it("rejects goal when trust is below floor", async () => {
      const adapter = makeMockAdapter();
      const mgr = new PgGoalManager(adapter);

      await expect(
        mgr.addGoal({
          description: "Sketchy",
          priority: "low",
          status: "active",
          successCriteria: [],
          source: "agent",
          sourceTrust: 0.3, // Below 0.6 floor for agent
        }),
      ).rejects.toThrow("below floor");
    });

    it("rejects child of completed parent", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [makeGoalRow({ status: "completed" })],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      await expect(
        mgr.addGoal({
          description: "Child",
          priority: "low",
          status: "active",
          successCriteria: [],
          source: "user",
          sourceTrust: 0.9,
          parentGoalId: "goal-uuid-1",
        }),
      ).rejects.toThrow("Cannot add child to completed parent");
    });
  });

  describe("updateGoal()", () => {
    it("updates mutable fields and returns updated goal", async () => {
      const exec = vi.fn()
        .mockResolvedValueOnce({ rows: [makeGoalRow()], columns: [] }) // getGoalById
        .mockResolvedValueOnce({ rows: [makeGoalRow({ description: "Updated" })], columns: [] }); // UPDATE
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      const updated = await mgr.updateGoal("goal-uuid-1", { description: "Updated" });

      expect(updated.description).toBe("Updated");
      const updateSql = exec.mock.calls[1][0] as string;
      expect(updateSql).toContain("UPDATE autonomy_goals");
      expect(updateSql).toContain("description = 'Updated'");
    });

    it("rejects invalid status transition", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [makeGoalRow({ status: "completed" })],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      await expect(
        mgr.updateGoal("goal-uuid-1", { status: "active" }),
      ).rejects.toThrow("Invalid status transition");
    });

    it("rejects low-trust caller closing high-trust goal", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [makeGoalRow({ source_trust: 0.9 })],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      await expect(
        mgr.updateGoal(
          "goal-uuid-1",
          { status: "completed" },
          { source: "agent", sourceTrust: 0.7 },
        ),
      ).rejects.toThrow("caller trust");
    });

    it("sets completed_at on terminal status", async () => {
      const exec = vi.fn()
        .mockResolvedValueOnce({ rows: [makeGoalRow()], columns: [] })
        .mockResolvedValueOnce({ rows: [makeGoalRow({ status: "completed" })], columns: [] });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      await mgr.updateGoal("goal-uuid-1", { status: "completed" });

      const updateSql = exec.mock.calls[1][0] as string;
      expect(updateSql).toContain("completed_at");
    });
  });

  describe("getActiveGoals()", () => {
    it("returns goals sorted by priority", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [
          makeGoalRow({ id: "g1", priority: "high" }),
          makeGoalRow({ id: "g2", priority: "critical" }),
        ],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      const goals = await mgr.getActiveGoals();
      expect(goals).toHaveLength(2);
      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("status = 'active'");
      expect(sql).toContain("ORDER BY");
    });
  });

  describe("getGoalTree()", () => {
    it("uses recursive CTE", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [makeGoalRow()],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      await mgr.getGoalTree("root-id");

      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("WITH RECURSIVE");
      expect(sql).toContain("root-id");
    });
  });

  describe("getGoalById()", () => {
    it("returns goal when found", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [makeGoalRow()],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      const goal = await mgr.getGoalById("goal-uuid-1");
      expect(goal).toBeDefined();
      expect(goal!.id).toBe("goal-uuid-1");
    });

    it("returns undefined when not found", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      expect(await mgr.getGoalById("nonexistent")).toBeUndefined();
    });
  });

  describe("evaluateGoal()", () => {
    it("evaluates criteria and returns result", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [makeGoalRow({ success_criteria: ["Task is done"] })],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      const result = await mgr.evaluateGoal("goal-uuid-1");

      expect(result.met).toBe(true);
      expect(result.evidence.some((e) => e.includes("PASS"))).toBe(true);
    });

    it("returns not met for empty criteria", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [makeGoalRow({ success_criteria: [] })],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      const result = await mgr.evaluateGoal("goal-uuid-1");
      expect(result.met).toBe(false);
      expect(result.evidence).toContain("No success criteria defined");
    });

    it("uses custom evaluator when set", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [makeGoalRow({ success_criteria: ["custom check"] })],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);
      mgr.setCriteriaEvaluator(async () => true);

      const result = await mgr.evaluateGoal("goal-uuid-1");
      expect(result.met).toBe(true);
    });
  });

  describe("row conversion", () => {
    it("handles string JSONB fields", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [makeGoalRow({
          success_criteria: '["a", "b"]',
          source_trust: "0.75",
        })],
        columns: [],
      });
      const adapter = makeMockAdapter(exec);
      const mgr = new PgGoalManager(adapter);

      const goal = await mgr.getGoalById("goal-uuid-1");
      expect(goal!.successCriteria).toEqual(["a", "b"]);
      expect(goal!.sourceTrust).toBe(0.75);
    });
  });
});
