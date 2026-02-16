/**
 * GoalDrivenPlanner — PlannerRole implementation.
 *
 * Creates execution plans by decomposing requests into goal-backed steps,
 * validates plans against the tool registry, and trust-gates plan creation
 * through the GoalManager's existing trust floors.
 *
 * @module autonomy/roles/planner
 */

import type { Goal, GoalManager } from "../goals/manager.js";
import type { ToolRegistryInterface } from "../tools/types.js";
import type {
  ExecutionPlan,
  PlannerRole,
  PlanRequest,
  PlanStep,
  PlanValidation,
} from "./types.js";

/**
 * Configuration for the planner.
 */
export interface PlannerConfig {
  /** Maximum number of steps in a plan (default: 20). */
  maxPlanSteps?: number;
  /** Auto-approve plans with 3 or fewer steps (default: false). */
  autoApproveSimplePlans?: boolean;
}

let _planIdCounter = 0;
let _stepIdCounter = 0;

function nextPlanId(): string {
  return `plan-${++_planIdCounter}`;
}

function nextStepId(): string {
  return `step-${++_stepIdCounter}`;
}

/**
 * Maps a ToolCallSource to a GoalManager source type.
 */
function mapSourceToGoalSource(source: string): "user" | "system" | "agent" {
  if (source === "user") return "user";
  if (source === "system") return "system";
  return "agent";
}

export class GoalDrivenPlanner implements PlannerRole {
  private activePlan: ExecutionPlan | null = null;

  constructor(
    private readonly goalManager: GoalManager,
    private readonly toolRegistry: ToolRegistryInterface,
    private readonly config?: PlannerConfig,
  ) {}

  async createPlan(request: PlanRequest): Promise<ExecutionPlan> {
    // Cancel any existing plan
    if (this.activePlan) {
      await this.cancelPlan("Replaced by new plan");
    }

    // Create a root goal through GoalManager (trust-gated)
    const rootGoal = await this.goalManager.addGoal({
      description: request.description,
      priority: "medium",
      status: "active",
      successCriteria: [`Plan for: ${request.description}`],
      source: mapSourceToGoalSource(request.source),
      sourceTrust: request.sourceTrust,
    });

    // Build plan steps from constraints (one step per constraint/tool hint)
    const steps: PlanStep[] = [];
    const goals: Goal[] = [rootGoal];

    if (request.constraints && request.constraints.length > 0) {
      for (const constraint of request.constraints) {
        const step: PlanStep = {
          id: nextStepId(),
          toolName: constraint,
          params: {},
          dependsOn:
            steps.length > 0 ? [steps[steps.length - 1].id] : undefined,
        };
        steps.push(step);
      }
    }

    const plan: ExecutionPlan = {
      id: nextPlanId(),
      goals,
      steps,
      createdAt: Date.now(),
      status: "pending",
    };

    this.activePlan = plan;
    return plan;
  }

  async validatePlan(plan: ExecutionPlan): Promise<PlanValidation> {
    const issues: string[] = [];
    const maxSteps = this.config?.maxPlanSteps ?? 20;

    // Check step count
    if (plan.steps.length > maxSteps) {
      issues.push(
        `Plan has ${plan.steps.length} steps, exceeding max of ${maxSteps}`,
      );
    }

    // Check tool names against registry
    for (const step of plan.steps) {
      if (!this.toolRegistry.has(step.toolName)) {
        issues.push(
          `Step "${step.id}" references unknown tool "${step.toolName}"`,
        );
      }
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const stepMap = new Map(plan.steps.map((s) => [s.id, s]));

    const hasCycle = (stepId: string): boolean => {
      if (visiting.has(stepId)) return true;
      if (visited.has(stepId)) return false;
      visiting.add(stepId);
      const step = stepMap.get(stepId);
      if (step?.dependsOn) {
        for (const dep of step.dependsOn) {
          if (hasCycle(dep)) return true;
        }
      }
      visiting.delete(stepId);
      visited.add(stepId);
      return false;
    };

    for (const step of plan.steps) {
      if (hasCycle(step.id)) {
        issues.push("Plan contains circular dependencies");
        break;
      }
    }

    // Check that all params are serializable
    for (const step of plan.steps) {
      try {
        JSON.stringify(step.params);
      } catch {
        issues.push(`Step "${step.id}" has non-serializable params`);
      }
    }

    return { valid: issues.length === 0, issues };
  }

  getActivePlan(): ExecutionPlan | null {
    return this.activePlan;
  }

  async cancelPlan(reason: string): Promise<void> {
    if (this.activePlan) {
      this.activePlan.status = "rejected";
      this.activePlan = null;
    }
  }
}
