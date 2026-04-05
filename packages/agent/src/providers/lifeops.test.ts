import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCheckSenderRole, mockGetOverview } = vi.hoisted(() => ({
  mockCheckSenderRole: vi.fn(),
  mockGetOverview: vi.fn(),
}));

vi.mock("@miladyai/plugin-roles", () => ({
  checkSenderRole: mockCheckSenderRole,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsService: class {
    getOverview = mockGetOverview;
  },
}));

import { lifeOpsProvider } from "./lifeops";

describe("lifeOpsProvider", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
    mockGetOverview.mockReset();
    mockCheckSenderRole.mockResolvedValue({
      entityId: "owner-1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });
    mockGetOverview.mockResolvedValue({
      owner: {
        occurrences: [{ title: "Pay rent", state: "visible" }],
        goals: [{ title: "Keep finances clean" }],
        reminders: [],
        summary: {
          activeOccurrenceCount: 1,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeReminderCount: 0,
          activeGoalCount: 1,
        },
      },
      agentOps: {
        occurrences: [{ title: "Review plugin health", state: "visible" }],
        goals: [],
        reminders: [],
        summary: {
          activeOccurrenceCount: 1,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeReminderCount: 0,
          activeGoalCount: 0,
        },
      },
    });
  });

  it("returns empty output for non-admin callers", async () => {
    mockCheckSenderRole.mockResolvedValue({
      entityId: "user-1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "user-1",
        content: {
          source: "client_chat",
          text: "show my todos",
        },
      } as never,
      {} as never,
    );

    expect(result).toEqual({
      text: "",
      values: {},
      data: {},
    });
  });

  it("summarizes owner and agent lifeops for admin chat", async () => {
    const result = await lifeOpsProvider.get(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: {
          source: "client_chat",
          text: "what's on deck?",
        },
      } as never,
      {} as never,
    );

    expect(result.text).toContain("Use MANAGE_LIFEOPS");
    expect(result.text).toContain("Owner open occurrences: 1");
    expect(result.text).toContain("Pay rent");
    expect(result.text).toContain("Review plugin health");
    expect(result.values).toMatchObject({
      ownerOpenOccurrences: 1,
      ownerActiveGoals: 1,
      agentOpenOccurrences: 1,
    });
  });
});
