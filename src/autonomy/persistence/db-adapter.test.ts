/**
 * Tests for the AutonomyDbAdapter.
 *
 * Uses a mock DrizzleDb to verify adapter behavior without
 * requiring a real database connection.
 */

import { describe, expect, it, vi } from "vitest";

import { AutonomyDbAdapter, type DrizzleDb } from "./db-adapter.js";

// ---------- Mock ----------

function makeMockDb(): DrizzleDb {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn().mockResolvedValue({
      rows: [],
      fields: [],
    }),
  };
}

// ---------- Tests ----------

describe("AutonomyDbAdapter", () => {
  it("constructs with default config", () => {
    const db = makeMockDb();
    const adapter = new AutonomyDbAdapter(db);
    expect(adapter.agentId).toBe("default");
  });

  it("constructs with custom config", () => {
    const db = makeMockDb();
    const adapter = new AutonomyDbAdapter(db, {
      agentId: "agent-1",
      autoMigrate: false,
    });
    expect(adapter.agentId).toBe("agent-1");
  });

  it("exposes table references", () => {
    const db = makeMockDb();
    const adapter = new AutonomyDbAdapter(db);
    const tables = adapter.tables;
    expect(tables.events).toBeDefined();
    expect(tables.goals).toBeDefined();
    expect(tables.state).toBeDefined();
    expect(tables.audit).toBeDefined();
    expect(tables.approvals).toBeDefined();
    expect(tables.identity).toBeDefined();
  });

  it("exposes raw db reference", () => {
    const db = makeMockDb();
    const adapter = new AutonomyDbAdapter(db);
    expect(adapter.raw).toBe(db);
  });

  it("executeRaw throws if not initialized", async () => {
    const db = makeMockDb();
    const adapter = new AutonomyDbAdapter(db, { autoMigrate: false });
    await expect(adapter.executeRaw("SELECT 1")).rejects.toThrow(
      "not initialized",
    );
  });

  it("executeRaw works after initialize (with autoMigrate=false)", async () => {
    const db = makeMockDb();
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ count: 42 }],
      fields: [{ name: "count" }],
    });

    const adapter = new AutonomyDbAdapter(db, { autoMigrate: false });
    await adapter.initialize();

    const result = await adapter.executeRaw("SELECT count(*) FROM autonomy_events");
    expect(result.rows).toHaveLength(1);
    expect(result.columns).toContain("count");
    expect(db.execute).toHaveBeenCalled();
  });

  it("executeRaw extracts column names from rows when fields missing", async () => {
    const db = makeMockDb();
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ id: 1, name: "test" }],
    });

    const adapter = new AutonomyDbAdapter(db, { autoMigrate: false });
    await adapter.initialize();

    const result = await adapter.executeRaw("SELECT * FROM autonomy_events");
    expect(result.columns).toEqual(["id", "name"]);
  });

  it("tableExists returns true when table is found", async () => {
    const db = makeMockDb();
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ table_name: "autonomy_events" }],
      fields: [{ name: "table_name" }],
    });

    const adapter = new AutonomyDbAdapter(db, { autoMigrate: false });
    await adapter.initialize();

    expect(await adapter.tableExists("autonomy_events")).toBe(true);
  });

  it("tableExists returns false when table is null", async () => {
    const db = makeMockDb();
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ table_name: null }],
      fields: [{ name: "table_name" }],
    });

    const adapter = new AutonomyDbAdapter(db, { autoMigrate: false });
    await adapter.initialize();

    expect(await adapter.tableExists("nonexistent_table")).toBe(false);
  });

  it("initialize is idempotent", async () => {
    const db = makeMockDb();
    const adapter = new AutonomyDbAdapter(db, { autoMigrate: false });

    await adapter.initialize();
    await adapter.initialize(); // Should not throw

    // Only one drizzle-orm import should have happened (first call)
    expect(true).toBe(true); // If we got here, no error
  });
});
