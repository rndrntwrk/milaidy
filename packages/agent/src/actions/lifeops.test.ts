import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckSenderRole,
  mockListDefinitions,
  mockListGoals,
  mockGetOverview,
  mockCreateDefinition,
  mockReviewGoal,
} = vi.hoisted(() => ({
  mockCheckSenderRole: vi.fn(),
  mockListDefinitions: vi.fn(),
  mockListGoals: vi.fn(),
  mockGetOverview: vi.fn(),
  mockCreateDefinition: vi.fn(),
  mockReviewGoal: vi.fn(),
}));

vi.mock("@miladyai/plugin-roles", () => ({
  checkSenderRole: mockCheckSenderRole,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsService: class {
    listDefinitions = mockListDefinitions;
    listGoals = mockListGoals;
    getOverview = mockGetOverview;
    createDefinition = mockCreateDefinition;
    reviewGoal = mockReviewGoal;
  },
}));

import { manageLifeOpsAction } from "./lifeops";

describe("manageLifeOpsAction", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
    mockListDefinitions.mockReset();
    mockListGoals.mockReset();
    mockGetOverview.mockReset();
    mockCreateDefinition.mockReset();
    mockReviewGoal.mockReset();
    mockCheckSenderRole.mockResolvedValue({
      entityId: "owner-1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });
  });

  it("rejects non-admin callers during validation", async () => {
    mockCheckSenderRole.mockResolvedValue({
      entityId: "user-1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const valid = await manageLifeOpsAction.validate?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "user-1",
        content: {
          source: "client_chat",
          text: "remind me to stretch every morning",
        },
      } as never,
      {} as never,
    );

    expect(valid).toBe(false);
  });

  it("creates owner lifeops definitions from chat requests", async () => {
    mockListGoals.mockResolvedValue([]);
    mockCreateDefinition.mockResolvedValue({
      definition: {
        id: "definition-1",
        title: "Stretch",
        cadence: {
          kind: "daily",
          windows: ["morning"],
        },
      },
      reminderPlan: null,
    });

    const result = await manageLifeOpsAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: {
          source: "client_chat",
          text: "remind me to stretch every morning",
        },
      } as never,
      {} as never,
      {
        parameters: {
          operation: "create_definition",
          kind: "habit",
          title: "Stretch",
          cadence: {
            kind: "daily",
            windows: ["morning"],
          },
        },
      } as never,
    );

    expect(mockCreateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        ownership: {
          domain: "user_lifeops",
          subjectType: "owner",
        },
        title: "Stretch",
        kind: "habit",
        source: "chat",
        originalIntent: "remind me to stretch every morning",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining('Saved "Stretch"'),
    });
  });

  it("reviews a goal by conversational title", async () => {
    mockListGoals.mockResolvedValue([
      {
        goal: {
          id: "goal-1",
          title: "Stay healthy",
          domain: "user_lifeops",
        },
        links: [],
      },
    ]);
    mockReviewGoal.mockResolvedValue({
      goal: {
        id: "goal-1",
        title: "Stay healthy",
        reviewState: "on_track",
      },
      summary: {
        explanation: "This goal is on track because 2 linked support items were completed in the last 7 days.",
      },
    });

    const result = await manageLifeOpsAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: {
          source: "client_chat",
          text: "how am I doing on my stay healthy goal?",
        },
      } as never,
      {} as never,
      {
        parameters: {
          operation: "review_goal",
          targetTitle: "Stay healthy",
        },
      } as never,
    );

    expect(mockReviewGoal).toHaveBeenCalledWith("goal-1");
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("on track"),
    });
  });
});
