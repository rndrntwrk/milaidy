import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckSenderRole,
  mockListDefinitions,
  mockListGoals,
  mockGetOverview,
  mockCreateDefinition,
  mockReviewGoal,
  mockCapturePhoneConsent,
  mockUpdateDefinition,
  mockDeleteDefinition,
  mockDeleteGoal,
} = vi.hoisted(() => ({
  mockCheckSenderRole: vi.fn(),
  mockListDefinitions: vi.fn(),
  mockListGoals: vi.fn(),
  mockGetOverview: vi.fn(),
  mockCreateDefinition: vi.fn(),
  mockReviewGoal: vi.fn(),
  mockCapturePhoneConsent: vi.fn(),
  mockUpdateDefinition: vi.fn(),
  mockDeleteDefinition: vi.fn(),
  mockDeleteGoal: vi.fn(),
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
    capturePhoneConsent = mockCapturePhoneConsent;
    updateDefinition = mockUpdateDefinition;
    deleteDefinition = mockDeleteDefinition;
    deleteGoal = mockDeleteGoal;
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
    mockCapturePhoneConsent.mockReset();
    mockUpdateDefinition.mockReset();
    mockDeleteDefinition.mockReset();
    mockDeleteGoal.mockReset();
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

  it("captures a phone number with SMS consent", async () => {
    mockCapturePhoneConsent.mockResolvedValue({
      phoneNumber: "+15551234567",
      policies: [
        { channelType: "sms", allowEscalation: true },
        { channelType: "voice", allowEscalation: false },
      ],
    });

    const result = await manageLifeOpsAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: {
          source: "client_chat",
          text: "my phone number is 555-123-4567, you can text me",
        },
      } as never,
      {} as never,
      {
        parameters: {
          operation: "capture_phone",
          phoneNumber: "+15551234567",
          allowSms: true,
          allowVoice: false,
        },
      } as never,
    );

    expect(mockCapturePhoneConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: "+15551234567",
        consentGiven: true,
        allowSms: true,
        allowVoice: false,
        privacyClass: "private",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("+15551234567"),
    });
  });

  it("configures a reminder plan with escalation steps", async () => {
    mockListDefinitions.mockResolvedValue([
      {
        definition: {
          id: "def-1",
          title: "Brush teeth",
          domain: "user_lifeops",
        },
      },
    ]);
    mockUpdateDefinition.mockResolvedValue({
      definition: {
        id: "def-1",
        title: "Brush teeth",
      },
    });

    const result = await manageLifeOpsAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: {
          source: "client_chat",
          text: "text me if I ignore the brushing reminder",
        },
      } as never,
      {} as never,
      {
        parameters: {
          operation: "configure_reminder_plan",
          targetTitle: "Brush teeth",
          escalationSteps: [
            { channel: "in_app", offsetMinutes: 0, label: "In-app reminder" },
            { channel: "sms", offsetMinutes: 15, label: "SMS if not acknowledged" },
          ],
        },
      } as never,
    );

    expect(mockUpdateDefinition).toHaveBeenCalledWith(
      "def-1",
      expect.objectContaining({
        reminderPlan: expect.objectContaining({
          steps: [
            { channel: "in_app", offsetMinutes: 0, label: "In-app reminder" },
            { channel: "sms", offsetMinutes: 15, label: "SMS if not acknowledged" },
          ],
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Brush teeth"),
    });
  });

  it("returns error when capture_phone has no phone number", async () => {
    const result = await manageLifeOpsAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: { source: "client_chat", text: "save my phone" },
      } as never,
      {} as never,
      {
        parameters: {
          operation: "capture_phone",
        },
      } as never,
    );

    expect(result).toMatchObject({
      success: false,
      text: expect.stringContaining("phone number is required"),
    });
  });

  it("deletes a definition by title", async () => {
    mockListDefinitions.mockResolvedValue([
      {
        definition: {
          id: "def-1",
          title: "Brush teeth",
          domain: "user_lifeops",
        },
      },
    ]);
    mockDeleteDefinition.mockResolvedValue(undefined);

    const result = await manageLifeOpsAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: { source: "client_chat", text: "delete the brushing reminder" },
      } as never,
      {} as never,
      {
        parameters: {
          operation: "delete_definition",
          targetTitle: "Brush teeth",
        },
      } as never,
    );

    expect(mockDeleteDefinition).toHaveBeenCalledWith("def-1");
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Brush teeth"),
    });
  });

  it("deletes a goal by title", async () => {
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
    mockDeleteGoal.mockResolvedValue(undefined);

    const result = await manageLifeOpsAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: { source: "client_chat", text: "remove the stay healthy goal" },
      } as never,
      {} as never,
      {
        parameters: {
          operation: "delete_goal",
          targetTitle: "Stay healthy",
        },
      } as never,
    );

    expect(mockDeleteGoal).toHaveBeenCalledWith("goal-1");
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Stay healthy"),
    });
  });

  it("configures a reminder plan with escalation steps", async () => {
    mockListDefinitions.mockResolvedValue([
      {
        definition: {
          id: "def-1",
          title: "Brush teeth",
          domain: "user_lifeops",
        },
      },
    ]);
    mockUpdateDefinition.mockResolvedValue({
      definition: {
        id: "def-1",
        title: "Brush teeth",
      },
    });

    const result = await manageLifeOpsAction.handler?.(
      { agentId: "agent-1" } as never,
      {
        entityId: "owner-1",
        content: {
          source: "client_chat",
          text: "text me if I ignore the brushing reminder",
        },
      } as never,
      {} as never,
      {
        parameters: {
          operation: "configure_reminder_plan",
          targetTitle: "Brush teeth",
          escalationSteps: [
            { channel: "in_app", offsetMinutes: 0, label: "In-app reminder" },
            { channel: "sms", offsetMinutes: 15, label: "SMS if not acknowledged" },
          ],
        },
      } as never,
    );

    expect(mockUpdateDefinition).toHaveBeenCalledWith(
      "def-1",
      expect.objectContaining({
        reminderPlan: expect.objectContaining({
          steps: [
            { channel: "in_app", offsetMinutes: 0, label: "In-app reminder" },
            { channel: "sms", offsetMinutes: 15, label: "SMS if not acknowledged" },
          ],
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("Brush teeth"),
    });
  });
});
