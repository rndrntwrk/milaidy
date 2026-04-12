/**
 * Integration tests for the website-blocker GET ?host= endpoint backed by a
 * real PGlite database.
 *
 * The route handler's `resolveRequiredTasksForHost()` dynamically imports
 * `LifeOpsRepository` and queries real task definitions with websiteAccess
 * policies.  These tests exercise that path end-to-end against an in-memory
 * PGlite instance.
 *
 * Only the OS-level blocker (`@miladyai/plugin-selfcontrol/selfcontrol`) and
 * external service dependencies are mocked -- the LifeOps repository + SQL
 * layer are real.
 */

import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebsiteBlockerRouteContext } from "../../src/api/website-blocker-routes";
import { handleWebsiteBlockerRoutes } from "../../src/api/website-blocker-routes";
import { LifeOpsRepository } from "../../src/lifeops/repository";
import { LifeOpsService } from "../../src/lifeops/service";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

// ---------------------------------------------------------------------------
// External module mocks
// ---------------------------------------------------------------------------

const selfControlMocks = vi.hoisted(() => ({
  getSelfControlStatus: vi.fn(),
  startSelfControlBlock: vi.fn(),
  stopSelfControlBlock: vi.fn(),
}));

vi.mock("@miladyai/plugin-selfcontrol/selfcontrol", () => ({
  getSelfControlStatus: selfControlMocks.getSelfControlStatus,
  startSelfControlBlock: selfControlMocks.startSelfControlBlock,
  stopSelfControlBlock: selfControlMocks.stopSelfControlBlock,
}));

// The route handler lazy-imports @miladyai/plugin-selfcontrol for
// syncWebsiteBlockerExpiryTask; stub it since we never exercise POST/PUT.
vi.mock("@miladyai/plugin-selfcontrol", () => ({
  syncWebsiteBlockerExpiryTask: vi.fn(),
}));

// LifeOpsService transitive dependencies outside the DB boundary:
vi.mock("../../src/config/owner-contacts.js", () => ({
  loadOwnerContactsConfig: vi.fn().mockReturnValue({}),
  loadOwnerContactRoutingHints: vi.fn().mockReturnValue([]),
  resolveOwnerContactWithFallback: vi.fn().mockReturnValue(null),
}));

vi.mock("../../src/runtime/owner-entity.js", () => ({
  resolveOwnerEntityId: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../src/runtime/agent-event-service.js", () => ({
  getAgentEventService: vi.fn().mockReturnValue({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

vi.mock("../../src/lifeops/apple-reminders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lifeops/apple-reminders.js")>();
  return {
    ...actual,
    createNativeAppleReminderLikeItem: vi.fn().mockResolvedValue({
      ok: true,
      provider: "apple_reminders",
      reminderId: "stub",
    }),
    updateNativeAppleReminderLikeItem: vi.fn().mockResolvedValue({
      ok: true,
      provider: "apple_reminders",
      reminderId: "stub",
    }),
    deleteNativeAppleReminderLikeItem: vi.fn().mockResolvedValue({
      ok: true,
      provider: "apple_reminders",
    }),
    readNativeAppleReminderMetadata: vi.fn().mockReturnValue(null),
  };
});

vi.mock("../../src/services/escalation.js", () => ({
  registerEscalationChannel: vi.fn(),
}));

// ---------------------------------------------------------------------------
// PGlite runtime adapter (mirrors service-pglite.test.ts)
// ---------------------------------------------------------------------------

const AGENT_ID = "pglite-blocker-test-agent" as UUID;

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
// Context builder (matches existing website-blocker-routes.test.ts pattern)
// ---------------------------------------------------------------------------

function buildCtx(
  method: string,
  pathname: string,
  runtime?: IAgentRuntime,
  fullUrl?: string,
): WebsiteBlockerRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: fullUrl ?? pathname }),
    res,
    method,
    pathname,
    runtime,
    json: vi.fn((response, data, status = 200) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    }),
    error: vi.fn((response, message, status = 500) => {
      response.writeHead(status);
      response.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => null),
  };
}

function getJsonPayload(ctx: WebsiteBlockerRouteContext): unknown {
  return (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("website-blocker-routes (PGlite integration)", () => {
  let db: PGlite;
  let runtime: IAgentRuntime;
  let service: LifeOpsService;
  let repository: LifeOpsRepository;

  beforeEach(async () => {
    db = new PGlite();
    runtime = createPgliteRuntime(db);

    repository = new LifeOpsRepository(runtime);
    await repository.ensureReady();

    service = new LifeOpsService(runtime);

    // Default: selfcontrol reports x.com and twitter.com as blocked.
    selfControlMocks.getSelfControlStatus.mockResolvedValue({
      available: true,
      active: true,
      hostsFilePath: "/etc/hosts",
      endsAt: null,
      websites: ["x.com", "twitter.com"],
      managedBy: "lifeops",
      metadata: null,
      canUnblockEarly: true,
      requiresElevation: false,
      engine: "hosts-file",
      platform: process.platform,
      supportsElevationPrompt: true,
      elevationPromptMethod: "osascript",
    });

    // LifeOpsService.syncWebsiteAccessState calls start/stop during
    // definition creation and occurrence completion.
    selfControlMocks.startSelfControlBlock.mockResolvedValue({
      success: true,
      endsAt: null,
    });
    selfControlMocks.stopSelfControlBlock.mockResolvedValue({
      success: true,
      removed: true,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  // -----------------------------------------------------------------------
  // (1) GET ?host= returns required tasks from real DB
  // -----------------------------------------------------------------------

  it("returns blocked:true with required tasks for a matching host", async () => {
    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "Morning routine",
      description: "Complete morning routine to unlock social media.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      websiteAccess: {
        groupKey: "distraction",
        websites: ["x.com", "twitter.com"],
        unlockMode: "fixed_duration",
        unlockDurationMinutes: 60,
        reason: "focus",
      },
      source: "chat",
    });

    const ctx = buildCtx(
      "GET",
      "/api/website-blocker",
      runtime,
      "/api/website-blocker?host=x.com",
    );
    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const payload = getJsonPayload(ctx) as {
      blocked: boolean;
      host: string;
      groupKey: string | null;
      requiredTasks: Array<{
        id: string;
        title: string;
        completed: boolean;
      }>;
    };

    expect(payload.blocked).toBe(true);
    expect(payload.host).toBe("x.com");
    expect(payload.groupKey).toBe("distraction");
    expect(payload.requiredTasks).toHaveLength(1);
    expect(payload.requiredTasks[0].title).toBe("Morning routine");
    expect(payload.requiredTasks[0].completed).toBe(false);
  });

  // -----------------------------------------------------------------------
  // (2) GET ?host= shows completed task after occurrence completion
  // -----------------------------------------------------------------------

  it("shows completed:true after the occurrence is completed", async () => {
    const record = await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "Morning routine",
      description: "Complete morning routine to unlock social media.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      websiteAccess: {
        groupKey: "distraction",
        websites: ["x.com", "twitter.com"],
        unlockMode: "fixed_duration",
        unlockDurationMinutes: 60,
        reason: "focus",
      },
      source: "chat",
    });

    // Find and complete the occurrence
    const occurrences = await repository.listOccurrencesForDefinition(
      AGENT_ID,
      record.definition.id,
    );
    const actionable = occurrences.find(
      (occ) => occ.state === "visible" || occ.state === "pending",
    );
    expect(actionable).toBeDefined();
    await service.completeOccurrence(actionable?.id ?? "", { note: "Done" });

    const ctx = buildCtx(
      "GET",
      "/api/website-blocker",
      runtime,
      "/api/website-blocker?host=x.com",
    );
    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const payload = getJsonPayload(ctx) as {
      blocked: boolean;
      requiredTasks: Array<{ title: string; completed: boolean }>;
    };

    expect(payload.blocked).toBe(true);
    expect(payload.requiredTasks).toHaveLength(1);
    expect(payload.requiredTasks[0].completed).toBe(true);
  });

  // -----------------------------------------------------------------------
  // (3) GET ?host= with non-matching host returns empty tasks
  // -----------------------------------------------------------------------

  it("returns blocked:false and empty requiredTasks for a non-matching host", async () => {
    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "Morning routine",
      description: "Complete morning routine.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      websiteAccess: {
        groupKey: "distraction",
        websites: ["x.com"],
        unlockMode: "fixed_duration",
        unlockDurationMinutes: 60,
        reason: "focus",
      },
      source: "chat",
    });

    // reddit.com is not in the selfcontrol status websites list either
    selfControlMocks.getSelfControlStatus.mockResolvedValue({
      available: true,
      active: true,
      hostsFilePath: "/etc/hosts",
      endsAt: null,
      websites: ["x.com"],
      managedBy: "lifeops",
      metadata: null,
      canUnblockEarly: true,
      requiresElevation: false,
      engine: "hosts-file",
      platform: process.platform,
      supportsElevationPrompt: true,
      elevationPromptMethod: "osascript",
    });

    const ctx = buildCtx(
      "GET",
      "/api/website-blocker",
      runtime,
      "/api/website-blocker?host=reddit.com",
    );
    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const payload = getJsonPayload(ctx) as {
      blocked: boolean;
      host: string;
      requiredTasks: unknown[];
    };

    expect(payload.blocked).toBe(false);
    expect(payload.host).toBe("reddit.com");
    expect(payload.requiredTasks).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // (4) GET ?host= with multiple definitions blocking the same host
  // -----------------------------------------------------------------------

  it("returns multiple requiredTasks when several definitions gate the same host", async () => {
    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "task",
      title: "Morning routine",
      description: "Complete morning routine.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      websiteAccess: {
        groupKey: "distraction",
        websites: ["x.com", "twitter.com"],
        unlockMode: "fixed_duration",
        unlockDurationMinutes: 60,
        reason: "focus",
      },
      source: "chat",
    });

    await service.createDefinition({
      ownership: { subjectType: "owner", domain: "user_lifeops" },
      kind: "habit",
      title: "Evening review",
      description: "Review the day before social media.",
      cadence: {
        kind: "once",
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      websiteAccess: {
        groupKey: "distraction",
        websites: ["x.com"],
        unlockMode: "fixed_duration",
        unlockDurationMinutes: 30,
        reason: "review first",
      },
      source: "chat",
    });

    const ctx = buildCtx(
      "GET",
      "/api/website-blocker",
      runtime,
      "/api/website-blocker?host=x.com",
    );
    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const payload = getJsonPayload(ctx) as {
      blocked: boolean;
      requiredTasks: Array<{ title: string; completed: boolean }>;
    };

    expect(payload.blocked).toBe(true);
    expect(payload.requiredTasks).toHaveLength(2);

    const titles = payload.requiredTasks.map((task) => task.title).sort();
    expect(titles).toEqual(["Evening review", "Morning routine"]);
    expect(
      payload.requiredTasks.every((task) => task.completed === false),
    ).toBe(true);
  });
});
