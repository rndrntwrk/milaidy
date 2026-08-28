import { describe, expect, test } from "bun:test";

describe("private Alice state service", () => {
  test("authenticates before parsing and dispatches only the explicit record contract", async () => {
    const { createAliceStateService } = await import("../src/service");
    const calls: unknown[] = [];
    const adapter = {
      async getRecord(kind: string, recordId: string, ownerId: string) {
        calls.push({ kind, recordId, ownerId });
        return { kind, recordId, ownerId: "owner-001", sessionId: "session-001", payload: {}, payloadSha256: `sha256:${"a".repeat(64)}`, revision: 1, updatedAt: 1_777_000_000_000 };
      },
      async putRecord() { throw new Error("unexpected"); },
      async listRecords() { throw new Error("unexpected"); },
      async applyAtomic() { throw new Error("unexpected"); },
    };
    const service = createAliceStateService({ adapter, token: "s".repeat(48) });
    const unauthorized = await service.fetch(new Request("https://state.internal/v1/state", {
      method: "POST",
      body: JSON.stringify({ operation: "record.get", kind: "memory", recordId: "memory-001", ownerId: "owner-001" }),
    }));
    expect(unauthorized.status).toBe(401);
    expect(calls).toHaveLength(0);

    const response = await service.fetch(new Request("https://state.internal/v1/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-alice-state-token": "s".repeat(48) },
      body: JSON.stringify({ operation: "record.get", kind: "memory", recordId: "memory-001", ownerId: "owner-001" }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, record: { recordId: "memory-001" } });
    expect(calls).toEqual([{ kind: "memory", recordId: "memory-001", ownerId: "owner-001" }]);
  });

  test("rejects public origins, unsupported paths, oversized bodies and secret-bearing envelopes", async () => {
    const { createAliceStateService } = await import("../src/service");
    const never = async () => { throw new Error("adapter must not be called"); };
    const service = createAliceStateService({
      adapter: { getRecord: never, putRecord: never, listRecords: never, applyAtomic: never },
      token: "s".repeat(48),
    });
    const request = (url: string, body: string, headers: Record<string, string> = {}) => service.fetch(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-alice-state-token": "s".repeat(48), ...headers },
      body,
    }));
    expect((await request("https://state.internal/v1/state", "{}", { origin: "https://alice.rndrntwrk.com" })).status).toBe(401);
    expect((await request("https://state.internal/public", "{}")).status).toBe(404);
    expect((await request("https://state.internal/v1/state", JSON.stringify({ operation: "record.get", kind: "memory", recordId: "memory-001", ownerId: "owner-001", serviceToken: "x".repeat(40) }))).status).toBe(400);
    expect((await request("https://state.internal/v1/state", JSON.stringify({ operation: "record.get", kind: "memory", recordId: "m".repeat(70_000), ownerId: "owner-001" }))).status).toBe(413);
  });

  test("exposes put, list and explicit atomic groups without exposing SQL", async () => {
    const { createAliceStateService } = await import("../src/service");
    const calls: Array<{ operation: string; value: unknown }> = [];
    const service = createAliceStateService({
      adapter: {
        async getRecord() { return null; },
        async putRecord(value: unknown) { calls.push({ operation: "put", value }); return value; },
        async listRecords(value: unknown) { calls.push({ operation: "list", value }); return []; },
        async applyAtomic(value: unknown) { calls.push({ operation: "atomic", value }); return []; },
      },
      token: "s".repeat(48),
    });
    const invoke = async (value: unknown) => service.fetch(new Request("https://state.internal/v1/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-alice-state-token": "s".repeat(48) },
      body: JSON.stringify(value),
    }));
    expect((await invoke({
      operation: "record.put", kind: "task", recordId: "task-001", ownerId: "owner-001",
      sessionId: "session-001", payload: { state: "queued" }, updatedAt: 1_777_000_000_000,
      idempotencyKey: "idem-task-001",
    })).status).toBe(200);
    expect((await invoke({ operation: "record.list", ownerId: "owner-001", sessionId: "session-001", kind: "task", limit: 10 })).status).toBe(200);
    expect((await invoke({
      operation: "records.atomic", operationId: "atomic-task-001",
      records: [{ kind: "task", recordId: "task-001", ownerId: "owner-001", sessionId: "session-001", payload: { state: "running" }, updatedAt: 1_777_000_000_001 }],
    })).status).toBe(200);
    expect(calls.map((call) => call.operation)).toEqual(["put", "list", "atomic"]);
    expect((await invoke({ operation: "sql", statement: "SELECT 1" })).status).toBe(400);
  });
});
