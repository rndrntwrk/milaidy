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
});
