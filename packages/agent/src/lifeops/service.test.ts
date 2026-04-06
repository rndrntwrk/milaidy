import crypto from "node:crypto";
import type { IAgentRuntime, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const selfControlMocks = vi.hoisted(() => ({
  getSelfControlStatus: vi.fn(),
  startSelfControlBlock: vi.fn(),
  stopSelfControlBlock: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  loadElizaConfig: vi.fn(),
}));

vi.mock("@miladyai/plugin-selfcontrol/selfcontrol", () => ({
  getSelfControlStatus: selfControlMocks.getSelfControlStatus,
  startSelfControlBlock: selfControlMocks.startSelfControlBlock,
  stopSelfControlBlock: selfControlMocks.stopSelfControlBlock,
}));

vi.mock("../config/config.js", () => ({
  loadElizaConfig: configMocks.loadElizaConfig,
}));

import { LifeOpsService } from "./service.js";

function createRuntime() {
  return {
    agentId: "agent-lifeops" as UUID,
    sendMessageToTarget: vi.fn().mockResolvedValue(undefined),
    getService: vi.fn(() => null),
  } as unknown as IAgentRuntime & {
    sendMessageToTarget: ReturnType<typeof vi.fn>;
  };
}

function createSelfControlStatus(
  overrides: Record<string, unknown> = {},
) {
  return {
    available: true,
    active: false,
    hostsFilePath: "/etc/hosts",
    endsAt: null,
    websites: [],
    managedBy: null,
    metadata: null,
    canUnblockEarly: true,
    requiresElevation: false,
    engine: "hosts-file" as const,
    platform: process.platform,
    supportsElevationPrompt: true,
    elevationPromptMethod: "osascript" as const,
    ...overrides,
  };
}

describe("LifeOpsService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    configMocks.loadElizaConfig.mockReturnValue({
      agents: {
        defaults: {
          ownerContacts: {
            discord: { entityId: "owner-1", channelId: "dm-1" },
          },
        },
      },
    });
    selfControlMocks.getSelfControlStatus.mockResolvedValue(
      createSelfControlStatus(),
    );
    selfControlMocks.startSelfControlBlock.mockResolvedValue({
      success: true,
      endsAt: null,
    });
    selfControlMocks.stopSelfControlBlock.mockResolvedValue({
      success: true,
      removed: true,
      status: createSelfControlStatus(),
    });
  });

  it("dispatches connected runtime reminders through the owner contact", async () => {
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    (service as unknown as { repository: Record<string, unknown> }).repository = {
      listChannelPolicies: vi.fn().mockResolvedValue([]),
      createReminderAttempt: vi.fn().mockResolvedValue(undefined),
    };
    (service as unknown as { recordReminderAudit: ReturnType<typeof vi.fn> })
      .recordReminderAudit = vi.fn().mockResolvedValue(undefined);

    const attempt = await (
      service as unknown as {
        dispatchReminderAttempt: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
      }
    ).dispatchReminderAttempt({
      plan: { id: "plan-1" },
      ownerType: "occurrence",
      ownerId: "occ-1",
      occurrenceId: "occ-1",
      subjectType: "owner",
      title: "Drink water",
      channel: "discord",
      stepIndex: 0,
      scheduledFor: "2026-04-06T12:00:00.000Z",
      dueAt: null,
      urgency: "medium",
      quietHours: {},
      acknowledged: false,
      attemptedAt: "2026-04-06T12:00:00.000Z",
    });

    expect(runtime.sendMessageToTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "discord",
        entityId: "owner-1",
        channelId: "dm-1",
      }),
      expect.objectContaining({
        source: "discord",
        text: expect.stringContaining("Drink water"),
      }),
    );
    expect(attempt).toMatchObject({
      outcome: "delivered",
      connectorRef: "runtime:discord:dm-1",
    });
  });

  it("syncs earned-access blocker state into the LifeOps-managed hosts block", async () => {
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    (service as unknown as { repository: Record<string, unknown> }).repository = {
      listDefinitions: vi.fn().mockResolvedValue([
        {
          id: "def-1",
          agentId: "agent-lifeops",
          status: "active",
          websiteAccess: {
            groupKey: "social-media",
            websites: ["x.com", "twitter.com"],
            unlockMode: "fixed_duration",
            unlockDurationMinutes: 60,
            reason: "Earn access after your routine.",
          },
        },
      ]),
      listWebsiteAccessGrants: vi.fn().mockResolvedValue([]),
    };

    await (
      service as unknown as {
        syncWebsiteAccessState: (now: Date) => Promise<void>;
      }
    ).syncWebsiteAccessState(new Date("2026-04-06T12:00:00.000Z"));

    expect(selfControlMocks.startSelfControlBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        websites: ["twitter.com", "x.com"],
        durationMinutes: null,
        metadata: expect.objectContaining({
          managedBy: "lifeops",
          blockedGroups: ["social-media"],
        }),
      }),
    );
  });

  it("does not clobber a non-LifeOps website block", async () => {
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    (service as unknown as { repository: Record<string, unknown> }).repository = {
      listDefinitions: vi.fn().mockResolvedValue([
        {
          id: "def-1",
          agentId: "agent-lifeops",
          status: "active",
          websiteAccess: {
            groupKey: "social-media",
            websites: ["x.com"],
            unlockMode: "fixed_duration",
            unlockDurationMinutes: 60,
            reason: "Earn access after your routine.",
          },
        },
      ]),
      listWebsiteAccessGrants: vi.fn().mockResolvedValue([]),
    };
    selfControlMocks.getSelfControlStatus.mockResolvedValue(
      createSelfControlStatus({
        active: true,
        websites: ["x.com"],
        managedBy: "manual-focus",
      }),
    );

    await (
      service as unknown as {
        syncWebsiteAccessState: (now: Date) => Promise<void>;
      }
    ).syncWebsiteAccessState(new Date("2026-04-06T12:00:00.000Z"));

    expect(selfControlMocks.stopSelfControlBlock).not.toHaveBeenCalled();
    expect(selfControlMocks.startSelfControlBlock).not.toHaveBeenCalled();
  });

  it("awards website access when completing a gated occurrence", async () => {
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    const awardWebsiteAccessGrant = vi.fn().mockResolvedValue(undefined);
    const syncWebsiteAccessState = vi.fn().mockResolvedValue(undefined);
    const refreshDefinitionOccurrences = vi.fn().mockResolvedValue([]);
    const recordAudit = vi.fn().mockResolvedValue(undefined);

    (service as unknown as { repository: Record<string, unknown> }).repository = {
      updateOccurrence: vi.fn().mockResolvedValue(undefined),
      getOccurrenceView: vi.fn().mockResolvedValue({
        id: "occ-1",
        title: "Brush teeth",
        state: "completed",
      }),
    };
    (
      service as unknown as {
        getFreshOccurrence: ReturnType<typeof vi.fn>;
        awardWebsiteAccessGrant: ReturnType<typeof vi.fn>;
        syncWebsiteAccessState: ReturnType<typeof vi.fn>;
        refreshDefinitionOccurrences: ReturnType<typeof vi.fn>;
        recordAudit: ReturnType<typeof vi.fn>;
      }
    ).getFreshOccurrence = vi.fn().mockResolvedValue({
      definition: {
        id: "def-1",
        title: "Brush teeth",
        websiteAccess: {
          groupKey: "social-media",
          websites: ["x.com"],
          unlockMode: "fixed_duration",
          unlockDurationMinutes: 60,
          reason: "Earn access after your routine.",
        },
      },
      occurrence: {
        id: "occ-1",
        agentId: "agent-lifeops",
        definitionId: "def-1",
        occurrenceKey: "daily:2026-04-06:morning",
        state: "visible",
        snoozedUntil: null,
        completionPayload: null,
      },
    });
    (
      service as unknown as {
        awardWebsiteAccessGrant: ReturnType<typeof vi.fn>;
        syncWebsiteAccessState: ReturnType<typeof vi.fn>;
        refreshDefinitionOccurrences: ReturnType<typeof vi.fn>;
        recordAudit: ReturnType<typeof vi.fn>;
      }
    ).awardWebsiteAccessGrant = awardWebsiteAccessGrant;
    (
      service as unknown as {
        syncWebsiteAccessState: ReturnType<typeof vi.fn>;
        refreshDefinitionOccurrences: ReturnType<typeof vi.fn>;
        recordAudit: ReturnType<typeof vi.fn>;
      }
    ).syncWebsiteAccessState = syncWebsiteAccessState;
    (
      service as unknown as {
        refreshDefinitionOccurrences: ReturnType<typeof vi.fn>;
        recordAudit: ReturnType<typeof vi.fn>;
      }
    ).refreshDefinitionOccurrences = refreshDefinitionOccurrences;
    (
      service as unknown as {
        recordAudit: ReturnType<typeof vi.fn>;
      }
    ).recordAudit = recordAudit;

    const result = await service.completeOccurrence("occ-1", {});

    expect(awardWebsiteAccessGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: "def-1" }),
      "occ-1",
      expect.any(Date),
    );
    expect(syncWebsiteAccessState).toHaveBeenCalledWith(expect.any(Date));
    expect(result).toMatchObject({ id: "occ-1", state: "completed" });
  });

  it("computes adherence and streak metrics for a multi-slot routine", async () => {
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    (service as unknown as { repository: Record<string, unknown> }).repository = {
      getDefinition: vi.fn().mockResolvedValue({
        id: "def-1",
        agentId: "agent-lifeops",
        domain: "user_lifeops",
        subjectType: "owner",
        subjectId: "owner-1",
        visibilityScope: "owner_agent_admin",
        contextPolicy: "explicit_only",
        kind: "habit",
        title: "Brush teeth",
        description: "Brush every morning and every night.",
        originalIntent: "Remind me to brush my teeth every morning and night.",
        timezone: "UTC",
        status: "active",
        priority: 2,
        cadence: {
          kind: "times_per_day",
          slots: [
            {
              key: "morning",
              label: "Morning",
              minuteOfDay: 8 * 60,
              durationMinutes: 30,
            },
            {
              key: "night",
              label: "Night",
              minuteOfDay: 20 * 60,
              durationMinutes: 30,
            },
          ],
        },
        windowPolicy: {
          timezone: "UTC",
          windows: [],
        },
        progressionRule: {
          kind: "none",
        },
        websiteAccess: null,
        reminderPlanId: null,
        goalId: null,
        source: "chat",
        metadata: {},
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-05T08:10:00.000Z",
      }),
      getReminderPlan: vi.fn().mockResolvedValue(null),
      listOccurrencesForDefinition: vi.fn().mockResolvedValue([
        {
          id: "occ-1",
          agentId: "agent-lifeops",
          domain: "user_lifeops",
          subjectType: "owner",
          subjectId: "owner-1",
          visibilityScope: "owner_agent_admin",
          contextPolicy: "explicit_only",
          definitionId: "def-1",
          occurrenceKey: "2026-04-03:morning",
          scheduledAt: "2026-04-03T08:00:00.000Z",
          dueAt: "2026-04-03T08:00:00.000Z",
          relevanceStartAt: "2026-04-03T07:00:00.000Z",
          relevanceEndAt: "2026-04-03T12:00:00.000Z",
          windowName: "morning",
          state: "completed",
          snoozedUntil: null,
          completionPayload: null,
          derivedTarget: null,
          metadata: {},
          createdAt: "2026-04-03T07:00:00.000Z",
          updatedAt: "2026-04-03T08:05:00.000Z",
        },
        {
          id: "occ-2",
          agentId: "agent-lifeops",
          domain: "user_lifeops",
          subjectType: "owner",
          subjectId: "owner-1",
          visibilityScope: "owner_agent_admin",
          contextPolicy: "explicit_only",
          definitionId: "def-1",
          occurrenceKey: "2026-04-03:night",
          scheduledAt: "2026-04-03T20:00:00.000Z",
          dueAt: "2026-04-03T20:00:00.000Z",
          relevanceStartAt: "2026-04-03T19:00:00.000Z",
          relevanceEndAt: "2026-04-04T01:00:00.000Z",
          windowName: "night",
          state: "completed",
          snoozedUntil: null,
          completionPayload: null,
          derivedTarget: null,
          metadata: {},
          createdAt: "2026-04-03T19:00:00.000Z",
          updatedAt: "2026-04-03T20:10:00.000Z",
        },
        {
          id: "occ-3",
          agentId: "agent-lifeops",
          domain: "user_lifeops",
          subjectType: "owner",
          subjectId: "owner-1",
          visibilityScope: "owner_agent_admin",
          contextPolicy: "explicit_only",
          definitionId: "def-1",
          occurrenceKey: "2026-04-04:morning",
          scheduledAt: "2026-04-04T08:00:00.000Z",
          dueAt: "2026-04-04T08:00:00.000Z",
          relevanceStartAt: "2026-04-04T07:00:00.000Z",
          relevanceEndAt: "2026-04-04T12:00:00.000Z",
          windowName: "morning",
          state: "completed",
          snoozedUntil: null,
          completionPayload: null,
          derivedTarget: null,
          metadata: {},
          createdAt: "2026-04-04T07:00:00.000Z",
          updatedAt: "2026-04-04T08:15:00.000Z",
        },
        {
          id: "occ-4",
          agentId: "agent-lifeops",
          domain: "user_lifeops",
          subjectType: "owner",
          subjectId: "owner-1",
          visibilityScope: "owner_agent_admin",
          contextPolicy: "explicit_only",
          definitionId: "def-1",
          occurrenceKey: "2026-04-04:night",
          scheduledAt: "2026-04-04T20:00:00.000Z",
          dueAt: "2026-04-04T20:00:00.000Z",
          relevanceStartAt: "2026-04-04T19:00:00.000Z",
          relevanceEndAt: "2026-04-05T01:00:00.000Z",
          windowName: "night",
          state: "skipped",
          snoozedUntil: null,
          completionPayload: null,
          derivedTarget: null,
          metadata: {},
          createdAt: "2026-04-04T19:00:00.000Z",
          updatedAt: "2026-04-04T20:30:00.000Z",
        },
        {
          id: "occ-5",
          agentId: "agent-lifeops",
          domain: "user_lifeops",
          subjectType: "owner",
          subjectId: "owner-1",
          visibilityScope: "owner_agent_admin",
          contextPolicy: "explicit_only",
          definitionId: "def-1",
          occurrenceKey: "2026-04-05:morning",
          scheduledAt: "2026-04-05T08:00:00.000Z",
          dueAt: "2026-04-05T08:00:00.000Z",
          relevanceStartAt: "2026-04-05T07:00:00.000Z",
          relevanceEndAt: "2026-04-05T12:00:00.000Z",
          windowName: "morning",
          state: "completed",
          snoozedUntil: null,
          completionPayload: null,
          derivedTarget: null,
          metadata: {},
          createdAt: "2026-04-05T07:00:00.000Z",
          updatedAt: "2026-04-05T08:10:00.000Z",
        },
        {
          id: "occ-6",
          agentId: "agent-lifeops",
          domain: "user_lifeops",
          subjectType: "owner",
          subjectId: "owner-1",
          visibilityScope: "owner_agent_admin",
          contextPolicy: "explicit_only",
          definitionId: "def-1",
          occurrenceKey: "2026-04-05:night",
          scheduledAt: "2026-04-05T20:00:00.000Z",
          dueAt: "2026-04-05T20:00:00.000Z",
          relevanceStartAt: "2026-04-05T19:00:00.000Z",
          relevanceEndAt: "2026-04-06T01:00:00.000Z",
          windowName: "night",
          state: "pending",
          snoozedUntil: null,
          completionPayload: null,
          derivedTarget: null,
          metadata: {},
          createdAt: "2026-04-05T19:00:00.000Z",
          updatedAt: "2026-04-05T19:00:00.000Z",
        },
      ]),
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T12:00:00.000Z"));
    let definition!: Awaited<ReturnType<LifeOpsService["getDefinition"]>>;
    try {
      definition = await service.getDefinition("def-1");
    } finally {
      vi.useRealTimers();
    }

    expect(definition.performance).toMatchObject({
      totalScheduledCount: 5,
      totalCompletedCount: 4,
      totalSkippedCount: 1,
      totalPendingCount: 0,
      currentOccurrenceStreak: 1,
      bestOccurrenceStreak: 3,
      currentPerfectDayStreak: 1,
      bestPerfectDayStreak: 1,
      lastCompletedAt: "2026-04-05T08:10:00.000Z",
      lastSkippedAt: "2026-04-04T20:30:00.000Z",
      last7Days: expect.objectContaining({
        scheduledCount: 5,
        completedCount: 4,
        skippedCount: 1,
        pendingCount: 0,
        perfectDayCount: 2,
      }),
      last30Days: expect.objectContaining({
        scheduledCount: 5,
        completedCount: 4,
      }),
    });
    expect(definition.performance.last7Days.completionRate).toBeCloseTo(0.8);
  });

  it("persists and reads the global reminder preference", async () => {
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    const policies: Array<Record<string, unknown>> = [];
    (service as unknown as {
      repository: Record<string, unknown>;
      recordChannelPolicyAudit: ReturnType<typeof vi.fn>;
    }).repository = {
      getChannelPolicy: vi.fn(
        async (_agentId: string, channelType: string, channelRef: string) =>
          policies.find(
            (policy) =>
              policy.channelType === channelType &&
              policy.channelRef === channelRef,
          ) ?? null,
      ),
      upsertChannelPolicy: vi.fn(async (policy: Record<string, unknown>) => {
        const index = policies.findIndex((candidate) => candidate.id === policy.id);
        if (index >= 0) {
          policies[index] = policy;
          return;
        }
        policies.push(policy);
      }),
      listChannelPolicies: vi.fn(async () => policies),
    };
    (
      service as unknown as {
        recordChannelPolicyAudit: ReturnType<typeof vi.fn>;
      }
    ).recordChannelPolicyAudit = vi.fn().mockResolvedValue(undefined);

    const preference = await service.setReminderPreference({
      intensity: "low",
      note: "send me less reminders",
    });

    expect(preference.effective).toMatchObject({
      intensity: "low",
      source: "global_policy",
      note: "send me less reminders",
    });
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({
      channelType: "in_app",
      channelRef: "lifeops://owner/reminder-preferences",
      metadata: expect.objectContaining({
        reminderIntensity: "low",
        reminderPreferenceScope: "global",
      }),
    });
  });

  it("persists a definition-level reminder preference override", async () => {
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    const definition = {
      id: "def-1",
      agentId: "agent-lifeops",
      domain: "user_lifeops",
      subjectType: "owner",
      subjectId: "owner-1",
      visibilityScope: "owner_agent_admin",
      contextPolicy: "explicit_only",
      kind: "habit",
      title: "Drink water",
      description: "",
      originalIntent: "drink water",
      timezone: "UTC",
      status: "active",
      priority: 3,
      cadence: { kind: "daily", windows: ["morning"] },
      windowPolicy: {
        timezone: "UTC",
        windows: [],
      },
      progressionRule: { kind: "none" },
      websiteAccess: null,
      reminderPlanId: "plan-1",
      goalId: null,
      source: "manual",
      metadata: {},
      createdAt: "2026-04-06T00:00:00.000Z",
      updatedAt: "2026-04-06T00:00:00.000Z",
    };
    const updatedDefinitions: Array<Record<string, unknown>> = [];
    (service as unknown as {
      repository: Record<string, unknown>;
      recordAudit: ReturnType<typeof vi.fn>;
    }).repository = {
      getDefinition: vi.fn(async () => definition),
      updateDefinition: vi.fn(async (nextDefinition: Record<string, unknown>) => {
        updatedDefinitions.push(nextDefinition);
      }),
      listChannelPolicies: vi.fn(async () => []),
    };
    (
      service as unknown as {
        recordAudit: ReturnType<typeof vi.fn>;
      }
    ).recordAudit = vi.fn().mockResolvedValue(undefined);

    const preference = await service.setReminderPreference({
      intensity: "paused",
      definitionId: "def-1",
      note: "stop reminding me about water",
    });

    expect(preference.definitionId).toBe("def-1");
    expect(preference.effective).toMatchObject({
      intensity: "paused",
      source: "definition_metadata",
      note: "stop reminding me about water",
    });
    expect(updatedDefinitions[0]).toMatchObject({
      id: "def-1",
      metadata: expect.objectContaining({
        reminderIntensity: "paused",
        reminderPreferenceScope: "definition",
      }),
    });
  });

  it.each([
    ["low", 1],
    ["normal", 2],
    ["high", 3],
    ["paused", 0],
  ] as const)(
    "processReminders applies %s reminder intensity",
    async (intensity, expectedCount) => {
      const runtime = createRuntime();
      const service = new LifeOpsService(runtime);
      const definition = {
        id: "def-1",
        agentId: "agent-lifeops",
        domain: "user_lifeops",
        subjectType: "owner",
        subjectId: "owner-1",
        visibilityScope: "owner_agent_admin",
        contextPolicy: "explicit_only",
        kind: "habit",
        title: "Brush teeth",
        description: "",
        originalIntent: "brush teeth",
        timezone: "UTC",
        status: "active",
        priority: 3,
        cadence: { kind: "daily", windows: ["morning", "night"] },
        windowPolicy: {
          timezone: "UTC",
          windows: [],
        },
        progressionRule: { kind: "none" },
        websiteAccess: null,
        reminderPlanId: "plan-1",
        goalId: null,
        source: "manual",
        metadata:
          intensity === "normal"
            ? {}
            : {
                reminderIntensity: intensity,
                reminderIntensityUpdatedAt: "2026-04-06T07:00:00.000Z",
              },
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z",
      };
      const occurrence = {
        id: "occ-1",
        agentId: "agent-lifeops",
        domain: "user_lifeops",
        subjectType: "owner",
        subjectId: "owner-1",
        visibilityScope: "owner_agent_admin",
        contextPolicy: "explicit_only",
        definitionId: "def-1",
        occurrenceKey: "2026-04-06:morning",
        scheduledAt: "2026-04-06T08:00:00.000Z",
        dueAt: "2026-04-06T08:00:00.000Z",
        relevanceStartAt: "2026-04-06T07:00:00.000Z",
        relevanceEndAt: "2026-04-06T12:00:00.000Z",
        windowName: "morning",
        state: "visible",
        snoozedUntil: null,
        completionPayload: null,
        derivedTarget: null,
        metadata: {},
        createdAt: "2026-04-06T07:00:00.000Z",
        updatedAt: "2026-04-06T07:00:00.000Z",
        definitionKind: "habit",
        definitionStatus: "active",
        cadence: { kind: "daily", windows: ["morning", "night"] },
        title: "Brush teeth",
        description: "",
        priority: 3,
        timezone: "UTC",
        source: "manual",
        goalId: null,
      };
      (service as unknown as {
        repository: Record<string, unknown>;
        refreshDefinitionOccurrences: ReturnType<typeof vi.fn>;
        dispatchReminderAttempt: ReturnType<typeof vi.fn>;
      }).repository = {
        listActiveDefinitions: vi.fn(async () => [definition]),
        listOccurrenceViewsForOverview: vi.fn(async () => [occurrence]),
        listReminderPlansForOwners: vi.fn(
          async (_agentId: string, ownerType: string) =>
            ownerType === "definition"
              ? [
                  {
                    id: "plan-1",
                    agentId: "agent-lifeops",
                    ownerType: "definition",
                    ownerId: "def-1",
                    steps: [
                      {
                        channel: "in_app",
                        offsetMinutes: 0,
                        label: "first",
                      },
                      {
                        channel: "in_app",
                        offsetMinutes: 30,
                        label: "second",
                      },
                    ],
                    mutePolicy: {},
                    quietHours: {},
                    createdAt: "2026-04-06T00:00:00.000Z",
                    updatedAt: "2026-04-06T00:00:00.000Z",
                  },
                ]
              : [],
        ),
        listCalendarEvents: vi.fn(async () => []),
        listReminderAttempts: vi.fn(async () => []),
        listChannelPolicies: vi.fn(async () => []),
      };
      (
        service as unknown as {
          refreshDefinitionOccurrences: ReturnType<typeof vi.fn>;
          dispatchReminderAttempt: ReturnType<typeof vi.fn>;
        }
      ).refreshDefinitionOccurrences = vi.fn().mockResolvedValue(undefined);
      (
        service as unknown as {
          dispatchReminderAttempt: ReturnType<typeof vi.fn>;
        }
      ).dispatchReminderAttempt = vi
        .fn()
        .mockImplementation(async (args: Record<string, unknown>) => ({
          id: crypto.randomUUID(),
          agentId: "agent-lifeops",
          planId: "plan-1",
          ownerType: args.ownerType,
          ownerId: args.ownerId,
          occurrenceId: args.occurrenceId,
          channel: args.channel,
          stepIndex: args.stepIndex,
          scheduledFor: args.scheduledFor,
          attemptedAt: args.attemptedAt,
          outcome: "delivered",
          connectorRef: "system:in_app",
          deliveryMetadata: {},
        }));

      const result = await service.processReminders({
        now: "2026-04-06T09:00:00.000Z",
      });

      expect(result.attempts).toHaveLength(expectedCount);
    },
  );
});
