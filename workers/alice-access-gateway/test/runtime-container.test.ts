import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

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
    ALICE_DEPLOYMENT_MANIFEST_SHA256: digest("8"),
    ALICE_ELIZA_COMMIT: "9".repeat(40),
    ALICE_RUNTIME_REVISION: "49",
  });

  expect(result).toMatchObject({
    MILADY_TRUST_CLOUDFLARE_ACCESS: "1",
    MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET:
      "access-proxy-secret-with-at-least-32-bytes",
    MILADY_API_TOKEN: "runtime-api-token-with-at-least-32-bytes",
    OPENAI_API_KEY: "runtime-release-token-with-at-least-32-bytes",
    OPENAI_BASE_URL: "http://alice-ai-gateway.internal/v1",
    OPENAI_EMBEDDING_URL: "http://alice-ai-gateway.internal/v1",
    ALICE_STATE_PLANE_URL:
      "http://alice-state-plane.internal/v1/eliza-database",
    ALICE_STATE_OWNER_ID: "alice-owner-production",
    ELIZA_VAULT_PASSPHRASE: "runtime-vault-passphrase-with-at-least-32-bytes",
    ALICE_PROGRAM_DIGEST: digest("1"),
    ALICE_RELEASE_DIGEST: digest("2"),
    ALICE_RUNTIME_REVISION: "49",
  });
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
  expect(containerSource).toContain("enableInternet = false");
  expect(workerSource).toContain(
    'export { ContainerProxy } from "@cloudflare/containers"',
  );
});

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
      body: JSON.stringify({ operation: "eliza.load" }),
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

  const containerSource = readFileSync(
    new URL("../src/alice-runtime-container.ts", import.meta.url),
    "utf8",
  );
  expect(containerSource).toContain(
    '"alice-state-plane.internal": forwardToAliceStatePlane',
  );
  const wrangler = JSON.parse(
    readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
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
});

test("admits the exact Companion state route and rejects every other state-plane path", async () => {
  const paths: string[] = [];
  const env = {
    ALICE_STATE_PLANE_SERVICE_TOKEN:
      "state-plane-service-token-with-at-least-32-bytes",
    ALICE_STATE_PLANE: {
      async fetch(request: Request) {
        paths.push(new URL(request.url).pathname);
        return Response.json({ ok: true });
      },
    },
  } as any;
  await (runtimeContainer as any).forwardToAliceStatePlane(
    new Request("http://alice-state-plane.internal/v1/state", {
      method: "POST",
      body: "{}",
    }),
    env,
  );
  expect(paths).toEqual(["/v1/state"]);
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
