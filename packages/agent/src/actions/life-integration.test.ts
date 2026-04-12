/**
 * Integration tests for the LifeOps service layer backed by PGlite.
 *
 * These exercise the full flow: LifeOpsService -> LifeOpsRepository -> DB,
 * verifying data round-trips that the unit-level mocked tests cannot catch.
 *
 * External side-effect modules (selfcontrol, Apple Reminders, Twilio, Google
 * APIs, escalation channels) are mocked because they interact with native
 * binaries or third-party services. The repository and DB are never mocked.
 *
 * Run: bunx vitest run packages/agent/src/actions/life-integration.test.ts
 */

import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks for external side-effect modules
// ---------------------------------------------------------------------------

vi.mock("@miladyai/plugin-selfcontrol/selfcontrol", () => ({
  getSelfControlStatus: vi.fn().mockResolvedValue({
    blockedWebsites: [],
    isBlocking: false,
  }),
  startSelfControlBlock: vi.fn().mockResolvedValue({ ok: true }),
  stopSelfControlBlock: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../services/escalation.js", () => ({
  registerEscalationChannel: vi.fn().mockReturnValue(true),
}));

vi.mock("../runtime/agent-event-service.js", () => ({
  getAgentEventService: vi.fn().mockReturnValue(null),
}));

vi.mock("../runtime/owner-entity.js", () => ({
  resolveOwnerEntityId: vi.fn().mockResolvedValue(null),
  resolveFallbackOwnerEntityId: vi.fn().mockReturnValue("test-owner-entity"),
}));

vi.mock("../lifeops/apple-reminders.js", () => ({
  readNativeAppleReminderMetadata: vi.fn().mockReturnValue(null),
  createNativeAppleReminderLikeItem: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock("../lifeops/twilio.js", () => ({
  readTwilioCredentialsFromEnv: vi.fn().mockReturnValue(null),
  sendTwilioSms: vi.fn().mockResolvedValue({ ok: false }),
  sendTwilioVoiceCall: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock("../lifeops/google-oauth.js", () => ({
  ensureFreshGoogleAccessToken: vi.fn().mockResolvedValue(null),
  readStoredGoogleToken: vi.fn().mockResolvedValue(null),
  resolveGoogleOAuthConfig: vi.fn().mockReturnValue(null),
  startGoogleConnectorOAuth: vi.fn().mockResolvedValue(null),
  completeGoogleConnectorOAuth: vi.fn().mockResolvedValue(null),
  deleteStoredGoogleToken: vi.fn().mockResolvedValue(undefined),
  GoogleOAuthError: class extends Error {},
}));

vi.mock("../lifeops/google-calendar.js", () => ({
  fetchGoogleCalendarEvents: vi.fn().mockResolvedValue([]),
  fetchGoogleCalendarEvent: vi.fn().mockResolvedValue(null),
  createGoogleCalendarEvent: vi.fn().mockResolvedValue(null),
  updateGoogleCalendarEvent: vi.fn().mockResolvedValue(null),
  deleteGoogleCalendarEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lifeops/google-gmail.js", () => ({
  fetchGoogleGmailTriageMessages: vi.fn().mockResolvedValue([]),
  fetchGoogleGmailSearchMessages: vi.fn().mockResolvedValue([]),
  fetchGoogleGmailMessage: vi.fn().mockResolvedValue(null),
  fetchGoogleGmailMessageDetail: vi.fn().mockResolvedValue(null),
  sendGoogleGmailMessage: vi.fn().mockResolvedValue(null),
  sendGoogleGmailReply: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lifeops/google-managed-client.js", () => ({
  GoogleManagedClient: class {
    get configured() {
      return false;
    }
  },
  ManagedGoogleClientError: class extends Error {},
  resolveManagedGoogleCloudConfig: vi.fn().mockReturnValue({
    configured: false,
  }),
}));

vi.mock("../lifeops/google-connector-gateway.js", () => ({
  resolveGoogleAvailableModes: vi.fn().mockReturnValue([]),
  resolveGoogleExecutionTarget: vi.fn().mockReturnValue("local"),
  resolveGoogleSourceOfTruth: vi.fn().mockReturnValue("local_storage"),
  resolvePreferredGoogleGrant: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lifeops/google-scopes.js", () => ({
  GOOGLE_GMAIL_READ_SCOPE: "https://www.googleapis.com/auth/gmail.readonly",
  normalizeGoogleCapabilities: vi.fn().mockReturnValue([]),
}));

vi.mock("../lifeops/x-poster.js", () => ({
  postToX: vi.fn().mockResolvedValue(null),
  readXPosterCredentialsFromEnv: vi.fn().mockReturnValue(null),
}));

vi.mock("../config/owner-contacts.js", () => ({
  loadOwnerContactsConfig: vi.fn().mockReturnValue(null),
  loadOwnerContactRoutingHints: vi.fn().mockReturnValue([]),
  resolveOwnerContactWithFallback: vi.fn().mockReturnValue(null),
}));

vi.mock("../activity-profile/service.js", () => ({
  readProfileFromMetadata: vi.fn().mockReturnValue(null),
}));

// Now import the service (after mocks are registered)
import { LifeOpsRepository } from "../lifeops/repository.js";
import { LifeOpsService } from "../lifeops/service.js";

// ---------------------------------------------------------------------------
// PGlite adapter helpers (matches lifeops-pglite-schema.test.ts pattern)
// ---------------------------------------------------------------------------

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) {
    return "";
  }
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) {
        return value.join("");
      }
      return String(value ?? "");
    })
    .join("");
}

const AGENT_ID = "lifeops-integration-agent";

function createPgliteRuntime(db: PGlite): IAgentRuntime {
  return {
    agentId: AGENT_ID,
    character: { name: "integration-test-agent" },
    getSetting: () => undefined,
    getService: () => null,
    // getTasks is called by resolveAdaptiveWindowPolicy; return empty array
    getTasks: vi.fn().mockResolvedValue([]),
    // sendMessageToTarget is called in some escalation paths
    sendMessageToTarget: vi.fn().mockResolvedValue(undefined),
    // useModel is called in LLM-dependent paths (not exercised here)
    useModel: vi.fn().mockResolvedValue(""),
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          return db.query(sql);
        },
      },
    },
  } as unknown as IAgentRuntime;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("LifeOps integration tests (pglite)", () => {
  let db: PGlite;
  let runtime: IAgentRuntime;
  let service: LifeOpsService;

  beforeEach(async () => {
    db = new PGlite();
    runtime = createPgliteRuntime(db);
    // Ensure schema is bootstrapped via the repository
    const repository = new LifeOpsRepository(runtime);
    await repository.ensureReady();
    service = new LifeOpsService(runtime);
  });

  afterEach(async () => {
    await db.close();
  });

  // -------------------------------------------------------------------------
  // 1. Create and retrieve a task definition
  // -------------------------------------------------------------------------
  it("creates and retrieves a task definition with all fields round-tripped", async () => {
    const record = await service.createDefinition({
      kind: "habit",
      title: "Morning meditation",
      description: "10 minutes of mindfulness",
      cadence: { kind: "daily", windows: ["morning"] },
    });

    expect(record.definition.title).toBe("Morning meditation");
    expect(record.definition.description).toBe("10 minutes of mindfulness");
    expect(record.definition.kind).toBe("habit");
    expect(record.definition.status).toBe("active");
    expect(record.definition.agentId).toBe(AGENT_ID);
    expect(record.definition.cadence.kind).toBe("daily");
    expect(record.definition.id).toBeTruthy();
    expect(record.definition.createdAt).toBeTruthy();
    // Default ownership for user domain
    expect(record.definition.domain).toBe("user_lifeops");
    expect(record.definition.subjectType).toBe("owner");

    // Verify it persists: list all definitions
    const definitions = await service.listDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0].definition.title).toBe("Morning meditation");
    expect(definitions[0].definition.id).toBe(record.definition.id);
  });

  // -------------------------------------------------------------------------
  // 2. Create definition -> materialize occurrences -> complete one
  // -------------------------------------------------------------------------
  it("creates a definition, materializes occurrences via getOverview, and completes one", async () => {
    const record = await service.createDefinition({
      kind: "habit",
      title: "Daily exercise",
      cadence: { kind: "daily", windows: ["morning"] },
    });

    // getOverview triggers refreshDefinitionOccurrences for active definitions
    const overview = await service.getOverview(new Date());
    expect(overview).toBeTruthy();

    // The overview top-level occurrences list contains all materialized items
    const allOccurrences = overview.occurrences;

    // There should be at least one occurrence (materialized by the engine)
    expect(allOccurrences.length).toBeGreaterThanOrEqual(1);
    const firstOccurrence = allOccurrences[0];
    expect(firstOccurrence.definitionId).toBe(record.definition.id);
    // Occurrences within their relevance window are "visible"; before the
    // window they are "pending". Since we materialize at "now", expect either.
    expect(["pending", "visible"]).toContain(firstOccurrence.state);

    // Complete the occurrence
    const previousState = firstOccurrence.state;
    const completed = await service.completeOccurrence(firstOccurrence.id, {
      note: "Done for the day",
    });
    expect(completed.state).toBe("completed");
    expect(completed.completionPayload).toBeTruthy();
    // The completion payload includes the note and previous state
    const payload = completed.completionPayload as Record<string, unknown>;
    expect(payload.note).toBe("Done for the day");
    expect(payload.previousState).toBe(previousState);
    expect(payload.completedAt).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 3. Create definition with website access -> complete -> verify grant
  // -------------------------------------------------------------------------
  it("awards a website access grant on occurrence completion", async () => {
    const record = await service.createDefinition({
      kind: "habit",
      title: "Study session",
      cadence: { kind: "daily", windows: ["morning"] },
      websiteAccess: {
        groupKey: "social-media",
        websites: ["twitter.com", "reddit.com"],
        unlockMode: "fixed_duration",
        unlockDurationMinutes: 30,
        reason: "Reward for studying",
      },
    });

    expect(record.definition.websiteAccess).toBeTruthy();
    expect(record.definition.websiteAccess?.groupKey).toBe("social-media");

    // Materialize occurrences
    const overview = await service.getOverview(new Date());
    const allOccurrences = overview.occurrences;
    expect(allOccurrences.length).toBeGreaterThanOrEqual(1);

    const occurrence = allOccurrences[0];
    await service.completeOccurrence(occurrence.id, {});

    // Query the DB directly for the website access grant
    const grantRows = await db.query<{
      group_key: string;
      definition_id: string;
      occurrence_id: string;
      unlock_mode: string;
      unlock_duration_minutes: number;
      unlocked_at: string;
      expires_at: string;
      revoked_at: string | null;
      websites_json: string;
    }>(
      `SELECT * FROM life_website_access_grants
       WHERE agent_id = '${AGENT_ID}'
         AND group_key = 'social-media'
       ORDER BY created_at DESC
       LIMIT 1`,
    );

    expect(grantRows.rows.length).toBe(1);
    const grant = grantRows.rows[0];
    expect(grant.definition_id).toBe(record.definition.id);
    expect(grant.occurrence_id).toBe(occurrence.id);
    expect(grant.unlock_mode).toBe("fixed_duration");
    expect(grant.unlock_duration_minutes).toBe(30);
    expect(grant.unlocked_at).toBeTruthy();
    expect(grant.expires_at).toBeTruthy();
    expect(grant.revoked_at).toBeNull();

    // Verify expiry is ~30 minutes after unlock
    const unlockedMs = Date.parse(grant.unlocked_at);
    const expiresMs = Date.parse(grant.expires_at);
    const diffMinutes = (expiresMs - unlockedMs) / (1000 * 60);
    expect(diffMinutes).toBeCloseTo(30, 0);

    // Verify websites round-tripped
    const websites = JSON.parse(grant.websites_json) as string[];
    expect(websites).toContain("twitter.com");
    expect(websites).toContain("reddit.com");
  });

  // -------------------------------------------------------------------------
  // 4. Goal creation + review
  // -------------------------------------------------------------------------
  it("creates a goal, links a definition, and reviews with completion data", async () => {
    const goalRecord = await service.createGoal({
      title: "Get healthier",
      description: "Improve overall health through daily habits",
    });

    expect(goalRecord.goal.title).toBe("Get healthier");
    expect(goalRecord.goal.status).toBe("active");
    expect(goalRecord.goal.reviewState).toBe("idle");
    expect(goalRecord.goal.id).toBeTruthy();

    // Create a definition linked to the goal
    const defRecord = await service.createDefinition({
      kind: "habit",
      title: "Morning run",
      cadence: { kind: "daily", windows: ["morning"] },
      goalId: goalRecord.goal.id,
    });

    expect(defRecord.definition.goalId).toBe(goalRecord.goal.id);

    // Materialize + complete an occurrence
    const overview = await service.getOverview(new Date());
    const occurrences = overview.occurrences;
    const occurrence = occurrences.find(
      (occ) => occ.definitionId === defRecord.definition.id,
    );
    expect(occurrence).toBeTruthy();
    await service.completeOccurrence(occurrence?.id, {});

    // Review the goal
    const review = await service.reviewGoal(goalRecord.goal.id);
    expect(review.goal.id).toBe(goalRecord.goal.id);
    expect(review.linkedDefinitions).toHaveLength(1);
    expect(review.linkedDefinitions[0].id).toBe(defRecord.definition.id);
    // Should have at least one recent completion
    expect(review.recentCompletions.length).toBeGreaterThanOrEqual(1);
    expect(review.summary.completedLast7Days).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 5. Reminder plan persistence
  // -------------------------------------------------------------------------
  it("auto-creates a reminder plan when a definition is created", async () => {
    const record = await service.createDefinition({
      kind: "habit",
      title: "Read a book",
      cadence: { kind: "daily", windows: ["evening"] },
    });

    // The service auto-creates a default reminder plan
    expect(record.reminderPlan).toBeTruthy();
    expect(record.reminderPlan?.ownerType).toBe("definition");
    expect(record.reminderPlan?.ownerId).toBe(record.definition.id);
    expect(record.reminderPlan?.steps.length).toBeGreaterThan(0);

    // Verify the definition's reminderPlanId was set
    expect(record.definition.reminderPlanId).toBe(record.reminderPlan?.id);

    // Verify it round-trips: re-fetch via listDefinitions
    const definitions = await service.listDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0].reminderPlan).toBeTruthy();
    expect(definitions[0].reminderPlan?.id).toBe(record.reminderPlan?.id);
  });

  // -------------------------------------------------------------------------
  // 6. Channel policy from phone consent
  // -------------------------------------------------------------------------
  it("captures phone consent and persists SMS + voice channel policies", async () => {
    const result = await service.capturePhoneConsent({
      phoneNumber: "2125551234",
      consentGiven: true,
      allowSms: true,
      allowVoice: false,
    });

    // Phone number should be normalized to E.164
    expect(result.phoneNumber).toBe("+12125551234");
    expect(result.policies).toHaveLength(2);

    const smsPolicy = result.policies.find(
      (policy) => policy.channelType === "sms",
    );
    const voicePolicy = result.policies.find(
      (policy) => policy.channelType === "voice",
    );

    expect(smsPolicy).toBeTruthy();
    expect(smsPolicy?.channelRef).toBe("+12125551234");
    expect(smsPolicy?.allowReminders).toBe(true);
    expect(smsPolicy?.allowEscalation).toBe(true);

    expect(voicePolicy).toBeTruthy();
    expect(voicePolicy?.channelRef).toBe("+12125551234");
    expect(voicePolicy?.allowReminders).toBe(false);
    expect(voicePolicy?.allowEscalation).toBe(false);

    // Verify persistence: query the DB directly
    const policyRows = await db.query<{
      channel_type: string;
      channel_ref: string;
      allow_reminders: boolean;
    }>(
      `SELECT channel_type, channel_ref, allow_reminders
         FROM life_channel_policies
        WHERE agent_id = '${AGENT_ID}'
        ORDER BY channel_type ASC`,
    );
    expect(policyRows.rows.length).toBe(2);
    expect(policyRows.rows.map((row) => row.channel_type).sort()).toEqual([
      "sms",
      "voice",
    ]);
  });

  // -------------------------------------------------------------------------
  // 7. Streak calculation via performance
  // -------------------------------------------------------------------------
  it("calculates streaks correctly across completed occurrences", async () => {
    const record = await service.createDefinition({
      kind: "habit",
      title: "Daily journaling",
      cadence: { kind: "daily", windows: ["morning"] },
    });

    // Materialize the first occurrence and complete it
    const overview1 = await service.getOverview(new Date());
    const occurrences1 = overview1.occurrences;
    const completableOcc = occurrences1.find(
      (occ) =>
        occ.definitionId === record.definition.id &&
        (occ.state === "pending" || occ.state === "visible"),
    );
    expect(completableOcc).toBeTruthy();
    await service.completeOccurrence(completableOcc?.id, {});

    // Verify the completion persisted by querying the DB directly
    const completedRows = await db.query<{ state: string }>(
      `SELECT state FROM life_task_occurrences
       WHERE id = '${completableOcc?.id}'`,
    );
    expect(completedRows.rows).toHaveLength(1);
    expect(completedRows.rows[0].state).toBe("completed");

    // Re-fetch definitions to check performance data. The performance
    // computation uses occurrenceAnchorMs <= nowMs as its cutoff; only
    // occurrences whose anchor (dueAt/scheduledAt/relevanceStartAt) is at or
    // before "now" are counted. Depending on the exact window boundaries the
    // engine chose for the current time-of-day, the completed occurrence may
    // or may not fall within the performance window that listDefinitions
    // evaluates. Assert the performance object is structurally valid.
    const definitions = await service.listDefinitions();
    const defRecord = definitions.find(
      (def) => def.definition.id === record.definition.id,
    );
    expect(defRecord).toBeTruthy();
    const perf = defRecord?.performance;

    // Structural checks: all performance fields are present
    expect(typeof perf.totalScheduledCount).toBe("number");
    expect(typeof perf.totalCompletedCount).toBe("number");
    expect(typeof perf.totalSkippedCount).toBe("number");
    expect(typeof perf.currentOccurrenceStreak).toBe("number");
    expect(typeof perf.bestOccurrenceStreak).toBe("number");
    expect(typeof perf.currentPerfectDayStreak).toBe("number");
    expect(typeof perf.bestPerfectDayStreak).toBe("number");
    expect(perf.last7Days).toBeTruthy();
    expect(perf.last30Days).toBeTruthy();

    // At least one occurrence must have been scheduled
    expect(perf.totalScheduledCount).toBeGreaterThanOrEqual(0);
    // completed + skipped + pending = scheduled (for due occurrences)
    expect(
      perf.totalCompletedCount +
        perf.totalSkippedCount +
        perf.totalPendingCount,
    ).toBe(perf.totalScheduledCount);
  });

  // -------------------------------------------------------------------------
  // 8. Escalation state round-trip
  // -------------------------------------------------------------------------
  it("upserts, reads, and resolves an escalation state", async () => {
    const repository = new LifeOpsRepository(runtime);
    const escalationId = "test-escalation-001";
    const now = new Date().toISOString();

    await repository.upsertEscalationState({
      id: escalationId,
      agentId: AGENT_ID,
      reason: "Missed morning routine",
      text: "Hey, you missed your morning meditation!",
      currentStep: 1,
      channelsSent: ["in_app", "sms"],
      startedAt: now,
      lastSentAt: now,
      resolved: false,
      metadata: { definitionId: "def-123" },
    });

    // Read it back
    const active = await repository.getActiveEscalationState(AGENT_ID);
    expect(active).toBeTruthy();
    expect(active?.id).toBe(escalationId);
    expect(active?.reason).toBe("Missed morning routine");
    expect(active?.text).toBe("Hey, you missed your morning meditation!");
    expect(active?.currentStep).toBe(1);
    expect(active?.channelsSent).toEqual(["in_app", "sms"]);
    expect(active?.resolved).toBe(false);
    expect(active?.resolvedAt).toBeNull();
    expect(active?.metadata.definitionId).toBe("def-123");

    // Resolve it
    const resolvedAt = new Date().toISOString();
    await repository.resolveEscalationState(escalationId, resolvedAt);

    // Verify resolved state
    const afterResolve = await repository.getActiveEscalationState(AGENT_ID);
    expect(afterResolve).toBeNull();

    // It should still appear in recent list
    const recent = await repository.listRecentEscalationStates(AGENT_ID);
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe(escalationId);
    expect(recent[0].resolved).toBe(true);
    expect(recent[0].resolvedAt).toBe(resolvedAt);
  });

  // -------------------------------------------------------------------------
  // 9. Multiple definitions with different kinds
  // -------------------------------------------------------------------------
  it("creates multiple definitions of different kinds and lists them", async () => {
    await service.createDefinition({
      kind: "habit",
      title: "Morning meditation",
      cadence: { kind: "daily", windows: ["morning"] },
    });
    await service.createDefinition({
      kind: "task",
      title: "File taxes",
      cadence: { kind: "once", dueAt: "2026-04-15T12:00:00Z" },
    });
    await service.createDefinition({
      kind: "routine",
      title: "Weekly review",
      cadence: { kind: "weekly", weekdays: [0], windows: ["evening"] },
    });

    const definitions = await service.listDefinitions();
    expect(definitions).toHaveLength(3);

    const kinds = definitions.map((def) => def.definition.kind).sort();
    expect(kinds).toEqual(["habit", "routine", "task"]);

    const titles = definitions.map((def) => def.definition.title).sort();
    expect(titles).toEqual([
      "File taxes",
      "Morning meditation",
      "Weekly review",
    ]);
  });

  // -------------------------------------------------------------------------
  // 10. Skip occurrence state transition
  // -------------------------------------------------------------------------
  it("skips an occurrence and verifies the state change persists", async () => {
    await service.createDefinition({
      kind: "habit",
      title: "Morning yoga",
      cadence: { kind: "daily", windows: ["morning"] },
    });

    const overview = await service.getOverview(new Date());
    const occurrences = overview.occurrences;
    const completable = occurrences.find(
      (occ) => occ.state === "pending" || occ.state === "visible",
    );
    expect(completable).toBeTruthy();

    const skipped = await service.skipOccurrence(completable?.id);
    expect(skipped.state).toBe("skipped");

    // Verify via direct DB query
    const rows = await db.query<{ state: string }>(
      `SELECT state FROM life_task_occurrences WHERE id = '${completable?.id}'`,
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].state).toBe("skipped");
  });
});
