import {
  CredentialStateValidationError,
  type AliceCredentialSnapshotV1,
} from "./credential-state";
import {
  CredentialGenerationConflictError,
  CredentialStateRowError,
  type CredentialStateStore,
} from "./credential-store";

const CREDENTIAL_STATE_PATH = "/v1/credential-state/openai-codex";
const MAX_CREDENTIAL_REQUEST_BYTES = 256 * 1024;
const SCOPE_HEADER = "x-alice-container-state-scope";
const OWNER_HEADER = "x-alice-state-owner";
const OWNER_ID = "alice-owner-production";

type CredentialScope =
  | "credential-bootstrap"
  | "credential-runtime"
  | "credential-release-manager";

type CredentialAuthorizer = (
  request: Request,
  expectedToken: string,
) => boolean;

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

function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  return (
    Object.keys(value).sort().join(",") === [...expected].sort().join(",")
  );
}

function safeGeneration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function methodAllowed(scope: CredentialScope, method: string): boolean {
  if (method === "GET") return true;
  if (method === "PUT") return scope === "credential-runtime";
  if (method === "DELETE") return scope === "credential-release-manager";
  return false;
}

function authorizeScope(request: Request): CredentialScope | null {
  if (request.headers.get(OWNER_HEADER) !== OWNER_ID) return null;
  const scope = request.headers.get(SCOPE_HEADER);
  if (
    scope !== "credential-bootstrap" &&
    scope !== "credential-runtime" &&
    scope !== "credential-release-manager"
  ) {
    return null;
  }
  return scope;
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredValue = request.headers.get("content-length");
  if (declaredValue !== null) {
    const declared = Number(declaredValue);
    if (!Number.isSafeInteger(declared) || declared < 0) {
      throw new Error("credential_request_invalid");
    }
    if (declared > MAX_CREDENTIAL_REQUEST_BYTES) {
      throw new Error("credential_request_too_large");
    }
  }
  if (!request.body) throw new Error("credential_request_invalid");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_CREDENTIAL_REQUEST_BYTES) {
        throw new Error("credential_request_too_large");
      }
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
    throw new Error("credential_request_invalid");
  }
}

function generationConflict(
  error: CredentialGenerationConflictError,
): Response {
  return response(
    {
      ok: false,
      code: error.code,
      expectedGeneration: error.expectedGeneration,
      actualGeneration: error.actualGeneration,
    },
    409,
  );
}

export function isCredentialStateRequest(request: Request): boolean {
  return new URL(request.url).pathname === CREDENTIAL_STATE_PATH;
}

export function createAliceCredentialService(input: {
  store: CredentialStateStore;
  token: string;
  authorize: CredentialAuthorizer;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  return {
    async fetch(request: Request): Promise<Response> {
      if (!isCredentialStateRequest(request)) {
        return response(
          { ok: false, code: "credential_route_not_found" },
          404,
        );
      }
      if (!input.authorize(request, input.token)) {
        return response(
          { ok: false, code: "credential_service_unauthorized" },
          401,
        );
      }

      const scope = authorizeScope(request);
      if (!scope) {
        return response({ ok: false, code: "credential_scope_invalid" }, 403);
      }
      if (!new Set(["GET", "PUT", "DELETE"]).has(request.method)) {
        return response({ ok: false, code: "credential_method_invalid" }, 405);
      }
      if (!methodAllowed(scope, request.method)) {
        return response({ ok: false, code: "credential_scope_invalid" }, 403);
      }

      try {
        if (request.method === "GET") {
          const snapshot = await input.store.getCredentialState();
          return snapshot
            ? response({ ok: true, snapshot }, 200)
            : response(
                { ok: false, code: "credential_state_not_found" },
                404,
              );
        }

        if (
          request.headers
            .get("content-type")
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase() !== "application/json"
        ) {
          return response(
            { ok: false, code: "credential_content_type_invalid" },
            415,
          );
        }

        const body = await readBoundedJson(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new Error("credential_request_invalid");
        }
        const record = body as Record<string, unknown>;

        if (request.method === "PUT") {
          if (!exactKeys(record, ["expectedGeneration", "snapshot"])) {
            throw new Error("credential_request_invalid");
          }
          if (
            record.expectedGeneration !== null &&
            !safeGeneration(record.expectedGeneration)
          ) {
            throw new Error("credential_request_invalid");
          }
          const snapshot = await input.store.putCredentialState({
            expectedGeneration: record.expectedGeneration as number | null,
            snapshot: record.snapshot,
          });
          return response({ ok: true, snapshot }, 200);
        }

        if (!exactKeys(record, ["expectedGeneration"])) {
          throw new Error("credential_request_invalid");
        }
        if (!safeGeneration(record.expectedGeneration)) {
          throw new Error("credential_request_invalid");
        }
        const deleted = await input.store.deleteCredentialState({
          expectedGeneration: record.expectedGeneration,
          recordedAtMs: now(),
        });
        return deleted
          ? response(
              {
                ok: true,
                deleted: true,
                generation: record.expectedGeneration,
              },
              200,
            )
          : response(
              { ok: false, code: "credential_state_not_found" },
              404,
            );
      } catch (error) {
        if (error instanceof CredentialGenerationConflictError) {
          return generationConflict(error);
        }
        if (error instanceof CredentialStateValidationError) {
          return response({ ok: false, code: error.code }, 400);
        }
        if (error instanceof CredentialStateRowError) {
          return response(
            { ok: false, code: "credential_state_integrity_failed" },
            503,
          );
        }
        const code = error instanceof Error ? error.message : "";
        if (code === "credential_request_too_large") {
          return response({ ok: false, code }, 413);
        }
        if (code === "credential_request_invalid") {
          return response({ ok: false, code }, 400);
        }
        return response(
          { ok: false, code: "credential_state_unavailable" },
          503,
        );
      }
    },
  };
}
