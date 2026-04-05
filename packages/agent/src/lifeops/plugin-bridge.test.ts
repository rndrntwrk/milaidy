import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateTodoDataService,
  mockCreateGoalDataService,
  todoDataService,
  goalDataService,
} = vi.hoisted(() => {
  const todoDataService = {
    createTodo: vi.fn(),
    getTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
    addTags: vi.fn(),
    removeTags: vi.fn(),
  };
  const goalDataService = {
    createGoal: vi.fn(),
    getGoal: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
  };
  return {
    mockCreateTodoDataService: vi.fn(() => todoDataService),
    mockCreateGoalDataService: vi.fn(() => goalDataService),
    todoDataService,
    goalDataService,
  };
});

vi.mock("@elizaos/plugin-todo", () => ({
  createTodoDataService: mockCreateTodoDataService,
}));

vi.mock("@elizaos/plugin-goals", () => ({
  createGoalDataService: mockCreateGoalDataService,
}));

import {
  syncAgentDefinitionTodoMirror,
  syncAgentGoalMirror,
} from "./plugin-bridge.js";

describe("lifeops plugin bridge", () => {
  beforeEach(() => {
    mockCreateTodoDataService.mockClear();
    mockCreateGoalDataService.mockClear();
    todoDataService.createTodo.mockReset();
    todoDataService.getTodo.mockReset();
    todoDataService.updateTodo.mockReset();
    todoDataService.deleteTodo.mockReset();
    todoDataService.addTags.mockReset();
    todoDataService.removeTags.mockReset();
    goalDataService.createGoal.mockReset();
    goalDataService.getGoal.mockReset();
    goalDataService.updateGoal.mockReset();
    goalDataService.deleteGoal.mockReset();
  });

  it("creates a mirrored plugin-todo record for agent-scoped lifeops definitions", async () => {
    todoDataService.getTodo.mockResolvedValue(null);
    todoDataService.createTodo.mockResolvedValue("todo-mirror-1");

    const definition = await syncAgentDefinitionTodoMirror({
      runtime: {
        agentId: "agent-1",
      } as never,
      previous: null,
      definition: {
        id: "definition-1",
        agentId: "agent-1",
        domain: "agent_ops",
        subjectType: "agent",
        subjectId: "agent-1",
        visibilityScope: "agent_and_admin",
        contextPolicy: "never",
        kind: "routine",
        title: "Review agent queue",
        description: "Internal recurring ops task",
        originalIntent: "Review agent queue",
        timezone: "UTC",
        status: "active",
        priority: 2,
        cadence: {
          kind: "times_per_day",
          slots: [
            { key: "am", label: "AM", minuteOfDay: 540, durationMinutes: 15 },
            { key: "pm", label: "PM", minuteOfDay: 1020, durationMinutes: 15 },
          ],
        },
        windowPolicy: { timezone: "UTC", windows: [] },
        progressionRule: { kind: "none" },
        reminderPlanId: null,
        goalId: null,
        source: "manual",
        metadata: {},
        createdAt: "2026-04-04T15:00:00.000Z",
        updatedAt: "2026-04-04T15:00:00.000Z",
      },
      occurrences: [
        {
          id: "occurrence-1",
          agentId: "agent-1",
          domain: "agent_ops",
          subjectType: "agent",
          subjectId: "agent-1",
          visibilityScope: "agent_and_admin",
          contextPolicy: "never",
          definitionId: "definition-1",
          occurrenceKey: "definition-1:am",
          scheduledAt: "2026-04-04T16:00:00.000Z",
          dueAt: "2026-04-04T16:00:00.000Z",
          relevanceStartAt: "2026-04-04T15:45:00.000Z",
          relevanceEndAt: "2026-04-04T16:30:00.000Z",
          windowName: "morning",
          state: "pending",
          snoozedUntil: null,
          completionPayload: null,
          derivedTarget: null,
          metadata: {},
          createdAt: "2026-04-04T15:00:00.000Z",
          updatedAt: "2026-04-04T15:00:00.000Z",
        },
      ],
    });

    expect(todoDataService.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        entityId: "agent-1",
        name: "Review agent queue",
        type: "daily",
      }),
    );
    expect(
      (definition.metadata.pluginTodoMirror as { externalId: string }).externalId,
    ).toBe("todo-mirror-1");
  });

  it("removes mirrored plugin-todo state when a definition leaves agent scope", async () => {
    const definition = await syncAgentDefinitionTodoMirror({
      runtime: {
        agentId: "agent-1",
      } as never,
      previous: {
        id: "definition-1",
        agentId: "agent-1",
        domain: "agent_ops",
        subjectType: "agent",
        subjectId: "agent-1",
        visibilityScope: "agent_and_admin",
        contextPolicy: "never",
        kind: "task",
        title: "Old",
        description: "",
        originalIntent: "Old",
        timezone: "UTC",
        status: "active",
        priority: 3,
        cadence: { kind: "once", dueAt: "2026-04-04T16:00:00.000Z" },
        windowPolicy: { timezone: "UTC", windows: [] },
        progressionRule: { kind: "none" },
        reminderPlanId: null,
        goalId: null,
        source: "manual",
        metadata: {
          pluginTodoMirror: {
            externalId: "todo-mirror-1",
            hiddenFromWorkbench: true,
            syncedAt: "2026-04-04T15:00:00.000Z",
          },
        },
        createdAt: "2026-04-04T15:00:00.000Z",
        updatedAt: "2026-04-04T15:00:00.000Z",
      },
      definition: {
        id: "definition-1",
        agentId: "agent-1",
        domain: "user_lifeops",
        subjectType: "owner",
        subjectId: "owner-1",
        visibilityScope: "owner_agent_admin",
        contextPolicy: "explicit_only",
        kind: "task",
        title: "Owner task",
        description: "",
        originalIntent: "Owner task",
        timezone: "UTC",
        status: "active",
        priority: 3,
        cadence: { kind: "once", dueAt: "2026-04-04T16:00:00.000Z" },
        windowPolicy: { timezone: "UTC", windows: [] },
        progressionRule: { kind: "none" },
        reminderPlanId: null,
        goalId: null,
        source: "manual",
        metadata: {
          pluginTodoMirror: {
            externalId: "todo-mirror-1",
            hiddenFromWorkbench: true,
            syncedAt: "2026-04-04T15:00:00.000Z",
          },
        },
        createdAt: "2026-04-04T15:00:00.000Z",
        updatedAt: "2026-04-04T15:10:00.000Z",
      },
      occurrences: [],
    });

    expect(todoDataService.deleteTodo).toHaveBeenCalledWith("todo-mirror-1");
    expect(definition.metadata.pluginTodoMirror).toBeUndefined();
  });

  it("creates a mirrored plugin-goals record for agent goals", async () => {
    goalDataService.getGoal.mockResolvedValue(null);
    goalDataService.createGoal.mockResolvedValue("goal-mirror-1");

    const goal = await syncAgentGoalMirror({
      runtime: {
        agentId: "agent-1",
      } as never,
      previous: null,
      goal: {
        id: "goal-1",
        agentId: "agent-1",
        domain: "agent_ops",
        subjectType: "agent",
        subjectId: "agent-1",
        visibilityScope: "agent_and_admin",
        contextPolicy: "never",
        title: "Keep agent ops tidy",
        description: "Agent-private long-term objective",
        cadence: null,
        supportStrategy: {},
        successCriteria: {},
        status: "active",
        reviewState: "needs_attention",
        metadata: {},
        createdAt: "2026-04-04T15:00:00.000Z",
        updatedAt: "2026-04-04T15:00:00.000Z",
      },
    });

    expect(goalDataService.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        ownerType: "agent",
        ownerId: "agent-1",
        name: "Keep agent ops tidy",
      }),
    );
    expect(
      (goal.metadata.pluginGoalMirror as { externalId: string }).externalId,
    ).toBe("goal-mirror-1");
  });
});
