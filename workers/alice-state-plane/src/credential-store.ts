import {
  ALICE_CREDENTIAL_PROVIDER_ID,
  ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION,
  validateCredentialSnapshot,
  type AliceCredentialSnapshotV1,
} from "./credential-state";

type D1RunResult = {
  success: boolean;
  meta?: { changes?: number };
  results?: unknown[];
};

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{
    success: boolean;
    results: T[];
  }>;
  run(): Promise<D1RunResult>;
};

export type CredentialStateD1Binding = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1RunResult[]>;
  exec(sql: string): Promise<unknown>;
};

export const ALICE_CREDENTIAL_STATE_SCHEMA = `
CREATE TABLE IF NOT EXISTS alice_credential_state (
  provider_id TEXT PRIMARY KEY NOT NULL CHECK(provider_id = 'openai-codex'),
  schema_version TEXT NOT NULL CHECK(schema_version = 'alice.credential-snapshot.v1'),
  generation INTEGER NOT NULL CHECK(generation >= 0),
  snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256) = 71),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms)
);
CREATE TABLE IF NOT EXISTS alice_credential_events (
  provider_id TEXT NOT NULL CHECK(provider_id = 'openai-codex'),
  generation INTEGER NOT NULL CHECK(generation >= 0),
  operation TEXT NOT NULL CHECK(operation IN ('put','delete')),
  snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256) = 71),
  recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
  PRIMARY KEY (provider_id, generation, operation)
);
CREATE INDEX IF NOT EXISTS alice_credential_events_recorded_idx
  ON alice_credential_events(recorded_at_ms, provider_id, generation);
`;

export async function installAliceCredentialStateSchema(
  db: CredentialStateD1Binding,
): Promise<void> {
  await db.exec(ALICE_CREDENTIAL_STATE_SCHEMA);
}

export class CredentialGenerationConflictError extends Error {
  readonly code = "credential_generation_conflict" as const;
  readonly expectedGeneration: number | null;
  readonly actualGeneration: number | null;

  constructor(
    expectedGeneration: number | null,
    actualGeneration: number | null,
  ) {
    super(
      "Credential state generation does not match the compare-and-swap precondition",
    );
    this.name = "CredentialGenerationConflictError";
    this.expectedGeneration = expectedGeneration;
    this.actualGeneration = actualGeneration;
  }
}

export class CredentialStateRowError extends Error {
  readonly code = "credential_state_row_invalid" as const;

  constructor() {
    super("Stored credential state failed integrity validation");
    this.name = "CredentialStateRowError";
  }
}

export interface CredentialStateStore {
  getCredentialState(): Promise<AliceCredentialSnapshotV1 | null>;
  putCredentialState(input: {
    expectedGeneration: number | null;
    snapshot: unknown;
  }): Promise<AliceCredentialSnapshotV1>;
  deleteCredentialState(input: {
    expectedGeneration: number;
    recordedAtMs: number;
  }): Promise<boolean>;
}

type CredentialStateRow = {
  provider_id: string;
  schema_version: string;
  generation: number;
  snapshot_sha256: string;
  snapshot_json: string;
  created_at_ms: number;
  updated_at_ms: number;
};

function safeGeneration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function changed(result: D1RunResult | undefined): number {
  return result?.success === false ? 0 : (result?.meta?.changes ?? 0);
}

function exactRowKeys(row: Record<string, unknown>): boolean {
  const expected = [
    "created_at_ms",
    "generation",
    "provider_id",
    "schema_version",
    "snapshot_json",
    "snapshot_sha256",
    "updated_at_ms",
  ];
  return Object.keys(row).sort().join(",") === expected.join(",");
}

async function decodeStoredRow(
  row: CredentialStateRow,
): Promise<AliceCredentialSnapshotV1> {
  if (
    !exactRowKeys(row as unknown as Record<string, unknown>) ||
    row.provider_id !== ALICE_CREDENTIAL_PROVIDER_ID ||
    row.schema_version !== ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION ||
    !safeGeneration(row.generation) ||
    typeof row.snapshot_sha256 !== "string" ||
    typeof row.snapshot_json !== "string" ||
    !safeGeneration(row.created_at_ms) ||
    !safeGeneration(row.updated_at_ms) ||
    row.updated_at_ms < row.created_at_ms
  ) {
    throw new CredentialStateRowError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.snapshot_json);
  } catch {
    throw new CredentialStateRowError();
  }

  let snapshot: AliceCredentialSnapshotV1;
  try {
    snapshot = await validateCredentialSnapshot(parsed);
  } catch {
    throw new CredentialStateRowError();
  }
  if (
    snapshot.generation !== row.generation ||
    snapshot.snapshotSha256 !== row.snapshot_sha256 ||
    snapshot.createdAtMs !== row.created_at_ms ||
    snapshot.updatedAtMs !== row.updated_at_ms
  ) {
    throw new CredentialStateRowError();
  }
  return snapshot;
}

const SELECT_CREDENTIAL_STATE = `SELECT
  provider_id, schema_version, generation, snapshot_sha256, snapshot_json,
  created_at_ms, updated_at_ms
FROM alice_credential_state
WHERE provider_id = ?`;

const INSERT_CREDENTIAL_STATE = `INSERT INTO alice_credential_state(
  provider_id, schema_version, generation, snapshot_sha256, snapshot_json,
  created_at_ms, updated_at_ms
)
SELECT ?, ?, ?, ?, ?, ?, ?
WHERE NOT EXISTS (
  SELECT 1 FROM alice_credential_state WHERE provider_id = ?
)`;

const UPDATE_CREDENTIAL_STATE = `UPDATE alice_credential_state SET
  schema_version = ?,
  generation = ?,
  snapshot_sha256 = ?,
  snapshot_json = ?,
  updated_at_ms = ?
WHERE provider_id = ? AND generation = ? AND created_at_ms = ?`;

const INSERT_PUT_EVENT = `INSERT OR IGNORE INTO alice_credential_events(
  provider_id, generation, operation, snapshot_sha256, recorded_at_ms
)
SELECT provider_id, generation, 'put', snapshot_sha256, updated_at_ms
FROM alice_credential_state
WHERE provider_id = ? AND generation = ? AND snapshot_sha256 = ?`;

const INSERT_DELETE_EVENT = `INSERT OR IGNORE INTO alice_credential_events(
  provider_id, generation, operation, snapshot_sha256, recorded_at_ms
)
SELECT provider_id, generation, 'delete', snapshot_sha256, ?
FROM alice_credential_state
WHERE provider_id = ? AND generation = ?`;

const DELETE_CREDENTIAL_STATE = `DELETE FROM alice_credential_state
WHERE provider_id = ? AND generation = ?`;

export class D1CredentialStateStore implements CredentialStateStore {
  private readonly db: CredentialStateD1Binding;

  constructor(db: CredentialStateD1Binding) {
    this.db = db;
  }

  async initialize(): Promise<void> {
    await installAliceCredentialStateSchema(this.db);
  }

  async getCredentialState(): Promise<AliceCredentialSnapshotV1 | null> {
    const row = await this.db
      .prepare(SELECT_CREDENTIAL_STATE)
      .bind(ALICE_CREDENTIAL_PROVIDER_ID)
      .first<CredentialStateRow>();
    return row ? decodeStoredRow(row) : null;
  }

  async putCredentialState(input: {
    expectedGeneration: number | null;
    snapshot: unknown;
  }): Promise<AliceCredentialSnapshotV1> {
    if (
      input.expectedGeneration !== null &&
      !safeGeneration(input.expectedGeneration)
    ) {
      throw new CredentialGenerationConflictError(null, null);
    }

    const snapshot = await validateCredentialSnapshot(input.snapshot);
    if (
      (input.expectedGeneration === null && snapshot.generation !== 0) ||
      (input.expectedGeneration !== null &&
        snapshot.generation !== input.expectedGeneration + 1)
    ) {
      const current = await this.getCredentialState();
      throw new CredentialGenerationConflictError(
        input.expectedGeneration,
        current?.generation ?? null,
      );
    }

    const snapshotJson = JSON.stringify(snapshot);
    const write =
      input.expectedGeneration === null
        ? this.db.prepare(INSERT_CREDENTIAL_STATE).bind(
            snapshot.providerId,
            snapshot.schemaVersion,
            snapshot.generation,
            snapshot.snapshotSha256,
            snapshotJson,
            snapshot.createdAtMs,
            snapshot.updatedAtMs,
            snapshot.providerId,
          )
        : this.db.prepare(UPDATE_CREDENTIAL_STATE).bind(
            snapshot.schemaVersion,
            snapshot.generation,
            snapshot.snapshotSha256,
            snapshotJson,
            snapshot.updatedAtMs,
            snapshot.providerId,
            input.expectedGeneration,
            snapshot.createdAtMs,
          );
    const event = this.db.prepare(INSERT_PUT_EVENT).bind(
      snapshot.providerId,
      snapshot.generation,
      snapshot.snapshotSha256,
    );
    await this.db.batch([write, event]);
    const current = await this.getCredentialState();

    if (
      current &&
      current.generation === snapshot.generation &&
      current.snapshotSha256 === snapshot.snapshotSha256 &&
      current.createdAtMs === snapshot.createdAtMs
    ) {
      return current;
    }

    throw new CredentialGenerationConflictError(
      input.expectedGeneration,
      current?.generation ?? null,
    );
  }

  async deleteCredentialState(input: {
    expectedGeneration: number;
    recordedAtMs: number;
  }): Promise<boolean> {
    if (
      !safeGeneration(input.expectedGeneration) ||
      !safeGeneration(input.recordedAtMs)
    ) {
      throw new CredentialGenerationConflictError(null, null);
    }

    const event = this.db.prepare(INSERT_DELETE_EVENT).bind(
      input.recordedAtMs,
      ALICE_CREDENTIAL_PROVIDER_ID,
      input.expectedGeneration,
    );
    const deletion = this.db.prepare(DELETE_CREDENTIAL_STATE).bind(
      ALICE_CREDENTIAL_PROVIDER_ID,
      input.expectedGeneration,
    );
    const results = await this.db.batch([event, deletion]);
    if (changed(results[1]) === 1) return true;

    const current = await this.getCredentialState();
    if (!current) return false;
    throw new CredentialGenerationConflictError(
      input.expectedGeneration,
      current.generation,
    );
  }
}
