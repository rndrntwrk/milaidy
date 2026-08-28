import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

type BoundStatement = {
  bind: (...values: unknown[]) => BoundStatement;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ success: boolean; results: T[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

class SqliteD1Binding {
  readonly sqlite: Database;

  constructor() {
    this.sqlite = new Database(":memory:");
  }

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
        return {
          success: true,
          results: binding.sqlite.query(sql).all(...values) as T[],
        };
      },
      async run() {
        const result = binding.sqlite.query(sql).run(...values);
        return { success: true, meta: { changes: result.changes } };
      },
    };
    return statement;
  }

  async batch(statements: BoundStatement[]) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  exec(sql: string) {
    this.sqlite.exec(sql);
    return Promise.resolve({ count: 1, duration: 0 });
  }
}

class FakeR2Bucket {
  readonly objects = new Map<string, { bytes: Uint8Array; customMetadata: Record<string, string> }>();

  async head(key: string) {
    const object = this.objects.get(key);
    return object
      ? { key, size: object.bytes.byteLength, customMetadata: object.customMetadata }
      : null;
  }

  async put(
    key: string,
    value: Uint8Array,
    options: { customMetadata: Record<string, string>; onlyIf?: { etagDoesNotMatch: string } },
  ) {
    if (options.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    this.objects.set(key, { bytes: value.slice(), customMetadata: options.customMetadata });
    return { key, size: value.byteLength, customMetadata: options.customMetadata };
  }
}

class FakeVectorIndex {
  readonly vectors = new Map<string, { values: number[]; namespace: string; metadata: Record<string, unknown> }>();

  async upsert(vectors: Array<{ id: string; values: number[]; namespace: string; metadata: Record<string, unknown> }>) {
    for (const vector of vectors) this.vectors.set(vector.id, structuredClone(vector));
    return { count: vectors.length, ids: vectors.map((vector) => vector.id) };
  }

  async query(values: number[], options: { namespace: string; topK: number; returnMetadata: "all" }) {
    const matches = [...this.vectors.entries()]
      .filter(([, vector]) => vector.namespace === options.namespace)
      .map(([id, vector]) => ({ id, score: values[0] === vector.values[0] ? 1 : 0, metadata: vector.metadata }))
      .slice(0, options.topK);
    return { count: matches.length, matches };
  }
}

const digest = (character: string) => `sha256:${character.repeat(64)}`;

describe("portable D1 Alice state contract", () => {
  test("persists every admitted canonical kind and makes identical replay idempotent across adapter restart", async () => {
    const state = await import("../src/state-plane");
    const d1 = new SqliteD1Binding();
    await state.installAliceStateSchema(d1);
    const first = new state.D1AliceStateAdapter(d1);
    const kinds = [
      "message", "room", "world", "entity", "relationship", "memory", "task",
      "trajectory", "connectorCursor", "configVersion", "approvalReceipt",
    ] as const;
    for (const [index, kind] of kinds.entries()) {
      const input = {
        kind,
        recordId: `${kind}-001`,
        ownerId: "owner-001",
        sessionId: "session-001",
        payload: { index, value: kind },
        updatedAt: 1_777_000_000_000 + index,
        idempotencyKey: `idem-${kind}-001`,
      };
      const created = await first.putRecord(input);
      const replayed = await new state.D1AliceStateAdapter(d1).putRecord(input);
      expect(replayed).toEqual(created);
      expect(replayed.revision).toBe(1);
      expect(await first.getRecord(kind, input.recordId, "owner-001")).toEqual(created);
    }
    expect(await first.listRecords({ ownerId: "owner-001", sessionId: "session-001", limit: 50 })).toHaveLength(11);
  });

  test("rejects idempotency collisions, unknown kinds and arbitrary SQL or callback transactions", async () => {
    const state = await import("../src/state-plane");
    const d1 = new SqliteD1Binding();
    await state.installAliceStateSchema(d1);
    const adapter = new state.D1AliceStateAdapter(d1);
    const base = {
      kind: "memory" as const,
      recordId: "memory-001",
      ownerId: "owner-001",
      sessionId: "session-001",
      payload: { text: "first" },
      updatedAt: 1_777_000_000_000,
      idempotencyKey: "idem-memory-001",
    };
    await adapter.putRecord(base);
    await expect(adapter.putRecord({ ...base, payload: { text: "collision" } })).rejects.toThrow("STATE_IDEMPOTENCY_COLLISION");
    await expect(adapter.putRecord({ ...base, kind: "rawSql" as never })).rejects.toThrow("STATE_KIND_UNSUPPORTED");
    await expect(adapter.transaction(async () => true)).rejects.toThrow("D1_CALLBACK_TRANSACTION_UNSUPPORTED");
    await expect(adapter.executeRawSql("select 1")).rejects.toThrow("D1_RAW_SQL_UNSUPPORTED");
  });

  test("executes an explicit atomic operation group through one D1 batch", async () => {
    const state = await import("../src/state-plane");
    const d1 = new SqliteD1Binding();
    await state.installAliceStateSchema(d1);
    let batches = 0;
    const originalBatch = d1.batch.bind(d1);
    d1.batch = async (statements) => {
      batches += 1;
      return originalBatch(statements);
    };
    const adapter = new state.D1AliceStateAdapter(d1);
    const result = await adapter.applyAtomic({
      operationId: "atomic-001",
      records: ["room", "message"].map((kind, index) => ({
        kind,
        recordId: `${kind}-atomic-001`,
        ownerId: "owner-001",
        sessionId: "session-001",
        payload: { index },
        updatedAt: 1_777_000_001_000 + index,
      })),
    });
    expect(result.map((record) => record.kind)).toEqual(["room", "message"]);
    expect(batches).toBe(1);
  });

  test("aborts the whole atomic group when an operation digest loses a concurrent collision", async () => {
    const state = await import("../src/state-plane");
    const d1 = new SqliteD1Binding();
    await state.installAliceStateSchema(d1);
    const originalBatch = d1.batch.bind(d1);
    let injected = false;
    d1.batch = async (statements) => {
      if (!injected) {
        injected = true;
        d1.sqlite.query("INSERT INTO alice_state_idempotency(idempotency_key, request_sha256, created_at) VALUES (?, ?, ?)")
          .run("atomic-race:0", "f".repeat(64), 1_777_000_002_000);
      }
      return originalBatch(statements);
    };
    const adapter = new state.D1AliceStateAdapter(d1);
    await expect(adapter.applyAtomic({
      operationId: "atomic-race",
      records: ["room", "message"].map((kind, index) => ({
        kind,
        recordId: `${kind}-race-001`,
        ownerId: "owner-001",
        sessionId: "session-001",
        payload: { index },
        updatedAt: 1_777_000_002_000 + index,
      })),
    })).rejects.toThrow("STATE_IDEMPOTENCY_COLLISION");
    expect(await adapter.getRecord("room", "room-race-001", "owner-001")).toBeNull();
    expect(await adapter.getRecord("message", "message-race-001", "owner-001")).toBeNull();
  });

  test("keeps owner identity immutable and requires it on every record read", async () => {
    const state = await import("../src/state-plane");
    const d1 = new SqliteD1Binding();
    await state.installAliceStateSchema(d1);
    const adapter = new state.D1AliceStateAdapter(d1);
    await adapter.putRecord({
      kind: "memory", recordId: "memory-tenant-001", ownerId: "owner-001",
      payload: { owner: 1 }, updatedAt: 1_777_000_000_000,
      idempotencyKey: "tenant-owner-001",
    });
    await adapter.putRecord({
      kind: "memory", recordId: "memory-tenant-001", ownerId: "owner-002",
      payload: { owner: 2 }, updatedAt: 1_777_000_000_001,
      idempotencyKey: "tenant-owner-002",
    });
    expect((await adapter.getRecord("memory", "memory-tenant-001", "owner-001"))?.payload).toEqual({ owner: 1 });
    expect((await adapter.getRecord("memory", "memory-tenant-001", "owner-002"))?.payload).toEqual({ owner: 2 });
    await expect(adapter.getRecord("memory", "memory-tenant-001", undefined as never)).rejects.toThrow("STATE_OWNER_REQUIRED");
  });
});

describe("Vectorize and R2 canonical references", () => {
  test("binds vectors to exact model and dimensions while retaining D1 identity", async () => {
    const state = await import("../src/state-plane");
    const d1 = new SqliteD1Binding();
    await state.installAliceStateSchema(d1);
    const adapter = new state.D1AliceStateAdapter(d1);
    await adapter.putRecord({
      kind: "memory",
      recordId: "memory-001",
      ownerId: "owner-001",
      sessionId: "session-001",
      payload: { text: "canonical memory" },
      updatedAt: 1_777_000_000_000,
      idempotencyKey: "idem-vector-memory-001",
    });
    const index = new FakeVectorIndex();
    const store = new state.AliceVectorStore(index, { indexName: "alice-memory-v1", model: "bge-base-en-v1.5", dimensions: 768 }, adapter);
    const ref = await store.upsert({
      recordKind: "memory",
      recordId: "memory-001",
      ownerId: "owner-001",
      model: "bge-base-en-v1.5",
      dimensions: 768,
      values: Array.from({ length: 768 }, (_, index) => index / 768),
    });
    expect(ref.namespace).toBe("owner:owner-001");
    expect(ref.model).toBe("bge-base-en-v1.5");
    expect(await adapter.getVectorReference("memory", "memory-001", "owner-001")).toEqual(ref);
    await expect(store.upsert({ ...ref, values: [1], dimensions: 1 })).rejects.toThrow("VECTOR_DIMENSION_DRIFT");
    await expect(store.query({ ownerId: "owner-001", model: "other", dimensions: 768, values: Array(768).fill(0), topK: 5 })).rejects.toThrow("VECTOR_MODEL_DRIFT");
    const matches = await store.query({ ownerId: "owner-001", model: "bge-base-en-v1.5", dimensions: 768, values: Array(768).fill(0), topK: 5 });
    expect(matches[0]?.recordId).toBe("memory-001");
    index.vectors.get(ref.vectorId)!.metadata.indexName = "wrong-index";
    await expect(store.query({ ownerId: "owner-001", model: "bge-base-en-v1.5", dimensions: 768, values: Array(768).fill(0), topK: 5 })).rejects.toThrow("VECTOR_RESULT_IDENTITY_INVALID");
    expect(() => new state.AliceVectorStore(index, { indexName: "alice-memory-v2", model: "large-model", dimensions: 2048 })).toThrow("VECTOR_DIMENSION_UNSUPPORTED");
  });

  test("writes exact bytes once under a content-addressed R2 key and rejects corrupt existing metadata", async () => {
    const state = await import("../src/state-plane");
    const d1 = new SqliteD1Binding();
    await state.installAliceStateSchema(d1);
    const adapter = new state.D1AliceStateAdapter(d1);
    const bucket = new FakeR2Bucket();
    const store = new state.AliceObjectStore(bucket, adapter);
    const bytes = new TextEncoder().encode("durable Alice evidence");
    const first = await store.put(bytes, "application/json", 1_777_000_000_000);
    const replay = await store.put(bytes, "application/json", 1_777_000_000_000);
    expect(replay).toEqual(first);
    expect(await adapter.getObjectReference(first.sha256)).toEqual(first);
    expect(bucket.objects.size).toBe(1);
    bucket.objects.get(first.key)!.customMetadata.sha256 = digest("f");
    await expect(store.put(bytes, "application/json")).rejects.toThrow("R2_CONTENT_ADDRESS_COLLISION");
  });
});

describe("per-owner/session coordination and private service boundary", () => {
  test("persists actor epoch and monotonic recovery cursors before restart", async () => {
    const state = await import("../src/state-plane");
    const storage = new Map<string, unknown>();
    const first = await state.AliceCoordinationLedger.restore(storage, "owner-001", "session-001");
    expect(await first.connect("connection-001", 1_777_000_000_000)).toMatchObject({ connectionEpoch: 1 });
    expect(await first.advanceCursor("telegram", "cursor-001", 1_777_000_000_010)).toMatchObject({ revision: 1 });
    const restarted = await state.AliceCoordinationLedger.restore(storage, "owner-001", "session-001");
    expect(restarted.snapshot()).toMatchObject({ connectionEpoch: 1, cursors: { telegram: { cursor: "cursor-001", revision: 1 } } });
    await expect(restarted.advanceCursor("telegram", "cursor-stale", 1_776_000_000_000)).rejects.toThrow("COORDINATION_CURSOR_STALE");
  });

  test("derives one deterministic DO name and rejects cross-owner names", async () => {
    const state = await import("../src/state-plane");
    const name = state.coordinationDurableName("owner-001", "session-001");
    expect(name).toBe("actor/owner-001/session/session-001");
    expect(state.parseCoordinationDurableName(name)).toEqual({ ownerId: "owner-001", sessionId: "session-001" });
    expect(() => state.parseCoordinationDurableName("actor/owner-002/session/../owner-001")).toThrow("COORDINATION_NAME_INVALID");
  });

  test("accepts only the private bounded service operation envelope and exact token", async () => {
    const state = await import("../src/state-plane");
    const token = "s".repeat(48);
    expect(state.authorizeStatePlaneRequest(new Request("https://state.internal/v1/state", { headers: { "x-alice-state-token": token } }), token)).toBe(true);
    expect(state.authorizeStatePlaneRequest(new Request("https://state.internal/v1/state", { headers: { authorization: `Bearer ${token}`, origin: "https://alice.rndrntwrk.com" } }), token)).toBe(false);
    expect(() => state.validateStateOperation({ operation: "sql", sql: "select 1" })).toThrow("STATE_OPERATION_UNSUPPORTED");
    expect(() => state.validateStateOperation({ operation: "record.get", kind: "memory", recordId: "memory-001", ownerId: "owner-001", token })).toThrow("STATE_OPERATION_SECRET_FIELD");
    expect(state.validateStateOperation({ operation: "record.get", kind: "memory", recordId: "memory-001", ownerId: "owner-001" })).toEqual({ operation: "record.get", kind: "memory", recordId: "memory-001", ownerId: "owner-001" });
  });
});
