export type ElizaDatabaseRecord = {
  collection: string;
  key: string;
  value: unknown;
};

export type ElizaLoadOperation = {
  operation: "eliza.load";
  ownerId: string;
  cursor: string | null;
  limit: number;
};

export type ElizaCommitOperation = {
  operation: "eliza.commit";
  ownerId: string;
  operationId: string;
  expectedRevision: number;
  mutations: ElizaMutation[];
};

export type ElizaMutation =
  | { collection: string; key: string; deleted: false; value: unknown }
  | { collection: string; key: string; deleted: true };

export type ElizaDatabaseOperation = ElizaLoadOperation | ElizaCommitOperation;

export type ElizaDatabaseAdapter = {
  load(input: Omit<ElizaLoadOperation, "operation">): Promise<{
    revision: number;
    records: ElizaDatabaseRecord[];
    nextCursor: string | null;
  }>;
  commit(input: Omit<ElizaCommitOperation, "operation">): Promise<{ revision: number }>;
};

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const SECRET_FIELDS = new Set([
  "token",
  "secret",
  "secrets",
  "password",
  "authorization",
  "cookie",
  "privatekey",
  "apikey",
  "apitoken",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
]);
const encoder = new TextEncoder();

type D1Result = {
  success: boolean;
  meta?: { changes?: number };
  results?: unknown[];
};

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ success: boolean; results: T[] }>;
  run(): Promise<D1Result>;
};

export type ElizaD1Binding = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
  exec(sql: string): Promise<unknown>;
};

export const ALICE_ELIZA_DATABASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS alice_eliza_heads (
  owner_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 0)
);
CREATE TABLE IF NOT EXISTS alice_eliza_records (
  owner_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  value_sha256 TEXT NOT NULL CHECK(length(value_sha256) = 64),
  revision INTEGER NOT NULL CHECK(revision > 0),
  PRIMARY KEY (owner_id, collection, record_key),
  FOREIGN KEY (owner_id) REFERENCES alice_eliza_heads(owner_id)
);
CREATE INDEX IF NOT EXISTS alice_eliza_records_load_idx
  ON alice_eliza_records(owner_id, collection, record_key);
CREATE TABLE IF NOT EXISTS alice_eliza_operations (
  owner_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
  expected_revision INTEGER NOT NULL CHECK(expected_revision >= 0),
  revision INTEGER NOT NULL CHECK(revision = expected_revision + 1),
  observed_revision INTEGER NOT NULL CHECK(observed_revision = revision),
  PRIMARY KEY (owner_id, operation_id),
  UNIQUE (owner_id, revision),
  FOREIGN KEY (owner_id) REFERENCES alice_eliza_heads(owner_id)
);
`;

export async function installElizaDatabaseSchema(db: ElizaD1Binding): Promise<void> {
  await db.exec(ALICE_ELIZA_DATABASE_SCHEMA);
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function isSecretField(key: string): boolean {
  return SECRET_FIELDS.has(key.replace(/[-_]/g, "").toLowerCase());
}

function containsSecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => isSecretField(key) || containsSecretField(child),
  );
}

function normalizeJson(value: unknown): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.includes("\0")) throw new Error("ELIZA_VALUE_INVALID");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("ELIZA_VALUE_INVALID");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key.length === 0 || /[\0\r\n]/.test(key) || isSecretField(key)) {
        throw new Error("ELIZA_SECRET_FIELD");
      }
      const child = (value as Record<string, unknown>)[key];
      if (
        child === undefined ||
        typeof child === "function" ||
        typeof child === "symbol" ||
        typeof child === "bigint"
      ) {
        throw new Error("ELIZA_VALUE_INVALID");
      }
      output[key] = normalizeJson(child);
    }
    return output;
  }
  throw new Error("ELIZA_VALUE_INVALID");
}

function canonicalJson(value: unknown, maxBytes = 1_000_000): string {
  if (containsSecretField(value)) throw new Error("ELIZA_SECRET_FIELD");
  const serialized = JSON.stringify(normalizeJson(value));
  if (encoder.encode(serialized).byteLength > maxBytes) {
    throw new Error("ELIZA_VALUE_TOO_LARGE");
  }
  return serialized;
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function validPathPart(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maxLength &&
    !/[\0\r\n]/.test(value)
  );
}

function validateMutations(value: unknown): ElizaMutation[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error("ELIZA_OPERATION_INVALID");
  }
  const targets = new Set<string>();
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("ELIZA_OPERATION_INVALID");
    }
    const mutation = candidate as Record<string, unknown>;
    const expected = mutation.deleted === true
      ? ["collection", "deleted", "key"]
      : ["collection", "deleted", "key", "value"];
    if (
      !exactKeys(mutation, expected) ||
      !validPathPart(mutation.collection, 256) ||
      !validPathPart(mutation.key, 512) ||
      (mutation.deleted !== true && mutation.deleted !== false)
    ) {
      throw new Error("ELIZA_OPERATION_INVALID");
    }
    const target = `${mutation.collection}\0${mutation.key}`;
    if (targets.has(target)) throw new Error("ELIZA_MUTATION_DUPLICATE");
    targets.add(target);
    if (mutation.deleted === true) {
      return {
        collection: mutation.collection,
        key: mutation.key,
        deleted: true,
      };
    }
    canonicalJson(mutation.value);
    return {
      collection: mutation.collection,
      key: mutation.key,
      deleted: false,
      value: mutation.value,
    };
  });
}

export function validateElizaDatabaseOperation(value: unknown): ElizaDatabaseOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ELIZA_OPERATION_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (
    record.operation === "eliza.load" &&
    exactKeys(record, ["operation", "ownerId", "cursor", "limit"]) &&
    typeof record.ownerId === "string" &&
    IDENTIFIER.test(record.ownerId) &&
    (
      record.cursor === null ||
      (
        typeof record.cursor === "string" &&
        record.cursor.length >= 1 &&
        record.cursor.length <= 4096 &&
        /^[A-Za-z0-9_-]+$/.test(record.cursor)
      )
    ) &&
    Number.isSafeInteger(record.limit) &&
    Number(record.limit) >= 1 &&
    Number(record.limit) <= 500
  ) {
    return record as ElizaLoadOperation;
  }
  if (
    record.operation === "eliza.commit" &&
    exactKeys(record, [
      "operation",
      "ownerId",
      "operationId",
      "expectedRevision",
      "mutations",
    ]) &&
    typeof record.ownerId === "string" &&
    IDENTIFIER.test(record.ownerId) &&
    typeof record.operationId === "string" &&
    IDENTIFIER.test(record.operationId) &&
    Number.isSafeInteger(record.expectedRevision) &&
    Number(record.expectedRevision) >= 0 &&
    Number(record.expectedRevision) < Number.MAX_SAFE_INTEGER
  ) {
    return {
      operation: "eliza.commit",
      ownerId: record.ownerId,
      operationId: record.operationId,
      expectedRevision: record.expectedRevision as number,
      mutations: validateMutations(record.mutations),
    };
  }
  throw new Error("ELIZA_OPERATION_INVALID");
}

type StoredElizaRow = {
  collection: string;
  record_key: string;
  value_json: string;
  value_sha256: string;
  revision: number;
};

type StoredElizaReceipt = {
  request_sha256: string;
  revision: number;
};

function validateStoredReceipt(value: StoredElizaReceipt): void {
  if (
    !exactKeys(value as unknown as Record<string, unknown>, ["request_sha256", "revision"]) ||
    !/^[a-f0-9]{64}$/.test(value.request_sha256) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) {
    throw new Error("ELIZA_ROW_INVALID");
  }
}

type ElizaCursor = {
  schemaVersion: "alice.eliza-cursor.v1";
  ownerId: string;
  revision: number;
  collection: string;
  key: string;
};

function encodeCursor(cursor: ElizaCursor): string {
  const bytes = encoder.encode(canonicalJson(cursor, 4096));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeCursor(value: string, ownerId: string): ElizaCursor {
  if (value.length < 1 || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("ELIZA_CURSOR_INVALID");
  }
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    )) as Record<string, unknown>;
    if (
      !exactKeys(decoded, ["schemaVersion", "ownerId", "revision", "collection", "key"]) ||
      decoded.schemaVersion !== "alice.eliza-cursor.v1" ||
      decoded.ownerId !== ownerId ||
      !Number.isSafeInteger(decoded.revision) ||
      Number(decoded.revision) < 0 ||
      !validPathPart(decoded.collection, 256) ||
      !validPathPart(decoded.key, 512) ||
      encodeCursor(decoded as ElizaCursor) !== value
    ) {
      throw new Error("ELIZA_CURSOR_INVALID");
    }
    return decoded as ElizaCursor;
  } catch (error) {
    if (error instanceof Error && error.message === "ELIZA_CURSOR_INVALID") throw error;
    throw new Error("ELIZA_CURSOR_INVALID");
  }
}

export class D1ElizaDatabaseAdapter implements ElizaDatabaseAdapter {
  constructor(readonly db: ElizaD1Binding) {}

  async load(input: Omit<ElizaLoadOperation, "operation">) {
    const operation = validateElizaDatabaseOperation({ operation: "eliza.load", ...input });
    if (operation.operation !== "eliza.load") throw new Error("ELIZA_OPERATION_INVALID");
    const cursor = operation.cursor === null ? null : decodeCursor(operation.cursor, operation.ownerId);
    const results = await this.db.batch([
      this.db.prepare("SELECT revision FROM alice_eliza_heads WHERE owner_id = ?")
        .bind(operation.ownerId),
      this.db.prepare(`
        SELECT collection, record_key, value_json, value_sha256, revision
        FROM alice_eliza_records
        WHERE owner_id = ? AND (
          ? IS NULL OR collection > ? OR (collection = ? AND record_key > ?)
        )
        ORDER BY collection, record_key
        LIMIT ?
      `).bind(
        operation.ownerId,
        cursor?.collection ?? null,
        cursor?.collection ?? "",
        cursor?.collection ?? "",
        cursor?.key ?? "",
        operation.limit + 1,
      ),
    ]);
    if (
      results.length !== 2 ||
      results.some((result) => result.success !== true || !Array.isArray(result.results))
    ) {
      throw new Error("ELIZA_LOAD_FAILED");
    }
    const headRows = (results[0]?.results ?? []) as Array<{ revision: number }>;
    const revision = headRows[0]?.revision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("ELIZA_ROW_INVALID");
    if (cursor && cursor.revision !== revision) throw new Error("ELIZA_REVISION_DRIFT");
    const rows = (results[1]?.results ?? []) as StoredElizaRow[];
    const output: ElizaDatabaseRecord[] = [];
    for (const row of rows.slice(0, operation.limit)) {
      if (
        !exactKeys(row as unknown as Record<string, unknown>, [
          "collection", "record_key", "value_json", "value_sha256", "revision",
        ]) ||
        !validPathPart(row.collection, 256) ||
        !validPathPart(row.record_key, 512) ||
        typeof row.value_json !== "string" ||
        !/^[a-f0-9]{64}$/.test(row.value_sha256) ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 1 ||
        row.revision > revision
      ) {
        throw new Error("ELIZA_ROW_INVALID");
      }
      let value: unknown;
      try {
        value = JSON.parse(row.value_json);
      } catch {
        throw new Error("ELIZA_ROW_INVALID");
      }
      let canonical: string;
      try {
        canonical = canonicalJson(value);
      } catch {
        throw new Error("ELIZA_ROW_INVALID");
      }
      if (canonical !== row.value_json || await sha256Text(row.value_json) !== row.value_sha256) {
        throw new Error("ELIZA_ROW_INVALID");
      }
      output.push({ collection: row.collection, key: row.record_key, value });
    }
    const last = output.at(-1);
    return {
      revision,
      records: output,
      nextCursor: rows.length > operation.limit && last
        ? encodeCursor({
            schemaVersion: "alice.eliza-cursor.v1",
            ownerId: operation.ownerId,
            revision,
            collection: last.collection,
            key: last.key,
          })
        : null,
    };
  }

  async commit(input: Omit<ElizaCommitOperation, "operation">) {
    const operation = validateElizaDatabaseOperation({ operation: "eliza.commit", ...input });
    if (operation.operation !== "eliza.commit") throw new Error("ELIZA_OPERATION_INVALID");
    const prepared = await Promise.all(operation.mutations.map(async (mutation) => {
      if (mutation.deleted) return { mutation, valueJson: null, valueHash: null };
      const valueJson = canonicalJson(mutation.value);
      return { mutation, valueJson, valueHash: await sha256Text(valueJson) };
    }));
    const requestHash = await sha256Text(canonicalJson({
      expectedRevision: operation.expectedRevision,
      mutations: prepared.map(({ mutation, valueJson }) => mutation.deleted
        ? mutation
        : { ...mutation, value: JSON.parse(valueJson!) }),
      operationId: operation.operationId,
      ownerId: operation.ownerId,
    }));
    const existing = await this.db.prepare(`
      SELECT request_sha256, revision FROM alice_eliza_operations
      WHERE owner_id = ? AND operation_id = ?
    `).bind(operation.ownerId, operation.operationId).first<StoredElizaReceipt>();
    if (existing) {
      validateStoredReceipt(existing);
      if (existing.request_sha256 !== requestHash) throw new Error("ELIZA_IDEMPOTENCY_COLLISION");
      return { revision: existing.revision };
    }
    await this.db.prepare(`
      INSERT INTO alice_eliza_heads(owner_id, revision) VALUES (?, 0)
      ON CONFLICT(owner_id) DO NOTHING
    `).bind(operation.ownerId).run();
    const head = await this.db.prepare(
      "SELECT revision FROM alice_eliza_heads WHERE owner_id = ?",
    ).bind(operation.ownerId).first<{ revision: number }>();
    if (!head || head.revision !== operation.expectedRevision) {
      throw new Error("ELIZA_REVISION_STALE");
    }
    const revision = operation.expectedRevision + 1;
    const statements: D1Statement[] = [
      this.db.prepare(`
        UPDATE alice_eliza_heads SET revision = ?
        WHERE owner_id = ? AND revision = ?
      `).bind(revision, operation.ownerId, operation.expectedRevision),
      this.db.prepare(`
        INSERT INTO alice_eliza_operations(
          owner_id, operation_id, request_sha256, expected_revision, revision, observed_revision
        )
        SELECT ?, ?, ?, ?, ?, revision FROM alice_eliza_heads WHERE owner_id = ?
      `).bind(
        operation.ownerId,
        operation.operationId,
        requestHash,
        operation.expectedRevision,
        revision,
        operation.ownerId,
      ),
    ];
    for (const item of prepared) {
      if (item.mutation.deleted) {
        statements.push(this.db.prepare(`
          DELETE FROM alice_eliza_records
          WHERE owner_id = ? AND collection = ? AND record_key = ?
        `).bind(operation.ownerId, item.mutation.collection, item.mutation.key));
      } else {
        statements.push(this.db.prepare(`
          INSERT INTO alice_eliza_records(
            owner_id, collection, record_key, value_json, value_sha256, revision
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(owner_id, collection, record_key) DO UPDATE SET
            value_json = excluded.value_json,
            value_sha256 = excluded.value_sha256,
            revision = excluded.revision
        `).bind(
          operation.ownerId,
          item.mutation.collection,
          item.mutation.key,
          item.valueJson,
          item.valueHash,
          revision,
        ));
      }
    }
    try {
      const committed = await this.db.batch(statements);
      if (
        committed.length !== statements.length ||
        committed.some((result) => result.success !== true)
      ) {
        throw new Error("ELIZA_D1_BATCH_FAILED");
      }
    } catch (error) {
      const receipt = await this.db.prepare(`
        SELECT request_sha256, revision FROM alice_eliza_operations
        WHERE owner_id = ? AND operation_id = ?
      `).bind(operation.ownerId, operation.operationId).first<StoredElizaReceipt>();
      if (receipt) {
        validateStoredReceipt(receipt);
        if (receipt.request_sha256 !== requestHash) throw new Error("ELIZA_IDEMPOTENCY_COLLISION");
        return { revision: receipt.revision };
      }
      const current = await this.db.prepare(
        "SELECT revision FROM alice_eliza_heads WHERE owner_id = ?",
      ).bind(operation.ownerId).first<{ revision: number }>();
      if (current?.revision !== operation.expectedRevision) throw new Error("ELIZA_REVISION_STALE");
      throw new Error("ELIZA_COMMIT_FAILED", { cause: error });
    }
    return { revision };
  }
}
