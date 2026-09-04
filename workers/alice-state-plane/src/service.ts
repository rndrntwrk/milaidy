import {
  authorizeStatePlaneRequest,
  validateStateOperation,
  type AliceObjectStore,
  type AliceStateKind,
  type AliceVectorStore,
  type D1AliceStateAdapter,
} from "./state-plane";
import {
  validateElizaDatabaseOperation,
  type ElizaDatabaseAdapter,
} from "./eliza-database";

type PortableAdapter = Pick<
  D1AliceStateAdapter,
  "getRecord" | "putRecord" | "listRecords" | "applyAtomic"
>;

type CoordinationService = {
  initialize(ownerId: string, sessionId: string): Promise<unknown>;
  snapshot(ownerId: string, sessionId: string): Promise<unknown>;
  connect(ownerId: string, sessionId: string, connectionId: string, connectedAt: number): Promise<unknown>;
  advanceCursor(ownerId: string, sessionId: string, connector: string, cursor: string, observedAt: number): Promise<unknown>;
};

const MAX_OPERATION_BYTES = 65_536;
const MAX_ELIZA_OPERATION_BYTES = 100_100_000;
const CONTAINER_SCOPE_HEADER = "x-alice-container-state-scope";
const CONTAINER_OWNER_HEADER = "x-alice-state-owner";

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function validCompanionStagePayload(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (
    !exactKeys(payload, ["schemaVersion", "state"]) ||
    payload.schemaVersion !== "alice.companion-stage-state.v1" ||
    !payload.state ||
    typeof payload.state !== "object" ||
    Array.isArray(payload.state)
  ) return false;
  const state = payload.state as Record<string, unknown>;
  if (!exactKeys(state, ["camera"]) || !state.camera || typeof state.camera !== "object" || Array.isArray(state.camera)) return false;
  const camera = state.camera as Record<string, unknown>;
  if (!exactKeys(camera, ["pan", "pitch", "yaw", "zoom"])) return false;
  return (
    typeof camera.zoom === "number" && Number.isFinite(camera.zoom) && camera.zoom >= 0 && camera.zoom <= 1 &&
    typeof camera.yaw === "number" && Number.isFinite(camera.yaw) && camera.yaw >= -Math.PI && camera.yaw <= Math.PI &&
    typeof camera.pitch === "number" && Number.isFinite(camera.pitch) && camera.pitch >= -Math.PI / 2 && camera.pitch <= Math.PI / 2 &&
    typeof camera.pan === "number" && Number.isFinite(camera.pan) && camera.pan >= -5 && camera.pan <= 5
  );
}

function validOpenAiCodexPayload(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (
    exactKeys(payload, ["schemaVersion", "state"]) &&
    payload.schemaVersion === "alice.openai-codex-auth-state.v1" &&
    payload.state === "deleted"
  ) return true;
  if (
    !exactKeys(payload, [
      "algorithm", "ciphertext", "iterations", "iv", "kdf", "salt",
      "schemaVersion", "state", "tag",
    ]) ||
    payload.schemaVersion !== "alice.openai-codex-auth-state.v1" ||
    payload.state !== "active" ||
    payload.algorithm !== "aes-256-gcm" ||
    payload.kdf !== "pbkdf2-sha256" ||
    payload.iterations !== 210_000
  ) return false;
  const encoded = /^[A-Za-z0-9_-]+$/;
  return [payload.salt, payload.iv, payload.ciphertext, payload.tag].every(
    (field) =>
      typeof field === "string" &&
      field.length >= 16 &&
      field.length <= 65_536 &&
      encoded.test(field),
  );
}

function containerScopeAllows(
  request: Request,
  pathname: string,
  operation: Record<string, unknown>,
): boolean {
  const scope = request.headers.get(CONTAINER_SCOPE_HEADER);
  const ownerId = request.headers.get(CONTAINER_OWNER_HEADER);
  if (scope === null && ownerId === null) return true;
  if (
    ownerId !== "alice-owner-production" ||
    operation.ownerId !== ownerId
  ) return false;
  if (scope === "eliza-database") {
    return pathname === "/v1/eliza-database" &&
      (operation.operation === "eliza.load" || operation.operation === "eliza.commit");
  }
  if (scope === "openai-codex-credentials") {
    if (
      pathname !== "/v1/state" ||
      operation.kind !== "configVersion" ||
      operation.recordId !== "openai-codex-credentials-v1"
    ) return false;
    if (operation.operation === "record.get") {
      return exactKeys(operation, ["kind", "operation", "ownerId", "recordId"]);
    }
    return operation.operation === "record.put" &&
      exactKeys(operation, [
        "idempotencyKey", "kind", "operation", "ownerId", "payload",
        "recordId", "sessionId", "updatedAt",
      ]) &&
      operation.sessionId === "openai-codex-production" &&
      validOpenAiCodexPayload(operation.payload);
  }
  if (
    scope !== "companion-stage" ||
    pathname !== "/v1/state" ||
    operation.kind !== "configVersion" ||
    operation.recordId !== "companion-stage-v1"
  ) return false;
  if (operation.operation === "record.get") {
    return exactKeys(operation, ["kind", "operation", "ownerId", "recordId"]);
  }
  return operation.operation === "record.put" &&
    exactKeys(operation, [
      "idempotencyKey", "kind", "operation", "ownerId", "payload",
      "recordId", "sessionId", "updatedAt",
    ]) &&
    operation.sessionId === "companion-production" &&
    validCompanionStagePayload(operation.payload);
}

function response(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function readBoundedJson(
  request: Request,
  maxBytes = MAX_OPERATION_BYTES,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("STATE_OPERATION_TOO_LARGE");
  if (!request.body) throw new Error("STATE_OPERATION_INVALID");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error("STATE_OPERATION_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("STATE_OPERATION_INVALID");
  }
}

export function createAliceStateService(input: {
  adapter: PortableAdapter;
  vectorStore?: Pick<AliceVectorStore, "upsert" | "query">;
  objectStore?: Pick<AliceObjectStore, "put">;
  coordination?: CoordinationService;
  elizaDatabase?: ElizaDatabaseAdapter;
  token: string;
}) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== "/v1/state" && url.pathname !== "/v1/eliza-database") {
        return response({ ok: false, code: "STATE_ROUTE_NOT_FOUND" }, 404);
      }
      if (request.method !== "POST") return response({ ok: false, code: "STATE_METHOD_INVALID" }, 405);
      if (!authorizeStatePlaneRequest(request, input.token)) return response({ ok: false, code: "STATE_SERVICE_UNAUTHORIZED" }, 401);
      if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
        return response({ ok: false, code: "STATE_CONTENT_TYPE_INVALID" }, 415);
      }
      try {
        const body = await readBoundedJson(
          request,
          url.pathname === "/v1/eliza-database"
            ? MAX_ELIZA_OPERATION_BYTES
            : MAX_OPERATION_BYTES,
        );
        if (url.pathname === "/v1/eliza-database") {
          if (!input.elizaDatabase) throw new Error("STATE_DEPENDENCY_UNAVAILABLE");
          const operation = validateElizaDatabaseOperation(body);
          if (!containerScopeAllows(request, url.pathname, operation as unknown as Record<string, unknown>)) {
            return response({ ok: false, code: "STATE_CONTAINER_SCOPE_INVALID" }, 403);
          }
          if (operation.operation === "eliza.load") {
            const { operation: _operation, ...load } = operation;
            return response({ ok: true, ...await input.elizaDatabase.load(load) }, 200);
          }
          const { operation: _operation, ...commit } = operation;
          return response({ ok: true, ...await input.elizaDatabase.commit(commit) }, 200);
        }
        const operation = validateStateOperation(body);
        if (!containerScopeAllows(request, url.pathname, operation as unknown as Record<string, unknown>)) {
          return response({ ok: false, code: "STATE_CONTAINER_SCOPE_INVALID" }, 403);
        }
        if (operation.operation === "record.get") {
          const record = await input.adapter.getRecord(operation.kind as AliceStateKind, operation.recordId, operation.ownerId);
          return response({ ok: true, record }, 200);
        }
        if (operation.operation === "record.put") {
          const { operation: _operation, ...recordInput } = operation;
          const record = await input.adapter.putRecord(recordInput);
          return response({ ok: true, record }, 200);
        }
        if (operation.operation === "record.list") {
          const { operation: _operation, ...listInput } = operation;
          const records = await input.adapter.listRecords(listInput);
          return response({ ok: true, records }, 200);
        }
        if (operation.operation === "records.atomic") {
          const { operation: _operation, ...atomicInput } = operation;
          const records = await input.adapter.applyAtomic(atomicInput);
          return response({ ok: true, records }, 200);
        }
        if (operation.operation === "vector.upsert") {
          if (!input.vectorStore) throw new Error("STATE_DEPENDENCY_UNAVAILABLE");
          const { operation: _operation, ...vectorInput } = operation;
          return response({ ok: true, reference: await input.vectorStore.upsert(vectorInput) }, 200);
        }
        if (operation.operation === "vector.query") {
          if (!input.vectorStore) throw new Error("STATE_DEPENDENCY_UNAVAILABLE");
          const { operation: _operation, ...queryInput } = operation;
          return response({ ok: true, matches: await input.vectorStore.query(queryInput) }, 200);
        }
        if (operation.operation === "object.put") {
          if (!input.objectStore) throw new Error("STATE_DEPENDENCY_UNAVAILABLE");
          const binary = atob(operation.bytesBase64);
          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
          return response({ ok: true, reference: await input.objectStore.put(bytes, operation.mediaType, operation.createdAt) }, 200);
        }
        if (!input.coordination) throw new Error("STATE_DEPENDENCY_UNAVAILABLE");
        if (operation.operation === "coordination.initialize") {
          return response({ ok: true, state: await input.coordination.initialize(operation.ownerId, operation.sessionId) }, 200);
        }
        if (operation.operation === "coordination.snapshot") {
          return response({ ok: true, state: await input.coordination.snapshot(operation.ownerId, operation.sessionId) }, 200);
        }
        if (operation.operation === "coordination.connect") {
          return response({ ok: true, state: await input.coordination.connect(
            operation.ownerId, operation.sessionId, operation.connectionId, operation.connectedAt,
          ) }, 200);
        }
        return response({ ok: true, cursor: await input.coordination.advanceCursor(
          operation.ownerId, operation.sessionId, operation.connector, operation.cursor, operation.observedAt,
        ) }, 200);
      } catch (error) {
        const code = error instanceof Error && /^(?:STATE|ELIZA)_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "STATE_OPERATION_FAILED";
        const elizaRoute = url.pathname === "/v1/eliza-database";
        const status = code === "STATE_OPERATION_TOO_LARGE" || code === "ELIZA_VALUE_TOO_LARGE"
          ? 413
          : !elizaRoute
            ? 400
            : code === "ELIZA_REVISION_STALE" ||
              code === "ELIZA_REVISION_DRIFT" ||
              code === "ELIZA_IDEMPOTENCY_COLLISION"
            ? 409
            : code === "ELIZA_COMMIT_FAILED" ||
                code === "ELIZA_LOAD_FAILED" ||
                code === "STATE_DEPENDENCY_UNAVAILABLE"
              ? 503
              : 400;
        return response({ ok: false, code }, status);
      }
    },
  };
}
