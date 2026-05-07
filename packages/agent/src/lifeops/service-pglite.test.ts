/**
 * Integration tests for LifeOpsService backed by a real PGlite database.
 *
 * Each test gets a fresh in-memory PGlite instance so there is no shared state
 * between tests.  The repository and SQL layers are exercised end-to-end --
 * only external services (selfcontrol, Apple Reminders, Google API, config
 * loader, owner-entity resolver) are mocked because they live outside the
 * database boundary.
 */

import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LifeOpsRepository } from "./repository.js";
import { LifeOpsService } from "./service.js";

// ---------------------------------------------------------------------------
// External module mocks (outside the DB boundary)
// ---------------------------------------------------------------------------

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

const appleReminderMocks = vi.hoisted(() => ({
  createNativeAppleReminderLikeItem: vi.fn(),
  readNativeAppleReminderMetadata: vi.fn(),
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

vi.mock("./apple-reminders.js", () => ({
  createNativeAppleReminderLikeItem:
    appleReminderMocks.createNativeAppleReminderLikeItem,
  readNativeAppleReminderMetadata:
    appleReminderMocks.readNativeAppleReminderMetadata,
}));

// ---------------------------------------------------------------------------
// PGlite runtime adapter (mirrors the pattern in lifeops-pglite-schema.test.ts)
// ---------------------------------------------------------------------------

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) return "";
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) return value.join("");
      return String(value ?? "");
    })
    .join("");
}

const AGENT_ID = "pglite-test-agent" as UUID;

/** Assert a value is defined and return the narrowed type. */
function requireDefined<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${label} to be defined`);
  }
  return value;
}

function createPgliteRuntime(db: PGlite): IAgentRuntime {
  return {
    agentId: AGENT_ID,
    character: {
      name: "TestAgent",
      system: "Be concise.",
      bio: ["Helps the user."],
      style: { all: ["Short."], chat: ["Direct."] },
    },
    getSetting: () => undefined,
    getService: () => null,
    getTasks: vi.fn().mockResolvedValue([]),
    useModel: vi.fn().mockResolvedValue(""),
    sendMessageToTarget: vi.fn().mockResolvedValue(undefined),
    getRoomsForParticipants: vi.fn().mockResolvedValue([]),
    getMemoriesByRoomIds: vi.fn().mockResolvedValue([]),
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          return db.query(sql);
        },
      },
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  } as unknown as IAgentRuntime;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("LifeOpsService (PGlite integration)", () => {
  let db: PGlite;
  let runtime: IAgentRuntime;
  let service: LifeOpsService;
  let repository: LifeOpsRepository;

  beforeEach(async () => {
    db = new PGlite();
    runtime = createPgliteRuntime(db);

    configMocks.loadElizaConfig.mockReturnValue({
      agents: {
        defaults: {
          ownerContacts: {
            discord: { entityId: "owner-1", channelId: "dm-1" },
          },
        },
      },
    });
    selfControlMocks.getSelfControlStatus.mockResolvedValue({
      available: true,
      active: false,
      hostsFilePath: "/etc/hosts",
      endsAt: null,
      websites: [],
      managedBy: null,
      metadata: null,
      canUnblockEarly: true,
      requiresElevation: false,
      engine: "hosts-file",
      platform: process.platform,
      supportsElevationPrompt: true,
      elevationPromptMethod: "osascript",
    });
    selfControlMocks.startSelfControlBlock.mockResolvedValue({
      success: true,
      endsAt: null,
    });
    selfControlMocks.stopSelfControlBlock.mockResolvedValue({
      success: true,
      removed: true,
    });
    ownerEntityMocks.resolveOwnerEntityId.mockResolvedValue(null);
    appleReminderMocks.readNativeAppleReminderMetadata.mockReturnValue(null);
    appleReminderMocks.createNativeAppleReminderLikeItem.mockResolvedValue({
      ok: true,
      provider: "apple_reminders",
      reminderId: "native-reminder-1",
    });

    repository = new LifeOpsRepository(runtime);
    // Ensure schema is bootstrapped before each test.
    await repository.ensureReady();

    service = new LifeOpsService(runtime);
  });

  afterEach(async () => {
    await db.close();
  });

  // -----------------------------------------------------------------------
  // (a) Create definition + list definitions
  // -----------------------------------------------------------------------

  it("creates a task definition and lists it back from the database", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "Buy groceries",
      description: "Weekly grocery run.",
      cadence: {
        kind: "once",
        dueAt: "2026-04-15T10:00:00.000Z",
      },
      source: "chat",
    });

    expect(record.definition.title).toBe("Buy groceries");
    expect(record.definition.kind).toBe("task");
    expect(record.definition.status).toBe("active");

    const definitions = await repository.listActiveDefinitions(AGENT_ID);
    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.id).toBe(record.definition.id);
    expect(definitions[0]?.title).toBe("Buy groceries");
    expect(definitions[0]?.description).toBe("Weekly grocery run.");
  });

  // -----------------------------------------------------------------------
  // (b) Create definition + materialize occurrences
  // -----------------------------------------------------------------------

  it("materializes occurrences for a daily habit definition", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Drink water",
      description: "Drink a glass of water.",
      cadence: {
        kind: "daily",
        windows: ["morning"],
      },
      source: "chat",
    });

    const occurrences = await repository.listOccurrencesForDefinition(
      AGENT_ID,
      record.definition.id,
    );

    // Daily cadence should produce at least one occurrence (today or upcoming)
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
    expect(occurrences[0]?.definitionId).toBe(record.definition.id);
    expect(
      occurrences.every(
        (occ) =>
          occ.state === "pending" ||
          occ.state === "visible" ||
          occ.state === "expired",
      ),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // (c) Complete occurrence
  // -----------------------------------------------------------------------

  it("completes an occurrence and verifies state change in the database", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "File taxes",
      description: "File 2025 tax return.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      source: "chat",
    });

    const occurrences = await repository.listOccurrencesForDefinition(
      AGENT_ID,
      record.definition.id,
    );
    expect(occurrences.length).toBeGreaterThanOrEqual(1);

    const targetOcc = requireDefined(
      occurrences.find(
        (occ) => occ.state === "visible" || occ.state === "pending",
      ),
      "actionable occurrence",
    );

    const view = await service.completeOccurrence(targetOcc.id, {
      note: "Done!",
    });

    expect(view.state).toBe("completed");
    expect(view.completionPayload).toMatchObject({
      completedAt: expect.any(String),
      note: "Done!",
    });

    // Verify directly in DB
    const dbOcc = await repository.getOccurrence(AGENT_ID, targetOcc.id);
    expect(dbOcc?.state).toBe("completed");
  });

  // -----------------------------------------------------------------------
  // (d) Skip occurrence
  // -----------------------------------------------------------------------

  it("skips an occurrence and verifies state change in the database", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "Clean desk",
      description: "Tidy the workspace.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      source: "chat",
    });

    const occurrences = await repository.listOccurrencesForDefinition(
      AGENT_ID,
      record.definition.id,
    );
    const targetOcc = requireDefined(
      occurrences.find(
        (occ) => occ.state === "visible" || occ.state === "pending",
      ),
      "actionable occurrence",
    );

    const view = await service.skipOccurrence(targetOcc.id);

    expect(view.state).toBe("skipped");

    const dbOcc = await repository.getOccurrence(AGENT_ID, targetOcc.id);
    expect(dbOcc?.state).toBe("skipped");
    expect(dbOcc?.completionPayload).toMatchObject({
      skippedAt: expect.any(String),
      previousState: expect.any(String),
    });
  });

  // -----------------------------------------------------------------------
  // (e) Snooze occurrence
  // -----------------------------------------------------------------------

  it("snoozes an occurrence and verifies snoozedUntil is set in the database", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "Reply to email",
      description: "Reply to the client email.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      source: "chat",
    });

    const occurrences = await repository.listOccurrencesForDefinition(
      AGENT_ID,
      record.definition.id,
    );
    const targetOcc = requireDefined(
      occurrences.find(
        (occ) => occ.state === "visible" || occ.state === "pending",
      ),
      "actionable occurrence",
    );

    const now = new Date();
    const view = await service.snoozeOccurrence(
      targetOcc.id,
      { minutes: 45 },
      now,
    );

    expect(view.state).toBe("snoozed");

    // computeSnoozedUntil adds 45 minutes to `now`
    const expectedSnooze = new Date(now.getTime() + 45 * 60_000).toISOString();
    expect(view.snoozedUntil).toBe(expectedSnooze);

    const dbOcc = await repository.getOccurrence(AGENT_ID, targetOcc.id);
    expect(dbOcc?.state).toBe("snoozed");
    expect(dbOcc?.snoozedUntil).toBe(expectedSnooze);
  });

  // -----------------------------------------------------------------------
  // (f) Website access grant on completion
  // -----------------------------------------------------------------------

  it("creates a website access grant when completing a gated occurrence", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Morning routine",
      description: "Complete morning routine to unlock social media.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      websiteAccess: {
        groupKey: "social-media",
        websites: ["x.com", "twitter.com"],
        unlockMode: "fixed_duration",
        unlockDurationMinutes: 60,
        reason: "Earn access after your routine.",
      },
      source: "chat",
    });

    const occurrences = await repository.listOccurrencesForDefinition(
      AGENT_ID,
      record.definition.id,
    );
    const targetOcc = requireDefined(
      occurrences.find(
        (occ) => occ.state === "visible" || occ.state === "pending",
      ),
      "actionable occurrence",
    );

    await service.completeOccurrence(targetOcc.id, {});

    const grants = await repository.listWebsiteAccessGrants(AGENT_ID);
    expect(grants.length).toBeGreaterThanOrEqual(1);

    const grant = grants.find(
      (g) => g.definitionId === record.definition.id && g.revokedAt === null,
    );
    expect(grant).toBeDefined();
    expect(grant?.groupKey).toBe("social-media");
    expect(grant?.websites).toEqual(
      expect.arrayContaining(["x.com", "twitter.com"]),
    );
    expect(grant?.unlockMode).toBe("fixed_duration");
    expect(grant?.unlockDurationMinutes).toBe(60);
    expect(grant?.occurrenceId).toBe(targetOcc.id);
  });

  // -----------------------------------------------------------------------
  // (g) Goal creation + linking
  // -----------------------------------------------------------------------

  it("creates a goal, links a definition to it, and verifies the link in the database", async () => {
    const goalRecord = await service.createGoal({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      title: "Get healthier",
      description: "Improve overall health through daily habits.",
    });

    expect(goalRecord.goal.title).toBe("Get healthier");
    expect(goalRecord.goal.status).toBe("active");

    // Verify goal persisted
    const dbGoal = await repository.getGoal(AGENT_ID, goalRecord.goal.id);
    expect(dbGoal).toBeDefined();
    expect(dbGoal?.title).toBe("Get healthier");

    // Create a definition linked to this goal
    const defRecord = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Drink water",
      description: "Drink 8 glasses of water per day.",
      cadence: {
        kind: "daily",
        windows: ["morning"],
      },
      goalId: goalRecord.goal.id,
      source: "chat",
    });

    expect(defRecord.definition.goalId).toBe(goalRecord.goal.id);

    // Verify the goal link exists in the DB
    const links = await repository.listGoalLinksForGoal(
      AGENT_ID,
      goalRecord.goal.id,
    );
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(
      links.some(
        (link) =>
          link.linkedType === "definition" &&
          link.linkedId === defRecord.definition.id,
      ),
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // (h) Reminder plan creation
  // -----------------------------------------------------------------------

  it("creates a definition with a reminder plan and verifies the plan is persisted", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Take vitamins",
      description: "Daily vitamins after breakfast.",
      cadence: {
        kind: "daily",
        windows: ["morning"],
      },
      reminderPlan: {
        steps: [
          { channel: "in_app", offsetMinutes: 0, label: "now" },
          { channel: "in_app", offsetMinutes: 15, label: "15 min" },
        ],
      },
      source: "chat",
    });

    expect(record.reminderPlan).not.toBeNull();
    expect(record.definition.reminderPlanId).toBeTruthy();

    // Verify reminder plan is in the DB
    const planId = requireDefined(
      record.definition.reminderPlanId,
      "reminderPlanId",
    );
    const dbPlan = await repository.getReminderPlan(AGENT_ID, planId);
    expect(dbPlan).toBeDefined();
    expect(dbPlan?.steps).toHaveLength(2);
    expect(dbPlan?.steps[0]).toMatchObject({
      channel: "in_app",
      offsetMinutes: 0,
    });
    expect(dbPlan?.steps[1]).toMatchObject({
      channel: "in_app",
      offsetMinutes: 15,
    });
  });

  // -----------------------------------------------------------------------
  // (i) Channel policy creation (capturePhoneConsent)
  // -----------------------------------------------------------------------

  it("captures phone consent and creates SMS and voice channel policies", async () => {
    const result = await service.capturePhoneConsent({
      phoneNumber: "+15551234567",
      consentGiven: true,
      privacyClass: "private",
      allowSms: true,
      allowVoice: false,
    });

    expect(result.phoneNumber).toBe("+15551234567");
    expect(result.policies).toHaveLength(2);

    // Verify policies in the DB
    const policies = await repository.listChannelPolicies(AGENT_ID);
    expect(policies).toHaveLength(2);

    const smsPolicy = policies.find((p) => p.channelType === "sms");
    expect(smsPolicy).toBeDefined();
    expect(smsPolicy?.channelRef).toBe("+15551234567");
    expect(smsPolicy?.allowReminders).toBe(true);
    expect(smsPolicy?.allowEscalation).toBe(true);
    expect(smsPolicy?.privacyClass).toBe("private");

    const voicePolicy = policies.find((p) => p.channelType === "voice");
    expect(voicePolicy).toBeDefined();
    expect(voicePolicy?.channelRef).toBe("+15551234567");
    expect(voicePolicy?.allowReminders).toBe(false);
    expect(voicePolicy?.allowEscalation).toBe(false);
  });

  // -----------------------------------------------------------------------
  // (j) Escalation state persistence
  // -----------------------------------------------------------------------

  it("persists escalation state and reads it back from the database", async () => {
    const now = new Date().toISOString();
    const escalationState = {
      id: "escalation-pglite-1",
      agentId: AGENT_ID,
      reason: "occurrence overdue",
      text: "You missed your morning routine",
      currentStep: 1,
      channelsSent: ["in_app", "discord"],
      startedAt: now,
      lastSentAt: now,
      resolved: false,
      resolvedAt: null,
      metadata: { occurrenceId: "occ-test-1" },
    };

    await repository.upsertEscalationState(escalationState);

    const active = await repository.getActiveEscalationState(AGENT_ID);
    expect(active).toBeDefined();
    expect(active?.id).toBe("escalation-pglite-1");
    expect(active?.reason).toBe("occurrence overdue");
    expect(active?.text).toBe("You missed your morning routine");
    expect(active?.currentStep).toBe(1);
    expect(active?.channelsSent).toEqual(["in_app", "discord"]);
    expect(active?.resolved).toBe(false);

    // Update to resolved
    await repository.resolveEscalationState("escalation-pglite-1", now);
    const resolved = await repository.getActiveEscalationState(AGENT_ID);
    expect(resolved).toBeNull();

    // Verify it's still in recent history
    const recent = await repository.listRecentEscalationStates(AGENT_ID);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.resolved).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Additional integration tests
  // -----------------------------------------------------------------------

  it("returns an occurrence view with joined definition fields", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "View test",
      description: "Verify occurrence view join.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      source: "chat",
    });

    const occurrences = await repository.listOccurrencesForDefinition(
      AGENT_ID,
      record.definition.id,
    );
    expect(occurrences.length).toBeGreaterThanOrEqual(1);

    const firstOcc = requireDefined(occurrences[0], "first occurrence");
    const view = await repository.getOccurrenceView(AGENT_ID, firstOcc.id);
    expect(view).toBeDefined();
    expect(view?.title).toBe("View test");
    expect(view?.definitionKind).toBe("task");
    expect(view?.definitionStatus).toBe("active");
    expect(view?.definitionId).toBe(record.definition.id);
  });

  it("upserts a channel policy via the service and reads it back", async () => {
    const policy = await service.upsertChannelPolicy({
      channelType: "discord",
      channelRef: "dm-test-1",
      privacyClass: "private",
      allowReminders: true,
      allowEscalation: false,
      allowPosts: false,
      requireConfirmationForActions: true,
      metadata: { source: "discord", entityId: "owner-1" },
    });

    expect(policy.channelType).toBe("discord");
    expect(policy.channelRef).toBe("dm-test-1");
    expect(policy.allowReminders).toBe(true);
    expect(policy.allowEscalation).toBe(false);

    // Read back directly from the DB
    const dbPolicy = await repository.getChannelPolicy(
      AGENT_ID,
      "discord",
      "dm-test-1",
    );
    expect(dbPolicy).toBeDefined();
    expect(dbPolicy?.id).toBe(policy.id);
    expect(dbPolicy?.allowReminders).toBe(true);

    // Upsert updates the existing policy (same channelType + channelRef)
    const updated = await service.upsertChannelPolicy({
      channelType: "discord",
      channelRef: "dm-test-1",
      allowEscalation: true,
    });
    expect(updated.id).toBe(policy.id);
    expect(updated.allowEscalation).toBe(true);
    // allowReminders unchanged
    expect(updated.allowReminders).toBe(true);
  });

  it("records audit events during definition creation", async () => {
    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "Audit trail test",
      description: "Verify audit events.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      source: "chat",
    });

    // Query audit events directly
    const { rows } = await db.query<{ event_type: string }>(
      `SELECT event_type FROM life_audit_events
        WHERE agent_id = '${AGENT_ID}'
        ORDER BY created_at ASC`,
    );
    const eventTypes = rows.map((r) => r.event_type);
    expect(eventTypes).toContain("definition_created");
  });
});
