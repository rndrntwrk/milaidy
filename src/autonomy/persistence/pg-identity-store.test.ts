/**
 * Tests for PgIdentityStore.
 */

import { describe, expect, it, vi } from "vitest";

import { PgIdentityStore } from "./pg-identity-store.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";
import type { AutonomyIdentityConfig } from "../identity/schema.js";

// ---------- Mock ----------

function makeMockAdapter(
  execFn?: ReturnType<typeof vi.fn>,
): AutonomyDbAdapter {
  return {
    executeRaw: execFn ?? vi.fn().mockResolvedValue({ rows: [], columns: [] }),
    agentId: "test-agent",
  } as unknown as AutonomyDbAdapter;
}

function makeIdentity(version = 1): AutonomyIdentityConfig {
  return {
    name: "test-agent",
    identityVersion: version,
    coreValues: ["helpfulness", "honesty"],
    communicationStyle: {
      tone: "formal",
      verbosity: "concise",
      personaVoice: "test voice",
    },
    hardBoundaries: ["no-harm"],
    softPreferences: { proactivity: "medium" },
  } as AutonomyIdentityConfig;
}

// ---------- Tests ----------

describe("PgIdentityStore", () => {
  describe("saveVersion()", () => {
    it("deactivates previous and inserts new version", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [{
          version: 1,
          identity: makeIdentity(),
          hash: "abc123",
          agent_id: "test-agent",
          active: true,
          created_at: "2025-01-01T00:00:00Z",
        }],
        columns: [],
      });
      const store = new PgIdentityStore(makeMockAdapter(exec));

      const entry = await store.saveVersion(makeIdentity());

      // Should have called executeRaw twice: deactivate + insert
      expect(exec).toHaveBeenCalledTimes(2);

      const deactivateSql = exec.mock.calls[0][0] as string;
      expect(deactivateSql).toContain("UPDATE autonomy_identity");
      expect(deactivateSql).toContain("active = false");

      const insertSql = exec.mock.calls[1][0] as string;
      expect(insertSql).toContain("INSERT INTO autonomy_identity");
      expect(insertSql).toContain("test-agent");

      expect(entry.version).toBe(1);
      expect(entry.active).toBe(true);
    });
  });

  describe("getActive()", () => {
    it("returns active identity version", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [{
          version: 2,
          identity: makeIdentity(2),
          hash: "def456",
          agent_id: "test-agent",
          active: true,
          created_at: "2025-01-01T00:00:00Z",
        }],
        columns: [],
      });
      const store = new PgIdentityStore(makeMockAdapter(exec));

      const entry = await store.getActive();

      expect(entry).toBeDefined();
      expect(entry!.version).toBe(2);
      expect(entry!.active).toBe(true);

      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("active = true");
    });

    it("returns undefined when no active version", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const store = new PgIdentityStore(makeMockAdapter(exec));

      expect(await store.getActive()).toBeUndefined();
    });
  });

  describe("getHistory()", () => {
    it("returns version history", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [
          { version: 2, identity: makeIdentity(2), hash: "h2", agent_id: "test-agent", active: true, created_at: "2025-01-02T00:00:00Z" },
          { version: 1, identity: makeIdentity(1), hash: "h1", agent_id: "test-agent", active: false, created_at: "2025-01-01T00:00:00Z" },
        ],
        columns: [],
      });
      const store = new PgIdentityStore(makeMockAdapter(exec));

      const entries = await store.getHistory(10);

      expect(entries).toHaveLength(2);
      expect(entries[0].version).toBe(2);
      expect(entries[1].version).toBe(1);

      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("ORDER BY version DESC");
      expect(sql).toContain("LIMIT 10");
    });
  });

  describe("getVersion()", () => {
    it("returns specific version", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [{ version: 1, identity: makeIdentity(), hash: "abc", agent_id: "test-agent", active: false, created_at: new Date() }],
        columns: [],
      });
      const store = new PgIdentityStore(makeMockAdapter(exec));

      const entry = await store.getVersion(1);
      expect(entry).toBeDefined();
      expect(entry!.version).toBe(1);
    });

    it("returns undefined when version not found", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const store = new PgIdentityStore(makeMockAdapter(exec));

      expect(await store.getVersion(99)).toBeUndefined();
    });
  });
});
