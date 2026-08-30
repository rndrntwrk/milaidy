import { describe, expect, test } from "bun:test";
import {
  ALICE_CREDENTIAL_OWNER_ID,
  ALICE_CREDENTIAL_PROVIDER_ID,
  ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION,
  canonicalCredentialManifest,
  sha256CredentialBytes,
  type AliceCredentialSnapshotV1,
} from "../src/credential-state";
import { createAliceCredentialService } from "../src/credential-service";
import {
  CredentialGenerationConflictError,
  type CredentialStateStore,
} from "../src/credential-store";

const TOKEN = "state-service-token-that-is-at-least-32-bytes";

async function snapshot(
  generation: number,
  marker = `opaque-${generation}`,
): Promise<AliceCredentialSnapshotV1> {
  const bytes = Buffer.from(marker, "utf8");
  const file = {
    relativePath: "auth/openai-codex/alice-primary.json",
    mode: 0o600 as const,
    size: bytes.byteLength,
    sha256: await sha256CredentialBytes(bytes),
    bytesBase64: bytes.toString("base64"),
  };
  const value: AliceCredentialSnapshotV1 = {
    schemaVersion: ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION,
    ownerId: ALICE_CREDENTIAL_OWNER_ID,
    providerId: ALICE_CREDENTIAL_PROVIDER_ID,
    generation,
    files: [file],
    snapshotSha256: `sha256:${"0".repeat(64)}`,
    createdAtMs: 100,
    updatedAtMs: 100 + generation,
  };
  return {
    ...value,
    snapshotSha256: await sha256CredentialBytes(
      new TextEncoder().encode(canonicalCredentialManifest(value)),
    ),
  };
}

class MemoryStore implements CredentialStateStore {
  current: AliceCredentialSnapshotV1 | null = null;

  async getCredentialState() {
    return this.current;
  }

  async putCredentialState(input: {
    expectedGeneration: number | null;
    snapshot: unknown;
  }) {
    const next = input.snapshot as AliceCredentialSnapshotV1;
    const actual = this.current?.generation ?? null;
    const same =
      this.current?.generation === next.generation &&
      this.current.snapshotSha256 === next.snapshotSha256;
    if (
      !same &&
      ((input.expectedGeneration === null && this.current !== null) ||
        (input.expectedGeneration !== null &&
          actual !== input.expectedGeneration))
    ) {
      throw new CredentialGenerationConflictError(
        input.expectedGeneration,
        actual,
      );
    }
    this.current = next;
    return next;
  }

  async deleteCredentialState(input: {
    expectedGeneration: number;
    recordedAtMs: number;
  }) {
    void input.recordedAtMs;
    if (!this.current) return false;
    if (this.current.generation !== input.expectedGeneration) {
      throw new CredentialGenerationConflictError(
        input.expectedGeneration,
        this.current.generation,
      );
    }
    this.current = null;
    return true;
  }
}

function authorize(request: Request, expectedToken: string): boolean {
  return (
    !request.headers.has("authorization") &&
    !request.headers.has("origin") &&
    !request.headers.has("cookie") &&
    request.headers.get("x-alice-state-token") === expectedToken
  );
}

function request(
  method: string,
  scope?: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Request {
  const headers: Record<string, string> = {
    "x-alice-state-token": TOKEN,
    "x-alice-state-owner": ALICE_CREDENTIAL_OWNER_ID,
    ...extraHeaders,
  };
  if (scope) headers["x-alice-container-state-scope"] = scope;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(
    "https://state.internal/v1/credential-state/openai-codex",
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

function service(store = new MemoryStore()) {
  return {
    store,
    service: createAliceCredentialService({
      store,
      token: TOKEN,
      authorize,
      now: () => 999,
    }),
  };
}

describe("credential-state service", () => {
  test("requires the service token, fixed owner, and dedicated scope", async () => {
    const { service: credentialService } = service();
    const noToken = request("GET", "credential-bootstrap");
    noToken.headers.delete("x-alice-state-token");
    let result = await credentialService.fetch(noToken);
    expect(result.status).toBe(401);
    expect(await body(result)).toMatchObject({
      code: "credential_service_unauthorized",
    });

    result = await credentialService.fetch(request("GET"));
    expect(result.status).toBe(403);
    result = await credentialService.fetch(request("GET", "agent-bot"));
    expect(result.status).toBe(403);

    const wrongOwner = request("GET", "credential-bootstrap");
    wrongOwner.headers.set("x-alice-state-owner", "different-owner");
    result = await credentialService.fetch(wrongOwner);
    expect(result.status).toBe(403);
  });

  test("gives bootstrap read-only and runtime compare-and-swap access", async () => {
    const { service: credentialService } = service();
    let result = await credentialService.fetch(
      request("GET", "credential-bootstrap"),
    );
    expect(result.status).toBe(404);
    expect(await body(result)).toMatchObject({
      code: "credential_state_not_found",
    });

    const zero = await snapshot(0);
    result = await credentialService.fetch(
      request("PUT", "credential-bootstrap", {
        expectedGeneration: null,
        snapshot: zero,
      }),
    );
    expect(result.status).toBe(403);

    result = await credentialService.fetch(
      request("PUT", "credential-runtime", {
        expectedGeneration: null,
        snapshot: zero,
      }),
    );
    expect(result.status).toBe(200);
    expect(await body(result)).toMatchObject({
      ok: true,
      snapshot: { generation: 0 },
    });

    result = await credentialService.fetch(
      request("GET", "credential-bootstrap"),
    );
    expect(result.status).toBe(200);
    expect(await body(result)).toMatchObject({
      snapshot: { snapshotSha256: zero.snapshotSha256 },
    });
  });

  test("limits deletion to release-manager and returns redacted conflicts", async () => {
    const { service: credentialService, store } = service();
    store.current = await snapshot(1);

    let result = await credentialService.fetch(
      request("DELETE", "credential-runtime", { expectedGeneration: 1 }),
    );
    expect(result.status).toBe(403);

    result = await credentialService.fetch(
      request("DELETE", "credential-release-manager", {
        expectedGeneration: 0,
      }),
    );
    expect(result.status).toBe(409);
    expect(await body(result)).toEqual({
      ok: false,
      code: "credential_generation_conflict",
      expectedGeneration: 0,
      actualGeneration: 1,
    });

    result = await credentialService.fetch(
      request("DELETE", "credential-release-manager", {
        expectedGeneration: 1,
      }),
    );
    expect(result.status).toBe(200);
    expect(await body(result)).toEqual({
      ok: true,
      deleted: true,
      generation: 1,
    });
  });

  test("enforces method, content type, exact body keys, and body size", async () => {
    const { service: credentialService } = service();
    let result = await credentialService.fetch(
      request("PATCH", "credential-runtime"),
    );
    expect(result.status).toBe(405);

    result = await credentialService.fetch(
      new Request(
        "https://state.internal/v1/credential-state/openai-codex",
        {
          method: "PUT",
          headers: {
            "x-alice-state-token": TOKEN,
            "x-alice-state-owner": ALICE_CREDENTIAL_OWNER_ID,
            "x-alice-container-state-scope": "credential-runtime",
          },
          body: "{}",
        },
      ),
    );
    expect(result.status).toBe(415);

    result = await credentialService.fetch(
      request("PUT", "credential-runtime", {
        expectedGeneration: null,
        snapshot: await snapshot(0),
        extra: true,
      }),
    );
    expect(result.status).toBe(400);

    result = await credentialService.fetch(
      request(
        "PUT",
        "credential-runtime",
        {},
        { "content-length": String(300 * 1024) },
      ),
    );
    expect(result.status).toBe(413);
  });

  test("never echoes credential bytes in validation errors", async () => {
    const { service: credentialService } = service();
    const marker = "DO_NOT_ECHO_CREDENTIAL";
    const value = await snapshot(0, marker);
    value.files[0] = {
      ...value.files[0]!,
      relativePath: "../auth.json",
    };

    const result = await credentialService.fetch(
      request("PUT", "credential-runtime", {
        expectedGeneration: null,
        snapshot: value,
      }),
    );
    expect(result.status).toBe(400);
    const text = await result.text();
    expect(text).not.toContain(marker);
    expect(text).not.toContain(Buffer.from(marker).toString("base64"));
  });
});
