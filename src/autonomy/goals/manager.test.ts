/**
 * Tests for autonomy/goals/manager.ts
 *
 * Exercises:
 *   - Goal CRUD operations
 *   - Trust-gated agent goal creation
 *   - Hierarchical goal trees
 *   - Goal evaluation and auto-completion
 *   - Parent cascading completion
 *   - Capacity management
 */

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryGoalManager } from "./manager.js";
import type { Goal } from "./manager.js";

type GoalInput = Omit<Goal, "id" | "createdAt" | "updatedAt">;

function makeGoalInput(overrides: Partial<GoalInput> = {}): GoalInput {
  return {
    description: "Test goal",
    priority: "medium",
    status: "active",
    successCriteria: ["Criterion is done"],
    source: "user",
    sourceTrust: 0.9,
    ...overrides,
  };
}

describe("InMemoryGoalManager", () => {
  let manager: InMemoryGoalManager;

  beforeEach(() => {
    manager = new InMemoryGoalManager();
  });

  describe("addGoal", () => {
    it("creates a goal with auto-generated id and timestamps", async () => {
      const goal = await manager.addGoal(makeGoalInput({
        description: "Write documentation",
      }));

      expect(goal.id).toBeDefined();
      expect(goal.id.length).toBeGreaterThan(0);
      expect(goal.description).toBe("Write documentation");
      expect(goal.createdAt).toBeLessThanOrEqual(Date.now());
      expect(goal.updatedAt).toBeLessThanOrEqual(Date.now());
    });

    it("rejects low-trust agent-proposed goals", async () => {
      await expect(
        manager.addGoal(makeGoalInput({
          source: "agent",
          sourceTrust: 0.3, // Below 0.6 floor
        })),
      ).rejects.toThrow("below floor");
    });

    it("allows high-trust agent-proposed goals", async () => {
      const goal = await manager.addGoal(makeGoalInput({
        source: "agent",
        sourceTrust: 0.8,
      }));

      expect(goal.source).toBe("agent");
    });

    it("allows user goals regardless of trust", async () => {
      const goal = await manager.addGoal(makeGoalInput({
        source: "user",
        sourceTrust: 0.1,
      }));

      expect(goal.source).toBe("user");
    });

    it("validates parent goal exists", async () => {
      await expect(
        manager.addGoal(makeGoalInput({
          parentGoalId: "non-existent",
        })),
      ).rejects.toThrow("not found");
    });

    it("accepts valid parent goal reference", async () => {
      const parent = await manager.addGoal(makeGoalInput({
        description: "Parent goal",
      }));

      const child = await manager.addGoal(makeGoalInput({
        description: "Child goal",
        parentGoalId: parent.id,
      }));

      expect(child.parentGoalId).toBe(parent.id);
    });
  });

  describe("updateGoal", () => {
    it("updates mutable fields", async () => {
      const goal = await manager.addGoal(makeGoalInput());
      const updated = await manager.updateGoal(goal.id, {
        status: "paused",
        description: "Updated description",
      });

      expect(updated.status).toBe("paused");
      expect(updated.description).toBe("Updated description");
      expect(updated.updatedAt).toBeGreaterThanOrEqual(goal.updatedAt);
    });

    it("sets completedAt when completing", async () => {
      const goal = await manager.addGoal(makeGoalInput());
      const completed = await manager.updateGoal(goal.id, {
        status: "completed",
      });

      expect(completed.completedAt).toBeDefined();
      expect(completed.completedAt).toBeLessThanOrEqual(Date.now());
    });

    it("throws for non-existent goal", async () => {
      await expect(
        manager.updateGoal("non-existent", { status: "paused" }),
      ).rejects.toThrow("not found");
    });
  });

  describe("getActiveGoals", () => {
    it("returns only active goals sorted by priority", async () => {
      await manager.addGoal(makeGoalInput({ priority: "low", status: "active" }));
      await manager.addGoal(makeGoalInput({ priority: "critical", status: "active" }));
      await manager.addGoal(makeGoalInput({ priority: "high", status: "completed" }));
      await manager.addGoal(makeGoalInput({ priority: "medium", status: "active" }));

      const active = await manager.getActiveGoals();

      expect(active).toHaveLength(3);
      expect(active[0].priority).toBe("critical");
      expect(active[1].priority).toBe("medium");
      expect(active[2].priority).toBe("low");
    });

    it("returns empty array when no active goals", async () => {
      await manager.addGoal(makeGoalInput({ status: "completed" }));
      const active = await manager.getActiveGoals();
      expect(active).toHaveLength(0);
    });
  });

  describe("getGoalTree", () => {
    it("returns full goal hierarchy", async () => {
      const root = await manager.addGoal(makeGoalInput({
        description: "Root",
      }));
      const child1 = await manager.addGoal(makeGoalInput({
        description: "Child 1",
        parentGoalId: root.id,
      }));
      await manager.addGoal(makeGoalInput({
        description: "Child 2",
        parentGoalId: root.id,
      }));
      await manager.addGoal(makeGoalInput({
        description: "Grandchild",
        parentGoalId: child1.id,
      }));

      const tree = await manager.getGoalTree(root.id);

      expect(tree).toHaveLength(4);
      expect(tree[0].description).toBe("Root");
    });

    it("returns empty array for non-existent root", async () => {
      const tree = await manager.getGoalTree("non-existent");
      expect(tree).toHaveLength(0);
    });
  });

  describe("getGoalById", () => {
    it("returns the goal if found", async () => {
      const created = await manager.addGoal(makeGoalInput({
        description: "Find me",
      }));

      const found = await manager.getGoalById(created.id);
      expect(found).toBeDefined();
      expect(found!.description).toBe("Find me");
    });

    it("returns undefined for non-existent id", async () => {
      const found = await manager.getGoalById("non-existent");
      expect(found).toBeUndefined();
    });

    it("returns a copy (not a reference)", async () => {
      const created = await manager.addGoal(makeGoalInput());
      const found = await manager.getGoalById(created.id);

      found!.description = "mutated";
      const refetched = await manager.getGoalById(created.id);
      expect(refetched!.description).not.toBe("mutated");
    });
  });

  describe("evaluateGoal", () => {
    it("evaluates criteria with 'done' keyword as met", async () => {
      const goal = await manager.addGoal(makeGoalInput({
        successCriteria: ["Task is done", "Feature verified"],
      }));

      const result = await manager.evaluateGoal(goal.id);

      expect(result.met).toBe(true);
      expect(result.evidence.some((e) => e.startsWith("PASS"))).toBe(true);
    });

    it("evaluates criteria with 'TODO' as not met", async () => {
      const goal = await manager.addGoal(makeGoalInput({
        successCriteria: ["TODO: implement feature"],
      }));

      const result = await manager.evaluateGoal(goal.id);

      expect(result.met).toBe(false);
      expect(result.evidence.some((e) => e.startsWith("FAIL"))).toBe(true);
    });

    it("auto-completes goal when all criteria met", async () => {
      const goal = await manager.addGoal(makeGoalInput({
        successCriteria: ["Task is done", "Feature is complete"],
      }));

      await manager.evaluateGoal(goal.id);

      const updated = await manager.getGoalById(goal.id);
      expect(updated!.status).toBe("completed");
      expect(updated!.completedAt).toBeDefined();
    });

    it("returns false for goals with no criteria", async () => {
      const goal = await manager.addGoal(makeGoalInput({
        successCriteria: [],
      }));

      const result = await manager.evaluateGoal(goal.id);
      expect(result.met).toBe(false);
    });

    it("throws for non-existent goal", async () => {
      await expect(manager.evaluateGoal("non-existent")).rejects.toThrow("not found");
    });

    it("uses custom criteria evaluator when set", async () => {
      manager.setCriteriaEvaluator(async (criterion) => {
        return criterion.includes("pass");
      });

      const goal = await manager.addGoal(makeGoalInput({
        successCriteria: ["This should pass", "This should fail"],
      }));

      const result = await manager.evaluateGoal(goal.id);
      expect(result.met).toBe(false); // One fails
      expect(result.evidence.filter((e) => e.startsWith("PASS"))).toHaveLength(1);
      expect(result.evidence.filter((e) => e.startsWith("FAIL"))).toHaveLength(1);
    });
  });

  describe("getStatusCounts", () => {
    it("counts goals by status", async () => {
      await manager.addGoal(makeGoalInput({ status: "active" }));
      await manager.addGoal(makeGoalInput({ status: "active" }));
      await manager.addGoal(makeGoalInput({ status: "completed" }));
      await manager.addGoal(makeGoalInput({ status: "failed" }));

      const counts = manager.getStatusCounts();
      expect(counts.active).toBe(2);
      expect(counts.completed).toBe(1);
      expect(counts.failed).toBe(1);
      expect(counts.paused).toBe(0);
    });
  });

  describe("capacity management", () => {
    it("throws when at capacity with no prunable goals", async () => {
      const small = new InMemoryGoalManager({ maxGoals: 2 });
      await small.addGoal(makeGoalInput({ status: "active" }));
      await small.addGoal(makeGoalInput({ status: "active" }));

      await expect(
        small.addGoal(makeGoalInput({ status: "active" })),
      ).rejects.toThrow("capacity");
    });

    it("prunes completed goals to make room", async () => {
      const small = new InMemoryGoalManager({ maxGoals: 3 });
      await small.addGoal(makeGoalInput({ status: "completed" }));
      await small.addGoal(makeGoalInput({ status: "completed" }));
      await small.addGoal(makeGoalInput({ status: "active" }));

      // Should prune oldest completed to make room
      const newGoal = await small.addGoal(makeGoalInput({ status: "active" }));
      expect(newGoal).toBeDefined();
    });
  });

  describe("clear", () => {
    it("removes all goals", async () => {
      await manager.addGoal(makeGoalInput());
      await manager.addGoal(makeGoalInput());

      manager.clear();

      const all = manager.getAllGoals();
      expect(all).toHaveLength(0);
    });
  });
});
