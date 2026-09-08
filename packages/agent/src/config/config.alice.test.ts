import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ElizaConfig } from "./types.js";

type SqlValue = string | number | boolean | null;
type SqlStatement = { sql: string; params: SqlValue[] };
const savedEnv = new Map<string, string | undefined>();
const envKeys = ["ALICE_RUNTIME_AUTHORITY_MODE", "ALICE_RUNTIME_PROFILE", "ALICE_STATE_OWNER_ID", "ELIZA_VAULT_PASSPHRASE", "MILADY_STATE_DIR", "MILADY_NAMESPACE", "MILADY_CONFIG_PATH", "MILADY_PERSIST_CONFIG_PATH"];
const originalFetch = globalThis.fetch;
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-config-integration-"));
const configPath = path.join(stateDir, "alice-config-test.json");
const seed = JSON.parse(fs.readFileSync(new URL("../../../../deploy/modal/alice-runtime-defaults.json", import.meta.url), "utf8"));
seed.ui.theme = "dark";
fs.writeFileSync(configPath, JSON.stringify(seed));
let failUpdate = false;
const sqlite = new Database(":memory:");
const fetchSql = async (request: Request): Promise<Response> => {
  const body = (await request.json()) as { statements: SqlStatement[] };
  const results = body.statements.map((statement) => {
    if (failUpdate && /^UPDATE alice_runtime_config/i.test(statement.sql)) return { rows: [] };
    const rows = sqlite.query(statement.sql).all(...statement.params) as Record<string, unknown>[];
    return { rows };
  });
  return Response.json({ ok: true, results });
};
function aliceConfig(theme: string): ElizaConfig {
  return { logging: { level: "error" }, ui: { theme } } as ElizaConfig;
}

describe("Alice config.ts durable integration", () => {
  let initialize: () => Promise<void>;
  let load: () => ElizaConfig;
  let save: (config: ElizaConfig) => void | Promise<void>;
  beforeAll(async () => {
    for (const key of envKeys) savedEnv.set(key, process.env[key]);
    process.env.ALICE_RUNTIME_AUTHORITY_MODE = "proposer-only";
    process.env.ALICE_RUNTIME_PROFILE = "full-gated";
    process.env.ALICE_STATE_OWNER_ID = "alice-owner-production";
    process.env.ELIZA_VAULT_PASSPHRASE = "alice-config-integration-passphrase-32";
    process.env.MILADY_STATE_DIR = stateDir;
    process.env.MILADY_NAMESPACE = "alice-config-test";
    process.env.MILADY_CONFIG_PATH = configPath;
    process.env.MILADY_PERSIST_CONFIG_PATH = configPath;
    globalThis.fetch = fetchSql;
    ({ initializeAliceConfigPersistence: initialize, loadElizaConfig: load, saveElizaConfig: save } = await import("./config.js"));
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      const value = savedEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    sqlite.close();
    fs.rmSync(stateDir, { recursive: true, force: true });
  });
  test("fails closed before init, then hydrates seeded Alice defaults and persists encrypted settings", async () => {
    expect(() => load()).toThrow("ALICE_CONFIG_NOT_INITIALIZED");
    await initialize();
    expect(load().ui?.theme).toBe("dark");
    expect(load().agents?.list?.[0]?.name).toBe("Alice");
    await save(aliceConfig("light"));
    expect(load().ui?.theme).toBe("light");
    expect(load().ui?.assistant?.name).toBe("Alice");
    const row = sqlite.query("SELECT ciphertext FROM alice_runtime_config").get() as { ciphertext: string };
    expect(row.ciphertext).not.toContain("light");
  });
  test("rejects failed CAS and keeps the previous hydrated setting", async () => {
    failUpdate = true;
    await expect(save(aliceConfig("blue"))).rejects.toThrow("ALICE_CONFIG_REVISION_CONFLICT");
    failUpdate = false;
    expect(load().ui?.theme).toBe("light");
  });
});
