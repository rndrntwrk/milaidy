import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { SQL } from "drizzle-orm";
import { createAliceConfigStore } from "./alice-config-store.js";
import type { ElizaConfig } from "./types.js";

let alice = true;
let persist: ((next: string, previous: string) => Promise<void>) | undefined;
let save: (config: ElizaConfig) => Promise<void>;
mock.module("@rndrntwrk/plugin-555stream/auth", () => ({
  isAliceNativeStreamRuntime: () => alice,
  setNativeAgentTokenPersistence: (callback: typeof persist, onlyIfUnset = false) => {
    if (!onlyIfUnset || !persist) persist = callback;
  },
}));
mock.module("./config.js", () => ({ saveElizaConfig: (config: ElizaConfig) => save(config) }));
const { registerAliceNativeStreamTokenPersistence } = await import("./stream555-native-token.js");

const sqlite = new Database(":memory:");
const dialect = new SQLiteSyncDialect();
const db = { execute(query: SQL) {
  const compiled = dialect.sqlToQuery(query);
  const rows = sqlite.query(compiled.sql).all(...compiled.params) as Record<string, unknown>[];
  return Promise.resolve({ rows });
} };
const passphrase = "native-stream-test-passphrase-32-chars";
let store: ReturnType<typeof createAliceConfigStore>;
beforeEach(() => {
  sqlite.run("DROP TABLE IF EXISTS alice_runtime_config");
  alice = true;
  persist = undefined;
  store = createAliceConfigStore({ db, passphrase });
  save = async config => { await store.write(config); };
});
afterEach(() => { persist = undefined; });
afterAll(() => { sqlite.close(); });

test("registers persistence only for the native Alice runtime", () => {
  alice = false;
  registerAliceNativeStreamTokenPersistence(() => ({}));
  expect(persist).toBeUndefined();
  alice = true;
  registerAliceNativeStreamTokenPersistence(() => ({}));
  expect(persist).toBeFunction();
});

test("keeps API-first persistence authoritative when runtime registers its fallback", async () => {
  const apiConfig: ElizaConfig = { ui: { theme: "dark" }, env: { vars: { STREAM555_AGENT_TOKEN: "old-token" } } };
  const runtimeConfig: ElizaConfig = { env: { vars: { STREAM555_AGENT_TOKEN: "old-token" } } };
  registerAliceNativeStreamTokenPersistence(() => apiConfig);
  registerAliceNativeStreamTokenPersistence(() => runtimeConfig, true);
  await persist!("new-token", "old-token");
  expect(apiConfig.env?.vars?.STREAM555_AGENT_TOKEN).toBe("new-token");
  expect(runtimeConfig.env?.vars?.STREAM555_AGENT_TOKEN).toBe("old-token");
  expect(await store.read()).toEqual(apiConfig);
});

test("commits the encrypted token before updating live config and removes legacy aliases", async () => {
  const config: ElizaConfig = { env: {
    STREAM555_AGENT_TOKEN: "old-token",
    STREAM555_AGENT_API_KEY: "old-key",
    STREAM_API_BEARER_TOKEN: "old-bearer",
    vars: { STREAM555_AGENT_TOKEN: "old-token", STREAM555_AGENT_API_KEY: "old-key",
      STREAM_API_BEARER_TOKEN: "old-bearer", UNRELATED: "retained" },
  } };
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  save = async candidate => { entered(); await waiting; await store.write(candidate); };
  registerAliceNativeStreamTokenPersistence(() => config);
  expect(persist).toBeFunction();
  const updating = persist!("new-token", "old-token");
  await started;
  expect(config.env?.vars?.STREAM555_AGENT_TOKEN).toBe("old-token");
  release();
  await updating;
  expect(config.env).toEqual({ vars: { STREAM555_AGENT_TOKEN: "new-token", UNRELATED: "retained" } });
  const replacement = createAliceConfigStore({ db, passphrase });
  expect(await replacement.read()).toEqual(config);
  const raw = sqlite.query("SELECT ciphertext FROM alice_runtime_config").get();
  expect(JSON.stringify(raw)).not.toContain("new-token");
});

test("preserves live config on save failure and rejects a stale queued token writer", async () => {
  let config: ElizaConfig = { env: { vars: { STREAM555_AGENT_TOKEN: "old-token" } } };
  registerAliceNativeStreamTokenPersistence(() => config);
  expect(persist).toBeFunction();
  save = async () => { throw new Error("durable write rejected"); };
  await expect(persist!("new-token", "old-token")).rejects.toThrow("durable write rejected");
  expect(config.env?.vars?.STREAM555_AGENT_TOKEN).toBe("old-token");
  save = async candidate => { await store.write(candidate); };
  // The API may replace its config reference; the callback must use its live getter.
  config = { ui: { theme: "dark" }, env: { vars: { STREAM555_AGENT_TOKEN: "replacement-token" } } };
  const outcomes = await Promise.allSettled([
    persist!("winning-token", "replacement-token"),
    persist!("stale-token", "replacement-token"),
  ]);
  expect(outcomes[0].status).toBe("fulfilled");
  expect(outcomes[1].status).toBe("rejected");
  expect(config.env?.vars?.STREAM555_AGENT_TOKEN).toBe("winning-token");
  expect(await store.read()).toEqual(config);
  await expect(persist!("other-token", "replacement-token")).rejects.toThrow("Stream credential changed");
});
