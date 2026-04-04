/**
 * PRD validation inventory for Milaidy life-ops.
 *
 * Replace each `it.todo()` with executable assertions as the corresponding
 * implementation lands. This file keeps the PRD's milestone and acceptance
 * surface inside the repo so the delivery scope does not drift.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { startApiServer } from "../src/api/server";
import { LifeOpsRepository } from "../src/lifeops/repository";
import { LifeOpsService } from "../src/lifeops/service";
import { req } from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";

type Phase = "P0" | "P1" | "P2" | "P3";
type Domain =
  | "onboarding"
  | "tasks"
  | "habits"
  | "goals"
  | "reminders"
  | "calendar"
  | "gmail"
  | "workflows"
  | "privacy"
  | "channels"
  | "browser"
  | "x";

type Scenario = {
  id: string;
  phase: Phase;
  domain: Domain;
  title: string;
};

const contractScenarios: Scenario[] = [
  {
    id: "P0-01",
    phase: "P0",
    domain: "onboarding",
    title:
      "conversational onboarding asks for the user's name when unknown and explains unlocked connector capabilities",
  },
  {
    id: "P0-02",
    phase: "P0",
    domain: "tasks",
    title:
      '"Remind me to brush my teeth every morning and every night" creates one durable definition with separate bounded occurrences',
  },
  {
    id: "P0-03",
    phase: "P0",
    domain: "habits",
    title:
      "morning and night occurrences only surface when their relevance windows are active",
  },
  {
    id: "P0-04",
    phase: "P0",
    domain: "reminders",
    title:
      "snoozing a habit occurrence by 30 minutes reliably resurfaces it after restart",
  },
  {
    id: "P0-05",
    phase: "P0",
    domain: "tasks",
    title:
      "completing a recurring habit marks only the current occurrence and does not retire the definition",
  },
  {
    id: "P0-06",
    phase: "P0",
    domain: "habits",
    title:
      "progressive routine rules store the progression formula, not only the latest numeric target",
  },
  {
    id: "P0-07",
    phase: "P0",
    domain: "goals",
    title:
      "goals remain first-class objects with their own review surface and may suggest supporting tasks without collapsing into todos",
  },
  {
    id: "P0-08",
    phase: "P0",
    domain: "reminders",
    title:
      "the right rail shows next urgent tasks and active reminders without rendering every recurring item all day",
  },
  {
    id: "P0-09",
    phase: "P0",
    domain: "privacy",
    title:
      "personal routines, health-adjacent habits, and emotional goals default to private surfaces and are blocked from public contexts",
  },
  {
    id: "P1-01",
    phase: "P1",
    domain: "calendar",
    title:
      "desktop local mode completes Google OAuth via installed-app PKCE plus loopback callback for calendar read access",
  },
  {
    id: "P1-02",
    phase: "P1",
    domain: "calendar",
    title:
      "remote or hosted mode completes Google OAuth via web-server callback while exposing the same connector status contract to the UI",
  },
  {
    id: "P1-03",
    phase: "P1",
    domain: "calendar",
    title:
      "today's calendar widget shows upcoming events in order and supports click-through into fuller detail",
  },
  {
    id: "P1-04",
    phase: "P1",
    domain: "calendar",
    title:
      "the agent answers next-event context questions with time, attendees, location, preparation needs, and linked mail context when available",
  },
  {
    id: "P1-05",
    phase: "P1",
    domain: "calendar",
    title:
      '"Schedule something for me tomorrow afternoon" requires calendar write capability and creates the expected event window',
  },
  {
    id: "P1-06",
    phase: "P1",
    domain: "reminders",
    title:
      "calendar event reminders are emitted through the same reminder and escalation engine used for tasks",
  },
  {
    id: "P1-07",
    phase: "P1",
    domain: "gmail",
    title:
      "Gmail triage surfaces important new mail and likely-reply-needed messages with clearly scoped permissions",
  },
  {
    id: "P1-08",
    phase: "P1",
    domain: "gmail",
    title:
      "reply drafting is allowed but message send remains blocked until the user explicitly confirms or enables a trusted automation",
  },
  {
    id: "P1-09",
    phase: "P1",
    domain: "gmail",
    title:
      "adding Gmail after Calendar triggers an explicit re-consent flow and updates the recorded granted capabilities",
  },
  {
    id: "P2-01",
    phase: "P2",
    domain: "channels",
    title:
      "phone number capture requires explicit consent and records whether SMS and voice escalation are individually allowed",
  },
  {
    id: "P2-02",
    phase: "P2",
    domain: "reminders",
    title:
      "multi-step escalation respects quiet hours, channel policies, urgency, and prior acknowledgment state",
  },
  {
    id: "P2-03",
    phase: "P2",
    domain: "workflows",
    title:
      "scheduled workflows are inspectable, editable, pausable, and attributable to a clear origin",
  },
  {
    id: "P2-04",
    phase: "P2",
    domain: "workflows",
    title:
      "workflow actions may create tasks, check calendar or mail state, summarize information, and run browser actions under policy gates",
  },
  {
    id: "P2-05",
    phase: "P2",
    domain: "reminders",
    title:
      "the user can inspect why a reminder fired, which connector was used, and which escalation step executed",
  },
  {
    id: "P3-01",
    phase: "P3",
    domain: "x",
    title:
      "X read and write capabilities are stored separately and presented as distinct permissions",
  },
  {
    id: "P3-02",
    phase: "P3",
    domain: "x",
    title:
      "posting to X never happens without per-post confirmation or an independently approved trusted posting policy",
  },
  {
    id: "P3-03",
    phase: "P3",
    domain: "browser",
    title:
      "agent-controlled browser sessions expose visible state including awaiting confirmation, navigating, and done",
  },
  {
    id: "P3-04",
    phase: "P3",
    domain: "browser",
    title:
      "browser-side account-affecting actions require explicit confirmation before execution",
  },
];

const liveScenarios: Scenario[] = [
  {
    id: "LIVE-01",
    phase: "P1",
    domain: "calendar",
    title:
      "real Google desktop OAuth loopback callback exchanges a code and stores a refresh token locally",
  },
  {
    id: "LIVE-02",
    phase: "P1",
    domain: "calendar",
    title:
      "real Google remote HTTPS callback exchanges a code and surfaces connected status to the Milady UI",
  },
  {
    id: "LIVE-03",
    phase: "P1",
    domain: "calendar",
    title:
      "real Google Calendar sync refreshes upcoming events and recovers cleanly after access token expiry",
  },
  {
    id: "LIVE-04",
    phase: "P1",
    domain: "gmail",
    title:
      "real Gmail triage reads the configured mailbox with the approved scope set and never sends mail automatically",
  },
  {
    id: "LIVE-05",
    phase: "P1",
    domain: "gmail",
    title:
      "revoking Google access on the account side forces connector status back to disconnected or needs-reauth",
  },
  {
    id: "LIVE-06",
    phase: "P2",
    domain: "channels",
    title:
      "Twilio or approved private channel escalation fires only on allowed channels and records the delivery audit trail",
  },
  {
    id: "LIVE-07",
    phase: "P2",
    domain: "calendar",
    title:
      "Workspace admin policy blocks produce a surfaced permission error instead of a silent connector failure",
  },
  {
    id: "LIVE-08",
    phase: "P3",
    domain: "browser",
    title:
      "real browser-session visibility stays in sync while the agent navigates and waits for user approval",
  },
];

const requiredDomains: Domain[] = [
  "onboarding",
  "tasks",
  "habits",
  "goals",
  "reminders",
  "calendar",
  "gmail",
  "workflows",
  "privacy",
  "channels",
  "browser",
  "x",
];

function assertUniqueScenarioIds(scenarios: Scenario[]): void {
  const ids = scenarios.map((scenario) => scenario.id);
  expect(new Set(ids).size).toBe(ids.length);
}

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

function createSqliteRuntime(agentId = "milaidy-lifeops-prd-agent"): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  const runtimeSubset = {
    agentId,
    character: { name: "MilaidyLifeOpsValidation" },
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          if (sql.length === 0) return [];
          if (/^(select|pragma)\b/i.test(sql)) {
            return sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
          }
          sqlite.exec(sql);
          return [];
        },
      },
    },
  };
  return runtimeSubset as unknown as AgentRuntime;
}

function createApiRuntime(agentId = "milaidy-lifeops-prd-api-agent"): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId,
    character: { name: "MilaidyLifeOpsValidation" } as AgentRuntime["character"],
    getSetting: () => undefined,
    getService: () => null,
    getRoomsByWorld: async () => [],
    getTasks: async (query?: { tags?: string[] }) => {
      if (!query?.tags || query.tags.length === 0) return tasks;
      return tasks.filter((task) =>
        query.tags?.every((tag) => task.tags?.includes(tag)),
      );
    },
    getTask: async (taskId: UUID) =>
      tasks.find((task) => task.id === taskId) ?? null,
    createTask: async (task: Task) => {
      const id = (task.id as UUID | undefined) ?? (crypto.randomUUID() as UUID);
      tasks.push({ ...task, id });
      return id;
    },
    updateTask: async (taskId: UUID, update: Partial<Task>) => {
      tasks = tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...update,
              metadata: {
                ...((task.metadata as Record<string, unknown> | undefined) ?? {}),
                ...((update.metadata as Record<string, unknown> | undefined) ?? {}),
              } as Task["metadata"],
            }
          : task,
      );
    },
    deleteTask: async (taskId: UUID) => {
      tasks = tasks.filter((task) => task.id !== taskId);
    },
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          if (sql.length === 0) return [];
          if (/^(select|pragma)\b/i.test(sql)) {
            return sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
          }
          sqlite.exec(sql);
          return [];
        },
      },
    },
  };
  return runtimeSubset as unknown as AgentRuntime;
}

function buildIdToken(claims: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.signature`;
}

async function withGoogleOAuthApiServer<T>(
  env: Record<string, string>,
  fn: (args: {
    port: number;
    stateDir: string;
    fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  }) => Promise<T>,
): Promise<T> {
  const envBackup = saveEnv(
    "ELIZA_STATE_DIR",
    "MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
    "ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
    "MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID",
    "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_ID",
    "MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
    "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
    "MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL",
    "ELIZA_GOOGLE_OAUTH_PUBLIC_BASE_URL",
  );
  const stateDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "milaidy-prd-google-oauth-"),
  );
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  process.env.ELIZA_STATE_DIR = stateDir;
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  const server = await startApiServer({
    port: 0,
    runtime: createApiRuntime(),
  });

  try {
    return await fn({
      port: server.port,
      stateDir,
      fetchMock,
    });
  } finally {
    await server.close();
    vi.unstubAllGlobals();
    await fs.rm(stateDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    envBackup.restore();
  }
}

async function createMorningNightHabit(runtime: AgentRuntime) {
  const service = new LifeOpsService(runtime);
  const created = await service.createDefinition({
    kind: "habit",
    title: "Brush teeth",
    description: "Brush every morning and night",
    originalIntent: "Remind me to brush my teeth every morning and every night",
    timezone: "America/Los_Angeles",
    cadence: {
      kind: "daily",
      windows: ["morning", "night"],
    },
  });
  return {
    service,
    created,
  };
}

function requireOccurrenceByWindow(
  overview: Awaited<ReturnType<LifeOpsService["getOverview"]>>,
  windowName: string,
) {
  const occurrence = overview.occurrences.find(
    (candidate) => candidate.windowName === windowName,
  );
  expect(occurrence).toBeDefined();
  return occurrence!;
}

function buildDenseSlots() {
  return Array.from({ length: 12 }, (_, index) => ({
    key: `slot-${index + 1}`,
    label: `Slot ${index + 1}`,
    minuteOfDay: index * 90,
    durationMinutes: 20,
  }));
}

describe("Milaidy PRD validation inventory", () => {
  it("covers every milestone phase", () => {
    const phases = [...new Set(contractScenarios.map((scenario) => scenario.phase))].sort();
    expect(phases).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("covers every required product domain", () => {
    const domains = new Set(contractScenarios.map((scenario) => scenario.domain));
    for (const domain of requiredDomains) {
      expect(domains.has(domain)).toBe(true);
    }
  });

  it("keeps contract scenario ids unique", () => {
    assertUniqueScenarioIds(contractScenarios);
  });

  it("keeps live scenario ids unique", () => {
    assertUniqueScenarioIds(liveScenarios);
  });
});

for (const phase of ["P0", "P1", "P2", "P3"] as const) {
  describe(`Milaidy PRD contract coverage ${phase}`, () => {
    for (const scenario of contractScenarios.filter(
      (candidate) => candidate.phase === phase,
    )) {
      if (scenario.id === "P0-02") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-02-agent");
          const { service, created } = await createMorningNightHabit(runtime);
          const repository = new LifeOpsRepository(runtime);

          expect(created.definition.status).toBe("active");
          expect(created.reminderPlan?.steps).toHaveLength(1);

          const overview = await service.getOverview(
            new Date("2026-04-04T16:00:00.000Z"),
          );
          const morning = requireOccurrenceByWindow(overview, "morning");
          const night = requireOccurrenceByWindow(overview, "night");
          expect(morning.state).toBe("visible");
          expect(night.state).toBe("pending");
          expect(morning.definitionId).toBe(created.definition.id);
          expect(night.definitionId).toBe(created.definition.id);
          expect(morning.id).not.toBe(night.id);
          expect(new Date(morning.scheduledAt ?? 0).getTime()).toBeLessThan(
            new Date(night.scheduledAt ?? 0).getTime(),
          );

          const persisted = await repository.listOccurrencesForDefinition(
            created.definition.agentId,
            created.definition.id,
          );
          expect(persisted.map((occurrence) => occurrence.windowName)).toEqual(
            expect.arrayContaining(["morning", "night"]),
          );
        });
        continue;
      }

      if (scenario.id === "P0-03") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-03-agent");
          const { service } = await createMorningNightHabit(runtime);

          const morningOverview = await service.getOverview(
            new Date("2026-04-04T16:00:00.000Z"),
          );
          expect(requireOccurrenceByWindow(morningOverview, "morning").state).toBe(
            "visible",
          );
          expect(requireOccurrenceByWindow(morningOverview, "night").state).toBe(
            "pending",
          );

          const afternoonOverview = await service.getOverview(
            new Date("2026-04-04T20:30:00.000Z"),
          );
          expect(
            afternoonOverview.occurrences.some(
              (occurrence) =>
                occurrence.windowName === "morning" &&
                occurrence.state === "visible",
            ),
          ).toBe(false);
          expect(
            requireOccurrenceByWindow(afternoonOverview, "night").state,
          ).toBe("pending");
        });
        continue;
      }

      if (scenario.id === "P0-04") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-04-agent");
          const { service } = await createMorningNightHabit(runtime);
          const morningTime = new Date("2026-04-04T16:00:00.000Z");
          const morningOverview = await service.getOverview(
            morningTime,
          );
          const morning = requireOccurrenceByWindow(morningOverview, "morning");

          const snoozed = await service.snoozeOccurrence(morning.id, {
            minutes: 30,
          }, morningTime);
          expect(snoozed.state).toBe("snoozed");

          const restartedService = new LifeOpsService(runtime);
          const beforeResurface = await restartedService.getOverview(
            new Date("2026-04-04T16:20:00.000Z"),
          );
          expect(
            beforeResurface.occurrences.find(
              (occurrence) => occurrence.id === morning.id,
            )?.state,
          ).toBe("snoozed");

          const afterResurface = await restartedService.getOverview(
            new Date("2026-04-04T16:31:00.000Z"),
          );
          expect(
            afterResurface.occurrences.find(
              (occurrence) => occurrence.id === morning.id,
            )?.state,
          ).toBe("visible");
        });
        continue;
      }

      if (scenario.id === "P0-05") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-05-agent");
          const { service, created } = await createMorningNightHabit(runtime);
          const repository = new LifeOpsRepository(runtime);
          const morningTime = new Date("2026-04-04T16:00:00.000Z");
          const morningOverview = await service.getOverview(
            morningTime,
          );
          const morning = requireOccurrenceByWindow(morningOverview, "morning");

          const completed = await service.completeOccurrence(morning.id, {
            note: "done",
          }, morningTime);
          expect(completed.state).toBe("completed");

          const definitionRecord = await service.getDefinition(created.definition.id);
          expect(definitionRecord.definition.status).toBe("active");

          const occurrences = await repository.listOccurrencesForDefinition(
            created.definition.agentId,
            created.definition.id,
          );
          expect(
            occurrences.find((occurrence) => occurrence.id === morning.id)?.state,
          ).toBe("completed");
          expect(
            occurrences.some(
              (occurrence) =>
                occurrence.windowName === "night" && occurrence.state === "pending",
            ),
          ).toBe(true);
        });
        continue;
      }

      if (scenario.id === "P0-06") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-06-agent");
          const service = new LifeOpsService(runtime);
          const repository = new LifeOpsRepository(runtime);
          const created = await service.createDefinition({
            kind: "routine",
            title: "Push-ups",
            timezone: "America/Los_Angeles",
            cadence: {
              kind: "daily",
              windows: ["morning", "night"],
            },
            progressionRule: {
              kind: "linear_increment",
              metric: "reps",
              start: 20,
              step: 5,
              unit: "reps",
            },
          });

          const overview = await service.getOverview(
            new Date("2026-04-04T16:00:00.000Z"),
          );
          const morning = requireOccurrenceByWindow(overview, "morning");
          await service.completeOccurrence(
            morning.id,
            {},
            new Date("2026-04-04T16:00:00.000Z"),
          );

          const definitionRecord = await service.getDefinition(created.definition.id);
          expect(definitionRecord.definition.progressionRule).toEqual({
            kind: "linear_increment",
            metric: "reps",
            start: 20,
            step: 5,
            unit: "reps",
          });

          const occurrences = await repository.listOccurrencesForDefinition(
            created.definition.agentId,
            created.definition.id,
          );
          const night = occurrences.find(
            (occurrence) =>
              occurrence.windowName === "night" && occurrence.state === "pending",
          );
          expect(night?.derivedTarget).toMatchObject({
            kind: "linear_increment",
            metric: "reps",
            start: 20,
            step: 5,
            target: 25,
            unit: "reps",
          });
        });
        continue;
      }

      if (scenario.id === "P0-07") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-07-agent");
          const service = new LifeOpsService(runtime);
          const goalRecord = await service.createGoal({
            title: "Stabilize sleep schedule",
            description: "Wake up consistently and protect bedtime.",
          });
          const definitionRecord = await service.createDefinition({
            kind: "habit",
            title: "Lights out routine",
            timezone: "America/Los_Angeles",
            goalId: goalRecord.goal.id,
            cadence: {
              kind: "daily",
              windows: ["night"],
            },
          });

          const fetchedGoal = await service.getGoal(goalRecord.goal.id);
          expect(fetchedGoal.goal.id).toBe(goalRecord.goal.id);
          expect(fetchedGoal.links).toHaveLength(1);
          expect(fetchedGoal.links[0]).toMatchObject({
            goalId: goalRecord.goal.id,
            linkedType: "definition",
            linkedId: definitionRecord.definition.id,
          });

          const overview = await service.getOverview(
            new Date("2026-04-05T05:30:00.000Z"),
          );
          expect(overview.goals.map((goal) => goal.id)).toContain(goalRecord.goal.id);
        });
        continue;
      }

      if (scenario.id === "P0-08") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-08-agent");
          const service = new LifeOpsService(runtime);
          await service.createDefinition({
            kind: "routine",
            title: "Deep work pulse",
            timezone: "UTC",
            cadence: {
              kind: "times_per_day",
              slots: buildDenseSlots(),
            },
          });

          const overview = await service.getOverview(
            new Date("2026-04-04T00:30:00.000Z"),
          );
          expect(overview.occurrences.length).toBe(8);
          expect(overview.summary.activeOccurrenceCount).toBeGreaterThanOrEqual(1);
          expect(overview.reminders.length).toBeGreaterThanOrEqual(1);
          expect(
            overview.reminders.every((reminder) => reminder.channel === "in_app"),
          ).toBe(true);
        });
        continue;
      }

      if (scenario.id === "P1-01") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, stateDir, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    access_token: "desktop-access-token",
                    refresh_token: "desktop-refresh-token",
                    expires_in: 3600,
                    scope: [
                      "openid",
                      "email",
                      "profile",
                      "https://www.googleapis.com/auth/calendar.readonly",
                    ].join(" "),
                    token_type: "Bearer",
                    id_token: buildIdToken({
                      sub: "google-user-1",
                      email: "agent@example.com",
                      name: "Agent Example",
                      email_verified: true,
                    }),
                  }),
                  {
                    status: 200,
                    headers: { "content-type": "application/json" },
                  },
                ),
              );

              const startRes = await req(
                port,
                "POST",
                "/api/lifeops/connectors/google/start",
                { capabilities: ["google.calendar.read"] },
              );
              expect(startRes.status).toBe(200);
              expect(startRes.data.mode).toBe("local");
              expect(startRes.data.requestedCapabilities).toEqual([
                "google.basic_identity",
                "google.calendar.read",
              ]);

              const authUrl = new URL(String(startRes.data.authUrl));
              expect(authUrl.searchParams.get("redirect_uri")).toBe(
                `http://127.0.0.1:${port}/api/lifeops/connectors/google/callback`,
              );
              expect(authUrl.searchParams.get("code_challenge_method")).toBe(
                "S256",
              );
              expect(authUrl.searchParams.get("scope")?.split(" ")).toEqual(
                expect.arrayContaining([
                  "openid",
                  "email",
                  "profile",
                  "https://www.googleapis.com/auth/calendar.readonly",
                ]),
              );

              const callbackRes = await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=desktop-code`,
              );
              expect(callbackRes.status).toBe(200);
              expect(String(callbackRes.data._raw)).toContain("Google Connected");

              const statusRes = await req(
                port,
                "GET",
                "/api/lifeops/connectors/google/status",
              );
              expect(statusRes.status).toBe(200);
              expect(statusRes.data.connected).toBe(true);
              expect(statusRes.data.mode).toBe("local");
              expect(statusRes.data.reason).toBe("connected");
              expect(statusRes.data.grantedCapabilities).toEqual([
                "google.basic_identity",
                "google.calendar.read",
              ]);

              const grant = statusRes.data.grant as Record<string, unknown>;
              const tokenPath = path.join(
                stateDir,
                "credentials",
                "lifeops",
                "google",
                String(grant.tokenRef),
              );
              const raw = JSON.parse(await fs.readFile(tokenPath, "utf-8")) as {
                refreshToken: string;
              };
              expect(raw.refreshToken).toBe("desktop-refresh-token");
            },
          );
        });
        continue;
      }

      if (scenario.id === "P1-02") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID: "web-client-id",
              MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET: "web-client-secret",
              MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL: "https://milady.example.com",
            },
            async ({ port, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    access_token: "remote-access-token",
                    refresh_token: "remote-refresh-token",
                    expires_in: 7200,
                    scope: [
                      "openid",
                      "email",
                      "profile",
                      "https://www.googleapis.com/auth/calendar.readonly",
                      "https://www.googleapis.com/auth/calendar.events",
                    ].join(" "),
                    token_type: "Bearer",
                    id_token: buildIdToken({
                      sub: "google-user-2",
                      email: "remote@example.com",
                      name: "Remote Example",
                      email_verified: true,
                    }),
                  }),
                  {
                    status: 200,
                    headers: { "content-type": "application/json" },
                  },
                ),
              );

              const startRes = await req(
                port,
                "POST",
                "/api/lifeops/connectors/google/start",
                {
                  mode: "remote",
                  capabilities: ["google.calendar.write"],
                },
              );
              expect(startRes.status).toBe(200);
              expect(startRes.data.mode).toBe("remote");
              expect(startRes.data.redirectUri).toBe(
                "https://milady.example.com/api/lifeops/connectors/google/callback",
              );

              const authUrl = new URL(String(startRes.data.authUrl));
              expect(authUrl.searchParams.get("redirect_uri")).toBe(
                "https://milady.example.com/api/lifeops/connectors/google/callback",
              );
              expect(authUrl.searchParams.get("scope")?.split(" ")).toEqual(
                expect.arrayContaining([
                  "openid",
                  "email",
                  "profile",
                  "https://www.googleapis.com/auth/calendar.events",
                ]),
              );

              await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=remote-code`,
              );

              const statusRes = await req(
                port,
                "GET",
                "/api/lifeops/connectors/google/status?mode=remote",
              );
              expect(statusRes.status).toBe(200);
              expect(statusRes.data.connected).toBe(true);
              expect(statusRes.data.mode).toBe("remote");
              expect(statusRes.data.reason).toBe("connected");
              expect(statusRes.data.grantedCapabilities).toEqual([
                "google.basic_identity",
                "google.calendar.read",
                "google.calendar.write",
              ]);
              expect((statusRes.data.identity as Record<string, unknown>).email).toBe(
                "remote@example.com",
              );
            },
          );
        });
        continue;
      }

      if (scenario.id === "P1-03") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    access_token: "calendar-access-token",
                    refresh_token: "calendar-refresh-token",
                    expires_in: 3600,
                    scope: [
                      "openid",
                      "email",
                      "profile",
                      "https://www.googleapis.com/auth/calendar.readonly",
                    ].join(" "),
                    token_type: "Bearer",
                    id_token: buildIdToken({
                      sub: "google-user-3",
                      email: "calendar@example.com",
                      name: "Calendar Example",
                      email_verified: true,
                    }),
                  }),
                  {
                    status: 200,
                    headers: { "content-type": "application/json" },
                  },
                ),
              );

              const startRes = await req(
                port,
                "POST",
                "/api/lifeops/connectors/google/start",
                { capabilities: ["google.calendar.read"] },
              );
              expect(startRes.status).toBe(200);

              const authUrl = new URL(String(startRes.data.authUrl));
              await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=calendar-code`,
              );

              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    items: [
                      {
                        id: "event-later",
                        status: "confirmed",
                        summary: "Design review",
                        location: "Studio",
                        htmlLink: "https://calendar.google.com/event?eid=design",
                        start: {
                          dateTime: "2026-04-04T15:00:00-07:00",
                          timeZone: "America/Los_Angeles",
                        },
                        end: {
                          dateTime: "2026-04-04T16:00:00-07:00",
                          timeZone: "America/Los_Angeles",
                        },
                        attendees: [
                          {
                            email: "friend@example.com",
                            displayName: "Friend",
                            responseStatus: "accepted",
                          },
                        ],
                      },
                      {
                        id: "event-earlier",
                        status: "confirmed",
                        summary: "Morning standup",
                        htmlLink: "https://calendar.google.com/event?eid=standup",
                        start: {
                          dateTime: "2026-04-04T09:00:00-07:00",
                          timeZone: "America/Los_Angeles",
                        },
                        end: {
                          dateTime: "2026-04-04T09:30:00-07:00",
                          timeZone: "America/Los_Angeles",
                        },
                      },
                    ],
                  }),
                  {
                    status: 200,
                    headers: { "content-type": "application/json" },
                  },
                ),
              );

              const feedRes = await req(
                port,
                "GET",
                "/api/lifeops/calendar/feed?timeZone=America%2FLos_Angeles",
              );
              expect(feedRes.status).toBe(200);
              expect(feedRes.data.source).toBe("synced");
              expect(feedRes.data.events.map((event: { title: string }) => event.title)).toEqual([
                "Morning standup",
                "Design review",
              ]);
              expect(feedRes.data.events[1]).toMatchObject({
                title: "Design review",
                htmlLink: "https://calendar.google.com/event?eid=design",
              });
            },
          );
        });
        continue;
      }

      it.todo(`[${scenario.id}] ${scenario.title}`);
    }
  });
}

const describeLive =
  process.env.MILADY_LIFEOPS_LIVE_TEST === "1" ? describe : describe.skip;

describeLive("Milaidy PRD live connector coverage", () => {
  for (const scenario of liveScenarios) {
    it.todo(`[${scenario.id}] ${scenario.title}`);
  }
});
