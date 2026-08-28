import { type IDatabaseAdapter, InMemoryDatabaseAdapter } from "@elizaos/core";

export type AliceElizaStateRecord = Readonly<{
  collection: string;
  key: string;
  value: unknown;
}>;

export type AliceElizaStateMutation =
  | Readonly<{
      collection: string;
      key: string;
      deleted: false;
      value: unknown;
    }>
  | Readonly<{
      collection: string;
      key: string;
      deleted: true;
    }>;

export type AliceElizaStateCommit = Readonly<{
  ownerId: string;
  operationId: string;
  expectedRevision: number;
  mutations: readonly AliceElizaStateMutation[];
}>;

export interface AliceElizaStateTransport {
  load(ownerId: string): Promise<{
    revision: number;
    records: AliceElizaStateRecord[];
  }>;
  commit(input: AliceElizaStateCommit): Promise<{ revision: number }>;
}

export type AliceFullRuntimeDatabaseEnv = Readonly<{
  ALICE_RUNTIME_AUTHORITY_MODE?: string;
  ALICE_RUNTIME_PROFILE?: string;
  ALICE_STATE_OWNER_ID?: string;
  ALICE_STATE_PLANE_URL?: string;
}>;

type CollectionSpec = Readonly<{
  name: string;
  shape: "map" | "array";
}>;

/**
 * These are the exact private stores owned by the pinned
 * InMemoryDatabaseAdapter. The list is deliberately exhaustive: a future
 * Eliza pin that adds or renames a store fails closed instead of silently
 * becoming ephemeral.
 */
export const ALICE_ELIZA_DURABLE_COLLECTIONS = [
  { name: "agents", shape: "map" },
  { name: "entities", shape: "map" },
  { name: "components", shape: "map" },
  { name: "componentIdsByEntity", shape: "map" },
  { name: "componentIdsByNaturalKey", shape: "map" },
  { name: "relationships", shape: "map" },
  { name: "rooms", shape: "map" },
  { name: "worlds", shape: "map" },
  { name: "tasks", shape: "map" },
  { name: "logs", shape: "array" },
  { name: "memoriesById", shape: "map" },
  { name: "memoriesByRoom", shape: "map" },
  { name: "cache", shape: "map" },
  { name: "participantsByRoom", shape: "map" },
  { name: "roomsByParticipant", shape: "map" },
  { name: "participantUserState", shape: "map" },
  { name: "pairingRequests", shape: "map" },
  { name: "pairingAllowlist", shape: "map" },
  { name: "connectorAccountsById", shape: "map" },
  { name: "connectorAccountIdsByKey", shape: "map" },
  { name: "connectorCredentialRefs", shape: "map" },
  { name: "connectorAuditEvents", shape: "array" },
  { name: "oauthFlowsByStateHash", shape: "map" },
] as const satisfies readonly CollectionSpec[];

const COLLECTION = /^[a-z][A-Za-z0-9]{2,63}$/;
const OWNER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const OPERATION = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const SECRET_FIELD =
  /(?:token|secret|password|authorization|cookie|privateKey|apiKey)/i;
const MAX_MUTATIONS = 100;
const MAX_RECORD_KEY_BYTES = 1_024;
const MAX_RECORD_VALUE_BYTES = 1_000_000;

type TaggedValue =
  | null
  | boolean
  | number
  | string
  | TaggedValue[]
  | { [key: string]: TaggedValue };

type AdapterInternals = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeAgentValue(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  const clone = { ...value };
  delete clone.secrets;
  if (isPlainObject(clone.settings)) {
    const settings = { ...clone.settings };
    delete settings.secrets;
    clone.settings = settings;
  }
  return clone;
}

function encodeValue(
  value: unknown,
  options: { collection: string; path?: string[] },
): TaggedValue {
  const path = options.path ?? [];
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value as null | string | boolean;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("ALICE_D1_STATE_VALUE_INVALID");
    return value;
  }
  if (value instanceof Date) {
    const epoch = value.getTime();
    if (!Number.isFinite(epoch))
      throw new Error("ALICE_D1_STATE_VALUE_INVALID");
    return { $aliceType: "date", value: epoch };
  }
  if (value instanceof Uint8Array) {
    return {
      $aliceType: "bytes",
      value: Buffer.from(value).toString("base64url"),
    };
  }
  if (value instanceof Set) {
    const values = [...value].map((entry) =>
      encodeValue(entry, { ...options, path: [...path, "[]"] }),
    );
    values.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
    return { $aliceType: "set", values };
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      encodeValue(entry, { ...options, path: [...path, "[]"] }),
    );
  }
  if (!isPlainObject(value)) throw new Error("ALICE_D1_STATE_VALUE_INVALID");

  const output: Record<string, TaggedValue> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined) continue;
    if (SECRET_FIELD.test(key)) {
      // Character/plugin secrets are supplied again by the Worker boundary on
      // every boot. They must never enter D1, logs, or a rollback artifact.
      continue;
    }
    output[key] = encodeValue(child, {
      ...options,
      path: [...path, key],
    });
  }
  return output;
}

function decodeValue(value: TaggedValue): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value.$aliceType === "date" && typeof value.value === "number") {
    return new Date(value.value);
  }
  if (value.$aliceType === "bytes" && typeof value.value === "string") {
    return Uint8Array.from(Buffer.from(value.value, "base64url"));
  }
  if (value.$aliceType === "set" && Array.isArray(value.values)) {
    return new Set(value.values.map(decodeValue));
  }
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value)) output[key] = decodeValue(value[key]);
  return output;
}

function canonicalRecord(record: AliceElizaStateRecord): string {
  return JSON.stringify(record);
}

function validateKey(key: string): void {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    /[\0\r\n]/.test(key) ||
    Buffer.byteLength(key) > MAX_RECORD_KEY_BYTES
  ) {
    throw new Error("ALICE_D1_STATE_KEY_INVALID");
  }
}

function arrayRecordKey(value: unknown): string {
  if (!isPlainObject(value) || typeof value.id !== "string") {
    throw new Error("ALICE_D1_STATE_ARRAY_ID_INVALID");
  }
  validateKey(value.id);
  return value.id;
}

function assertPinnedInternals(
  adapter: InMemoryDatabaseAdapter,
): AdapterInternals {
  const internals = adapter as unknown as AdapterInternals;
  for (const spec of ALICE_ELIZA_DURABLE_COLLECTIONS) {
    const value = internals[spec.name];
    if (
      (spec.shape === "map" && !(value instanceof Map)) ||
      (spec.shape === "array" && !Array.isArray(value))
    ) {
      throw new Error(`ALICE_D1_ADAPTER_PIN_DRIFT:${spec.name}`);
    }
  }
  return internals;
}

function captureState(
  adapter: InMemoryDatabaseAdapter,
): Map<string, AliceElizaStateRecord> {
  const internals = assertPinnedInternals(adapter);
  const output = new Map<string, AliceElizaStateRecord>();
  for (const spec of ALICE_ELIZA_DURABLE_COLLECTIONS) {
    if (!COLLECTION.test(spec.name))
      throw new Error("ALICE_D1_COLLECTION_INVALID");
    const value = internals[spec.name];
    const entries: Array<[string, unknown]> =
      spec.shape === "map"
        ? [...(value as Map<unknown, unknown>).entries()].map(
            ([key, child]) => [String(key), child],
          )
        : (value as unknown[]).map((child) => [arrayRecordKey(child), child]);
    for (const [key, rawValue] of entries) {
      validateKey(key);
      const sanitized =
        spec.name === "agents" ? sanitizeAgentValue(rawValue) : rawValue;
      const record: AliceElizaStateRecord = {
        collection: spec.name,
        key,
        value: encodeValue(sanitized, { collection: spec.name }),
      };
      if (Buffer.byteLength(canonicalRecord(record)) > MAX_RECORD_VALUE_BYTES) {
        throw new Error("ALICE_D1_STATE_VALUE_TOO_LARGE");
      }
      const identity = `${spec.name}\0${key}`;
      if (output.has(identity)) throw new Error("ALICE_D1_STATE_KEY_DUPLICATE");
      output.set(identity, record);
    }
  }
  return output;
}

function restoreState(
  adapter: InMemoryDatabaseAdapter,
  snapshot: ReadonlyMap<string, AliceElizaStateRecord>,
): void {
  const internals = assertPinnedInternals(adapter);
  const grouped = new Map<string, AliceElizaStateRecord[]>();
  for (const record of snapshot.values()) {
    if (!COLLECTION.test(record.collection)) {
      throw new Error("ALICE_D1_COLLECTION_INVALID");
    }
    validateKey(record.key);
    const spec = ALICE_ELIZA_DURABLE_COLLECTIONS.find(
      (candidate) => candidate.name === record.collection,
    );
    if (!spec) throw new Error("ALICE_D1_COLLECTION_UNSUPPORTED");
    const bucket = grouped.get(record.collection) ?? [];
    bucket.push(record);
    grouped.set(record.collection, bucket);
  }

  for (const spec of ALICE_ELIZA_DURABLE_COLLECTIONS) {
    const records = (grouped.get(spec.name) ?? []).sort((left, right) =>
      left.key.localeCompare(right.key),
    );
    if (spec.shape === "map") {
      internals[spec.name] = new Map(
        records.map((record) => [
          record.key,
          decodeValue(record.value as TaggedValue),
        ]),
      );
    } else {
      internals[spec.name] = records.map((record) =>
        decodeValue(record.value as TaggedValue),
      );
    }
  }
}

function diffState(
  before: ReadonlyMap<string, AliceElizaStateRecord>,
  after: ReadonlyMap<string, AliceElizaStateRecord>,
): AliceElizaStateMutation[] {
  const mutations: AliceElizaStateMutation[] = [];
  for (const identity of [
    ...new Set([...before.keys(), ...after.keys()]),
  ].sort()) {
    const previous = before.get(identity);
    const next = after.get(identity);
    if (previous && !next) {
      mutations.push({
        collection: previous.collection,
        key: previous.key,
        deleted: true,
      });
    } else if (
      next &&
      (!previous || canonicalRecord(previous) !== canonicalRecord(next))
    ) {
      mutations.push({
        collection: next.collection,
        key: next.key,
        deleted: false,
        value: next.value,
      });
    }
  }
  if (mutations.length > MAX_MUTATIONS) {
    throw new Error("ALICE_D1_STATE_MUTATION_LIMIT");
  }
  return mutations;
}

function snapshotFromRecords(
  records: readonly AliceElizaStateRecord[],
): Map<string, AliceElizaStateRecord> {
  const output = new Map<string, AliceElizaStateRecord>();
  for (const record of records) {
    if (!record || typeof record !== "object") {
      throw new Error("ALICE_D1_STATE_RECORD_INVALID");
    }
    const identity = `${record.collection}\0${record.key}`;
    if (output.has(identity)) throw new Error("ALICE_D1_STATE_KEY_DUPLICATE");
    output.set(identity, record);
  }
  return output;
}

export function createAliceFullRuntimeDatabaseAdapter(input: {
  env: AliceFullRuntimeDatabaseEnv;
  transport?: AliceElizaStateTransport;
  fetch?: (request: Request) => Promise<Response>;
}): IDatabaseAdapter<Record<string, never>> | undefined {
  if (
    input.env.ALICE_RUNTIME_AUTHORITY_MODE !== "proposer-only" ||
    input.env.ALICE_RUNTIME_PROFILE !== "full-gated"
  ) {
    return undefined;
  }
  const ownerId = input.env.ALICE_STATE_OWNER_ID ?? "";
  const url = input.env.ALICE_STATE_PLANE_URL ?? "";
  // Construct the HTTP transport even when a test transport is injected so
  // the production-only endpoint contract cannot be bypassed by configuration.
  const httpTransport = createAliceHttpStateTransport({
    url,
    ...(input.fetch ? { fetch: input.fetch } : {}),
  });
  return createAliceD1DatabaseAdapter({
    ownerId,
    transport: input.transport ?? httpTransport,
  });
}

export function createAliceD1DatabaseAdapter(input: {
  ownerId: string;
  transport: AliceElizaStateTransport;
  operationId?: () => string;
}): IDatabaseAdapter<Record<string, never>> {
  if (!OWNER.test(input.ownerId)) throw new Error("ALICE_D1_OWNER_INVALID");
  const target = new InMemoryDatabaseAdapter();
  let revision = 0;
  let initialized = false;
  let tail = Promise.resolve<unknown>(undefined);
  const nextOperationId = input.operationId ?? (() => crypto.randomUUID());
  let proxy: IDatabaseAdapter<Record<string, never>>;

  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.catch(() => undefined);
    return result;
  };

  const persistMutation = async <T>(
    method: (...args: unknown[]) => Promise<T>,
    args: unknown[],
  ): Promise<T> => {
    if (!initialized) throw new Error("ALICE_D1_ADAPTER_NOT_INITIALIZED");
    return serialized(async () => {
      const before = captureState(target);
      try {
        const result = await Reflect.apply(method, target, args);
        const after = captureState(target);
        const mutations = diffState(before, after);
        if (mutations.length === 0) return result;
        const operationId = nextOperationId();
        if (!OPERATION.test(operationId)) {
          throw new Error("ALICE_D1_OPERATION_ID_INVALID");
        }
        const committed = await input.transport.commit({
          ownerId: input.ownerId,
          operationId,
          expectedRevision: revision,
          mutations,
        });
        if (committed.revision !== revision + 1) {
          throw new Error("ALICE_D1_COMMIT_REVISION_INVALID");
        }
        revision = committed.revision;
        return result;
      } catch (error) {
        restoreState(target, before);
        throw error;
      }
    });
  };

  proxy = new Proxy(target, {
    get(current, property, receiver) {
      if (property === "initialize" || property === "init") {
        return async () =>
          serialized(async () => {
            if (initialized) return;
            await current.initialize();
            const loaded = await input.transport.load(input.ownerId);
            if (!Number.isSafeInteger(loaded.revision) || loaded.revision < 0) {
              throw new Error("ALICE_D1_LOAD_REVISION_INVALID");
            }
            const snapshot = snapshotFromRecords(loaded.records);
            restoreState(current, snapshot);
            revision = loaded.revision;
            initialized = true;
          });
      }
      if (property === "isReady") {
        return async () => initialized && (await current.isReady());
      }
      if (property === "transaction") {
        return <T>(
          callback: (
            adapter: IDatabaseAdapter<Record<string, never>>,
          ) => Promise<T>,
        ): Promise<T> =>
          serialized(async () => {
            if (!initialized)
              throw new Error("ALICE_D1_ADAPTER_NOT_INITIALIZED");
            const before = captureState(current);
            try {
              // The callback receives the underlying adapter so its operations
              // compose into this one optimistic commit. Calls made through
              // the outer proxy remain serialized behind this transaction.
              const result = await callback(
                current as IDatabaseAdapter<Record<string, never>>,
              );
              const after = captureState(current);
              const mutations = diffState(before, after);
              if (mutations.length > 0) {
                const operationId = nextOperationId();
                if (!OPERATION.test(operationId)) {
                  throw new Error("ALICE_D1_OPERATION_ID_INVALID");
                }
                const committed = await input.transport.commit({
                  ownerId: input.ownerId,
                  operationId,
                  expectedRevision: revision,
                  mutations,
                });
                if (committed.revision !== revision + 1) {
                  throw new Error("ALICE_D1_COMMIT_REVISION_INVALID");
                }
                revision = committed.revision;
              }
              return result;
            } catch (error) {
              restoreState(current, before);
              throw error;
            }
          });
      }
      const value = Reflect.get(current, property, receiver);
      if (typeof value !== "function") return value;
      if (
        property === "close" ||
        property === "getConnection" ||
        property === "runPluginMigrations" ||
        property === "runMigrations"
      ) {
        return (...args: unknown[]) => Reflect.apply(value, current, args);
      }
      const methodName = String(property);
      if (
        /^(?:get|list|count|search|query|is|are|find)/.test(methodName) ||
        methodName === "ensureEmbeddingDimension" ||
        methodName === "clearEmbeddingsOutsideActiveDimension"
      ) {
        return (...args: unknown[]) =>
          serialized(async () => Reflect.apply(value, current, args));
      }
      return (...args: unknown[]) => persistMutation(value, args);
    },
  }) as IDatabaseAdapter<Record<string, never>>;

  return proxy;
}

type FetchLike = (request: Request) => Promise<Response>;

function exactObjectKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

async function readExactJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim();
  if (contentType !== "application/json")
    throw new Error("ALICE_D1_RESPONSE_INVALID");
  const value = await response.json();
  if (!isPlainObject(value)) throw new Error("ALICE_D1_RESPONSE_INVALID");
  if (!response.ok || value.ok !== true) {
    const code =
      typeof value.code === "string" ? value.code : "ALICE_D1_REMOTE_FAILED";
    throw new Error(
      /^STATE_[A-Z0-9_]+$/.test(code) ? code : "ALICE_D1_REMOTE_FAILED",
    );
  }
  return value;
}

export function createAliceHttpStateTransport(input: {
  url: string;
  fetch?: FetchLike;
}): AliceElizaStateTransport {
  const url = new URL(input.url);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "alice-state-plane.internal" ||
    url.pathname !== "/v1/eliza-database" ||
    url.search ||
    url.hash
  ) {
    throw new Error("ALICE_D1_STATE_URL_INVALID");
  }
  const request = input.fetch ?? ((value: Request) => fetch(value));
  const call = async (body: Record<string, unknown>) => {
    const response = await request(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      }),
    );
    return readExactJson(response);
  };
  return {
    async load(ownerId) {
      const records: AliceElizaStateRecord[] = [];
      let cursor: string | null = null;
      let revision: number | null = null;
      do {
        const value = await call({
          operation: "eliza.load",
          ownerId,
          cursor,
          limit: 500,
        });
        if (
          !exactObjectKeys(value, [
            "ok",
            "revision",
            "records",
            "nextCursor",
          ]) ||
          !Number.isSafeInteger(value.revision) ||
          (value.revision as number) < 0 ||
          !Array.isArray(value.records) ||
          (value.nextCursor !== null && typeof value.nextCursor !== "string")
        ) {
          throw new Error("ALICE_D1_RESPONSE_INVALID");
        }
        if (revision !== null && revision !== value.revision) {
          throw new Error("ALICE_D1_LOAD_DRIFT");
        }
        revision = value.revision as number;
        for (const record of value.records) {
          if (
            !isPlainObject(record) ||
            !exactObjectKeys(record, ["collection", "key", "value"]) ||
            typeof record.collection !== "string" ||
            typeof record.key !== "string"
          ) {
            throw new Error("ALICE_D1_RESPONSE_INVALID");
          }
          records.push(record as AliceElizaStateRecord);
        }
        cursor = value.nextCursor as string | null;
      } while (cursor !== null);
      return { revision: revision ?? 0, records };
    },
    async commit(commit) {
      const value = await call({ operation: "eliza.commit", ...commit });
      if (
        !exactObjectKeys(value, ["ok", "revision"]) ||
        !Number.isSafeInteger(value.revision) ||
        (value.revision as number) < 1
      ) {
        throw new Error("ALICE_D1_RESPONSE_INVALID");
      }
      return { revision: value.revision as number };
    },
  };
}
