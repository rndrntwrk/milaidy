import { Database } from "bun:sqlite";
import type { IAgentRuntime } from "@elizaos/core";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { LifeOpsRepository } from "./repository";
import { sqlJsonMergeTopLevel } from "./sql";

describe("Life Ops SQLite JSON merge", () => {
  it("replaces nested objects shallowly and preserves null, scalar, and boolean values", () => {
    const db = new Database(":memory:");
    try {
      db.run("CREATE TABLE t (metadata TEXT)");
      db.run(
        `INSERT INTO t VALUES ('{"keep":{"old":true},"replace":{"old":true},"drop":"old","flag":false}')`,
      );
      const expression = sqlJsonMergeTopLevel(
        "metadata",
        { replace: { fresh: true }, drop: null, flag: true, added: "new",
          'quoted"key': null, "slash\\key": { nested: true }, omitted: undefined },
        "sqlite",
      );
      db.run(`UPDATE t SET metadata = ${expression}`);
      const row = db
        .query<{ metadata: string }, []>("SELECT metadata FROM t")
        .get();
      expect(JSON.parse(row!.metadata)).toEqual({
        keep: { old: true },
        replace: { fresh: true },
        drop: null,
        flag: true,
        added: "new",
        'quoted"key': null,
        "slash\\key": { nested: true },
      });
    } finally {
      db.close();
    }
  });

  it("rolls back a failed legacy rebuild and preserves the grant on a successful retry", async () => {
    const sqlite = new Database(":memory:");
    const dialect = new SQLiteSyncDialect();
    let failRebuild = true;
    let batches = 0;
    const execute = (query: SQL) => {
      const { sql, params } = dialect.sqlToQuery(query);
      return { rows: sqlite.query(sql).all(...params) };
    };
    const db = {
      dialect: "sqlite" as const,
      async execute(query: SQL) { return execute(query); },
      async batch(queries: SQL[]) {
        batches += 1;
        return sqlite.transaction(() => queries.map((query, index) => {
          const result = execute(query);
          if (failRebuild && index === 3) throw new Error("injected migration failure");
          return result;
        }))();
      },
    };
    try {
      sqlite.exec(`CREATE TABLE life_connector_grants (
        id TEXT PRIMARY KEY, agent_id TEXT, provider TEXT, identity_json TEXT,
        granted_scopes_json TEXT, capabilities_json TEXT, token_ref TEXT,
        mode TEXT, metadata_json TEXT, last_refresh_at TEXT, created_at TEXT, updated_at TEXT
      ); INSERT INTO life_connector_grants VALUES (
        'preserved', 'alice', 'github', '{}', '[]', '[]', NULL,
        'oauth', '{}', NULL, '2026-09-07', '2026-09-07'
      );`);
      const repository = new LifeOpsRepository({ adapter: { db } } as unknown as IAgentRuntime);
      await expect(repository.ensureReady()).rejects.toThrow("injected migration failure");
      expect(sqlite.query("SELECT id FROM life_connector_grants").all()).toEqual([{ id: "preserved" }]);
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE name = 'life_connector_grants_next'").all()).toEqual([]);
      failRebuild = false;
      await repository.ensureReady();
      expect(sqlite.query("SELECT id, side FROM life_connector_grants").all()).toEqual([{ id: "preserved", side: "owner" }]);
      expect(batches).toBe(2);
    } finally {
      sqlite.close();
    }
  });
});
