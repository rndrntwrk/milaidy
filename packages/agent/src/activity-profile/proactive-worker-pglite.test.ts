/**
 * PGlite-backed integration tests for the proactive worker.
 *
 * These tests exercise the **data-fetching** paths that flow through
 * LifeOpsService to a real PGlite database.  External boundaries (activity
 * profile building from messages, owner-entity resolution, message sending,
 * event emission, config loaders, Google Calendar OAuth, selfcontrol, Apple
 * Reminders) remain mocked because they live outside the database boundary.
 *
 * The key principle: mock boundaries, use real DB for everything LifeOps
 * stores.
 */

import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LifeOpsRepository } from "../lifeops/repository.js";
import { LifeOpsService } from "../lifeops/service.js";

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
  deleteNativeAppleReminderLikeItem: vi.fn(),
  readNativeAppleReminderMetadata: vi.fn(),
  updateNativeAppleReminderLikeItem: vi.fn(),
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

vi.mock("../lifeops/apple-reminders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lifeops/apple-reminders.js")>();
  return {
    ...actual,
    createNativeAppleReminderLikeItem:
      appleReminderMocks.createNativeAppleReminderLikeItem,
    deleteNativeAppleReminderLikeItem:
      appleReminderMocks.deleteNativeAppleReminderLikeItem,
    readNativeAppleReminderMetadata:
      appleReminderMocks.readNativeAppleReminderMetadata,
    updateNativeAppleReminderLikeItem:
      appleReminderMocks.updateNativeAppleReminderLikeItem,
  };
});

// ---------------------------------------------------------------------------
// PGlite runtime adapter (matches the pattern in lifeops/service-pglite.test.ts)
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

const AGENT_ID = "pglite-proactive-test-agent" as UUID;

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
// Default mock wiring shared by all tests
// ---------------------------------------------------------------------------

function wireDefaultExternalMocks(): void {
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
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("proactive worker with real PGlite DB", () => {
  let db: PGlite;
  let runtime: IAgentRuntime;
  let service: LifeOpsService;
  let repository: LifeOpsRepository;

  beforeEach(async () => {
    db = new PGlite();
    runtime = createPgliteRuntime(db);
    wireDefaultExternalMocks();

    repository = new LifeOpsRepository(runtime);
    await repository.ensureReady();

    service = new LifeOpsService(runtime);
  });

  afterEach(async () => {
    await db.close();
  });

  // -----------------------------------------------------------------------
  // (1) Fetches real occurrences from DB for nudge planning
  // -----------------------------------------------------------------------

  it("getOverview returns materialized occurrences for a daily habit", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Brush teeth",
      description: "Morning brush.",
      cadence: { kind: "daily", windows: ["morning"] },
      source: "chat",
    });

    const now = new Date();
    const overview = await service.getOverview(now);

    // The overview should contain at least one occurrence from the habit
    // we just created, since daily habits materialize on creation.
    expect(overview.occurrences.length).toBeGreaterThanOrEqual(1);

    const matchingOcc = overview.occurrences.find(
      (occ) => occ.definitionId === record.definition.id,
    );
    expect(matchingOcc).toBeDefined();
    expect(matchingOcc?.title).toBe("Brush teeth");
    expect(matchingOcc?.definitionKind).toBe("habit");

    // Verify the fields that fetchPlannerContext maps into OccurrenceSlim
    // are all present and correctly typed.
    expect(typeof matchingOcc?.id).toBe("string");
    expect(typeof matchingOcc?.state).toBe("string");
    expect(matchingOcc?.cadence).toBeDefined();
    expect(typeof matchingOcc?.priority).toBe("number");
  });

  it("getOverview returns occurrences from multiple definitions", async () => {
    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Drink water",
      description: "Stay hydrated.",
      cadence: { kind: "daily", windows: ["morning"] },
      source: "chat",
    });

    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "File taxes",
      description: "File the return.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      source: "chat",
    });

    const now = new Date();
    const overview = await service.getOverview(now);

    // Should have at least one occurrence from each definition
    const titles = overview.occurrences.map((occ) => occ.title);
    expect(titles).toContain("Drink water");
    expect(titles).toContain("File taxes");
  });

  // -----------------------------------------------------------------------
  // (2) Fetches real goals from DB for goal check-in planning
  // -----------------------------------------------------------------------

  it("listGoals returns goals with linked definitions from the database", async () => {
    const goalRecord = await service.createGoal({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      title: "Get healthier",
      description: "Improve overall health.",
    });

    // Link a definition to the goal
    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Drink water",
      description: "8 glasses daily.",
      cadence: { kind: "daily", windows: ["morning"] },
      goalId: goalRecord.goal.id,
      source: "chat",
    });

    const goals = await service.listGoals();

    expect(goals).toHaveLength(1);
    expect(goals[0]?.goal.title).toBe("Get healthier");
    expect(goals[0]?.goal.status).toBe("active");
    expect(goals[0]?.links.length).toBeGreaterThanOrEqual(1);
  });

  it("reviewGoal returns correct summary for a goal with linked occurrences", async () => {
    const goalRecord = await service.createGoal({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      title: "Morning routine",
      description: "Establish a morning routine.",
    });

    const defRecord = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Stretch",
      description: "Morning stretch.",
      cadence: { kind: "daily", windows: ["morning"] },
      goalId: goalRecord.goal.id,
      source: "chat",
    });

    const now = new Date();
    const review = await service.reviewGoal(goalRecord.goal.id, now);

    // The review should reflect the linked definition
    expect(review.goal.id).toBe(goalRecord.goal.id);
    expect(review.summary.linkedDefinitionCount).toBe(1);

    // The GoalSlim mapping in fetchPlannerContext uses these fields:
    const scheduled =
      review.summary.activeOccurrenceCount +
      review.summary.overdueOccurrenceCount +
      review.summary.completedLast7Days;
    const recentCompletionRate =
      scheduled > 0 ? review.summary.completedLast7Days / scheduled : 0;

    expect(typeof recentCompletionRate).toBe("number");
    expect(recentCompletionRate).toBeGreaterThanOrEqual(0);
    expect(recentCompletionRate).toBeLessThanOrEqual(1);

    // Verify the linked definition is correctly associated
    expect(review.linkedDefinitions).toHaveLength(1);
    expect(review.linkedDefinitions[0]?.id).toBe(defRecord.definition.id);
  });

  it("reviewGoal reflects completed occurrences in the summary", async () => {
    const goalRecord = await service.createGoal({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      title: "Stay hydrated",
      description: "Drink water daily.",
    });

    const defRecord = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "Drink water now",
      description: "One glass.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      goalId: goalRecord.goal.id,
      source: "chat",
    });

    // Complete the occurrence
    const occurrences = await repository.listOccurrencesForDefinition(
      AGENT_ID,
      defRecord.definition.id,
    );
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
    const actionableOcc = occurrences.find(
      (occ) => occ.state === "visible" || occ.state === "pending",
    );
    expect(actionableOcc).toBeDefined();
    await service.completeOccurrence(actionableOcc!.id, { note: "Done." });

    const now = new Date();
    const review = await service.reviewGoal(goalRecord.goal.id, now);

    // completedLast7Days should count the completion we just made
    expect(review.summary.completedLast7Days).toBeGreaterThanOrEqual(1);
    expect(review.recentCompletions.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // (3) Seeding check queries real DB state
  // -----------------------------------------------------------------------

  it("checkAndOfferSeeding returns needsSeeding=true on empty DB", async () => {
    const result = await service.checkAndOfferSeeding();
    expect(result.needsSeeding).toBe(true);
    expect(result.availableTemplates.length).toBeGreaterThan(0);
  });

  it("checkAndOfferSeeding returns needsSeeding=false after creating a definition", async () => {
    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "Existing task",
      description: "Already have routines.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      source: "chat",
    });

    const result = await service.checkAndOfferSeeding();
    expect(result.needsSeeding).toBe(false);
    expect(result.availableTemplates).toHaveLength(0);
  });

  it("checkAndOfferSeeding returns needsSeeding=false after markSeedingOffered", async () => {
    // Verify it starts needing seeding
    const before = await service.checkAndOfferSeeding();
    expect(before.needsSeeding).toBe(true);

    // Mark seeding as offered (writes an audit event)
    await service.markSeedingOffered();

    // Now it should not need seeding even though there are no definitions,
    // because the audit trail records the offer.
    const after = await service.checkAndOfferSeeding();
    expect(after.needsSeeding).toBe(false);
  });

  it("applySeedRoutines creates definitions and prevents re-seeding", async () => {
    const createdIds = await service.applySeedRoutines(["brush_teeth"]);
    expect(createdIds).toHaveLength(1);

    // After applying seed routines, definitions exist so seeding is not needed
    const result = await service.checkAndOfferSeeding();
    expect(result.needsSeeding).toBe(false);

    // The seed definitions should also show up in the overview
    const overview = await service.getOverview(new Date());
    const brushOcc = overview.occurrences.find(
      (occ) => occ.title === "Brush teeth",
    );
    expect(brushOcc).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // (4) Activity signals persist and read back
  // -----------------------------------------------------------------------

  it("captureActivitySignal persists and listActivitySignals reads back", async () => {
    const now = new Date();
    await service.captureActivitySignal({
      source: "app_lifecycle",
      platform: "desktop_app",
      state: "active",
      observedAt: now.toISOString(),
    });

    await service.captureActivitySignal({
      source: "app_lifecycle",
      platform: "desktop_app",
      state: "idle",
      observedAt: new Date(now.getTime() + 60_000).toISOString(),
    });

    const signals = await service.listActivitySignals({ limit: 10 });
    expect(signals).toHaveLength(2);

    // Verify ordering (most recent first or both present)
    const states = signals.map((s) => s.state);
    expect(states).toContain("active");
    expect(states).toContain("idle");
  });

  it("listActivitySignals filters by state", async () => {
    const now = new Date();
    await service.captureActivitySignal({
      source: "app_lifecycle",
      platform: "desktop_app",
      state: "active",
      observedAt: now.toISOString(),
    });
    await service.captureActivitySignal({
      source: "app_lifecycle",
      platform: "desktop_app",
      state: "idle",
      observedAt: new Date(now.getTime() + 60_000).toISOString(),
    });

    const activeOnly = await service.listActivitySignals({
      states: ["active"],
    });
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0]?.state).toBe("active");
  });

  // -----------------------------------------------------------------------
  // (5) Overview + goal data round-trip matching fetchPlannerContext shape
  // -----------------------------------------------------------------------

  it("getOverview occurrence fields match the OccurrenceSlim mapping in fetchPlannerContext", async () => {
    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Take vitamins",
      description: "Daily vitamins.",
      cadence: { kind: "daily", windows: ["morning"] },
      priority: 4,
      source: "chat",
    });

    const overview = await service.getOverview(new Date());
    const occ = overview.occurrences.find(
      (o) => o.title === "Take vitamins",
    );
    expect(occ).toBeDefined();

    // These are the exact fields fetchPlannerContext reads from each occurrence
    // to build an OccurrenceSlim:
    //   id, title (fallback to definitionId), dueAt, state,
    //   definitionKind, cadence.kind, priority
    expect(typeof occ!.id).toBe("string");
    expect(occ!.title).toBe("Take vitamins");
    expect(occ!.definitionKind).toBe("habit");
    expect(occ!.cadence).toMatchObject({ kind: "daily" });
    expect(occ!.priority).toBe(4);
    // dueAt may be null for some cadence types; for daily it should be set
    expect(occ!.dueAt).toBeDefined();
    // state should be one of the valid occurrence states
    expect(["visible", "pending", "snoozed", "expired"]).toContain(occ!.state);
  });

  it("goal review fields match the GoalSlim mapping in fetchPlannerContext", async () => {
    const goalRecord = await service.createGoal({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      title: "Exercise regularly",
      description: "Build a workout habit.",
    });

    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Workout",
      description: "30 min exercise.",
      cadence: { kind: "daily", windows: ["morning"] },
      goalId: goalRecord.goal.id,
      source: "chat",
    });

    const goals = await service.listGoals();
    expect(goals).toHaveLength(1);

    const record = goals[0]!;
    expect(record.goal.status).toBe("active");

    const review = await service.reviewGoal(record.goal.id, new Date());

    // These are the exact fields fetchPlannerContext reads to build GoalSlim:
    //   id, title, status, linkedDefinitionCount, recentCompletionRate,
    //   lastReviewedAt (mapped from summary.lastActivityAt)
    expect(typeof review.goal.id).toBe("string");
    expect(review.goal.title).toBe("Exercise regularly");
    expect(review.goal.status).toBe("active");
    expect(typeof review.summary.linkedDefinitionCount).toBe("number");
    expect(review.summary.linkedDefinitionCount).toBe(1);
    expect(typeof review.summary.completedLast7Days).toBe("number");
    expect(typeof review.summary.activeOccurrenceCount).toBe("number");
    expect(typeof review.summary.overdueOccurrenceCount).toBe("number");
  });

  // -----------------------------------------------------------------------
  // (6) Calendar feed gracefully fails without Google OAuth
  // -----------------------------------------------------------------------

  it("getCalendarFeed throws 409 when Google Calendar is not connected", async () => {
    // This validates the fetchPlannerContext error path: the worker catches
    // 409 from getCalendarFeed and returns partial context (occurrences only).
    const { LifeOpsServiceError: ServiceError } = await import(
      "../lifeops/service.js"
    );

    await expect(
      service.getCalendarFeed(
        new URL("http://localhost/api/lifeops/calendar"),
        {},
        new Date(),
      ),
    ).rejects.toThrow(ServiceError);

    try {
      await service.getCalendarFeed(
        new URL("http://localhost/api/lifeops/calendar"),
        {},
        new Date(),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      // The proactive worker specifically checks for status 409
      expect((error as InstanceType<typeof ServiceError>).status).toBe(409);
    }
  });

  // -----------------------------------------------------------------------
  // (7) Audit trail for seeding offer round-trip
  // -----------------------------------------------------------------------

  it("markSeedingOffered creates an audit event that checkAndOfferSeeding reads", async () => {
    // Start: needs seeding
    expect((await service.checkAndOfferSeeding()).needsSeeding).toBe(true);

    // Record the offer
    await service.markSeedingOffered();

    // Verify the audit event was written to the DB
    const { rows } = await db.query<{ event_type: string; reason: string }>(
      `SELECT event_type, reason FROM life_audit_events
        WHERE agent_id = '${AGENT_ID}'
        AND event_type = 'seeding_offered'
        ORDER BY created_at DESC
        LIMIT 1`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event_type).toBe("seeding_offered");
    expect(rows[0]?.reason).toBe("seed routines offered");

    // Now checkAndOfferSeeding reads this audit and returns false
    expect((await service.checkAndOfferSeeding()).needsSeeding).toBe(false);
  });

  // -----------------------------------------------------------------------
  // (8) Complete occurrence changes overview state
  // -----------------------------------------------------------------------

  it("completing an occurrence removes it from overview active list", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "One-off task",
      description: "Complete once.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      source: "chat",
    });

    // Verify the occurrence appears in the overview
    const overviewBefore = await service.getOverview(new Date());
    const occBefore = overviewBefore.occurrences.find(
      (occ) => occ.definitionId === record.definition.id,
    );
    expect(occBefore).toBeDefined();
    expect(["visible", "pending"]).toContain(occBefore!.state);

    // Complete it
    await service.completeOccurrence(occBefore!.id, { note: "Done." });

    // After completion, the occurrence should not appear as visible/pending
    const overviewAfter = await service.getOverview(new Date());
    const occAfter = overviewAfter.occurrences.find(
      (occ) =>
        occ.definitionId === record.definition.id &&
        (occ.state === "visible" || occ.state === "pending"),
    );
    expect(occAfter).toBeUndefined();
  });
});
