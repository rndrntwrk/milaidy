import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { createAliceStateService } from "../src/service";
import { forwardToAliceStatePlane } from "../../alice-access-gateway/src/alice-runtime-host";
import { createAliceRuntimeSql } from "../../../packages/agent/src/runtime/alice-runtime-sql";
import { LifeOpsRepository } from "../../../packages/agent/src/lifeops/repository";
import type { IAgentRuntime } from "@elizaos/core";

const token = "s".repeat(48);
const ownerId = "alice-owner-production";

function setup() {
  const sqlite = new Database(":memory:");
  const never = async () => { throw new Error("Authority state must remain isolated"); };
  const runtimeSql = {
    prepare(text: string) {
      return { bind: (...params: (string | number | null)[]) => ({ text, params }) };
    },
    async batch(statements: { text: string; params: (string | number | null)[] }[]) {
      return sqlite.transaction(() => statements.map(({ text, params }) => ({
        success: true, results: sqlite.query(text).all(...params),
      })))();
    },
  };
  const service = createAliceStateService({
    adapter: { getRecord: never, putRecord: never, listRecords: never, applyAtomic: never },
    runtimeSql: runtimeSql as unknown as D1Database,
    token,
  });
  const connect = () => createAliceRuntimeSql({
    ownerId,
    fetch: (request) => forwardToAliceStatePlane(request, {
      ALICE_STATE_PLANE_SERVICE_TOKEN: token,
      ALICE_STATE_PLANE: service,
    }),
  });
  return { sqlite, service, connect };
}

describe("private Alice runtime SQL", () => {
  test("requires the private token and SQL scope before accessing the isolated database", async () => {
    const { sqlite, service } = setup();
    try {
      const body = JSON.stringify({ operation: "sql.batch", ownerId,
        statements: [{ sql: "SELECT 1", params: [] }] });
      const headers = { "content-type": "application/json" };
      const invoke = (extra: Record<string, string>) => service.fetch(new Request(
        "https://state.internal/v1/runtime-sql",
        { method: "POST", headers: { ...headers, ...extra }, body },
      ));
      expect((await invoke({})).status).toBe(401);
      expect((await invoke({ "x-alice-state-token": token })).status).toBe(403);
      expect((await invoke({ "x-alice-state-token": token,
        "x-alice-container-state-scope": "runtime-sql", "x-alice-state-owner": "another-owner" })).status).toBe(403);
    } finally { sqlite.close(); }
  });

  test("persists across client replacement, binds values and rolls back a failed batch", async () => {
    const { sqlite, connect } = setup();
    try {
      const first = connect();
      expect(await first.isReady()).toBe(true);
      await first.execute(sql.raw("CREATE TABLE life_sql_test (id TEXT PRIMARY KEY, value TEXT)"));
      await expect(first.execute(sql.raw("ALTER TABLE life_sql_test ADD COLUMN value TEXT")))
        .rejects.toThrow("duplicate column");
      await first.execute(sql`INSERT INTO life_sql_test VALUES (${"saved"}, ${"quote'; DROP TABLE life_sql_test; --"})`);
      const restarted = connect();
      expect((await restarted.execute(sql`SELECT value FROM life_sql_test WHERE id = ${"saved"}`)).rows)
        .toEqual([{ value: "quote'; DROP TABLE life_sql_test; --" }]);
      await expect(restarted.batch([
        sql`UPDATE life_sql_test SET value = ${"unsaved"} WHERE id = ${"saved"}`,
        sql`INSERT INTO life_sql_test VALUES (${"saved"}, ${"duplicate"})`,
      ])).rejects.toThrow();
      expect((await restarted.execute(sql`SELECT value FROM life_sql_test WHERE id = ${"saved"}`)).rows)
        .toEqual([{ value: "quote'; DROP TABLE life_sql_test; --" }]);
      expect((await restarted.execute(sql`DELETE FROM life_sql_test WHERE id = ${"saved"} RETURNING id`)).rows)
        .toEqual([{ id: "saved" }]);
    } finally { sqlite.close(); }
  });

  test("initializes the actual Life Ops repository through the private SQL connection", async () => {
    const { sqlite, connect } = setup();
    try {
      const db = connect();
      const repository = new LifeOpsRepository({ adapter: { db } } as unknown as IAgentRuntime);
      await repository.ensureReady();
      expect((await db.execute(sql.raw("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'life_%'"))).rows)
        .toEqual([{ count: 23 }]);
      await expect(db.execute(sql.raw("ATTACH DATABASE ':memory:' AS other"))).rejects.toThrow("ALICE_SQL_OPERATION_FAILED:400");
      await expect(db.execute(sql.raw("BEGIN"))).rejects.toThrow("ALICE_SQL_OPERATION_FAILED:400");
    } finally { sqlite.close(); }
  });
});
