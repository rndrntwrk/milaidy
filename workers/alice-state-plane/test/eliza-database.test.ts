import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

type BoundStatement = {
  bind: (...values: unknown[]) => BoundStatement;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ success: boolean; results: T[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number }; results: unknown[] }>;
  execute: () => { success: boolean; meta: { changes: number }; results: unknown[] };
};

class SqliteD1Binding {
  readonly sqlite = new Database(":memory:");

  prepare(sql: string): BoundStatement {
    let values: unknown[] = [];
    const binding = this;
    const statement: BoundStatement = {
      bind(...next) {
        values = next;
        return statement;
      },
      async first<T>() {
        return (binding.sqlite.query(sql).get(...values) as T | null) ?? null;
      },
      async all<T>() {
        return { success: true, results: binding.sqlite.query(sql).all(...values) as T[] };
      },
      async run() {
        return statement.execute();
      },
      execute() {
        const results = binding.sqlite.query(sql).all(...values);
        const changes = Number(
          (binding.sqlite.query("SELECT changes() AS changes").get() as { changes: number }).changes,
        );
        return { success: true, meta: { changes }, results };
      },
    };
    return statement;
  }

  async batch(statements: BoundStatement[]) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.execute());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql: string) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }
}

describe("D1 Eliza durable database adapter", () => {
  test("installs its tables through the additive production D1 migration", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(readFileSync(new URL("../migrations/0001_alice_state.sql", import.meta.url), "utf8"));
    sqlite.exec(readFileSync(new URL("../migrations/0002_execution_records.sql", import.meta.url), "utf8"));
    sqlite.exec(readFileSync(new URL("../migrations/0003_eliza_database.sql", import.meta.url), "utf8"));
    expect(sqlite.query(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'alice_eliza_%'
      ORDER BY name
    `).all()).toEqual([
      { name: "alice_eliza_heads" },
      { name: "alice_eliza_operations" },
      { name: "alice_eliza_records" },
    ]);
  });

  test("commits canonical records atomically and reloads them after adapter restart", async () => {
    const database = await import("../src/eliza-database");
    const d1 = new SqliteD1Binding();
    await database.installElizaDatabaseSchema(d1);
    const first = new database.D1ElizaDatabaseAdapter(d1);
    await expect(first.load({ ownerId: "owner-001", cursor: null, limit: 500 })).resolves.toEqual({
      revision: 0,
      records: [],
      nextCursor: null,
    });
    await expect(first.commit({
      ownerId: "owner-001",
      operationId: "operation-001",
      expectedRevision: 0,
      mutations: [
        { collection: "memories", key: "memory-002", deleted: false, value: { z: 2, a: 1 } },
        { collection: "entities", key: "entity-001", deleted: false, value: { name: "Alice" } },
      ],
    })).resolves.toEqual({ revision: 1 });
    await expect(new database.D1ElizaDatabaseAdapter(d1).load({
      ownerId: "owner-001",
      cursor: null,
      limit: 500,
    })).resolves.toEqual({
      revision: 1,
      records: [
        { collection: "entities", key: "entity-001", value: { name: "Alice" } },
        { collection: "memories", key: "memory-002", value: { a: 1, z: 2 } },
      ],
      nextCursor: null,
    });
    expect((d1.sqlite.query(`
      SELECT value_json FROM alice_eliza_records
      WHERE owner_id = 'owner-001' AND collection = 'memories' AND record_key = 'memory-002'
    `).get() as { value_json: string }).value_json).toBe('{"a":1,"z":2}');
  });

  test("round-trips CR and LF in JSON strings while still rejecting NUL", async () => {
    const database = await import("../src/eliza-database");
    const d1 = new SqliteD1Binding();
    await database.installElizaDatabaseSchema(d1);
    const adapter = new database.D1ElizaDatabaseAdapter(d1);
    const value = {
      text: "first line\r\nsecond line\nthird line",
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
        tokenCount: 18,
      },
    };

    await expect(adapter.commit({
      ownerId: "owner-001",
      operationId: "operation-crlf-001",
      expectedRevision: 0,
      mutations: [
        { collection: "memories", key: "memory-crlf", deleted: false, value },
      ],
    })).resolves.toEqual({ revision: 1 });
    await expect(new database.D1ElizaDatabaseAdapter(d1).load({
      ownerId: "owner-001",
      cursor: null,
      limit: 500,
    })).resolves.toEqual({
      revision: 1,
      records: [{ collection: "memories", key: "memory-crlf", value }],
      nextCursor: null,
    });

    await expect(adapter.commit({
      ownerId: "owner-001",
      operationId: "operation-nul-001",
      expectedRevision: 1,
      mutations: [
        {
          collection: "memories",
          key: "memory-nul",
          deleted: false,
          value: { text: "before\0after" },
        },
      ],
    })).rejects.toThrow("ELIZA_VALUE_INVALID");
  });

  test("deletes records and preserves the exact first receipt across restart and later commits", async () => {
    const database = await import("../src/eliza-database");
    const d1 = new SqliteD1Binding();
    await database.installElizaDatabaseSchema(d1);
    const adapter = new database.D1ElizaDatabaseAdapter(d1);
    const first = {
      ownerId: "owner-001",
      operationId: "operation-create-001",
      expectedRevision: 0,
      mutations: [{ collection: "memories", key: "memory-001", deleted: false as const, value: { text: "one" } }],
    };
    expect(await adapter.commit(first)).toEqual({ revision: 1 });
    expect(await adapter.commit({
      ownerId: "owner-001",
      operationId: "operation-delete-001",
      expectedRevision: 1,
      mutations: [{ collection: "memories", key: "memory-001", deleted: true }],
    })).toEqual({ revision: 2 });
    expect(await new database.D1ElizaDatabaseAdapter(d1).commit(first)).toEqual({ revision: 1 });
    expect(await adapter.load({ ownerId: "owner-001", cursor: null, limit: 500 })).toEqual({
      revision: 2,
      records: [],
      nextCursor: null,
    });
  });

  test("fails closed on an idempotency collision or stale expected revision", async () => {
    const database = await import("../src/eliza-database");
    const d1 = new SqliteD1Binding();
    await database.installElizaDatabaseSchema(d1);
    const adapter = new database.D1ElizaDatabaseAdapter(d1);
    const base = {
      ownerId: "owner-001",
      operationId: "operation-001",
      expectedRevision: 0,
      mutations: [{ collection: "memories", key: "memory-001", deleted: false as const, value: { text: "one" } }],
    };
    await adapter.commit(base);
    await expect(adapter.commit({
      ...base,
      mutations: [{ ...base.mutations[0]!, value: { text: "collision" } }],
    })).rejects.toThrow("ELIZA_IDEMPOTENCY_COLLISION");
    await expect(adapter.commit({
      ...base,
      operationId: "operation-stale-001",
    })).rejects.toThrow("ELIZA_REVISION_STALE");
    expect((await adapter.load({ ownerId: "owner-001", cursor: null, limit: 500 })).records).toEqual([
      { collection: "memories", key: "memory-001", value: { text: "one" } },
    ]);
  });

  test("lets only one optimistic writer advance an owner head revision", async () => {
    const database = await import("../src/eliza-database");
    const d1 = new SqliteD1Binding();
    await database.installElizaDatabaseSchema(d1);
    const originalBatch = d1.batch.bind(d1);
    let winner: { revision: number } | null = null;
    let injected = false;
    d1.batch = async (statements) => {
      if (!injected) {
        injected = true;
        d1.batch = originalBatch;
        winner = await new database.D1ElizaDatabaseAdapter(d1).commit({
          ownerId: "owner-001",
          operationId: "operation-winner-001",
          expectedRevision: 0,
          mutations: [{ collection: "memory", key: "winner", deleted: false, value: { writer: "winner" } }],
        });
      }
      return originalBatch(statements);
    };
    const loser = new database.D1ElizaDatabaseAdapter(d1).commit({
      ownerId: "owner-001",
      operationId: "operation-loser-001",
      expectedRevision: 0,
      mutations: [{ collection: "memory", key: "loser", deleted: false, value: { writer: "loser" } }],
    });
    await expect(loser).rejects.toThrow("ELIZA_REVISION_STALE");
    expect(winner).toEqual({ revision: 1 });
    expect(await new database.D1ElizaDatabaseAdapter(d1).load({
      ownerId: "owner-001",
      cursor: null,
      limit: 500,
    })).toEqual({
      revision: 1,
      records: [{ collection: "memory", key: "winner", value: { writer: "winner" } }],
      nextCursor: null,
    });
  });

  test("rolls back the head, receipt, and every mutation when one batched statement fails", async () => {
    const database = await import("../src/eliza-database");
    const d1 = new SqliteD1Binding();
    await database.installElizaDatabaseSchema(d1);
    const originalBatch = d1.batch.bind(d1);
    let injected = false;
    d1.batch = async (statements) => {
      if (!injected) {
        injected = true;
        return originalBatch([...statements, d1.prepare("INSERT INTO alice_missing_table(value) VALUES (1)")]);
      }
      return originalBatch(statements);
    };
    const adapter = new database.D1ElizaDatabaseAdapter(d1);
    await expect(adapter.commit({
      ownerId: "owner-001",
      operationId: "operation-atomic-failure-001",
      expectedRevision: 0,
      mutations: [
        { collection: "memories", key: "memory-001", deleted: false, value: { text: "one" } },
        { collection: "memories", key: "memory-002", deleted: false, value: { text: "two" } },
      ],
    })).rejects.toThrow("ELIZA_COMMIT_FAILED");
    expect(await adapter.load({ ownerId: "owner-001", cursor: null, limit: 500 })).toEqual({
      revision: 0,
      records: [],
      nextCursor: null,
    });
    expect(d1.sqlite.query("SELECT * FROM alice_eliza_operations").all()).toEqual([]);
  });

  test("does not claim a commit when D1 returns an unsuccessful batch result", async () => {
    const database = await import("../src/eliza-database");
    const d1 = new SqliteD1Binding();
    await database.installElizaDatabaseSchema(d1);
    d1.batch = async () => [{ success: false, meta: { changes: 0 }, results: [] }];
    const adapter = new database.D1ElizaDatabaseAdapter(d1);
    await expect(adapter.commit({
      ownerId: "owner-001",
      operationId: "operation-unsuccessful-001",
      expectedRevision: 0,
      mutations: [{ collection: "memories", key: "memory-001", deleted: false, value: { text: "one" } }],
    })).rejects.toThrow("ELIZA_COMMIT_FAILED");
    expect((d1.sqlite.query("SELECT revision FROM alice_eliza_heads WHERE owner_id = ?")
      .get("owner-001") as { revision: number }).revision).toBe(0);
    expect(d1.sqlite.query("SELECT * FROM alice_eliza_records").all()).toEqual([]);
  });

  test("paginates one revision and rejects the cursor after head drift", async () => {
    const database = await import("../src/eliza-database");
    const d1 = new SqliteD1Binding();
    await database.installElizaDatabaseSchema(d1);
    const adapter = new database.D1ElizaDatabaseAdapter(d1);
    await adapter.commit({
      ownerId: "owner-001",
      operationId: "operation-page-001",
      expectedRevision: 0,
      mutations: ["003", "001", "002"].map((key) => ({
        collection: "memories",
        key: `memory-${key}`,
        deleted: false as const,
        value: { key },
      })),
    });
    const first = await adapter.load({ ownerId: "owner-001", cursor: null, limit: 2 });
    expect(first.revision).toBe(1);
    expect(first.records.map((record) => record.key)).toEqual(["memory-001", "memory-002"]);
    expect(typeof first.nextCursor).toBe("string");
    expect(await adapter.load({ ownerId: "owner-001", cursor: first.nextCursor, limit: 2 })).toEqual({
      revision: 1,
      records: [{ collection: "memories", key: "memory-003", value: { key: "003" } }],
      nextCursor: null,
    });
    await adapter.commit({
      ownerId: "owner-001",
      operationId: "operation-page-002",
      expectedRevision: 1,
      mutations: [{ collection: "entities", key: "entity-001", deleted: false, value: { name: "Alice" } }],
    });
    await expect(adapter.load({
      ownerId: "owner-001",
      cursor: first.nextCursor,
      limit: 2,
    })).rejects.toThrow("ELIZA_REVISION_DRIFT");
  });

  test("rejects duplicate targets, secret fields, control characters and values over one megabyte", async () => {
    const database = await import("../src/eliza-database");
    const d1 = new SqliteD1Binding();
    await database.installElizaDatabaseSchema(d1);
    const adapter = new database.D1ElizaDatabaseAdapter(d1);
    const input = (mutations: unknown[]) => ({
      ownerId: "owner-001",
      operationId: "operation-invalid-001",
      expectedRevision: 0,
      mutations,
    });
    await expect(adapter.commit(input([
      { collection: "memory", key: "same", deleted: true },
      { collection: "memory", key: "same", deleted: true },
    ]) as never)).rejects.toThrow("ELIZA_MUTATION_DUPLICATE");
    await expect(adapter.commit(input([
      { collection: "memory", key: "secret", deleted: false, value: { apiToken: "forbidden" } },
    ]) as never)).rejects.toThrow("ELIZA_SECRET_FIELD");
    for (const credentialField of [
      "authToken",
      "bearerToken",
      "oauthToken",
      "secretKey",
      "accessTokenSecret",
    ]) {
      await expect(adapter.commit(input([
        {
          collection: "memory",
          key: `secret-${credentialField}`,
          deleted: false,
          value: { [credentialField]: "forbidden" },
        },
      ]) as never)).rejects.toThrow("ELIZA_SECRET_FIELD");
    }
    await expect(adapter.commit(input([
      { collection: "memory\n", key: "control", deleted: true },
    ]) as never)).rejects.toThrow("ELIZA_OPERATION_INVALID");
    await expect(adapter.commit(input([
      { collection: "memory", key: "large", deleted: false, value: "x".repeat(1_000_001) },
    ]) as never)).rejects.toThrow("ELIZA_VALUE_TOO_LARGE");
    expect(await adapter.load({ ownerId: "owner-001", cursor: null, limit: 500 })).toEqual({
      revision: 0,
      records: [],
      nextCursor: null,
    });
    await expect(adapter.commit({
      ownerId: "owner-001",
      operationId: "operation-max-revision-001",
      expectedRevision: Number.MAX_SAFE_INTEGER,
      mutations: [{ collection: "memory", key: "overflow", deleted: true }],
    })).rejects.toThrow("ELIZA_OPERATION_INVALID");
  });

  test("fails closed when persisted canonical JSON is corrupt", async () => {
    const database = await import("../src/eliza-database");
    const d1 = new SqliteD1Binding();
    await database.installElizaDatabaseSchema(d1);
    const adapter = new database.D1ElizaDatabaseAdapter(d1);
    await adapter.commit({
      ownerId: "owner-001",
      operationId: "operation-corrupt-001",
      expectedRevision: 0,
      mutations: [{ collection: "memories", key: "memory-001", deleted: false, value: { text: "one" } }],
    });
    d1.sqlite.query(`
      UPDATE alice_eliza_records SET value_json = ?
      WHERE owner_id = ? AND collection = ? AND record_key = ?
    `).run('{"text":"tampered"}', "owner-001", "memories", "memory-001");
    await expect(adapter.load({ ownerId: "owner-001", cursor: null, limit: 500 }))
      .rejects.toThrow("ELIZA_ROW_INVALID");
  });
});
