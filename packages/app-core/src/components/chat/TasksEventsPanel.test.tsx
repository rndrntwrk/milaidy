// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockClient } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClient: {
    completeLifeOpsOccurrence: vi.fn(),
    getLifeOpsOverview: vi.fn(),
    listWorkbenchTodos: vi.fn(),
    skipLifeOpsOccurrence: vi.fn(),
    snoozeLifeOpsOccurrence: vi.fn(),
  },
}));

vi.mock("@miladyai/ui", () => ({
  Badge: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("span", props, children),
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("button", { type: "button", ...props }, children),
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../api", () => ({
  client: mockClient,
}));

import { TasksEventsPanel } from "./TasksEventsPanel";

function flattenText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }
      return flattenText(child);
    })
    .join(" ");
}

describe("TasksEventsPanel", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockClient.completeLifeOpsOccurrence.mockReset();
    mockClient.getLifeOpsOverview.mockReset();
    mockClient.listWorkbenchTodos.mockReset();
    mockClient.skipLifeOpsOccurrence.mockReset();
    mockClient.snoozeLifeOpsOccurrence.mockReset();
    const workbench = {
      todos: [],
      lifeops: {
        occurrences: [
          {
            id: "occ-visible",
            agentId: "agent-1",
            definitionId: "def-1",
            occurrenceKey: "slot:today:current",
            scheduledAt: new Date(Date.now() - 5 * 60_000).toISOString(),
            dueAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            relevanceStartAt: new Date(Date.now() - 15 * 60_000).toISOString(),
            relevanceEndAt: new Date(Date.now() + 60 * 60_000).toISOString(),
            windowName: "Current",
            state: "visible",
            snoozedUntil: null,
            completionPayload: null,
            derivedTarget: null,
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            definitionKind: "routine",
            definitionStatus: "active",
            title: "Current slot check-in",
            description: "Keep the day moving.",
            priority: 2,
            timezone: "UTC",
            source: "manual",
            goalId: "goal-1",
          },
        ],
        goals: [
          {
            id: "goal-1",
            agentId: "agent-1",
            title: "Stay on top of life ops",
            description: "",
            cadence: null,
            supportStrategy: {},
            successCriteria: {},
            status: "active",
            reviewState: "idle",
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        reminders: [
          {
            occurrenceId: "occ-visible",
            definitionId: "def-1",
            title: "Current slot check-in",
            channel: "in_app",
            stepIndex: 0,
            stepLabel: "In-app reminder",
            scheduledFor: new Date(Date.now() - 60_000).toISOString(),
            dueAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            state: "visible",
          },
        ],
        summary: {
          activeOccurrenceCount: 1,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeReminderCount: 1,
          activeGoalCount: 1,
        },
      },
    };
    mockUseApp.mockReturnValue({
      ptySessions: [
        {
          sessionId: "active-1",
          agentType: "codex",
          label: "Worker 1",
          originalTask: "Investigate failing tests",
          workdir: "/tmp/worker-1",
          status: "tool_running",
          decisionCount: 0,
          autoResolvedCount: 0,
          toolDescription: "bun test",
          lastActivity: "Running bun test",
        },
        {
          sessionId: "done-1",
          agentType: "codex",
          label: "Finished worker",
          originalTask: "Already done",
          workdir: "/tmp/worker-done",
          status: "completed",
          decisionCount: 0,
          autoResolvedCount: 0,
        },
      ],
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
      workbench,
    });
    mockClient.listWorkbenchTodos.mockResolvedValue({
      todos: [
        {
          id: "todo-open",
          name: "Write release notes",
          description: "Summarize the widget bar change",
          priority: 1,
          isUrgent: true,
          isCompleted: false,
          type: "task",
        },
        {
          id: "todo-done",
          name: "Ship patch",
          description: "Already done",
          priority: null,
          isUrgent: false,
          isCompleted: true,
          type: "task",
        },
      ],
    });
    mockClient.getLifeOpsOverview.mockResolvedValue(workbench.lifeops);
    mockClient.completeLifeOpsOccurrence.mockResolvedValue({
      occurrence: {
        id: "occ-visible",
        state: "completed",
      },
    });
    mockClient.skipLifeOpsOccurrence.mockResolvedValue({
      occurrence: {
        id: "occ-visible",
        state: "skipped",
      },
    });
    mockClient.snoozeLifeOpsOccurrence.mockResolvedValue({
      occurrence: {
        id: "occ-visible",
        state: "snoozed",
      },
    });
  });

  it("shows open todos, ongoing orchestrator sessions, and recent events", async () => {
    const clearEvents = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents,
          events: [
            {
              id: "evt-1",
              timestamp: Date.now(),
              eventType: "task_registered",
              summary: "Task started: Worker 1",
            },
          ],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const text = flattenText(tree.root).toLowerCase();
    expect(mockClient.listWorkbenchTodos.mock.calls.length).toBeGreaterThan(0);
    expect(mockClient.getLifeOpsOverview.mock.calls.length).toBeGreaterThan(0);
    expect(text).toContain("current slot check-in");
    expect(text).toContain("in-app reminder");
    expect(text).toContain("write release notes");
    expect(text).not.toContain("ship patch");
    expect(text).toContain("worker 1");
    expect(text).not.toContain("finished worker");
    expect(text).toContain("task started: worker 1");
  });

  it("runs life-ops occurrence actions from the panel", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents: vi.fn(),
          events: [],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const doneButton = tree.root
      .findAllByType("button")
      .find((button) => flattenText(button).includes("Done"));
    expect(doneButton).toBeDefined();

    await act(async () => {
      doneButton?.props.onClick();
      await Promise.resolve();
    });

    expect(mockClient.completeLifeOpsOccurrence).toHaveBeenCalledWith(
      "occ-visible",
      {},
    );
  });
});
