import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ALICE_CREDENTIAL_OWNER_ID,
  ALICE_CREDENTIAL_PROVIDER_ID,
  ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION,
  canonicalCredentialManifest,
  sha256CredentialBytes,
} from "../src/credential-state";
import {
  CredentialGenerationConflictError,
  CredentialStateRowError,
  D1CredentialStateStore,
  type CredentialStateD1Binding,
} from "../src/credential-store";

class TestStatement {
  private params: unknown[] = [];

  constructor(private readonly statement: any) {}

  bind(...values: unknown[]) {
    this.params = values;
    return this;
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.statement.get(...this.params) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T>() {
    return {
      success: true,
      results: this.statement.all(...this.params) as T[],
    };
  }

  async run() {
    const result = this.statement.run(...this.params);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class TestD1 implements CredentialStateD1Binding {
  readonly database = new Database(":memory:");

  prepare(sql: string) {
    return new TestStatement(this.database.query(sql));
  }

  async exec(sql: string) {
    this.database.exec(sql);
  }

  async batch(statements: TestStatement[]) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

async function snapshot(generation: number, value = `opaque-${generation}`) {
  const bytes = Buffer.from(value, "utf8");
  const file = {
    relativePath: "auth/openai-codex/alice-primary.json",
    mode: 0o600 as const,
    size: bytes.byteLength,
    sha256: await sha256CredentialBytes(bytes),
    bytesBase64: bytes.toString("base64"),
  };
  const result = {
    schemaVersion: ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION,
    ownerId: ALICE_CREDENTIAL_OWNER_ID,
    providerId: ALICE_CREDENTIAL_PROVIDER_ID,
    generation,
    files: [file],
    snapshotSha256: `sha256:${"0".repeat(64)}` as const,
    createdAtMs: 100,
    updatedAtMs: 100 + generation,
  };
  return {
    ...result,
    snapshotSha256: await sha256CredentialBytes(
      new TextEncoder().encode(canonicalCredentialManifest(result)),
    ),
  };
}

describe("D1CredentialStateStore", () => {
  test("creates, reads, updates, and idempotently retries", async () => {
    const db = new TestD1();
    const store = new D1CredentialStateStore(db);
    await store.initialize();
    expect(await store.getCredentialState()).toBeNull();

    const zero = await snapshot(0);
    expect(
      await store.putCredentialState({
        expectedGeneration: null,
        snapshot: zero,
      }),
    ).toEqual(zero);
    expect(
      await store.putCredentialState({
        expectedGeneration: null,
        snapshot: zero,
      }),
    ).toEqual(zero);

    const one = await snapshot(1);
    expect(
      await store.putCredentialState({
        expectedGeneration: 0,
        snapshot: one,
      }),
    ).toEqual(one);
    expect(
      await store.putCredentialState({
        expectedGeneration: 0,
        snapshot: one,
      }),
    ).toEqual(one);
  });

  test("rejects stale, skipped, and mismatched compare-and-swap writes", async () => {
    const db = new TestD1();
    const store = new D1CredentialStateStore(db);
    await store.initialize();
    await store.putCredentialState({
      expectedGeneration: null,
      snapshot: await snapshot(0),
    });
    await store.putCredentialState({
      expectedGeneration: 0,
      snapshot: await snapshot(1),
    });

    const differentOne = await snapshot(1, "different");
    await expect(
      store.putCredentialState({
        expectedGeneration: 0,
        snapshot: differentOne,
      }),
    ).rejects.toMatchObject({
      code: "credential_generation_conflict",
      expectedGeneration: 0,
      actualGeneration: 1,
    });

    await expect(
      store.putCredentialState({
        expectedGeneration: 1,
        snapshot: await snapshot(3),
      }),
    ).rejects.toBeInstanceOf(CredentialGenerationConflictError);
  });

  test("generation-fences deletion and logs metadata only", async () => {
    const db = new TestD1();
    const store = new D1CredentialStateStore(db);
    await store.initialize();
    await store.putCredentialState({
      expectedGeneration: null,
      snapshot: await snapshot(0),
    });
    await store.putCredentialState({
      expectedGeneration: 0,
      snapshot: await snapshot(1),
    });

    await expect(
      store.deleteCredentialState({
        expectedGeneration: 0,
        recordedAtMs: 200,
      }),
    ).rejects.toMatchObject({ actualGeneration: 1 });
    expect(
      await store.deleteCredentialState({
        expectedGeneration: 1,
        recordedAtMs: 201,
      }),
    ).toBe(true);
    expect(
      await store.deleteCredentialState({
        expectedGeneration: 1,
        recordedAtMs: 202,
      }),
    ).toBe(false);

    const rows = db.database
      .query(
        "SELECT * FROM alice_credential_events ORDER BY generation, operation",
      )
      .all() as Array<Record<string, unknown>>;
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "generation",
      "operation",
      "provider_id",
      "recorded_at_ms",
      "snapshot_sha256",
    ]);
    expect(rows.map((row) => [row.generation, row.operation])).toEqual([
      [0, "put"],
      [1, "delete"],
      [1, "put"],
    ]);
    expect(JSON.stringify(rows)).not.toContain("opaque-");
  });

  test("rejects corrupted stored rows without exposing snapshot bytes", async () => {
    const db = new TestD1();
    const store = new D1CredentialStateStore(db);
    await store.initialize();
    await store.putCredentialState({
      expectedGeneration: null,
      snapshot: await snapshot(0),
    });
    db.database
      .query("UPDATE alice_credential_state SET snapshot_sha256 = ?")
      .run(`sha256:${"f".repeat(64)}`);

    try {
      await store.getCredentialState();
      throw new Error("Expected row validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialStateRowError);
      expect(String(error)).not.toContain("opaque-0");
    }
  });
});
