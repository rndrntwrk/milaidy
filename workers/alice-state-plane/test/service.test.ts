import { describe, expect, test } from "bun:test";

describe("private Alice state service", () => {
  test("loads an empty Eliza database through the private authenticated route", async () => {
    const { createAliceStateService } = await import("../src/service");
    const never = async () => { throw new Error("generic adapter must not be called"); };
    const service = createAliceStateService({
      adapter: { getRecord: never, putRecord: never, listRecords: never, applyAtomic: never },
      elizaDatabase: {
        async load(input: unknown) {
          expect(input).toEqual({ ownerId: "owner-001", cursor: null, limit: 500 });
          return { revision: 0, records: [], nextCursor: null };
        },
        async commit() { throw new Error("commit must not be called"); },
      },
      token: "s".repeat(48),
    });
    const result = await service.fetch(new Request("https://state.internal/v1/eliza-database", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-alice-state-token": "s".repeat(48),
      },
      body: JSON.stringify({
        operation: "eliza.load",
        ownerId: "owner-001",
        cursor: null,
        limit: 500,
      }),
    }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      ok: true,
      revision: 0,
      records: [],
      nextCursor: null,
    });
  });

  test("binds Container-scoped state calls to the production owner and exact Companion record", async () => {
    const { createAliceStateService } = await import("../src/service");
    const calls: unknown[] = [];
    const service = createAliceStateService({
      adapter: {
        async getRecord(kind: string, recordId: string, ownerId: string) {
          calls.push({ kind, recordId, ownerId });
          return null;
        },
        async putRecord(value: unknown) {
          calls.push(value);
          return value;
        },
        async listRecords() { throw new Error("unexpected"); },
        async applyAtomic() { throw new Error("unexpected"); },
      },
      elizaDatabase: {
        async load(input: unknown) {
          calls.push(input);
          return { revision: 0, records: [], nextCursor: null };
        },
        async commit() { throw new Error("unexpected"); },
      },
      token: "s".repeat(48),
    });
    const invoke = (path: string, scope: string, value: unknown) =>
      service.fetch(new Request(`https://state.internal${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alice-state-token": "s".repeat(48),
          "x-alice-container-state-scope": scope,
          "x-alice-state-owner": "alice-owner-production",
        },
        body: JSON.stringify(value),
      }));

    expect((await invoke("/v1/eliza-database", "eliza-database", {
      operation: "eliza.load",
      ownerId: "alice-owner-production",
      cursor: null,
      limit: 500,
    })).status).toBe(200);
    expect((await invoke("/v1/eliza-database", "eliza-database", {
      operation: "eliza.load",
      ownerId: "other-owner",
      cursor: null,
      limit: 500,
    })).status).toBe(403);
    expect((await invoke("/v1/state", "companion-stage", {
      operation: "record.get",
      kind: "configVersion",
      recordId: "companion-stage-v1",
      ownerId: "alice-owner-production",
    })).status).toBe(200);
    expect((await invoke("/v1/state", "openai-codex-credentials", {
      operation: "record.put",
      kind: "configVersion",
      recordId: "openai-codex-credentials-v1",
      ownerId: "alice-owner-production",
      sessionId: "openai-codex-production",
      payload: {
        schemaVersion: "alice.openai-codex-auth-state.v1",
        state: "active",
        algorithm: "aes-256-gcm",
        kdf: "pbkdf2-sha256",
        iterations: 210000,
        salt: "a".repeat(32),
        iv: "b".repeat(24),
        ciphertext: "c".repeat(64),
        tag: "d".repeat(32),
      },
      updatedAt: 1_777_000_000_000,
      idempotencyKey: "openai-codex-valid-001",
    })).status).toBe(200);
    expect((await invoke("/v1/state", "openai-codex-credentials", {
      operation: "record.put",
      kind: "configVersion",
      recordId: "openai-codex-credentials-v1",
      ownerId: "alice-owner-production",
      sessionId: "openai-codex-production",
      payload: { schemaVersion: "alice.openai-codex-auth-state.v1", accessToken: "raw" },
      updatedAt: 1_777_000_000_000,
      idempotencyKey: "openai-codex-invalid-001",
    })).status).toBe(400);
    expect((await invoke("/v1/state", "companion-stage", {
      operation: "record.put",
      kind: "configVersion",
      recordId: "companion-stage-v1",
      ownerId: "alice-owner-production",
      sessionId: "companion-production",
      payload: {
        schemaVersion: "alice.companion-stage-state.v1",
        state: { camera: { zoom: 0.5, yaw: 0, pitch: 0, pan: 0 } },
      },
      updatedAt: 1_777_000_000_000,
      idempotencyKey: "companion-stage-valid-001",
    })).status).toBe(200);
    expect((await invoke("/v1/state", "companion-stage", {
      operation: "record.get",
      kind: "approvalReceipt",
      recordId: "forged-receipt",
      ownerId: "alice-owner-production",
    })).status).toBe(403);
    expect((await invoke("/v1/state", "companion-stage", {
      operation: "record.get",
      kind: "configVersion",
      recordId: "companion-stage-v1",
      ownerId: "other-owner",
    })).status).toBe(403);
    expect((await invoke("/v1/state", "companion-stage", {
      operation: "record.put",
      kind: "configVersion",
      recordId: "companion-stage-v1",
      ownerId: "alice-owner-production",
      sessionId: "companion-production",
      payload: { schemaVersion: "alice.companion-stage-state.v1", state: {} },
      updatedAt: 1_777_000_000_000,
      idempotencyKey: "companion-stage-invalid-001",
    })).status).toBe(403);
    expect(calls).toHaveLength(4);
  });

  test("commits a bounded Eliza value and rejects unauthorized, extra, or secret-bearing shapes", async () => {
    const { createAliceStateService } = await import("../src/service");
    const never = async () => { throw new Error("generic adapter must not be called"); };
    const calls: unknown[] = [];
    const service = createAliceStateService({
      adapter: { getRecord: never, putRecord: never, listRecords: never, applyAtomic: never },
      elizaDatabase: {
        async load() { throw new Error("load must not be called"); },
        async commit(input: unknown) {
          calls.push(input);
          return { revision: 1 };
        },
      },
      token: "s".repeat(48),
    });
    const body = {
      operation: "eliza.commit",
      ownerId: "owner-001",
      operationId: "operation-001",
      expectedRevision: 0,
      mutations: [{
        collection: "memories",
        key: "memory-001",
        deleted: false,
        value: { text: "x".repeat(70_000) },
      }],
    };
    const invoke = (value: unknown, token = "s".repeat(48)) => service.fetch(new Request(
      "https://state.internal/v1/eliza-database",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-alice-state-token": token },
        body: JSON.stringify(value),
      },
    ));
    expect((await invoke(body, "wrong-token".repeat(4))).status).toBe(401);
    const committed = await invoke(body);
    expect(committed.status).toBe(200);
    expect(await committed.json()).toEqual({ ok: true, revision: 1 });
    expect(calls).toHaveLength(1);
    const extra = await invoke({ ...body, unexpected: true });
    expect(extra.status).toBe(400);
    expect(await extra.json()).toEqual({ ok: false, code: "ELIZA_OPERATION_INVALID" });
    const secret = await invoke({
      ...body,
      mutations: [{
        collection: "memories",
        key: "memory-secret-001",
        deleted: false,
        value: { authorization: "forbidden" },
      }],
    });
    expect(secret.status).toBe(400);
    expect(await secret.json()).toEqual({ ok: false, code: "ELIZA_SECRET_FIELD" });
    expect(calls).toHaveLength(1);
  });

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
    const dependencyFailure = await request("https://state.internal/v1/state", JSON.stringify({
      operation: "vector.query",
      ownerId: "owner-001",
      model: "bge-base-en-v1.5",
      dimensions: 1,
      values: [1],
      topK: 1,
    }));
    expect(dependencyFailure.status).toBe(400);
    expect(await dependencyFailure.json()).toEqual({
      ok: false,
      code: "STATE_DEPENDENCY_UNAVAILABLE",
    });
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

  test("routes exact Vectorize, R2 and coordination operations through private dependencies", async () => {
    const { createAliceStateService } = await import("../src/service");
    const calls: string[] = [];
    const never = async () => { throw new Error("record adapter must not be called"); };
    const service = createAliceStateService({
      adapter: { getRecord: never, putRecord: never, listRecords: never, applyAtomic: never },
      vectorStore: {
        async upsert() { calls.push("vector.upsert"); return { vectorId: "vec-owner-001" }; },
        async query() { calls.push("vector.query"); return []; },
      },
      objectStore: {
        async put(bytes: Uint8Array) { calls.push(`object.put:${bytes.byteLength}`); return { key: "objects/sha256/example" }; },
      },
      coordination: {
        async initialize() { calls.push("coordination.initialize"); return { ownerId: "owner-001", sessionId: "session-001" }; },
        async snapshot() { calls.push("coordination.snapshot"); return { connectionEpoch: 0 }; },
        async connect() { calls.push("coordination.connect"); return { connectionEpoch: 1 }; },
        async advanceCursor() { calls.push("coordination.cursor"); return { revision: 1 }; },
      },
      token: "s".repeat(48),
    });
    const invoke = async (value: unknown) => service.fetch(new Request("https://state.internal/v1/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-alice-state-token": "s".repeat(48) },
      body: JSON.stringify(value),
    }));
    const operations = [
      { operation: "vector.upsert", recordKind: "memory", recordId: "memory-001", ownerId: "owner-001", model: "bge-base-en-v1.5", dimensions: 3, values: [1, 2, 3] },
      { operation: "vector.query", ownerId: "owner-001", model: "bge-base-en-v1.5", dimensions: 3, values: [1, 2, 3], topK: 5 },
      { operation: "object.put", bytesBase64: "YWxpY2U=", mediaType: "text/plain", createdAt: 1_777_000_000_000 },
      { operation: "coordination.initialize", ownerId: "owner-001", sessionId: "session-001" },
      { operation: "coordination.snapshot", ownerId: "owner-001", sessionId: "session-001" },
      { operation: "coordination.connect", ownerId: "owner-001", sessionId: "session-001", connectionId: "connection-001", connectedAt: 1_777_000_000_000 },
      { operation: "coordination.cursor", ownerId: "owner-001", sessionId: "session-001", connector: "telegram", cursor: "cursor-001", observedAt: 1_777_000_000_001 },
    ];
    for (const operation of operations) expect((await invoke(operation)).status).toBe(200);
    expect(calls).toEqual([
      "vector.upsert", "vector.query", "object.put:5", "coordination.initialize",
      "coordination.snapshot", "coordination.connect", "coordination.cursor",
    ]);
    expect((await invoke({ operation: "sql", statement: "SELECT 1" })).status).toBe(400);
  });
});
