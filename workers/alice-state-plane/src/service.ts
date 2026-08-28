import {
  authorizeStatePlaneRequest,
  validateStateOperation,
  type AliceStateKind,
  type D1AliceStateAdapter,
} from "./state-plane";

type PortableAdapter = Pick<
  D1AliceStateAdapter,
  "getRecord" | "putRecord" | "listRecords" | "applyAtomic"
>;

const MAX_OPERATION_BYTES = 65_536;

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

async function readBoundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_OPERATION_BYTES) throw new Error("STATE_OPERATION_TOO_LARGE");
  if (!request.body) throw new Error("STATE_OPERATION_INVALID");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_OPERATION_BYTES) throw new Error("STATE_OPERATION_TOO_LARGE");
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
  token: string;
}) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== "/v1/state") return response({ ok: false, code: "STATE_ROUTE_NOT_FOUND" }, 404);
      if (request.method !== "POST") return response({ ok: false, code: "STATE_METHOD_INVALID" }, 405);
      if (!authorizeStatePlaneRequest(request, input.token)) return response({ ok: false, code: "STATE_SERVICE_UNAUTHORIZED" }, 401);
      if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
        return response({ ok: false, code: "STATE_CONTENT_TYPE_INVALID" }, 415);
      }
      try {
        const operation = validateStateOperation(await readBoundedJson(request));
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
        const { operation: _operation, ...atomicInput } = operation;
        const records = await input.adapter.applyAtomic(atomicInput);
        return response({ ok: true, records }, 200);
      } catch (error) {
        const code = error instanceof Error && /^STATE_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "STATE_OPERATION_FAILED";
        return response({ ok: false, code }, code === "STATE_OPERATION_TOO_LARGE" ? 413 : 400);
      }
    },
  };
}
