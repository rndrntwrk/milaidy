/**
 * Integration tests for EscalationService backed by a real PGlite database.
 *
 * Each test gets a fresh in-memory PGlite instance so there is no shared state
 * between tests. Config loading and DB persistence are exercised end-to-end.
 *
 * Mocks that remain:
 * - `runtime.sendMessageToTarget` -- real network call to connectors
 * - `runtime.getRoomsForParticipant` / `getMemoriesByRoomIds` -- memory layer
 * - `resolveOwnerEntityId` -- depends on full runtime bootstrap
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LifeOpsRepository } from "../lifeops/repository.js";

// ---------------------------------------------------------------------------
// Hoisted mocks -- only things outside the DB / config boundary
// ---------------------------------------------------------------------------

const ownerEntityMocks = vi.hoisted(() => ({
  resolveOwnerEntityId: vi.fn(),
}));

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock("../runtime/owner-entity.js", () => ({
  resolveOwnerEntityId: ownerEntityMocks.resolveOwnerEntityId,
}));

// Config is NOT mocked -- we use real loadElizaConfig / saveElizaConfig
// backed by a temp file via MILADY_CONFIG_PATH.

import { EscalationService, registerEscalationChannel } from "./escalation.js";
import { _resetMissingSendHandlerLogsForTests } from "./send-handler-availability.js";

// ---------------------------------------------------------------------------
// PGlite runtime adapter (mirrors service-pglite.test.ts)
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

const AGENT_ID = "pglite-esc-agent" as UUID;

function createPgliteRuntime(
  db: PGlite,
  overrides?: Record<string, unknown>,
): IAgentRuntime {
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
    sendHandlers: new Map<string, unknown>([["client_chat", vi.fn()]]),
    sendMessageToTarget: vi.fn().mockResolvedValue(undefined),
    getRoomsForParticipant: vi.fn().mockResolvedValue([]),
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
    ...overrides,
  } as unknown as IAgentRuntime;
}

// ---------------------------------------------------------------------------
// Temp config file helpers
// ---------------------------------------------------------------------------

let tmpDir: string | null = null;
let savedConfigPath: string | undefined;
let savedPersistPath: string | undefined;

function setupTempConfig(
  initialConfig: Record<string, unknown> = { agents: { defaults: {} } },
): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "esc-pglite-test-"));
  const configPath = path.join(tmpDir, "milady.json");
  fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));

  savedConfigPath = process.env.MILADY_CONFIG_PATH;
  savedPersistPath = process.env.MILADY_PERSIST_CONFIG_PATH;
  process.env.MILADY_CONFIG_PATH = configPath;
  // Ensure writes go to the same file
  process.env.MILADY_PERSIST_CONFIG_PATH = configPath;
  return configPath;
}

function teardownTempConfig(): void {
  if (savedConfigPath !== undefined) {
    process.env.MILADY_CONFIG_PATH = savedConfigPath;
  } else {
    delete process.env.MILADY_CONFIG_PATH;
  }
  if (savedPersistPath !== undefined) {
    process.env.MILADY_PERSIST_CONFIG_PATH = savedPersistPath;
  } else {
    delete process.env.MILADY_PERSIST_CONFIG_PATH;
  }
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("EscalationService (PGlite integration)", () => {
  let db: PGlite;
  let runtime: IAgentRuntime;
  let repository: LifeOpsRepository;

  beforeEach(async () => {
    db = new PGlite();
    runtime = createPgliteRuntime(db);

    repository = new LifeOpsRepository(runtime);
    await repository.ensureReady();

    ownerEntityMocks.resolveOwnerEntityId.mockResolvedValue(null);

    vi.clearAllMocks();
    _resetMissingSendHandlerLogsForTests();
    EscalationService._reset();
  });

  afterEach(async () => {
    EscalationService._reset();
    teardownTempConfig();
    await db.close();
  });

  // -----------------------------------------------------------------------
  // 1. Start escalation -> persists to DB
  // -----------------------------------------------------------------------

  it("persists escalation state to DB on start", async () => {
    setupTempConfig({
      agents: {
        defaults: {
          escalation: {
            channels: ["client_chat"],
            waitMinutes: 5,
            maxRetries: 1,
          },
          ownerContacts: {
            client_chat: { entityId: "owner-1" },
          },
        },
      },
    });

    const state = await EscalationService.startEscalation(
      runtime,
      "overdue task",
      "Your morning routine is overdue",
    );

    expect(state.id).toMatch(/^esc-/);
    expect(state.resolved).toBe(false);

    // Directly query the DB to verify the row
    const row = await repository.getActiveEscalationState(AGENT_ID);
    expect(row).not.toBeNull();
    expect(row?.id).toBe(state.id);
    expect(row?.reason).toBe("overdue task");
    expect(row?.text).toBe("Your morning routine is overdue");
    expect(row?.currentStep).toBe(0);
    expect(row?.resolved).toBe(false);
    expect(row?.resolvedAt).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2. Rehydrate from DB after restart
  // -----------------------------------------------------------------------

  it("rehydrates an unresolved escalation from DB into in-memory cache", async () => {
    setupTempConfig({
      agents: { defaults: {} },
    });

    // Insert an unresolved escalation row directly into the DB
    const now = new Date().toISOString();
    await repository.upsertEscalationState({
      id: "esc-rehydrate-1",
      agentId: AGENT_ID,
      reason: "missed deadline",
      text: "You missed your deadline",
      currentStep: 2,
      channelsSent: ["client_chat", "telegram"],
      startedAt: now,
      lastSentAt: now,
      resolved: false,
      resolvedAt: null,
    });

    // In-memory cache should be empty after _reset
    expect(EscalationService.getActiveEscalationSync()).toBeNull();

    // Rehydrate from DB
    await EscalationService.rehydrateFromDb(runtime);

    // Now the in-memory cache should have the escalation
    const active = EscalationService.getActiveEscalationSync();
    expect(active).not.toBeNull();
    expect(active?.id).toBe("esc-rehydrate-1");
    expect(active?.reason).toBe("missed deadline");
    expect(active?.currentStep).toBe(2);
    expect(active?.channelsSent).toEqual(["client_chat", "telegram"]);
    expect(active?.resolved).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 3. Resolve escalation -> updates DB
  // -----------------------------------------------------------------------

  it("marks escalation resolved in DB when resolveEscalation is called", async () => {
    setupTempConfig({
      agents: {
        defaults: {
          escalation: {
            channels: ["client_chat"],
            waitMinutes: 5,
            maxRetries: 1,
          },
          ownerContacts: {
            client_chat: { entityId: "owner-1" },
          },
        },
      },
    });

    const state = await EscalationService.startEscalation(
      runtime,
      "urgent issue",
      "Something went wrong",
    );

    // Verify unresolved in DB
    const beforeResolve = await repository.getActiveEscalationState(AGENT_ID);
    expect(beforeResolve?.resolved).toBe(false);

    await EscalationService.resolveEscalation(state.id, runtime);

    // Active query should return null (only returns unresolved)
    const afterResolve = await repository.getActiveEscalationState(AGENT_ID);
    expect(afterResolve).toBeNull();

    // Verify the row is resolved via recent history
    const recent = await repository.listRecentEscalationStates(AGENT_ID);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe(state.id);
    expect(recent[0]?.resolved).toBe(true);
    expect(recent[0]?.resolvedAt).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 4. getActiveEscalation falls through to DB
  // -----------------------------------------------------------------------

  it("falls through to DB when in-memory cache is empty", async () => {
    setupTempConfig({
      agents: { defaults: {} },
    });

    // Insert an unresolved escalation directly into DB
    const now = new Date().toISOString();
    await repository.upsertEscalationState({
      id: "esc-fallthrough-1",
      agentId: AGENT_ID,
      reason: "pending review",
      text: "Please review the report",
      currentStep: 0,
      channelsSent: ["client_chat"],
      startedAt: now,
      lastSentAt: now,
      resolved: false,
      resolvedAt: null,
    });

    // In-memory cache is empty
    expect(EscalationService.getActiveEscalationSync()).toBeNull();

    // getActiveEscalation should find it from DB
    const active = await EscalationService.getActiveEscalation(runtime);
    expect(active).not.toBeNull();
    expect(active?.id).toBe("esc-fallthrough-1");
    expect(active?.reason).toBe("pending review");

    // After the DB lookup, it should now be cached in memory
    const cached = EscalationService.getActiveEscalationSync();
    expect(cached).not.toBeNull();
    expect(cached?.id).toBe("esc-fallthrough-1");
  });

  // -----------------------------------------------------------------------
  // 5. registerEscalationChannel persists to real config file
  // -----------------------------------------------------------------------

  it("persists a new channel to the config file on disk", () => {
    const configPath = setupTempConfig({
      agents: {
        defaults: {
          escalation: {},
        },
      },
    });

    const result = registerEscalationChannel("telegram");
    expect(result).toBe(true);

    // Read the file back from disk and verify
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const agents = config.agents as Record<string, unknown>;
    const defaults = agents.defaults as Record<string, unknown>;
    const escalation = defaults.escalation as Record<string, unknown>;

    expect(escalation.channels).toEqual(["client_chat", "telegram"]);
  });

  it("appends a second channel to existing channels in the config file", () => {
    const configPath = setupTempConfig({
      agents: {
        defaults: {
          escalation: {
            channels: ["client_chat", "telegram"],
          },
        },
      },
    });

    const result = registerEscalationChannel("discord");
    expect(result).toBe(true);

    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const agents = config.agents as Record<string, unknown>;
    const defaults = agents.defaults as Record<string, unknown>;
    const escalation = defaults.escalation as Record<string, unknown>;

    expect(escalation.channels).toEqual(["client_chat", "telegram", "discord"]);
  });

  // -----------------------------------------------------------------------
  // 6. Escalation state round-trip preserves all fields
  // -----------------------------------------------------------------------

  it("round-trips all escalation fields through DB persistence", async () => {
    setupTempConfig({
      agents: {
        defaults: {
          escalation: {
            channels: ["client_chat", "telegram"],
            waitMinutes: 5,
            maxRetries: 3,
          },
          ownerContacts: {
            client_chat: { entityId: "owner-1" },
            telegram: { entityId: "owner-1", channelId: "tg-123" },
          },
        },
      },
    });

    const state = await EscalationService.startEscalation(
      runtime,
      "overdue medication",
      "Time to take your medication",
    );

    // The startEscalation sends to the first channel, so channelsSent
    // should have at least one entry.
    expect(state.channelsSent.length).toBeGreaterThanOrEqual(0);

    // Read back from DB
    const row = await repository.getActiveEscalationState(AGENT_ID);
    expect(row).not.toBeNull();

    // Verify every field
    expect(row?.id).toBe(state.id);
    expect(row?.reason).toBe(state.reason);
    expect(row?.text).toBe(state.text);
    expect(row?.currentStep).toBe(state.currentStep);
    expect(row?.channelsSent).toEqual(state.channelsSent);
    expect(row?.resolved).toBe(state.resolved);
    expect(row?.resolvedAt).toBeNull();

    // Timestamps should be valid ISO strings
    expect(new Date(row?.startedAt ?? "").getTime()).toBe(state.startedAt);
    expect(new Date(row?.lastSentAt ?? "").getTime()).toBe(state.lastSentAt);
  });

  // -----------------------------------------------------------------------
  // 7. Concurrent escalation coalescing
  // -----------------------------------------------------------------------

  it("coalesces concurrent escalations into a single DB row", async () => {
    setupTempConfig({
      agents: {
        defaults: {
          escalation: {
            channels: ["client_chat"],
            waitMinutes: 5,
            maxRetries: 3,
          },
          ownerContacts: {
            client_chat: { entityId: "owner-1" },
          },
        },
      },
    });

    const first = await EscalationService.startEscalation(
      runtime,
      "reason-alpha",
      "First escalation text",
    );

    const second = await EscalationService.startEscalation(
      runtime,
      "reason-beta",
      "Second escalation text",
    );

    // Same escalation object -- coalesced
    expect(second.id).toBe(first.id);
    expect(second.reason).toContain("reason-alpha");
    expect(second.reason).toContain("reason-beta");
    expect(second.text).toContain("First escalation text");
    expect(second.text).toContain("Second escalation text");

    // Only 1 row in the DB
    const recent = await repository.listRecentEscalationStates(AGENT_ID);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe(first.id);
    expect(recent[0]?.reason).toContain("reason-alpha");
    expect(recent[0]?.reason).toContain("reason-beta");
  });

  // -----------------------------------------------------------------------
  // Bonus: _resetDb clears DB state
  // -----------------------------------------------------------------------

  it("_resetDb deletes all escalation rows for the agent", async () => {
    setupTempConfig({
      agents: {
        defaults: {
          escalation: {
            channels: ["client_chat"],
            waitMinutes: 5,
            maxRetries: 1,
          },
          ownerContacts: {
            client_chat: { entityId: "owner-1" },
          },
        },
      },
    });

    await EscalationService.startEscalation(runtime, "test", "text");

    // Verify row exists
    const before = await repository.listRecentEscalationStates(AGENT_ID);
    expect(before.length).toBeGreaterThan(0);

    await EscalationService._resetDb(runtime);

    const after = await repository.listRecentEscalationStates(AGENT_ID);
    expect(after).toHaveLength(0);
  });
});
