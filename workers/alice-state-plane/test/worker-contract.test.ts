import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("Alice state Worker and Durable Object deployment contract", () => {
  test("has an actual private Worker entrypoint, SQLite DO migration and all durable bindings", async () => {
    const root = new URL("..", import.meta.url);
    const [entrypoint, config] = await Promise.all([
      readFile(new URL("src/index.ts", root), "utf8"),
      readFile(new URL("wrangler.jsonc", root), "utf8"),
    ]);
    expect(entrypoint).toMatch(/extends DurableObject/);
    expect(entrypoint).toMatch(/DurableObjectCoordinationStorage/);
    expect(entrypoint).toMatch(/createAliceStateService/);
    expect(config).toMatch(/"workers_dev"\s*:\s*false/);
    expect(config).toMatch(/"routes"\s*:\s*\[\s*\]/);
    expect(config).toMatch(/"d1_databases"/);
    expect(config).toMatch(/"vectorize"/);
    expect(config).toMatch(/"r2_buckets"/);
    expect(config).toMatch(/"new_sqlite_classes"/);
  });

  test("adapts DurableObjectStorage without treating a Map as the production store", async () => {
    const { DurableObjectCoordinationStorage, AliceCoordinationLedger } = await import("../src/coordination-storage");
    const writes: unknown[] = [];
    const durable = new Map<string, unknown>();
    const storage = new DurableObjectCoordinationStorage({
      get: async (key: string) => durable.get(key),
      put: async (key: string, value: unknown) => {
        writes.push(structuredClone(value));
        durable.set(key, structuredClone(value));
      },
    });
    const ledger = await AliceCoordinationLedger.restore(storage, "owner-001", "session-001");
    await ledger.connect("connection-001", 1_777_000_000_000);
    expect(writes).toHaveLength(2);
    expect((await AliceCoordinationLedger.restore(storage, "owner-001", "session-001")).snapshot().connectionEpoch).toBe(1);
  });
});
