export const ALICE_STATE_KINDS = [
  "message",
  "room",
  "world",
  "entity",
  "relationship",
  "memory",
  "task",
  "trajectory",
  "connectorCursor",
  "configVersion",
  "approvalReceipt",
] as const;

export type AliceStateKind = (typeof ALICE_STATE_KINDS)[number];

type D1RunResult = { success: boolean; meta?: { changes?: number }; results?: unknown[] };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ success: boolean; results: T[] }>;
  run(): Promise<D1RunResult>;
};
type D1Binding = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1RunResult[]>;
  exec(sql: string): Promise<unknown>;
};

type VectorMetadataScalar = string | number | boolean | string[];
type VectorMetadata = VectorMetadataScalar | Record<string, VectorMetadataScalar>;
type VectorizeBinding = {
  upsert(vectors: Array<{
    id: string;
    values: number[];
    namespace: string;
    metadata: Record<string, VectorMetadata>;
  }>): Promise<unknown>;
  query(
    values: number[],
    options: { namespace: string; topK: number; returnMetadata: "all" },
  ): Promise<{ matches: Array<{ id: string; score: number; metadata?: Record<string, VectorMetadata> }> }>;
};

type R2Head = {
  key: string;
  size: number;
  customMetadata?: Record<string, string>;
};
type R2Binding = {
  head(key: string): Promise<R2Head | null>;
  put(
    key: string,
    value: Uint8Array,
    options: {
      onlyIf: { etagDoesNotMatch: string };
      customMetadata: Record<string, string>;
      httpMetadata: { contentType: string };
      sha256: ArrayBuffer;
    },
  ): Promise<R2Head | null>;
};

export type PortableRecordInput = {
  kind: AliceStateKind;
  recordId: string;
  ownerId: string;
  sessionId?: string | null;
  payload: unknown;
  updatedAt: number;
  idempotencyKey?: string;
};

export type PortableRecord = {
  kind: AliceStateKind;
  recordId: string;
  ownerId: string;
  sessionId: string | null;
  payload: unknown;
  payloadSha256: string;
  revision: number;
  updatedAt: number;
};

const encoder = new TextEncoder();
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const STATE_KIND = new Set<string>(ALICE_STATE_KINDS);
const SECRET_FIELD = /(?:token|secret|authorization|cookie|password|privateKey)/i;

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function normalizeJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("STATE_PAYLOAD_INVALID");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key.length === 0 || key.includes("\0")) throw new Error("STATE_PAYLOAD_INVALID");
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined || typeof child === "function" || typeof child === "symbol" || typeof child === "bigint") {
        throw new Error("STATE_PAYLOAD_INVALID");
      }
      output[key] = normalizeJson(child);
    }
    return output;
  }
  throw new Error("STATE_PAYLOAD_INVALID");
}

function canonicalJson(value: unknown): string {
  const json = JSON.stringify(normalizeJson(value));
  if (encoder.encode(json).byteLength > 1_000_000) throw new Error("STATE_PAYLOAD_TOO_LARGE");
  return json;
}

async function sha256Bytes(bytes: Uint8Array): Promise<{ hex: string; buffer: ArrayBuffer }> {
  const buffer = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { hex, buffer };
}

async function sha256Text(value: string): Promise<string> {
  return (await sha256Bytes(encoder.encode(value))).hex;
}

function validateRecord(input: PortableRecordInput): void {
  if (!STATE_KIND.has(input.kind)) throw new Error("STATE_KIND_UNSUPPORTED");
  if (!validIdentifier(input.recordId) || !validIdentifier(input.ownerId)) {
    throw new Error("STATE_IDENTITY_INVALID");
  }
  if (input.sessionId !== undefined && input.sessionId !== null && !validIdentifier(input.sessionId)) {
    throw new Error("STATE_IDENTITY_INVALID");
  }
  if (!Number.isSafeInteger(input.updatedAt) || input.updatedAt <= 0) {
    throw new Error("STATE_TIMESTAMP_INVALID");
  }
  if (input.idempotencyKey !== undefined && !validIdentifier(input.idempotencyKey)) {
    throw new Error("STATE_IDEMPOTENCY_KEY_INVALID");
  }
  canonicalJson(input.payload);
}

export const ALICE_STATE_SCHEMA = `
CREATE TABLE IF NOT EXISTS alice_state_idempotency (
  owner_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
  created_at INTEGER NOT NULL CHECK(created_at > 0),
  PRIMARY KEY (owner_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS alice_state_records (
  kind TEXT NOT NULL CHECK(kind IN ('message','room','world','entity','relationship','memory','task','trajectory','connectorCursor','configVersion','approvalReceipt')),
  record_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  session_id TEXT,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  revision INTEGER NOT NULL CHECK(revision > 0),
  updated_at INTEGER NOT NULL CHECK(updated_at > 0),
  PRIMARY KEY (owner_id, kind, record_id)
);
CREATE INDEX IF NOT EXISTS alice_state_owner_session_idx
  ON alice_state_records(owner_id, session_id, updated_at, kind, record_id);
CREATE TABLE IF NOT EXISTS alice_vector_references (
  owner_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  vector_id TEXT NOT NULL UNIQUE,
  index_name TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK(dimensions > 0 AND dimensions <= 1536),
  namespace TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, record_kind, record_id),
  FOREIGN KEY (owner_id, record_kind, record_id) REFERENCES alice_state_records(owner_id, kind, record_id)
);
CREATE TABLE IF NOT EXISTS alice_object_references (
  object_sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(object_sha256) = 64),
  object_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at INTEGER NOT NULL CHECK(created_at > 0)
);
`;

export async function installAliceStateSchema(db: D1Binding): Promise<void> {
  await db.exec(ALICE_STATE_SCHEMA);
}

type StoredRecordRow = {
  kind: AliceStateKind;
  record_id: string;
  owner_id: string;
  session_id: string | null;
  payload_json: string;
  payload_sha256: string;
  revision: number;
  updated_at: number;
};

async function toRecord(row: StoredRecordRow): Promise<PortableRecord> {
  if (!exactKeys(row as unknown as Record<string, unknown>, [
    "kind", "record_id", "owner_id", "session_id", "payload_json",
    "payload_sha256", "revision", "updated_at",
  ]) || !STATE_KIND.has(row.kind) || !validIdentifier(row.record_id) ||
    !validIdentifier(row.owner_id) || (row.session_id !== null && !validIdentifier(row.session_id)) ||
    typeof row.payload_json !== "string" || !/^[a-f0-9]{64}$/.test(row.payload_sha256) ||
    !Number.isSafeInteger(row.revision) || row.revision < 1 ||
    !Number.isSafeInteger(row.updated_at) || row.updated_at < 1) {
    throw new Error("STATE_ROW_INVALID");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    throw new Error("STATE_ROW_INVALID");
  }
  const canonical = canonicalJson(payload);
  if (canonical !== row.payload_json || await sha256Text(canonical) !== row.payload_sha256) {
    throw new Error("STATE_ROW_INVALID");
  }
  return {
    kind: row.kind,
    recordId: row.record_id,
    ownerId: row.owner_id,
    sessionId: row.session_id,
    payload,
    payloadSha256: `sha256:${row.payload_sha256}`,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

const INSERT_IDEMPOTENCY = `
INSERT INTO alice_state_idempotency(owner_id, idempotency_key, request_sha256, created_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(owner_id, idempotency_key) DO UPDATE SET
  request_sha256 = CASE
    WHEN alice_state_idempotency.request_sha256 = excluded.request_sha256
    THEN alice_state_idempotency.request_sha256
    ELSE NULL
  END`;

const UPSERT_RECORD = `
INSERT INTO alice_state_records(
  kind, record_id, owner_id, session_id, payload_json, payload_sha256, revision, updated_at
)
SELECT ?, ?, ?, ?, ?, ?, 1, ?
WHERE (SELECT request_sha256 FROM alice_state_idempotency WHERE owner_id = ? AND idempotency_key = ?) = ?
ON CONFLICT(owner_id, kind, record_id) DO UPDATE SET
  owner_id = excluded.owner_id,
  session_id = excluded.session_id,
  payload_json = excluded.payload_json,
  payload_sha256 = excluded.payload_sha256,
  revision = CASE
    WHEN alice_state_records.owner_id = excluded.owner_id
      AND COALESCE(alice_state_records.session_id, '') = COALESCE(excluded.session_id, '')
      AND alice_state_records.payload_sha256 = excluded.payload_sha256
    THEN alice_state_records.revision
    ELSE alice_state_records.revision + 1
  END,
  updated_at = CASE
    WHEN alice_state_records.owner_id = excluded.owner_id
      AND COALESCE(alice_state_records.session_id, '') = COALESCE(excluded.session_id, '')
      AND alice_state_records.payload_sha256 = excluded.payload_sha256
    THEN alice_state_records.updated_at
    ELSE excluded.updated_at
  END`;

export class D1AliceStateAdapter {
  constructor(readonly db: D1Binding) {}

  async initialize(): Promise<void> {
    await installAliceStateSchema(this.db);
  }

  async isReady(): Promise<boolean> {
    const row = await this.db.prepare("SELECT 1 AS ready FROM alice_state_records LIMIT 1").first<{ ready: number }>();
    return row === null || row.ready === 1;
  }

  async close(): Promise<void> {}

  async getConnection(): Promise<D1Binding> {
    return this.db;
  }

  async transaction<T>(_callback: (adapter: D1AliceStateAdapter) => Promise<T>): Promise<T> {
    throw new Error("D1_CALLBACK_TRANSACTION_UNSUPPORTED");
  }

  async executeRawSql(_sql: string): Promise<never> {
    throw new Error("D1_RAW_SQL_UNSUPPORTED");
  }

  async putRecord(input: PortableRecordInput): Promise<PortableRecord> {
    const [record] = await this.applyAtomic({
      operationId: input.idempotencyKey ?? `put-${input.kind}-${input.recordId}-${input.updatedAt}`,
      records: [input],
    });
    if (!record) throw new Error("STATE_WRITE_INVALID");
    return record;
  }

  async applyAtomic(input: {
    operationId: string;
    records: Array<Omit<PortableRecordInput, "idempotencyKey">>;
  }): Promise<PortableRecord[]> {
    if (!validIdentifier(input.operationId) || input.records.length === 0 || input.records.length > 100) {
      throw new Error("STATE_ATOMIC_OPERATION_INVALID");
    }
    const operationOwnerId = input.records[0]?.ownerId;
    if (!validIdentifier(operationOwnerId) || input.records.some((record) => record.ownerId !== operationOwnerId)) {
      throw new Error("STATE_ATOMIC_OWNER_MISMATCH");
    }
    const targets = new Set<string>();
    for (const record of input.records) {
      const target = `${record.ownerId}\0${record.kind}\0${record.recordId}`;
      if (targets.has(target)) throw new Error("STATE_ATOMIC_TARGET_DUPLICATE");
      targets.add(target);
    }
    const statements: D1Statement[] = [];
    const prepared: Array<{ record: Omit<PortableRecordInput, "idempotencyKey">; idempotencyKey: string; requestHash: string; payloadJson: string; payloadHash: string }> = [];
    for (const [index, record] of input.records.entries()) {
      validateRecord(record);
      const payloadJson = canonicalJson(record.payload);
      const payloadHash = await sha256Text(payloadJson);
      const idempotencyKey = input.records.length === 1 ? input.operationId : `${input.operationId}:${index}`;
      const requestHash = await sha256Text(canonicalJson({
        kind: record.kind,
        recordId: record.recordId,
        ownerId: record.ownerId,
        sessionId: record.sessionId ?? null,
        payloadSha256: payloadHash,
        updatedAt: record.updatedAt,
      }));
      const existing = await this.db
        .prepare("SELECT request_sha256 FROM alice_state_idempotency WHERE owner_id = ? AND idempotency_key = ?")
        .bind(operationOwnerId, idempotencyKey)
        .first<{ request_sha256: string }>();
      if (existing && existing.request_sha256 !== requestHash) {
        throw new Error("STATE_IDEMPOTENCY_COLLISION");
      }
      statements.push(
        this.db.prepare(INSERT_IDEMPOTENCY).bind(operationOwnerId, idempotencyKey, requestHash, record.updatedAt),
        this.db.prepare(UPSERT_RECORD).bind(
          record.kind,
          record.recordId,
          record.ownerId,
          record.sessionId ?? null,
          payloadJson,
          payloadHash,
          record.updatedAt,
          operationOwnerId,
          idempotencyKey,
          requestHash,
        ),
      );
      prepared.push({ record, idempotencyKey, requestHash, payloadJson, payloadHash });
    }
    try {
      await this.db.batch(statements);
    } catch (error) {
      for (const item of prepared) {
        const ledger = await this.db
          .prepare("SELECT request_sha256 FROM alice_state_idempotency WHERE owner_id = ? AND idempotency_key = ?")
          .bind(operationOwnerId, item.idempotencyKey)
          .first<{ request_sha256: string }>();
        if (ledger && ledger.request_sha256 !== item.requestHash) {
          throw new Error("STATE_IDEMPOTENCY_COLLISION");
        }
      }
      throw new Error("STATE_ATOMIC_COMMIT_FAILED", { cause: error });
    }
    const output: PortableRecord[] = [];
    for (const item of prepared) {
      const ledger = await this.db
        .prepare("SELECT request_sha256 FROM alice_state_idempotency WHERE owner_id = ? AND idempotency_key = ?")
        .bind(operationOwnerId, item.idempotencyKey)
        .first<{ request_sha256: string }>();
      if (!ledger || ledger.request_sha256 !== item.requestHash) throw new Error("STATE_ATOMIC_COMMIT_INVALID");
      const stored = await this.getRecord(item.record.kind, item.record.recordId, item.record.ownerId);
      if (!stored) throw new Error("STATE_ATOMIC_COMMIT_INVALID");
      output.push(stored);
    }
    return output;
  }

  async getRecord(kind: AliceStateKind, recordId: string, ownerId: string): Promise<PortableRecord | null> {
    if (!STATE_KIND.has(kind)) throw new Error("STATE_KIND_UNSUPPORTED");
    if (!validIdentifier(recordId)) throw new Error("STATE_IDENTITY_INVALID");
    if (!validIdentifier(ownerId)) throw new Error("STATE_OWNER_REQUIRED");
    const row = await this.db
      .prepare(`SELECT kind, record_id, owner_id, session_id, payload_json, payload_sha256, revision, updated_at
        FROM alice_state_records WHERE kind = ? AND record_id = ? AND owner_id = ?`)
      .bind(kind, recordId, ownerId)
      .first<StoredRecordRow>();
    return row ? await toRecord(row) : null;
  }

  async listRecords(input: { ownerId: string; sessionId?: string | null; kind?: AliceStateKind; limit: number }): Promise<PortableRecord[]> {
    if (!validIdentifier(input.ownerId) || (input.sessionId != null && !validIdentifier(input.sessionId))) {
      throw new Error("STATE_IDENTITY_INVALID");
    }
    if (input.kind !== undefined && !STATE_KIND.has(input.kind)) throw new Error("STATE_KIND_UNSUPPORTED");
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 500) throw new Error("STATE_LIMIT_INVALID");
    const clauses = ["owner_id = ?"];
    const params: unknown[] = [input.ownerId];
    if (input.sessionId !== undefined) {
      clauses.push(input.sessionId === null ? "session_id IS NULL" : "session_id = ?");
      if (input.sessionId !== null) params.push(input.sessionId);
    }
    if (input.kind !== undefined) {
      clauses.push("kind = ?");
      params.push(input.kind);
    }
    params.push(input.limit);
    const rows = await this.db.prepare(`SELECT kind, record_id, owner_id, session_id, payload_json, payload_sha256, revision, updated_at
      FROM alice_state_records WHERE ${clauses.join(" AND ")}
      ORDER BY updated_at ASC, kind ASC, record_id ASC LIMIT ?`).bind(...params).all<StoredRecordRow>();
    if (!rows.success) throw new Error("STATE_READ_FAILED");
    return Promise.all(rows.results.map(toRecord));
  }

  async putVectorReference(input: {
    vectorId: string;
    recordKind: AliceStateKind;
    recordId: string;
    ownerId: string;
    namespace: string;
    indexName: string;
    model: string;
    dimensions: number;
  }, updatedAt: number) {
    if (!STATE_KIND.has(input.recordKind) || !validIdentifier(input.recordId) ||
      !validIdentifier(input.vectorId) || !validIdentifier(input.ownerId) ||
      !validIdentifier(input.indexName) || !validIdentifier(input.model) ||
      input.namespace !== `owner:${input.ownerId}` ||
      !Number.isSafeInteger(input.dimensions) || input.dimensions < 1 ||
      !Number.isSafeInteger(updatedAt) || updatedAt <= 0) {
      throw new Error("VECTOR_REFERENCE_INVALID");
    }
    const canonical = await this.getRecord(input.recordKind, input.recordId, input.ownerId);
    if (!canonical || canonical.ownerId !== input.ownerId) throw new Error("VECTOR_CANONICAL_RECORD_MISSING");
    await this.db.prepare(`INSERT INTO alice_vector_references(
      owner_id, record_kind, record_id, vector_id, index_name, model, dimensions, namespace, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, record_kind, record_id) DO UPDATE SET
      vector_id = excluded.vector_id,
      index_name = excluded.index_name,
      model = excluded.model,
      dimensions = excluded.dimensions,
      namespace = excluded.namespace,
      updated_at = excluded.updated_at`).bind(
        input.ownerId, input.recordKind, input.recordId, input.vectorId, input.indexName,
        input.model, input.dimensions, input.namespace, updatedAt,
      ).run();
    return { ...input };
  }

  async getVectorReference(recordKind: AliceStateKind, recordId: string, ownerId: string) {
    if (!STATE_KIND.has(recordKind) || !validIdentifier(recordId) || !validIdentifier(ownerId)) throw new Error("VECTOR_REFERENCE_INVALID");
    const row = await this.db.prepare(`SELECT record_kind, record_id, vector_id, index_name, model, dimensions, namespace
      FROM alice_vector_references WHERE record_kind = ? AND record_id = ? AND owner_id = ?`).bind(recordKind, recordId, ownerId).first<{
        record_kind: AliceStateKind; record_id: string; vector_id: string; index_name: string;
        model: string; dimensions: number; namespace: string;
      }>();
    if (!row) return null;
    if (row.namespace !== `owner:${ownerId}`) throw new Error("VECTOR_REFERENCE_INVALID");
    return {
      vectorId: row.vector_id,
      recordKind: row.record_kind,
      recordId: row.record_id,
      ownerId,
      namespace: row.namespace,
      indexName: row.index_name,
      model: row.model,
      dimensions: row.dimensions,
    };
  }

  async requireCanonicalRecord(recordKind: AliceStateKind, recordId: string, ownerId: string): Promise<PortableRecord> {
    const record = await this.getRecord(recordKind, recordId, ownerId);
    if (!record) throw new Error("VECTOR_CANONICAL_RECORD_MISSING");
    return record;
  }

  async putObjectReference(input: {
    key: string;
    sha256: string;
    sizeBytes: number;
    mediaType: string;
  }, createdAt: number) {
    const match = input.sha256.match(/^sha256:([a-f0-9]{64})$/);
    if (!match || input.key !== `objects/sha256/${match[1]}` ||
      !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0 ||
      !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(input.mediaType) ||
      !Number.isSafeInteger(createdAt) || createdAt <= 0) {
      throw new Error("R2_OBJECT_REFERENCE_INVALID");
    }
    await this.db.prepare(`INSERT INTO alice_object_references(
      object_sha256, object_key, media_type, size_bytes, created_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(object_sha256) DO NOTHING`).bind(
      match[1], input.key, input.mediaType, input.sizeBytes, createdAt,
    ).run();
    const stored = await this.getObjectReference(input.sha256);
    if (!stored || canonicalJson(stored) !== canonicalJson(input)) throw new Error("R2_OBJECT_REFERENCE_COLLISION");
    return stored;
  }

  async getObjectReference(sha256: string) {
    const match = sha256.match(/^sha256:([a-f0-9]{64})$/);
    if (!match) throw new Error("R2_OBJECT_REFERENCE_INVALID");
    const row = await this.db.prepare(`SELECT object_sha256, object_key, media_type, size_bytes
      FROM alice_object_references WHERE object_sha256 = ?`).bind(match[1]).first<{
        object_sha256: string; object_key: string; media_type: string; size_bytes: number;
      }>();
    return row ? { key: row.object_key, sha256: `sha256:${row.object_sha256}`, sizeBytes: row.size_bytes, mediaType: row.media_type } : null;
  }
}

export class AliceVectorStore {
  constructor(
    private readonly index: VectorizeBinding,
    private readonly contract: { indexName: string; model: string; dimensions: number },
    private readonly canonical?: D1AliceStateAdapter,
  ) {
    if (!validIdentifier(contract.indexName) || !validIdentifier(contract.model) || !Number.isSafeInteger(contract.dimensions) || contract.dimensions < 1) {
      throw new Error("VECTOR_CONTRACT_INVALID");
    }
    if (contract.dimensions > 1_536) throw new Error("VECTOR_DIMENSION_UNSUPPORTED");
  }

  private validate(model: string, dimensions: number, values: number[]): void {
    if (model !== this.contract.model) throw new Error("VECTOR_MODEL_DRIFT");
    if (dimensions !== this.contract.dimensions || values.length !== dimensions) throw new Error("VECTOR_DIMENSION_DRIFT");
    if (values.some((value) => !Number.isFinite(value))) throw new Error("VECTOR_VALUES_INVALID");
  }

  async upsert(input: {
    recordKind: AliceStateKind;
    recordId: string;
    ownerId: string;
    model: string;
    dimensions: number;
    values: number[];
  }) {
    if (!STATE_KIND.has(input.recordKind) || !validIdentifier(input.recordId) || !validIdentifier(input.ownerId)) {
      throw new Error("VECTOR_IDENTITY_INVALID");
    }
    this.validate(input.model, input.dimensions, input.values);
    if (this.canonical) await this.canonical.requireCanonicalRecord(input.recordKind, input.recordId, input.ownerId);
    const namespace = `owner:${input.ownerId}`;
    const vectorId = `vector-${await sha256Text(canonicalJson({
      ownerId: input.ownerId,
      recordKind: input.recordKind,
      recordId: input.recordId,
      indexName: this.contract.indexName,
      model: this.contract.model,
    }))}`;
    await this.index.upsert([{ id: vectorId, values: input.values, namespace, metadata: {
      recordKind: input.recordKind,
      recordId: input.recordId,
      ownerId: input.ownerId,
      model: input.model,
      dimensions: input.dimensions,
      indexName: this.contract.indexName,
    } }]);
    const reference = { vectorId, recordKind: input.recordKind, recordId: input.recordId, ownerId: input.ownerId, namespace, indexName: this.contract.indexName, model: input.model, dimensions: input.dimensions };
    if (this.canonical) {
      await this.canonical.putVectorReference(reference, Date.now());
      const reconciled = await this.canonical.getVectorReference(input.recordKind, input.recordId, input.ownerId);
      if (canonicalJson(reconciled) !== canonicalJson(reference)) throw new Error("VECTOR_REFERENCE_RECONCILIATION_INVALID");
    }
    return reference;
  }

  async query(input: { ownerId: string; model: string; dimensions: number; values: number[]; topK: number }) {
    if (!validIdentifier(input.ownerId) || !Number.isSafeInteger(input.topK) || input.topK < 1 || input.topK > 50) {
      throw new Error("VECTOR_QUERY_INVALID");
    }
    this.validate(input.model, input.dimensions, input.values);
    const response = await this.index.query(input.values, { namespace: `owner:${input.ownerId}`, topK: input.topK, returnMetadata: "all" });
    return Promise.all(response.matches.map(async (match) => {
      const metadata = match.metadata;
      if (!metadata || metadata.ownerId !== input.ownerId || metadata.model !== this.contract.model ||
        metadata.dimensions !== this.contract.dimensions || metadata.indexName !== this.contract.indexName ||
        !STATE_KIND.has(String(metadata.recordKind)) || !validIdentifier(metadata.recordId)) {
        throw new Error("VECTOR_RESULT_IDENTITY_INVALID");
      }
      const expectedVectorId = `vector-${await sha256Text(canonicalJson({
        ownerId: input.ownerId,
        recordKind: metadata.recordKind,
        recordId: metadata.recordId,
        indexName: this.contract.indexName,
        model: this.contract.model,
      }))}`;
      if (match.id !== expectedVectorId) throw new Error("VECTOR_RESULT_IDENTITY_INVALID");
      return { vectorId: match.id, score: match.score, recordKind: metadata.recordKind as AliceStateKind, recordId: metadata.recordId as string };
    }));
  }
}

export class AliceObjectStore {
  constructor(
    private readonly bucket: R2Binding,
    private readonly canonical?: D1AliceStateAdapter,
  ) {}

  async put(bytes: Uint8Array, mediaType: string, createdAt = Date.now()) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 25_000_000 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mediaType)) {
      throw new Error("R2_OBJECT_INPUT_INVALID");
    }
    const digest = await sha256Bytes(bytes);
    const digestValue = `sha256:${digest.hex}`;
    const key = `objects/sha256/${digest.hex}`;
    const expectedMetadata = { sha256: digestValue, mediaType, sizeBytes: String(bytes.byteLength) };
    const verify = (object: R2Head | null) => {
      if (!object || object.key !== key || object.size !== bytes.byteLength || object.customMetadata?.sha256 !== digestValue || object.customMetadata?.mediaType !== mediaType || object.customMetadata?.sizeBytes !== String(bytes.byteLength)) {
        throw new Error("R2_CONTENT_ADDRESS_COLLISION");
      }
      return { key, sha256: digestValue, sizeBytes: bytes.byteLength, mediaType };
    };
    const existing = await this.bucket.head(key);
    const reference = existing ? verify(existing) : verify(
      await this.bucket.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        customMetadata: expectedMetadata,
        httpMetadata: { contentType: mediaType },
        sha256: digest.buffer,
      }) ?? await this.bucket.head(key),
    );
    if (this.canonical) await this.canonical.putObjectReference(reference, createdAt);
    return reference;
  }
}

type CoordinationCursor = { cursor: string; observedAt: number; revision: number };
type CoordinationState = {
  schemaVersion: "alice.coordination.v1";
  ownerId: string;
  sessionId: string;
  connectionEpoch: number;
  activeConnectionId: string | null;
  connectedAt: number | null;
  cursors: Record<string, CoordinationCursor>;
};

export type CoordinationStorage = {
  get(key: string): unknown | Promise<unknown>;
  set(key: string, value: unknown): unknown | Promise<unknown>;
};

function validCoordinationState(value: unknown, ownerId: string, sessionId: string): value is CoordinationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as CoordinationState;
  return state.schemaVersion === "alice.coordination.v1" && state.ownerId === ownerId && state.sessionId === sessionId &&
    Number.isSafeInteger(state.connectionEpoch) && state.connectionEpoch >= 0 &&
    (state.activeConnectionId === null || validIdentifier(state.activeConnectionId)) &&
    (state.connectedAt === null || (Number.isSafeInteger(state.connectedAt) && state.connectedAt > 0)) &&
    !!state.cursors && typeof state.cursors === "object" && !Array.isArray(state.cursors) &&
    Object.entries(state.cursors).every(([connector, cursor]) => validIdentifier(connector) && validIdentifier(cursor.cursor) && Number.isSafeInteger(cursor.observedAt) && cursor.observedAt > 0 && Number.isSafeInteger(cursor.revision) && cursor.revision > 0);
}

export class AliceCoordinationLedger {
  private constructor(private readonly storage: CoordinationStorage, private state: CoordinationState) {}

  static async restore(storage: CoordinationStorage, ownerId: string, sessionId: string): Promise<AliceCoordinationLedger> {
    if (!validIdentifier(ownerId) || !validIdentifier(sessionId)) throw new Error("COORDINATION_IDENTITY_INVALID");
    const stored = await storage.get("state");
    const state: CoordinationState = stored === undefined
      ? { schemaVersion: "alice.coordination.v1", ownerId, sessionId, connectionEpoch: 0, activeConnectionId: null, connectedAt: null, cursors: {} }
      : structuredClone(stored) as CoordinationState;
    if (!validCoordinationState(state, ownerId, sessionId)) throw new Error("COORDINATION_STATE_INVALID");
    if (stored === undefined) await storage.set("state", structuredClone(state));
    return new AliceCoordinationLedger(storage, state);
  }

  snapshot(): CoordinationState {
    return structuredClone(this.state);
  }

  async connect(connectionId: string, connectedAt: number): Promise<CoordinationState> {
    if (!validIdentifier(connectionId) || !Number.isSafeInteger(connectedAt) || connectedAt <= 0) throw new Error("COORDINATION_CONNECTION_INVALID");
    const candidate = this.snapshot();
    candidate.connectionEpoch += 1;
    candidate.activeConnectionId = connectionId;
    candidate.connectedAt = connectedAt;
    await this.storage.set("state", structuredClone(candidate));
    this.state = candidate;
    return this.snapshot();
  }

  async advanceCursor(connector: string, cursor: string, observedAt: number): Promise<CoordinationCursor> {
    if (!validIdentifier(connector) || !validIdentifier(cursor) || !Number.isSafeInteger(observedAt) || observedAt <= 0) throw new Error("COORDINATION_CURSOR_INVALID");
    const previous = this.state.cursors[connector];
    if (previous && observedAt < previous.observedAt) throw new Error("COORDINATION_CURSOR_STALE");
    if (previous && observedAt === previous.observedAt && cursor !== previous.cursor) throw new Error("COORDINATION_CURSOR_COLLISION");
    if (previous && cursor === previous.cursor) return structuredClone(previous);
    const next = { cursor, observedAt, revision: (previous?.revision ?? 0) + 1 };
    const candidate = this.snapshot();
    candidate.cursors[connector] = next;
    await this.storage.set("state", structuredClone(candidate));
    this.state = candidate;
    return structuredClone(next);
  }
}

export function coordinationDurableName(ownerId: string, sessionId: string): string {
  if (!validIdentifier(ownerId) || !validIdentifier(sessionId)) throw new Error("COORDINATION_NAME_INVALID");
  return `actor/${ownerId}/session/${sessionId}`;
}

export function parseCoordinationDurableName(name: string): { ownerId: string; sessionId: string } {
  const match = name.match(/^actor\/([^/]+)\/session\/([^/]+)$/);
  if (!match || !validIdentifier(match[1]) || !validIdentifier(match[2])) throw new Error("COORDINATION_NAME_INVALID");
  return { ownerId: match[1], sessionId: match[2] };
}

function fixedStringEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const width = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < width; index += 1) mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return mismatch === 0;
}

export function authorizeStatePlaneRequest(request: Request, expectedToken: string): boolean {
  if (typeof expectedToken !== "string" || expectedToken.length < 32) return false;
  if (request.headers.has("origin") || request.headers.has("authorization") || request.headers.has("cookie")) return false;
  const presented = request.headers.get("x-alice-state-token") ?? "";
  return fixedStringEqual(presented, expectedToken);
}

export type StateOperation =
  | { operation: "record.get"; kind: AliceStateKind; recordId: string; ownerId: string }
  | ({ operation: "record.put" } & PortableRecordInput)
  | { operation: "record.list"; ownerId: string; sessionId?: string | null; kind?: AliceStateKind; limit: number }
  | { operation: "records.atomic"; operationId: string; records: Array<Omit<PortableRecordInput, "idempotencyKey">> }
  | { operation: "vector.upsert"; recordKind: AliceStateKind; recordId: string; ownerId: string; model: string; dimensions: number; values: number[] }
  | { operation: "vector.query"; ownerId: string; model: string; dimensions: number; values: number[]; topK: number }
  | { operation: "object.put"; bytesBase64: string; mediaType: string; createdAt: number }
  | { operation: "coordination.initialize"; ownerId: string; sessionId: string }
  | { operation: "coordination.snapshot"; ownerId: string; sessionId: string }
  | { operation: "coordination.connect"; ownerId: string; sessionId: string; connectionId: string; connectedAt: number }
  | { operation: "coordination.cursor"; ownerId: string; sessionId: string; connector: string; cursor: string; observedAt: number };

function containsSecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => SECRET_FIELD.test(key) || containsSecretField(child),
  );
}

function validateVectorValues(model: unknown, dimensions: unknown, values: unknown): asserts values is number[] {
  if (!validIdentifier(model) || !Number.isSafeInteger(dimensions) || Number(dimensions) < 1 || Number(dimensions) > 1_536 ||
    !Array.isArray(values) || values.length !== dimensions || values.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error("STATE_OPERATION_INVALID");
  }
}

function validateCoordinationIdentity(ownerId: unknown, sessionId: unknown): void {
  if (!validIdentifier(ownerId) || !validIdentifier(sessionId)) throw new Error("STATE_OPERATION_INVALID");
}

export function validateStateOperation(value: unknown): StateOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("STATE_OPERATION_INVALID");
  const record = value as Record<string, unknown>;
  if (containsSecretField(record)) throw new Error("STATE_OPERATION_SECRET_FIELD");
  if (record.operation === "record.get") {
    if (!exactKeys(record, ["operation", "kind", "recordId", "ownerId"]) || !STATE_KIND.has(String(record.kind)) || !validIdentifier(record.recordId) || !validIdentifier(record.ownerId)) {
      throw new Error("STATE_OPERATION_INVALID");
    }
    return { operation: "record.get", kind: record.kind as AliceStateKind, recordId: record.recordId, ownerId: record.ownerId };
  }
  if (record.operation === "record.put") {
    const required = ["operation", "kind", "recordId", "ownerId", "payload", "updatedAt"];
    const allowed = new Set([...required, "sessionId", "idempotencyKey"]);
    if (!required.every((key) => key in record) || Object.keys(record).some((key) => !allowed.has(key))) {
      throw new Error("STATE_OPERATION_INVALID");
    }
    const input = {
      kind: record.kind as AliceStateKind,
      recordId: record.recordId as string,
      ownerId: record.ownerId as string,
      ...(record.sessionId !== undefined ? { sessionId: record.sessionId as string | null } : {}),
      payload: record.payload,
      updatedAt: record.updatedAt as number,
      ...(record.idempotencyKey !== undefined ? { idempotencyKey: record.idempotencyKey as string } : {}),
    };
    validateRecord(input);
    return { operation: "record.put", ...input };
  }
  if (record.operation === "record.list") {
    const required = ["operation", "ownerId", "limit"];
    const allowed = new Set([...required, "sessionId", "kind"]);
    if (!required.every((key) => key in record) || Object.keys(record).some((key) => !allowed.has(key)) ||
      !validIdentifier(record.ownerId) || (record.sessionId !== undefined && record.sessionId !== null && !validIdentifier(record.sessionId)) ||
      (record.kind !== undefined && !STATE_KIND.has(String(record.kind))) || !Number.isSafeInteger(record.limit) || Number(record.limit) < 1 || Number(record.limit) > 500) {
      throw new Error("STATE_OPERATION_INVALID");
    }
    return {
      operation: "record.list",
      ownerId: record.ownerId,
      ...(record.sessionId !== undefined ? { sessionId: record.sessionId as string | null } : {}),
      ...(record.kind !== undefined ? { kind: record.kind as AliceStateKind } : {}),
      limit: record.limit as number,
    };
  }
  if (record.operation === "records.atomic") {
    if (!exactKeys(record, ["operation", "operationId", "records"]) || !validIdentifier(record.operationId) ||
      !Array.isArray(record.records) || record.records.length < 1 || record.records.length > 100) {
      throw new Error("STATE_OPERATION_INVALID");
    }
    const records = record.records.map((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("STATE_OPERATION_INVALID");
      const value = candidate as Record<string, unknown>;
      const required = ["kind", "recordId", "ownerId", "payload", "updatedAt"];
      const allowed = new Set([...required, "sessionId"]);
      if (!required.every((key) => key in value) || Object.keys(value).some((key) => !allowed.has(key))) throw new Error("STATE_OPERATION_INVALID");
      const input = {
        kind: value.kind as AliceStateKind,
        recordId: value.recordId as string,
        ownerId: value.ownerId as string,
        ...(value.sessionId !== undefined ? { sessionId: value.sessionId as string | null } : {}),
        payload: value.payload,
        updatedAt: value.updatedAt as number,
      };
      validateRecord(input);
      return input;
    });
    return { operation: "records.atomic", operationId: record.operationId, records };
  }
  if (record.operation === "vector.upsert") {
    if (!exactKeys(record, ["operation", "recordKind", "recordId", "ownerId", "model", "dimensions", "values"]) ||
      !STATE_KIND.has(String(record.recordKind)) || !validIdentifier(record.recordId) || !validIdentifier(record.ownerId)) {
      throw new Error("STATE_OPERATION_INVALID");
    }
    validateVectorValues(record.model, record.dimensions, record.values);
    return {
      operation: "vector.upsert", recordKind: record.recordKind as AliceStateKind,
      recordId: record.recordId, ownerId: record.ownerId, model: record.model as string,
      dimensions: record.dimensions as number, values: record.values,
    };
  }
  if (record.operation === "vector.query") {
    if (!exactKeys(record, ["operation", "ownerId", "model", "dimensions", "values", "topK"]) ||
      !validIdentifier(record.ownerId) || !Number.isSafeInteger(record.topK) || Number(record.topK) < 1 || Number(record.topK) > 50) {
      throw new Error("STATE_OPERATION_INVALID");
    }
    validateVectorValues(record.model, record.dimensions, record.values);
    return {
      operation: "vector.query", ownerId: record.ownerId, model: record.model as string,
      dimensions: record.dimensions as number, values: record.values, topK: record.topK as number,
    };
  }
  if (record.operation === "object.put") {
    if (!exactKeys(record, ["operation", "bytesBase64", "mediaType", "createdAt"]) ||
      typeof record.bytesBase64 !== "string" || record.bytesBase64.length > 34_000_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.bytesBase64) ||
      !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(record.mediaType)) ||
      !Number.isSafeInteger(record.createdAt) || Number(record.createdAt) < 1) {
      throw new Error("STATE_OPERATION_INVALID");
    }
    return { operation: "object.put", bytesBase64: record.bytesBase64, mediaType: record.mediaType as string, createdAt: record.createdAt as number };
  }
  if (record.operation === "coordination.initialize" || record.operation === "coordination.snapshot") {
    if (!exactKeys(record, ["operation", "ownerId", "sessionId"])) throw new Error("STATE_OPERATION_INVALID");
    validateCoordinationIdentity(record.ownerId, record.sessionId);
    return { operation: record.operation, ownerId: record.ownerId as string, sessionId: record.sessionId as string };
  }
  if (record.operation === "coordination.connect") {
    if (!exactKeys(record, ["operation", "ownerId", "sessionId", "connectionId", "connectedAt"])) throw new Error("STATE_OPERATION_INVALID");
    validateCoordinationIdentity(record.ownerId, record.sessionId);
    if (!validIdentifier(record.connectionId) || !Number.isSafeInteger(record.connectedAt) || Number(record.connectedAt) < 1) throw new Error("STATE_OPERATION_INVALID");
    return {
      operation: "coordination.connect", ownerId: record.ownerId as string, sessionId: record.sessionId as string,
      connectionId: record.connectionId, connectedAt: record.connectedAt as number,
    };
  }
  if (record.operation === "coordination.cursor") {
    if (!exactKeys(record, ["operation", "ownerId", "sessionId", "connector", "cursor", "observedAt"])) throw new Error("STATE_OPERATION_INVALID");
    validateCoordinationIdentity(record.ownerId, record.sessionId);
    if (!validIdentifier(record.connector) || !validIdentifier(record.cursor) || !Number.isSafeInteger(record.observedAt) || Number(record.observedAt) < 1) throw new Error("STATE_OPERATION_INVALID");
    return {
      operation: "coordination.cursor", ownerId: record.ownerId as string, sessionId: record.sessionId as string,
      connector: record.connector, cursor: record.cursor, observedAt: record.observedAt as number,
    };
  }
  throw new Error("STATE_OPERATION_UNSUPPORTED");
}
