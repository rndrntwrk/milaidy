import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { SQL } from "drizzle-orm";
import { createAliceConfigStore } from "./alice-config-store";

const passphrase = "a".repeat(32);
const dialect = new SQLiteSyncDialect();

function db() {
  const sqlite = new Database(":memory:");
  return {
    sqlite,
    execute(query: SQL) {
      const compiled = dialect.sqlToQuery(query);
      const statement = sqlite.query(compiled.sql);
      const rows = statement.all(...compiled.params) as Record<string, unknown>[];
      return Promise.resolve({ rows });
    },
  };
}

describe("Alice config store", () => {
  test("encrypts config and survives a replacement instance", async () => {
    const firstDb = db();
    const first = createAliceConfigStore({ db: firstDb, passphrase });
    await first.write({ model: "pinned", nested: { enabled: true } });
    const raw = firstDb.sqlite.query("SELECT * FROM alice_runtime_config").get() as Record<string, unknown>;
    expect(raw.ciphertext).not.toContain("pinned");
    const replacement = createAliceConfigStore({ db: firstDb, passphrase });
    expect(await replacement.read()).toEqual({ model: "pinned", nested: { enabled: true } });
    firstDb.sqlite.close();
  });

  test("rejects wrong keys and tampering without exposing plaintext", async () => {
    const state = db();
    const store = createAliceConfigStore({ db: state, passphrase });
    await store.write({ secretless: "config" });
    const wrongKey = createAliceConfigStore({ db: state, passphrase: "b".repeat(32) });
    await expect(wrongKey.read()).rejects.toThrow("ALICE_CONFIG_DECRYPT_FAILED");
    state.sqlite.run("UPDATE alice_runtime_config SET ciphertext = 'tampered'");
    await expect(store.read()).rejects.toThrow("ALICE_CONFIG_DECRYPT_FAILED");
    state.sqlite.close();
  });

  test("uses revision CAS and rejects a stale writer", async () => {
    const state = db();
    const first = createAliceConfigStore({ db: state, passphrase });
    await first.write({ version: 1 });
    const stale = createAliceConfigStore({ db: state, passphrase });
    expect(await stale.read()).toEqual({ version: 1 });
    await first.write({ version: 2 });
    await expect(stale.write({ version: 3 })).rejects.toThrow("ALICE_CONFIG_REVISION_CONFLICT");
    expect(await first.read()).toEqual({ version: 2 });
    state.sqlite.close();
  });

  test("rejects a writer that observed an empty store before another insert", async () => {
    const state = db();
    const stale = createAliceConfigStore({ db: state, passphrase });
    expect(await stale.read()).toBeNull();
    const first = createAliceConfigStore({ db: state, passphrase });
    await first.write({ version: 1 });
    await expect(stale.write({ version: 2 })).rejects.toThrow("ALICE_CONFIG_REVISION_CONFLICT");
    expect(await first.read()).toEqual({ version: 1 });
    state.sqlite.close();
  });
});
