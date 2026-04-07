import { PGlite } from "@electric-sql/pglite";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLifeOpsConnectorGrant,
  LifeOpsRepository,
} from "../src/lifeops/repository";

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

describe("lifeops repository PGlite schema", () => {
  let db: PGlite | null = null;

  function requireDb(): PGlite {
    if (!db) {
      throw new Error("PGlite test database unavailable");
    }
    return db;
  }

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
  });

  it("initializes connector grants and round-trips preferences on PGlite", async () => {
    db = new PGlite();

    const runtime = {
      agentId: "lifeops-pglite-agent",
      character: { name: "lifeops-pglite-agent" },
      getSetting: () => undefined,
      getService: () => null,
      adapter: {
        db: {
          execute: async (query: SqlQuery) => {
            const sql = extractSqlText(query).trim();
            return requireDb().query(sql);
          },
        },
      },
    } as unknown as IAgentRuntime;

    const repository = new LifeOpsRepository(runtime);
    const grant = createLifeOpsConnectorGrant({
      agentId: "lifeops-pglite-agent",
      provider: "google",
      identity: {},
      grantedScopes: [],
      capabilities: [],
      tokenRef: null,
      mode: "local",
      preferredByAgent: true,
      metadata: {},
      lastRefreshAt: null,
    });

    await repository.upsertConnectorGrant(grant);
    const grants = await repository.listConnectorGrants("lifeops-pglite-agent");

    expect(grants).toHaveLength(1);
    expect(grants[0]?.provider).toBe("google");
    expect(grants[0]?.preferredByAgent).toBe(true);
  });

  it("upgrades legacy life_task_definitions without domain columns before creating subject indexes", async () => {
    db = new PGlite();

    await requireDb().exec(`
      CREATE TABLE life_task_definitions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        original_intent TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 3,
        cadence_json TEXT NOT NULL,
        window_policy_json TEXT NOT NULL,
        progression_rule_json TEXT NOT NULL,
        reminder_plan_id TEXT,
        goal_id TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const runtime = {
      agentId: "lifeops-legacy-schema-agent",
      character: { name: "lifeops-legacy-schema-agent" },
      getSetting: () => undefined,
      getService: () => null,
      adapter: {
        db: {
          execute: async (query: SqlQuery) => {
            const sql = extractSqlText(query).trim();
            return requireDb().query(sql);
          },
        },
      },
    } as unknown as IAgentRuntime;

    const repository = new LifeOpsRepository(runtime);
    await expect(repository.ensureReady()).resolves.toBeUndefined();

    const domainCol = await requireDb().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'life_task_definitions'
         AND column_name = 'domain'`,
    );
    expect(domainCol.rows?.length ?? 0).toBeGreaterThan(0);

    const subjectIdx = await requireDb().query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = current_schema()
         AND tablename = 'life_task_definitions'
         AND indexname = 'idx_life_task_definitions_subject'`,
    );
    expect(subjectIdx.rows?.length ?? 0).toBeGreaterThan(0);
  });

  it("runs connector-grants savepoint migration on PGlite (BEGIN + SAVEPOINT)", async () => {
    db = new PGlite();

    await requireDb().exec(`
      CREATE TABLE life_connector_grants (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        identity_json TEXT NOT NULL DEFAULT '{}',
        granted_scopes_json TEXT NOT NULL DEFAULT '[]',
        capabilities_json TEXT NOT NULL DEFAULT '[]',
        token_ref TEXT,
        mode TEXT NOT NULL,
        execution_target TEXT NOT NULL DEFAULT 'local',
        source_of_truth TEXT NOT NULL DEFAULT 'local_storage',
        preferred_by_agent BOOLEAN NOT NULL DEFAULT FALSE,
        cloud_connection_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        last_refresh_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const runtime = {
      agentId: "lifeops-legacy-connector-agent",
      character: { name: "lifeops-legacy-connector-agent" },
      getSetting: () => undefined,
      getService: () => null,
      adapter: {
        db: {
          execute: async (query: SqlQuery) => {
            const sql = extractSqlText(query).trim();
            return requireDb().query(sql);
          },
        },
      },
    } as unknown as IAgentRuntime;

    const repository = new LifeOpsRepository(runtime);
    await expect(repository.ensureReady()).resolves.toBeUndefined();

    const sideCol = await requireDb().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'life_connector_grants'
         AND column_name = 'side'`,
    );
    expect(sideCol.rows?.length ?? 0).toBeGreaterThan(0);
  });
});
