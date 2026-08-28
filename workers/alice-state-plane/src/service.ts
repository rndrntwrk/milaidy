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
          if (operation.operation === "eliza.load") {
            const { operation: _operation, ...load } = operation;
            return response({ ok: true, ...await input.elizaDatabase.load(load) }, 200);
          }
          const { operation: _operation, ...commit } = operation;
          return response({ ok: true, ...await input.elizaDatabase.commit(commit) }, 200);
        }
        const operation = validateStateOperation(body);
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
