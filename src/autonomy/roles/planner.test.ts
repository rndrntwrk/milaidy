import { describe, expect, it, vi } from "vitest";
import type { Goal, GoalManager } from "../goals/manager.js";
import type { ToolRegistryInterface } from "../tools/types.js";
import { GoalDrivenPlanner } from "./planner.js";
import type { PlanRequest } from "./types.js";

function createMockGoalManager(overrides?: Partial<GoalManager>): GoalManager {
  let idCounter = 0;
  return {
    addGoal: vi.fn(async (goalData) => ({
      id: `goal-${++idCounter}`,
      ...goalData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })) as unknown as GoalManager["addGoal"],
    updateGoal: vi.fn(async () => ({}) as Goal),
    getActiveGoals: vi.fn(async () => []),
    getGoalTree: vi.fn(async () => []),
    getGoalById: vi.fn(async () => undefined),
    evaluateGoal: vi.fn(async () => ({
      goalId: "x",
      complete: false,
      criteriaResults: [],
    })),
    ...overrides,
  };
}

function createMockToolRegistry(
  knownTools: string[] = [],
): ToolRegistryInterface {
  return {
    register: vi.fn(),
    get: vi.fn((name) =>
      knownTools.includes(name) ? ({ name } as any) : undefined,
    ),
    getAll: vi.fn(() => []),
    getByRiskClass: vi.fn(() => []),
    getByTag: vi.fn(() => []),
    has: vi.fn((name) => knownTools.includes(name)),
    unregister: vi.fn(() => false),
  };
}

describe("GoalDrivenPlanner", () => {
  const basicRequest: PlanRequest = {
    description: "Test plan",
    source: "user",
    sourceTrust: 0.9,
  };

  describe("createPlan()", () => {
    it("creates a plan from a simple request", async () => {
      const gm = createMockGoalManager();
      const tr = createMockToolRegistry();
      const planner = new GoalDrivenPlanner(gm, tr);

      const plan = await planner.createPlan(basicRequest);

      expect(plan.id).toBeDefined();
      expect(plan.goals).toHaveLength(1);
      expect(plan.status).toBe("pending");
      expect(plan.createdAt).toBeGreaterThan(0);
    });

    it("creates steps from constraints", async () => {
      const gm = createMockGoalManager();
      const tr = createMockToolRegistry(["RUN_IN_TERMINAL", "GENERATE_IMAGE"]);
      const planner = new GoalDrivenPlanner(gm, tr);

      const plan = await planner.createPlan({
        ...basicRequest,
        constraints: ["RUN_IN_TERMINAL", "GENERATE_IMAGE"],
      });

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].toolName).toBe("RUN_IN_TERMINAL");
      expect(plan.steps[1].toolName).toBe("GENERATE_IMAGE");
      expect(plan.steps[1].dependsOn).toEqual([plan.steps[0].id]);
    });

    it("trust-gates plan creation through GoalManager", async () => {
      const gm = createMockGoalManager({
        addGoal: vi.fn(async () => {
          throw new Error("Trust floor not met");
        }) as unknown as GoalManager["addGoal"],
      });
      const tr = createMockToolRegistry();
      const planner = new GoalDrivenPlanner(gm, tr);

      await expect(
        planner.createPlan({
          ...basicRequest,
          sourceTrust: 0.1,
        }),
      ).rejects.toThrow("Trust floor not met");
    });

    it("plan has correct structure (id, goals, steps)", async () => {
      const gm = createMockGoalManager();
      const tr = createMockToolRegistry();
      const planner = new GoalDrivenPlanner(gm, tr);

      const plan = await planner.createPlan(basicRequest);

      expect(typeof plan.id).toBe("string");
      expect(Array.isArray(plan.goals)).toBe(true);
      expect(Array.isArray(plan.steps)).toBe(true);
      expect(typeof plan.createdAt).toBe("number");
      expect(plan.status).toBe("pending");
    });
  });

  describe("validatePlan()", () => {
    it("validates step count limits", async () => {
      const gm = createMockGoalManager();
      const tr = createMockToolRegistry(["tool1"]);
      const planner = new GoalDrivenPlanner(gm, tr, { maxPlanSteps: 2 });

      const plan = await planner.createPlan({
        ...basicRequest,
        constraints: ["tool1", "tool1", "tool1"],
      });

      const validation = await planner.validatePlan(plan);
      expect(validation.valid).toBe(false);
      expect(validation.issues.some((i) => i.includes("exceeding max"))).toBe(
        true,
      );
    });

    it("validates tool names against registry", async () => {
      const gm = createMockGoalManager();
      const tr = createMockToolRegistry(["KNOWN_TOOL"]);
      const planner = new GoalDrivenPlanner(gm, tr);

      const plan = await planner.createPlan({
        ...basicRequest,
        constraints: ["UNKNOWN_TOOL"],
      });

      const validation = await planner.validatePlan(plan);
      expect(validation.valid).toBe(false);
      expect(validation.issues.some((i) => i.includes("unknown tool"))).toBe(
        true,
      );
    });

    it("passes valid plan", async () => {
      const gm = createMockGoalManager();
      const tr = createMockToolRegistry(["RUN_IN_TERMINAL"]);
      const planner = new GoalDrivenPlanner(gm, tr);

      const plan = await planner.createPlan({
        ...basicRequest,
        constraints: ["RUN_IN_TERMINAL"],
      });

      const validation = await planner.validatePlan(plan);
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });
  });

  describe("lifecycle", () => {
    it("cancelPlan clears active plan", async () => {
      const gm = createMockGoalManager();
      const tr = createMockToolRegistry();
      const planner = new GoalDrivenPlanner(gm, tr);

      await planner.createPlan(basicRequest);
      expect(planner.getActivePlan()).not.toBeNull();

      await planner.cancelPlan("no longer needed");
      expect(planner.getActivePlan()).toBeNull();
    });

    it("getActivePlan returns null when no plan active", () => {
      const gm = createMockGoalManager();
      const tr = createMockToolRegistry();
      const planner = new GoalDrivenPlanner(gm, tr);

      expect(planner.getActivePlan()).toBeNull();
    });

    it("only one active plan at a time", async () => {
      const gm = createMockGoalManager();
      const tr = createMockToolRegistry();
      const planner = new GoalDrivenPlanner(gm, tr);

      const plan1 = await planner.createPlan(basicRequest);
      const plan2 = await planner.createPlan({
        ...basicRequest,
        description: "Second",
      });

      expect(planner.getActivePlan()!.id).toBe(plan2.id);
      expect(plan1.id).not.toBe(plan2.id);
    });
  });
});
