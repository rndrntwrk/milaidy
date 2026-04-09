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

const ownerEntityMocks = vi.hoisted(() => ({
  resolveOwnerEntityId: vi.fn(),
}));

vi.mock("@miladyai/plugin-selfcontrol/selfcontrol", () => ({
  getSelfControlStatus: selfControlMocks.getSelfControlStatus,
  startSelfControlBlock: selfControlMocks.startSelfControlBlock,
  stopSelfControlBlock: selfControlMocks.stopSelfControlBlock,
}));

vi.mock("../config/config.js", () => ({
  loadElizaConfig: configMocks.loadElizaConfig,
}));

vi.mock("../runtime/owner-entity.js", () => ({
  resolveOwnerEntityId: ownerEntityMocks.resolveOwnerEntityId,
}));

import { LifeOpsService } from "./service.js";

function createRuntime() {
  return {
    agentId: "agent-lifeops" as UUID,
    sendMessageToTarget: vi.fn().mockResolvedValue(undefined),
    getService: vi.fn(() => null),
    getTasks: vi.fn().mockResolvedValue([]),
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
    ownerEntityMocks.resolveOwnerEntityId.mockResolvedValue(null);
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

  it("falls back to the owner entity when discord has no explicit owner contact", async () => {
    configMocks.loadElizaConfig.mockReturnValue({
      agents: {
        defaults: {
          ownerContacts: {},
        },
      },
    });
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime, {
      ownerEntityId: "owner-discord-uuid",
    });
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
      plan: { id: "plan-owner-fallback" },
      ownerType: "occurrence",
      ownerId: "occ-owner-fallback",
      occurrenceId: "occ-owner-fallback",
      subjectType: "owner",
      title: "Brush teeth",
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
        entityId: "owner-discord-uuid",
        channelId: null,
      }),
      expect.objectContaining({
        source: "discord",
      }),
    );
    expect(attempt).toMatchObject({
      outcome: "delivered",
      connectorRef: "runtime:discord:owner-discord-uuid",
    });
  });

  it("does not synthesize a discord runtime target when no real owner entity exists", async () => {
    configMocks.loadElizaConfig.mockReturnValue({
      agents: {
        defaults: {
          ownerContacts: {},
        },
      },
    });
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
      plan: { id: "plan-no-owner" },
      ownerType: "occurrence",
      ownerId: "occ-no-owner",
      occurrenceId: "occ-no-owner",
      subjectType: "owner",
      title: "Brush teeth",
      channel: "discord",
      stepIndex: 0,
      scheduledFor: "2026-04-06T12:00:00.000Z",
      dueAt: null,
      urgency: "medium",
      quietHours: {},
      acknowledged: false,
      attemptedAt: "2026-04-06T12:00:00.000Z",
    });

    expect(ownerEntityMocks.resolveOwnerEntityId).toHaveBeenCalledWith(runtime);
    expect(runtime.sendMessageToTarget).not.toHaveBeenCalled();
    expect(attempt).toMatchObject({
      outcome: "blocked_connector",
      connectorRef: null,
      deliveryMetadata: expect.objectContaining({
        reason: "unconfigured_channel",
      }),
    });
  });

  it("uses relationships routing hints to resolve the selected reminder endpoint and history", async () => {
    configMocks.loadElizaConfig.mockReturnValue({
      agents: {
        defaults: {
          ownerContacts: {
            discord: { entityId: "owner-1" },
          },
        },
      },
    });
    const runtime = createRuntime();
    const relationshipsContact = {
      preferences: { preferredCommunicationChannel: "discord" },
      customFields: {
        discordChannelId: "dm-relationships",
      },
    };
    (runtime as unknown as { getService: ReturnType<typeof vi.fn> }).getService =
      vi.fn((name: string) =>
        name === "relationships"
          ? {
              getContact: vi.fn().mockResolvedValue(relationshipsContact),
            }
          : null,
      );
    (runtime as unknown as { getEntityById: ReturnType<typeof vi.fn> }).getEntityById =
      vi.fn().mockResolvedValue({
        metadata: {
          platformIdentities: [
            { platform: "discord", handle: "@shaw", status: "active" },
          ],
        },
      });
    (runtime as unknown as { getRoomsForParticipant: ReturnType<typeof vi.fn> }).getRoomsForParticipant =
      vi.fn().mockResolvedValue(["room-1"]);
    (runtime as unknown as { getMemoriesByRoomIds: ReturnType<typeof vi.fn> }).getMemoriesByRoomIds =
      vi.fn().mockResolvedValue([
        {
          entityId: "owner-1",
          createdAt: "2026-04-06T11:59:00.000Z",
          content: { text: "Seen in discord" },
        },
      ]);
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
      plan: { id: "plan-relationships" },
      ownerType: "occurrence",
      ownerId: "occ-relationships",
      occurrenceId: "occ-relationships",
      subjectType: "owner",
      title: "Brush teeth",
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
        channelId: "dm-relationships",
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          routeResolution: expect.objectContaining({
            sourceOfTruth: "config+relationships",
            preferredCommunicationChannel: "discord",
            platformIdentities: [
              {
                platform: "discord",
                handle: "@shaw",
                status: "active",
              },
            ],
            lastResponseAt: "2026-04-06T11:59:00.000Z",
            lastResponseChannel: "discord",
          }),
          routeEndpoint: "dm-relationships",
          routeSource: "discord",
        }),
      }),
    );
    expect(attempt).toMatchObject({
      outcome: "delivered",
      connectorRef: "runtime:discord:dm-relationships",
      deliveryMetadata: expect.objectContaining({
        routeResolution: expect.objectContaining({
          sourceOfTruth: "config+relationships",
        }),
      }),
    });
  });

  it("allows normal runtime reminders when only escalation is disabled by policy", async () => {
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    (service as unknown as { repository: Record<string, unknown> }).repository = {
      listChannelPolicies: vi.fn().mockResolvedValue([
        {
          id: "policy-1",
          agentId: "agent-lifeops",
          channelType: "discord",
          channelRef: "dm-1",
          privacyClass: "private",
          allowReminders: true,
          allowEscalation: false,
          allowPosts: false,
          requireConfirmationForActions: true,
          metadata: {
            source: "discord",
            entityId: "owner-1",
            channelId: "dm-1",
          },
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:00.000Z",
        },
      ]),
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
      title: "Stretch",
      channel: "discord",
      stepIndex: 0,
      scheduledFor: "2026-04-06T12:00:00.000Z",
      dueAt: null,
      urgency: "high",
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
        text: expect.stringContaining("Stretch"),
      }),
    );
    expect(attempt).toMatchObject({
      outcome: "delivered",
      channel: "discord",
    });
  });

  it("blocks follow-up reminder steps when escalation is disabled by policy", async () => {
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    (service as unknown as { repository: Record<string, unknown> }).repository = {
      listChannelPolicies: vi.fn().mockResolvedValue([
        {
          id: "policy-1",
          agentId: "agent-lifeops",
          channelType: "discord",
          channelRef: "dm-1",
          privacyClass: "private",
          allowReminders: true,
          allowEscalation: false,
          allowPosts: false,
          requireConfirmationForActions: true,
          metadata: {
            source: "discord",
            entityId: "owner-1",
            channelId: "dm-1",
          },
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:00.000Z",
        },
      ]),
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
      title: "Stretch",
      channel: "discord",
      stepIndex: 1,
      scheduledFor: "2026-04-06T12:05:00.000Z",
      dueAt: null,
      urgency: "high",
      quietHours: {},
      acknowledged: false,
      attemptedAt: "2026-04-06T12:05:00.000Z",
    });

    expect(runtime.sendMessageToTarget).not.toHaveBeenCalled();
    expect(attempt).toMatchObject({
      outcome: "blocked_policy",
      channel: "discord",
    });
  });

  it("selects the currently active platform for reminder escalation", async () => {
    configMocks.loadElizaConfig.mockReturnValue({
      agents: {
        defaults: {
          ownerContacts: {
            discord: { entityId: "owner-1", channelId: "dm-1" },
            telegram: { entityId: "owner-1", channelId: "tg-1" },
          },
        },
      },
    });
    const runtime = createRuntime();
    runtime.getTasks = vi.fn().mockResolvedValue([
      {
        id: "task-1",
        name: "PROACTIVE_AGENT",
        metadata: {
          proactiveAgent: { kind: "runtime_runner", version: 1 },
          activityProfile: {
            primaryPlatform: "telegram",
            secondaryPlatform: "discord",
            lastSeenPlatform: "discord",
            isCurrentlyActive: true,
          },
        },
      },
    ]);
    const service = new LifeOpsService(runtime);
    (service as unknown as { repository: Record<string, unknown> }).repository = {
      createReminderAttempt: vi.fn().mockResolvedValue(undefined),
      listChannelPolicies: vi.fn().mockResolvedValue([]),
      getOccurrence: vi.fn().mockResolvedValue({
        id: "occ-1",
        agentId: "agent-lifeops",
        domain: "user_lifeops",
        subjectType: "owner",
        subjectId: "owner-1",
        visibilityScope: "owner_agent_admin",
        contextPolicy: "explicit_only",
        definitionId: "def-1",
        occurrenceKey: "2026-04-06",
        scheduledAt: "2026-04-06T12:00:00.000Z",
        dueAt: "2026-04-06T12:00:00.000Z",
        relevanceStartAt: "2026-04-06T12:00:00.000Z",
        relevanceEndAt: "2026-04-06T16:00:00.000Z",
        windowName: "afternoon",
        state: "visible",
        snoozedUntil: null,
        completionPayload: null,
        derivedTarget: null,
        metadata: {},
        createdAt: "2026-04-06T12:00:00.000Z",
        updatedAt: "2026-04-06T12:00:00.000Z",
      }),
      updateOccurrence: vi.fn().mockResolvedValue(undefined),
    };
    (service as unknown as { recordReminderAudit: ReturnType<typeof vi.fn> })
      .recordReminderAudit = vi.fn().mockResolvedValue(undefined);

    const attempt = await (
      service as unknown as {
        dispatchDueReminderEscalation: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
      }
    ).dispatchDueReminderEscalation({
      plan: {
        id: "plan-1",
        steps: [{ channel: "in_app", offsetMinutes: 0, label: "now" }],
        quietHours: {},
      },
      ownerType: "occurrence",
      ownerId: "occ-1",
      occurrenceId: "occ-1",
      subjectType: "owner",
      title: "Brush teeth",
      dueAt: "2026-04-06T12:00:00.000Z",
      urgency: "critical",
      quietHours: {},
      attemptedAt: "2026-04-06T12:06:00.000Z",
      now: new Date("2026-04-06T12:06:00.000Z"),
      attempts: [
        {
          id: "attempt-1",
          agentId: "agent-lifeops",
          planId: "plan-1",
          ownerType: "occurrence",
          ownerId: "occ-1",
          occurrenceId: "occ-1",
          channel: "in_app",
          stepIndex: 0,
          scheduledFor: "2026-04-06T12:00:00.000Z",
          attemptedAt: "2026-04-06T12:00:00.000Z",
          outcome: "delivered",
          connectorRef: "system:in_app",
          deliveryMetadata: {
            lifecycle: "plan",
          },
        },
      ],
      policies: [],
      activityProfile: {
        primaryPlatform: "telegram",
        secondaryPlatform: "discord",
        lastSeenPlatform: "discord",
        isCurrentlyActive: true,
      },
      occurrence: {
        relevanceStartAt: "2026-04-06T12:00:00.000Z",
        snoozedUntil: null,
        metadata: {},
        state: "visible",
      },
      acknowledged: false,
    });

    expect(runtime.sendMessageToTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "discord",
        entityId: "owner-1",
        channelId: "dm-1",
      }),
      expect.objectContaining({
        source: "discord",
      }),
    );
    expect(attempt).toMatchObject({
      outcome: "delivered",
      channel: "discord",
      deliveryMetadata: expect.objectContaining({
        lifecycle: "escalation",
        activityPlatform: "discord",
      }),
    });
  });

  it("dispatches telegram reminders through the telegram-account owner contact alias", async () => {
    configMocks.loadElizaConfig.mockReturnValue({
      agents: {
        defaults: {
          ownerContacts: {
            telegramAccount: { entityId: "owner-1", channelId: "tg-account-1" },
          },
        },
      },
    });

    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    (service as unknown as { repository: Record<string, unknown> }).repository = {
      listChannelPolicies: vi.fn().mockResolvedValue([]),
      createReminderAttempt: vi.fn().mockResolvedValue(undefined),
    };
    (service as unknown as { recordReminderAudit: ReturnType<typeof vi.fn> })
      .recordReminderAudit = vi.fn().mockResolvedValue(undefined);

    await (
      service as unknown as {
        dispatchReminderAttempt: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
      }
    ).dispatchReminderAttempt({
      plan: { id: "plan-2" },
      ownerType: "occurrence",
      ownerId: "occ-2",
      occurrenceId: "occ-2",
      subjectType: "owner",
      title: "Brush teeth",
      channel: "telegram",
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
        source: "telegram-account",
        entityId: "owner-1",
        channelId: "tg-account-1",
      }),
      expect.objectContaining({
        source: "telegram-account",
      }),
    );
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
      listReminderAttempts: vi.fn().mockResolvedValue([]),
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
      intensity: "minimal",
      note: "send me less reminders",
    });

    expect(preference.effective).toMatchObject({
      intensity: "minimal",
      source: "global_policy",
      note: "send me less reminders",
    });
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({
      channelType: "in_app",
      channelRef: "lifeops://owner/reminder-preferences",
      metadata: expect.objectContaining({
        reminderIntensity: "minimal",
        reminderPreferenceScope: "global",
      }),
    });
  });

  it("normalizes legacy reminder intensity metadata when reading preferences", async () => {
    const runtime = createRuntime();
    const service = new LifeOpsService(runtime);
    const definition = {
      id: "def-compat",
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
      windowPolicy: { timezone: "UTC", windows: [] },
      progressionRule: { kind: "none" },
      websiteAccess: null,
      reminderPlanId: "plan-compat",
      goalId: null,
      source: "manual",
      metadata: {
        reminderIntensity: "paused",
        reminderIntensityUpdatedAt: "2026-04-06T07:00:00.000Z",
        reminderIntensityNote: "legacy stored setting",
        reminderPreferenceScope: "definition",
      },
      createdAt: "2026-04-06T00:00:00.000Z",
      updatedAt: "2026-04-06T00:00:00.000Z",
    };
    (service as unknown as {
      repository: Record<string, unknown>;
    }).repository = {
      getDefinition: vi.fn(async () => definition),
      listChannelPolicies: vi.fn(async () => []),
    };

    const preference = await service.getReminderPreference("def-compat");

    expect(preference.definition).toMatchObject({
      intensity: "high_priority_only",
      source: "definition_metadata",
      updatedAt: "2026-04-06T07:00:00.000Z",
      note: "legacy stored setting",
    });
    expect(preference.effective.intensity).toBe("high_priority_only");
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
      intensity: "high_priority_only",
      source: "definition_metadata",
      note: "stop reminding me about water",
    });
    expect(updatedDefinitions[0]).toMatchObject({
      id: "def-1",
      metadata: expect.objectContaining({
        reminderIntensity: "high_priority_only",
        reminderPreferenceScope: "definition",
      }),
    });
  });

  it.each([
    ["minimal", 1],
    ["normal", 2],
    ["persistent", 3],
    ["high_priority_only", 0],
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
