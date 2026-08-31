import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { readAliceReleaseMetadata } from "../../../packages/agent/src/api/alice-release-metadata";
import * as runtimeContainer from "../src/alice-runtime-host";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

test("builds a fail-closed Container environment for gateway auth, release proof, and internal inference", () => {
  expect(typeof (runtimeContainer as any).buildAliceRuntimeContainerEnv).toBe(
    "function",
  );
  const build = (runtimeContainer as any).buildAliceRuntimeContainerEnv as (
    env: Record<string, string>,
  ) => Record<string, string>;
  const result = build({
    ALICE_ACCESS_PROXY_SECRET: "access-proxy-secret-with-at-least-32-bytes",
    ALICE_RUNTIME_API_TOKEN: "runtime-api-token-with-at-least-32-bytes",
    ALICE_RUNTIME_RELEASE_TOKEN: "runtime-release-token-with-at-least-32-bytes",
    ALICE_RUNTIME_VAULT_PASSPHRASE:
      "runtime-vault-passphrase-with-at-least-32-bytes",
    ALICE_STATE_PLANE_SERVICE_TOKEN:
      "state-plane-service-token-with-at-least-32-bytes",
    ALICE_PROGRAM_DIGEST: digest("1"),
    ALICE_RELEASE_DIGEST: digest("2"),
    ALICE_POLICY_HASH: digest("3"),
    ALICE_SOURCE_COMMIT: "4".repeat(40),
    ALICE_DEPLOYMENT_CONTROLLER_COMMIT: "5".repeat(40),
    ALICE_RUNTIME_IMAGE: `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"6".repeat(64)}`,
    ALICE_RUNTIME_BUILD_MANIFEST_SHA256: digest("7"),
    ALICE_CAPABILITY_BOM_SHA256: digest("a"),
    ALICE_DEPLOYMENT_MANIFEST_SHA256: digest("8"),
    ALICE_ELIZA_COMMIT: "9".repeat(40),
    ALICE_RUNTIME_REVISION: "49",
  });

  expect(result).toMatchObject({
    MILADY_CLOUD_PROVISIONED: "1",
    MILADY_TRUST_CLOUDFLARE_ACCESS: "1",
    MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET:
      "access-proxy-secret-with-at-least-32-bytes",
    MILADY_API_TOKEN: "runtime-api-token-with-at-least-32-bytes",
    OPENAI_API_KEY: "runtime-release-token-with-at-least-32-bytes",
    OPENAI_BASE_URL: "http://alice-ai-gateway.internal/v1",
    OPENAI_EMBEDDING_URL: "http://alice-ai-gateway.internal/v1",
    MILADY_DISABLE_LOCAL_EMBEDDINGS: "1",
    ELIZA_DISABLE_LOCAL_EMBEDDINGS: "1",
    ALICE_STATE_PLANE_URL:
      "http://alice-state-plane.internal/v1/eliza-database",
    ALICE_COMPANION_STATE_URL:
      "http://alice-state-plane.internal/v1/companion-state",
    ALICE_STATE_OWNER_ID: "alice-owner-production",
    ELIZA_VAULT_PASSPHRASE: "runtime-vault-passphrase-with-at-least-32-bytes",
    ALICE_PROGRAM_DIGEST: digest("1"),
    ALICE_RELEASE_DIGEST: digest("2"),
    ALICE_CAPABILITY_BOM_SHA256: digest("a"),
    ALICE_RUNTIME_REVISION: "49",
  });
  expect(readAliceReleaseMetadata(result)?.capabilityBomSha256).toBe(
    digest("a"),
  );
  expect("ALICE_MODAL_REVISION" in result).toBe(false);
  expect("ALICE_STATE_PLANE_SERVICE_TOKEN" in result).toBe(false);
  expect("ELIZA_SKIP_PLUGINS" in result).toBe(false);
});

test("routes the only allowed model host through ContainerProxy to the authenticated service binding", async () => {
  let forwarded: Request | undefined;
  const env = {
    ALICE_RUNTIME_RELEASE_TOKEN: "runtime-release-token-with-at-least-32-bytes",
    ALICE_AI_GATEWAY: {
      async fetch(request: Request) {
        forwarded = request;
        return new Response("ok");
      },
    },
  } as any;
  const request = new Request(
    "http://alice-ai-gateway.internal/v1/chat/completions",
    { headers: { authorization: "Bearer caller-controlled" } },
  );

  await runtimeContainer.forwardToAliceAiGateway(request, env);
  expect(forwarded?.url).toBe(request.url);
  expect(forwarded?.headers.get("authorization")).toBe(
    "Bearer runtime-release-token-with-at-least-32-bytes",
  );
  const containerSource = readFileSync(
    new URL("../src/alice-runtime-container.ts", import.meta.url),
    "utf8",
  );
  const workerSource = readFileSync(
    new URL("../src/worker.ts", import.meta.url),
    "utf8",
  );
  expect(containerSource).toContain(
    '"alice-ai-gateway.internal": forwardToAliceAiGateway',
  );
  expect(containerSource).not.toContain("static outboundByHost =");
  expect(containerSource).toContain(
    "AliceRuntimeContainer.outboundByHost = ALICE_RUNTIME_OUTBOUND_BY_HOST",
  );
  expect(containerSource).toContain("enableInternet = false");
  expect(workerSource).toContain(
    'export { ContainerProxy } from "@cloudflare/containers"',
  );
});

const invalidAiGatewayEnvironments: Array<
  [string, (fetchBinding: (request: Request) => Promise<Response>) => unknown]
> = [
  ["the environment is null", () => null],
  ["the environment is malformed", () => "not-an-environment"],
  [
    "the release token is missing",
    (fetchBinding) => ({ ALICE_AI_GATEWAY: { fetch: fetchBinding } }),
  ],
  [
    "the release token is too short",
    (fetchBinding) => ({
      ALICE_RUNTIME_RELEASE_TOKEN: "too-short",
      ALICE_AI_GATEWAY: { fetch: fetchBinding },
    }),
  ],
  [
    "the service binding is missing",
    () => ({
      ALICE_RUNTIME_RELEASE_TOKEN:
        "runtime-release-token-with-at-least-32-bytes",
    }),
  ],
  [
    "the service binding cannot fetch",
    () => ({
      ALICE_RUNTIME_RELEASE_TOKEN:
        "runtime-release-token-with-at-least-32-bytes",
      ALICE_AI_GATEWAY: {},
    }),
  ],
];

test.each(invalidAiGatewayEnvironments)(
  "fails closed before AI egress when %s",
  (_label, buildEnvironment) => {
    let forwarded = 0;
    const env = buildEnvironment(async () => {
      forwarded += 1;
      return new Response("must-not-forward");
    });
    expect(() =>
      runtimeContainer.forwardToAliceAiGateway(
        new Request("http://alice-ai-gateway.internal/v1/chat/completions"),
        env,
      ),
    ).toThrow("ALICE_AI_GATEWAY_FORWARD_INVALID");
    expect(forwarded).toBe(0);
  },
);

test("routes the state host through the private service binding without exposing its token to the Container", async () => {
  expect(typeof (runtimeContainer as any).forwardToAliceStatePlane).toBe(
    "function",
  );
  let forwarded: Request | undefined;
  const env = {
    ALICE_STATE_PLANE_SERVICE_TOKEN:
      "state-plane-service-token-with-at-least-32-bytes",
    ALICE_STATE_PLANE: {
      async fetch(request: Request) {
        forwarded = request;
        return Response.json({ ok: true });
      },
    },
  } as any;
  const request = new Request(
    "http://alice-state-plane.internal/v1/eliza-database",
    {
      method: "POST",
      headers: {
        authorization: "Bearer container-controlled",
        cookie: "must-not-cross",
        origin: "https://attacker.invalid",
        "content-type": "application/json",
        "x-alice-state-token": "container-controlled",
      },
      body: JSON.stringify({
        operation: "eliza.load",
        ownerId: "alice-owner-production",
        cursor: null,
        limit: 500,
      }),
    },
  );

  await (runtimeContainer as any).forwardToAliceStatePlane(request, env);
  expect(forwarded?.url).toBe(request.url);
  expect(forwarded?.headers.get("x-alice-state-token")).toBe(
    "state-plane-service-token-with-at-least-32-bytes",
  );
  expect(forwarded?.headers.has("authorization")).toBe(false);
  expect(forwarded?.headers.has("cookie")).toBe(false);
  expect(forwarded?.headers.has("origin")).toBe(false);
  expect(forwarded?.headers.get("x-alice-container-state-scope")).toBe(
    "eliza-database",
  );
  expect(forwarded?.headers.get("x-alice-state-owner")).toBe(
    "alice-owner-production",
  );

  const containerSource = readFileSync(
    new URL("../src/alice-runtime-container.ts", import.meta.url),
    "utf8",
  );
  expect(containerSource).toContain(
    '"alice-state-plane.internal": forwardToAliceStatePlane',
  );
  const wrangler = JSON.parse(
    readFileSync(
      new URL("../wrangler.runtime-host.jsonc", import.meta.url),
      "utf8",
    ),
  ) as {
    secrets: { required: string[] };
    services: Array<{ binding: string; service: string }>;
  };
  expect(wrangler.secrets.required).toContain(
    "ALICE_STATE_PLANE_SERVICE_TOKEN",
  );
  expect(wrangler.services).toContainEqual({
    binding: "ALICE_STATE_PLANE",
    service: "alice-state-plane",
  });
  const hostEntrypoint = readFileSync(
    new URL("../src/runtime-host.ts", import.meta.url),
    "utf8",
  );
  expect(hostEntrypoint).toContain(
    'export { ContainerProxy } from "@cloudflare/containers";',
  );
  expect(hostEntrypoint).toContain(
    'export { AliceRuntimeContainer } from "./alice-runtime-container";',
  );
  expect(hostEntrypoint).toContain("export default {};");
  expect(hostEntrypoint).not.toContain("fetch");
});

const invalidStatePlaneEnvironments: Array<
  [string, (fetchBinding: (request: Request) => Promise<Response>) => unknown]
> = [
  ["the environment is null", () => null],
  ["the environment is malformed", () => "not-an-environment"],
  [
    "the service token is missing",
    (fetchBinding) => ({ ALICE_STATE_PLANE: { fetch: fetchBinding } }),
  ],
  [
    "the service token is too short",
    (fetchBinding) => ({
      ALICE_STATE_PLANE_SERVICE_TOKEN: "too-short",
      ALICE_STATE_PLANE: { fetch: fetchBinding },
    }),
  ],
  [
    "the service binding is missing",
    () => ({
      ALICE_STATE_PLANE_SERVICE_TOKEN:
        "state-plane-service-token-with-at-least-32-bytes",
    }),
  ],
  [
    "the service binding cannot fetch",
    () => ({
      ALICE_STATE_PLANE_SERVICE_TOKEN:
        "state-plane-service-token-with-at-least-32-bytes",
      ALICE_STATE_PLANE: {},
    }),
  ],
];

test.each(invalidStatePlaneEnvironments)(
  "fails closed before state egress when %s",
  (_label, buildEnvironment) => {
    let forwarded = 0;
    const env = buildEnvironment(async () => {
      forwarded += 1;
      return new Response("must-not-forward");
    });
    expect(() =>
      runtimeContainer.forwardToAliceStatePlane(
        new Request("http://alice-state-plane.internal/v1/eliza-database", {
          method: "POST",
          body: "{}",
        }),
        env,
      ),
    ).toThrow("ALICE_STATE_PLANE_FORWARD_INVALID");
    expect(forwarded).toBe(0);
  },
);

test("admits only owner-bound Eliza and Companion state operations", async () => {
  const forwarded: Request[] = [];
  const env = {
    ALICE_STATE_PLANE_SERVICE_TOKEN:
      "state-plane-service-token-with-at-least-32-bytes",
    ALICE_STATE_PLANE: {
      async fetch(request: Request) {
        const body = await request.clone().json() as Record<string, unknown>;
        if (body.ownerId !== request.headers.get("x-alice-state-owner")) {
          return Response.json(
            { ok: false, code: "STATE_CONTAINER_SCOPE_INVALID" },
            { status: 403 },
          );
        }
        forwarded.push(request);
        return Response.json({ ok: true });
      },
    },
  } as any;
  await (runtimeContainer as any).forwardToAliceStatePlane(
    new Request("http://alice-state-plane.internal/v1/companion-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "record.get",
        kind: "configVersion",
        recordId: "companion-stage-v1",
        ownerId: "alice-owner-production",
      }),
    }),
    env,
  );
  expect(new URL(forwarded[0]!.url).pathname).toBe("/v1/state");
  expect(forwarded[0]!.headers.get("x-alice-container-state-scope")).toBe(
    "companion-stage",
  );
  expect(forwarded[0]!.headers.get("x-alice-state-owner")).toBe(
    "alice-owner-production",
  );

  expect((await
    (runtimeContainer as any).forwardToAliceStatePlane(
      new Request("http://alice-state-plane.internal/v1/eliza-database", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "eliza.load",
          ownerId: "other-owner",
          cursor: null,
          limit: 500,
        }),
      }),
      env,
    )).status).toBe(403);

  await
    (runtimeContainer as any).forwardToAliceStatePlane(
      new Request("http://alice-state-plane.internal/v1/companion-state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "record.put",
          kind: "approvalReceipt",
          recordId: "forged-receipt",
          ownerId: "alice-owner-production",
          sessionId: "companion-production",
          payload: {},
          updatedAt: 1_777_000_000_000,
          idempotencyKey: "forged-receipt",
        }),
      }),
      env,
    );
  expect(forwarded).toHaveLength(2);

  expect(() =>
    (runtimeContainer as any).forwardToAliceStatePlane(
      new Request("http://alice-state-plane.internal/v1/arbitrary", {
        method: "POST",
        body: "{}",
      }),
      env,
    ),
  ).toThrow("ALICE_STATE_PLANE_FORWARD_INVALID");
});
