import { describe, expect, test } from "bun:test";

import { sha256Base64Url } from "../../alice-production-control/src/access";
import {
  buildAliceAccessEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceControlEffectiveConfig,
  encodeAliceDeploymentManifest,
} from "../../alice-effective-config.js";
import {
  buildAliceDeploymentManifest,
  digestAliceDeploymentManifest,
  serializeAliceDeploymentManifest,
} from "../../../deploy/modal/alice_deployment_manifest.mjs";
import {
  aliceTestCloudflareContinuityReadback,
  aliceTestProviderReadbacks,
  aliceTestVerifiedWorkerBundleArtifact,
} from "../../../deploy/modal/test-fixtures/alice_provider_readbacks.mjs";
import { handleRequest } from "../src/index";

const encoder = new TextEncoder();
const now = 1_787_400_000;
const ownerEmail = "alice-owner@rndrntwrk.com";
const ownerEmailSha256 = await sha256Base64Url(ownerEmail);
const providerReadbacks = aliceTestProviderReadbacks({
  accessAudience: "alice-access-audience",
  ownerEmail,
});
const binding = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};
const releaseSource = {
  sourceCommit: "4".repeat(40),
  deploymentControllerCommit: "5".repeat(40),
  runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"6".repeat(64)}`,
  runtimeBuildManifestSha256: `sha256:${"8".repeat(64)}`,
  elizaCommit: "7".repeat(40),
};
const testDeploymentManifest = await buildAliceDeploymentManifest({
  releaseEpoch: 1,
  ...releaseSource,
  capabilityBomSha256: `sha256:${"a".repeat(64)}`,
  modalRevision: 49,
  policyHash: binding.policyHash,
  rollbackBoundary: "modal:alice-runtime:v49",
  ...providerReadbacks,
  cloudflareContinuityReadback: aliceTestCloudflareContinuityReadback(),
  workerBundleArtifact: aliceTestVerifiedWorkerBundleArtifact({
    sourceCommit: releaseSource.sourceCommit,
  }),
  accessEffectiveConfig: buildAliceAccessEffectiveConfig({
    accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
    accessAudience: "alice-access-audience",
    ownerEmailSha256,
    upstreamOrigin: "https://rndrntwrk--alice.modal.run",
  }),
  controlEffectiveConfig: buildAliceControlEffectiveConfig({
    accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
    accessAudience: "alice-access-audience",
    ownerEmailSha256,
    modelDailyBudgetUnits: 10_000,
    modalRevision: 49,
    releaseAccessAudience: "alice-release-controller-audience",
    releaseServiceTokenIdSha256: "R".repeat(43),
  }),
  aiGatewayEffectiveConfig: buildAliceAiGatewayEffectiveConfig(),
});
const testDeploymentManifestBytes = serializeAliceDeploymentManifest(
  testDeploymentManifest,
);
const release = {
  ...releaseSource,
  capabilityBomSha256: testDeploymentManifest.source.capabilityBomSha256,
  modalRevision: 49,
  deploymentManifestSha256: digestAliceDeploymentManifest(
    testDeploymentManifestBytes,
  ),
};

const aliceChatBoundary = {
  schemaVersion: "alice.chat-boundary.v1",
  authorityMode: "proposer-only",
  modelInterface: "TEXT_LARGE",
  actionExecution: "disabled",
  tools: "disabled",
  services: "not-invoked",
} as const;

function modalChatResponse(
  content: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "chatcmpl-modal-test",
    object: "chat.completion",
    created: now,
    model: "alice-production",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    alice_boundary: { ...aliceChatBoundary },
    ...overrides,
  };
}

function runtimeProof(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "alice.runtime-boundary-proof.v1",
    authorityMode: "proposer-only",
    actionExecution: "disabled",
    actionPlanning: false,
    backgroundAuthorityWorkers: "absent",
    configuredPluginPackages: [
      "alice-production-response-only",
      "@elizaos/plugin-sql",
      "@elizaos/plugin-openai",
    ],
    runtimePluginNames: [
      "alice-production-response-only",
      "basic-capabilities",
      "core-security-hooks",
      "openai",
      "sql",
    ],
    actionNames: [],
    evaluatorNames: [],
    serviceTypes: [],
    taskWorkerNames: [],
    release: { ...binding, ...release, ...overrides },
  };
}

function fullRuntimeProof() {
  return {
    schemaVersion: "alice.full-runtime-boundary-proof.v1",
    authorityMode: "proposer-only",
    runtimeProfile: "full-gated",
    bridgePlugin: "eliza",
    actionPlanning: true,
    coreComposition: [
      "bridge:eliza",
      "capabilities:basic",
      "security:core-hooks",
      "memory:sql",
      "skills:agent-skills",
      "hooks:eliza",
      "connectors:eliza",
    ],
    requiredConfiguredPluginPackages: [
      "eliza",
      "@elizaos/plugin-sql",
      "@elizaos/plugin-agent-skills",
      "@elizaos/plugin-openai",
    ],
    requiredRuntimePluginNames: [
      "@elizaos/plugin-agent-skills",
      "basic-capabilities",
      "core-security-hooks",
      "eliza",
      "openai",
      "sql",
    ],
    release: { ...binding, ...release },
  };
}

function runtimeHealth(overrides: Record<string, unknown> = {}) {
  return {
    ready: true,
    runtime: "ok",
    database: "ok",
    plugins: { loaded: 3, failed: 0 },
    coordinator: "not_wired",
    connectors: {},
    uptime: 42,
    agentState: "running",
    startup: { phase: "ready", attempt: 1 },
    aliceRelease: { ...binding, ...release },
    ...overrides,
  };
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString(
    "base64url",
  );
}

async function digest(value: string): Promise<string> {
  return `sha256:${Buffer.from(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  ).toString("hex")}`;
}

async function accessFixture() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const header = { alg: "RS256", kid: "gateway-test-key", typ: "JWT" };
  const claims = {
    iss: "https://rndrntwrk.cloudflareaccess.com",
    aud: "alice-access-audience",
    sub: "owner-subject",
    email: ownerEmail,
    iat: now - 10,
    nbf: now - 10,
    exp: now + 60,
  };
  const signingInput = `${base64Url(encoder.encode(JSON.stringify(header)))}.${base64Url(
    encoder.encode(JSON.stringify(claims)),
  )}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    encoder.encode(signingInput),
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    token: `${signingInput}.${base64Url(signature)}`,
    jwks: { keys: [{ ...publicJwk, kid: header.kid, alg: "RS256", use: "sig" }] },
  };
}

type EnvironmentOptions = {
  blockingScopes?: string[];
  admissionGeneration?: number;
  admissionBinding?: typeof binding;
  admissionRelease?: typeof release;
  onControlRequest?: (request: Request) => void;
  context?: {
    existingTurn: Record<string, unknown> | null;
    recentTurns: Record<string, unknown>[];
  };
};

async function environment(options: EnvironmentOptions = {}) {
  const controlToken = "control-service-token-with-at-least-32-bytes";
  return {
    ALICE_ACCESS_ISSUER: "https://rndrntwrk.cloudflareaccess.com",
    ALICE_ACCESS_AUDIENCE: "alice-access-audience",
    ALICE_OWNER_EMAIL_SHA256: ownerEmailSha256,
    ALICE_ACCESS_PROXY_SECRET: "proxy-proof-secret-with-at-least-32-bytes",
    ALICE_MODAL_PROXY_KEY: "wk-modal-proxy-key-with-at-least-32-bytes",
    ALICE_MODAL_PROXY_SECRET: "ws-modal-proxy-secret-with-at-least-32-bytes",
    ALICE_ACCESS_CONTROL_SERVICE_TOKEN: controlToken,
    ALICE_CONTROL: {
      async fetch(input: RequestInfo | URL, init?: RequestInit) {
        const request = new Request(input, init);
        expect(request.headers.get("x-alice-service-token")).toBe(controlToken);
        options.onControlRequest?.(request.clone());
        const path = new URL(request.url).pathname;
        if (path === "/control/internal/v1/runtime/admit") {
          const blockingScopes = options.blockingScopes ?? [];
          return Response.json(
            {
              ok: blockingScopes.length === 0,
              allowed: blockingScopes.length === 0,
              code: blockingScopes.length === 0 ? "RUNTIME_ADMITTED" : "RUNTIME_PAUSED",
              blockingScopes,
              admissionGeneration: options.admissionGeneration ?? 1,
              binding: options.admissionBinding ?? binding,
              release: options.admissionRelease ?? release,
            },
            { status: blockingScopes.length === 0 ? 200 : 503 },
          );
        }
        if (path.endsWith("/conversation/context")) {
          return Response.json({
            ok: true,
            context: {
              binding,
              ...(options.context ?? { existingTurn: null, recentTurns: [] }),
            },
          });
        }
        if (path.endsWith("/conversation/turn")) {
          return Response.json({
            ok: true,
            result: { ok: true, code: "CONVERSATION_TURN_APPENDED" },
          });
        }
        return Response.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
      },
    },
    ALICE_UPSTREAM_ORIGIN: "https://rndrntwrk--alice.modal.run",
    ALICE_DEPLOYMENT_MANIFEST_SHA256: release.deploymentManifestSha256,
    ALICE_DEPLOYMENT_MANIFEST_B64: encodeAliceDeploymentManifest(
      testDeploymentManifestBytes,
    ),
    ALICE_VERSION: { id: "worker-version-test", tag: "", timestamp: "" },
  };
}

function authenticatedFetch(
  env: Awaited<ReturnType<typeof environment>>,
  jwks: { keys: JsonWebKey[] },
  handler: (request: Request) => Promise<Response>,
  proofOverrides: Record<string, unknown> = {},
  onProofRequest?: (request: Request) => void,
) {
  return async (request: Request): Promise<Response> => {
    if (request.url === `${env.ALICE_ACCESS_ISSUER}/cdn-cgi/access/certs`) {
      return Response.json(jwks);
    }
    if (new URL(request.url).pathname === "/api/alice-production/proof") {
      onProofRequest?.(request.clone());
      return Response.json(runtimeProof(proofOverrides));
    }
    return handler(request);
  };
}

describe("Alice Access gateway", () => {
  test("proxies the complete full-gated root, Companion, broadcast, and asset surfaces", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    const ownerRequests: Request[] = [];

    for (const pathname of [
      "/",
      "/companion",
      "/broadcast/alice-cam",
      "/assets/main.js",
    ]) {
      const response = await handleRequest(
        new Request(`https://alice.rndrntwrk.com${pathname}`, {
          headers: {
            authorization: "Bearer must-not-reach-runtime",
            "cf-access-jwt-assertion": token,
          },
        }),
        env,
        async (request) => {
          if (request.url === `${env.ALICE_ACCESS_ISSUER}/cdn-cgi/access/certs`) {
            return Response.json(jwks);
          }
          if (new URL(request.url).pathname === "/api/alice-production/proof") {
            return Response.json(fullRuntimeProof());
          }
          ownerRequests.push(request.clone());
          return new Response(
            pathname.startsWith("/assets/")
              ? "window.__fullMilady=true;"
              : `<html><body data-milady-surface="${pathname}"></body></html>`,
            {
              headers: {
                "content-type": pathname.startsWith("/assets/")
                  ? "application/javascript"
                  : "text/html; charset=utf-8",
                "set-cookie": "must-not-cross-gateway=1",
              },
            },
          );
        },
        now,
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toContain(
        pathname.startsWith("/assets/") ? "__fullMilady" : "data-milady-surface",
      );
      expect(response.headers.get("set-cookie")).toBeNull();
    }

    expect(ownerRequests.map((request) => new URL(request.url).pathname)).toEqual([
      "/",
      "/companion",
      "/broadcast/alice-cam",
      "/assets/main.js",
    ]);
    for (const request of ownerRequests) {
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("cf-access-jwt-assertion")).toBeNull();
    }
  });

  test("proxies only the reviewed full-gated Companion and broadcast API surface", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();

    for (const [method, pathname] of [
      ["GET", "/api/auth/status"],
      ["GET", "/api/config"],
      ["GET", "/api/memories/feed?limit=10"],
      ["GET", "/api/companion/stage"],
      ["GET", "/api/broadcast/alice-cam/scene"],
      ["POST", "/api/companion/stage"],
    ]) {
      const response = await handleRequest(
        new Request(`https://alice.rndrntwrk.com${pathname}`, {
          method,
          headers: {
            "cf-access-jwt-assertion": token,
            "content-type": "application/json",
            origin: "https://alice.rndrntwrk.com",
          },
          ...(method === "POST" ? { body: '{"scene":"studio"}' } : {}),
        }),
        env,
        async (request) => {
          if (request.url === `${env.ALICE_ACCESS_ISSUER}/cdn-cgi/access/certs`) {
            return Response.json(jwks);
          }
          if (new URL(request.url).pathname === "/api/alice-production/proof") {
            return Response.json(fullRuntimeProof());
          }
          expect(request.headers.get("authorization")).toBeNull();
          expect(request.headers.get("cf-access-jwt-assertion")).toBeNull();
          return Response.json({ ok: true, pathname, method });
        },
        now,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, pathname, method });
    }
  });

  test("denies unreviewed full-gated read and write routes before runtime ingress", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    for (const [method, pathname] of [
      ["GET", "/api/sandbox/browser"],
      ["GET", "/api/unreviewed/read"],
      ["POST", "/api/unreviewed/execute"],
    ]) {
      let runtimeRequests = 0;
      const response = await handleRequest(
        new Request(`https://alice.rndrntwrk.com${pathname}`, {
          method,
          headers: {
            "cf-access-jwt-assertion": token,
            "content-type": "application/json",
            origin: "https://alice.rndrntwrk.com",
          },
          ...(method === "POST" ? { body: "{}" } : {}),
        }),
        env,
        async (request) => {
          if (request.url === `${env.ALICE_ACCESS_ISSUER}/cdn-cgi/access/certs`) {
            return Response.json(jwks);
          }
          runtimeRequests += 1;
          return Response.json(fullRuntimeProof());
        },
        now,
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        ok: false,
        code: "ALICE_PRODUCTION_MUTATION_DENIED",
      });
      expect(runtimeRequests).toBe(0);
    }
  });

  test("rejects non-exact full-profile proof inventories and profile case variants", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();

    for (const proof of [
      {
        ...fullRuntimeProof(),
        requiredConfiguredPluginPackages: ["eliza", {}, "@elizaos/plugin-sql"],
      },
      {
        ...fullRuntimeProof(),
        requiredConfiguredPluginPackages: [
          "eliza",
          "@elizaos/plugin-sql",
          "@elizaos/plugin-openai",
        ],
      },
      {
        ...fullRuntimeProof(),
        requiredConfiguredPluginPackages: [
          ...fullRuntimeProof().requiredConfiguredPluginPackages,
          "@elizaos/plugin-unreviewed",
        ],
      },
      {
        ...fullRuntimeProof(),
        requiredConfiguredPluginPackages: [
          "eliza",
          "@elizaos/plugin-sql",
          "@elizaos/plugin-agent-skills",
          "@elizaos/plugin-agent-skills",
        ],
      },
      {
        ...fullRuntimeProof(),
        requiredConfiguredPluginPackages: [
          "@elizaos/plugin-sql",
          "eliza",
          "@elizaos/plugin-agent-skills",
          "@elizaos/plugin-openai",
        ],
      },
      {
        ...fullRuntimeProof(),
        requiredRuntimePluginNames: ["core-security-hooks", "eliza", "sql"],
      },
      {
        ...fullRuntimeProof(),
        requiredRuntimePluginNames: [
          ...fullRuntimeProof().requiredRuntimePluginNames,
          "unreviewed-runtime-plugin",
        ],
      },
      { ...fullRuntimeProof(), runtimeProfile: "FULL-GATED" },
    ]) {
      let ownerRequests = 0;
      const response = await handleRequest(
        new Request("https://alice.rndrntwrk.com/", {
          headers: { "cf-access-jwt-assertion": token },
        }),
        env,
        async (request) => {
          if (request.url === `${env.ALICE_ACCESS_ISSUER}/cdn-cgi/access/certs`) {
            return Response.json(jwks);
          }
          if (new URL(request.url).pathname === "/api/alice-production/proof") {
            return Response.json(proof);
          }
          ownerRequests += 1;
          return new Response("unsafe");
        },
        now,
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        ok: false,
        code: "RUNTIME_RELEASE_MISMATCH",
      });
      expect(ownerRequests).toBe(0);
    }
  });

  test("requires a verified JWT for the exact owner before any upstream request", async () => {
    const env = await environment();
    let calls = 0;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/api/health"),
      env,
      async () => {
        calls += 1;
        return Response.json({ unreachable: true });
      },
      now,
    );
    expect(response.status).toBe(401);
    expect(calls).toBe(0);
  });

  test("rejects a one-field effective Access configuration substitution before ingress", async () => {
    const env = await environment();
    env.ALICE_UPSTREAM_ORIGIN = "https://rndrntwrk--alice-substituted.modal.run";
    let calls = 0;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/api/health"),
      env,
      async () => {
        calls += 1;
        return Response.json({ unreachable: true });
      },
      now,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "ACCESS_GATEWAY_FAIL_CLOSED",
    });
    expect(calls).toBe(0);
  });

  test("uses an explicit outbound header allowlist for proof and owner proxy requests", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    const seen: Request[] = [];
    const proofRequests: Request[] = [];
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/api/health", {
        headers: {
          authorization: "Bearer must-not-reach-modal",
          cookie: "CF_Authorization=must-not-reach-modal",
          "cf-access-jwt-assertion": token,
          "cf-access-client-id": "must-not-reach-modal",
          "cf-access-client-secret": "must-not-reach-modal",
          "x-api-key": "must-not-reach-modal",
          "x-eliza-token": "must-not-reach-modal",
          "x-eliza-export-token": "must-not-reach-modal",
          "x-eliza-terminal-token": "must-not-reach-modal",
          "x-private-secret": "must-not-reach-modal",
          "x-milady-cloudflare-access-secret": "attacker-value",
          "modal-key": "wk-attacker-value-must-not-reach-modal",
          "modal-secret": "ws-attacker-value-must-not-reach-modal",
          accept: "application/json",
        },
      }),
      env,
      authenticatedFetch(
        env,
        jwks,
        async (request) => {
          seen.push(request);
          return Response.json(runtimeHealth(), {
            headers: {
              "set-cookie": "subordinate=must-not-cross-access",
              location: "https://attacker.example/redirect",
              "access-control-allow-origin": "*",
              "x-upstream-control": "must-not-cross-access",
            },
          });
        },
        {},
        (request) => proofRequests.push(request),
      ),
      now,
    );
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://rndrntwrk--alice.modal.run/api/health");
    expect(seen[0]!.headers.get("authorization")).toBeNull();
    expect(seen[0]!.headers.get("cookie")).toBeNull();
    expect(seen[0]!.headers.get("cf-access-jwt-assertion")).toBeNull();
    expect(proofRequests).toHaveLength(2);
    for (const outbound of [...proofRequests, seen[0]!]) {
      for (const name of [
        "authorization",
        "cookie",
        "cf-access-jwt-assertion",
        "cf-access-client-id",
        "cf-access-client-secret",
        "x-api-key",
        "x-eliza-token",
        "x-eliza-export-token",
        "x-eliza-terminal-token",
        "x-private-secret",
      ]) {
        expect(outbound.headers.get(name)).toBeNull();
      }
      expect(outbound.headers.get("accept")).toBe("application/json");
      expect(outbound.headers.get("modal-key")).toBe(env.ALICE_MODAL_PROXY_KEY);
      expect(outbound.headers.get("modal-secret")).toBe(
        env.ALICE_MODAL_PROXY_SECRET,
      );
      expect(outbound.headers.get("x-milady-cloudflare-access-secret")).toBe(
        env.ALICE_ACCESS_PROXY_SECRET,
      );
    }
    expect(seen[0]!.headers.get("cf-access-authenticated-user-email")).toBe(
      "alice-owner-verified.invalid",
    );
    expect(seen[0]!.headers.get("x-milady-cloudflare-access-secret")).toBe(
      env.ALICE_ACCESS_PROXY_SECRET,
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("x-upstream-control")).toBeNull();
    expect(await response.json()).toEqual({
      ok: true,
      ready: true,
      agentState: "running",
      runtime: "ok",
      release: { ...binding, ...release },
    });
  });

  test("rejects broadened safe-read schemas and every preflight method", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    let ownerCalls = 0;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/api/health", {
        headers: { "cf-access-jwt-assertion": token },
      }),
      env,
      authenticatedFetch(env, jwks, async () => {
        ownerCalls += 1;
        return Response.json(runtimeHealth({ injected: "unsafe" }));
      }),
      now,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "RUNTIME_READ_INVALID",
    });
    expect(ownerCalls).toBe(1);

    for (const pathname of ["/api/health", "/api/emotes", "/v1/models"]) {
      const preflight = await handleRequest(
        new Request(`https://alice.rndrntwrk.com${pathname}`, {
          method: "OPTIONS",
          headers: { "cf-access-jwt-assertion": token },
        }),
        env,
        authenticatedFetch(env, jwks, async () => {
          throw new Error("OPTIONS must not reach Modal");
        }),
        now,
      );
      expect(preflight.status).toBe(403);
    }
  });

  test("does not expose arbitrary legacy static paths through the owner surface", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    const seen: Request[] = [];
    const runtimeToken = `MILADY_API_TOKEN=${env.ALICE_ACCESS_PROXY_SECRET}`;
    for (const path of [
      "/foo",
      "//foo",
      "/%2f%2ffoo/credential-probe",
      "/%2e%2e/foo",
    ]) {
      const response = await handleRequest(
        new Request(`https://alice.rndrntwrk.com${path}`, {
          headers: { "cf-access-jwt-assertion": token },
        }),
        env,
        authenticatedFetch(env, jwks, async (request) => {
          seen.push(request);
          return new Response(`<html>${runtimeToken}</html>`);
        }),
        now,
      );

      expect(response.status).toBe(403);
      const body = await response.text();
      expect(body).not.toContain("MILADY_API_TOKEN");
      expect(body).not.toContain(env.ALICE_ACCESS_PROXY_SECRET);
      expect(JSON.parse(body)).toMatchObject({
        ok: false,
        code: "ALICE_PRODUCTION_MUTATION_DENIED",
      });
    }
    expect(seen).toHaveLength(0);
  });

  test("serves the approved nonce-CSP durable chat UI with exact release fingerprints", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    let ownerProxyCalls = 0;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/", {
        headers: { "cf-access-jwt-assertion": token },
      }),
      env,
      authenticatedFetch(env, jwks, async () => {
        ownerProxyCalls += 1;
        return new Response("legacy dashboard");
      }),
      now,
    );

    expect(response.status).toBe(200);
    expect(ownerProxyCalls).toBe(0);
    expect(response.headers.get("content-type")).toContain("text/html");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    const nonce = csp.match(/script-src 'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    const html = await response.text();
    expect(html).toContain("Alice Production Core");
    expect(html).toContain("/v1/chat/completions");
    expect(html).toContain('id="alice-chat"');
    expect(html).toContain('id="alice-transcript"');
    expect(html).toContain(`nonce="${nonce}"`);
    expect(html).toContain(`data-program-digest="${binding.programDigest}"`);
    expect(html).toContain(`data-release-digest="${binding.releaseDigest}"`);
    expect(html).toContain(`data-policy-hash="${binding.policyHash}"`);
    expect(html).toContain(
      `data-deployment-manifest-sha256="${env.ALICE_DEPLOYMENT_MANIFEST_SHA256}"`,
    );
    expect(html).toContain(
      `data-access-config-sha256="${testDeploymentManifest.cloudflare.accessConfigSha256}"`,
    );
    expect(html).toContain(
      `data-access-policy-config-sha256="${testDeploymentManifest.cloudflare.accessPolicyConfigSha256}"`,
    );
    expect(html).not.toContain("/api/conversations");
    expect(html).not.toContain("innerHTML");
    expect(html).not.toContain("<link");
    expect(html).not.toContain("/assets/");
  });

  test("serves exact gateway provenance only after owner authentication", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/__alice_gateway/healthz", {
        headers: { "cf-access-jwt-assertion": token },
      }),
      env,
      authenticatedFetch(env, jwks, async () => {
        throw new Error("gateway health must not proxy the owner request");
      }),
      now,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      service: "alice-access-gateway",
      deploymentManifestSha256: env.ALICE_DEPLOYMENT_MANIFEST_SHA256,
    });
  });

  test("fails closed before Modal ingress when PAUSE_MODAL or PAUSE_RELEASE is active", async () => {
    for (const scope of ["modal", "release"]) {
      const env = await environment({ blockingScopes: [scope] });
      const { token, jwks } = await accessFixture();
      let upstreamCalls = 0;
      const response = await handleRequest(
        new Request("https://alice.rndrntwrk.com/api/health", {
          headers: { "cf-access-jwt-assertion": token },
        }),
        env,
        async (request) => {
          if (request.url === `${env.ALICE_ACCESS_ISSUER}/cdn-cgi/access/certs`) {
            return Response.json(jwks);
          }
          upstreamCalls += 1;
          return Response.json({ unsafe: true });
        },
        now,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        ok: false,
        code: "RUNTIME_PAUSED",
        blockingScopes: [scope],
      });
      expect(upstreamCalls).toBe(0);
    }
  });

  test("persists an authenticated response-only chat turn in Cloudflare before returning it", async () => {
    const controlRequests: Request[] = [];
    const env = await environment({
      onControlRequest: (request) => controlRequests.push(request),
    });
    const { token, jwks } = await accessFixture();
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": token,
          "content-type": "application/json",
          origin: "https://alice.rndrntwrk.com",
          "x-alice-session-id": "owner-primary",
        },
        body: JSON.stringify({
          model: "alice-production",
          messages: [{ role: "user", content: "Are you online?" }],
        }),
      }),
      env,
      authenticatedFetch(env, jwks, async (request) => {
        expect(request.headers.get("x-alice-session-id")).toBeNull();
        return Response.json(modalChatResponse("Alice is online."), {
          headers: {
            "set-cookie": "authority=must-not-cross-access",
            location: "https://attacker.example/redirect",
            "access-control-allow-origin": "*",
            "x-upstream-control": "must-not-cross-access",
          },
        });
      }),
      now,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-alice-durable-session-id")).toBe("owner-primary");
    expect(response.headers.get("x-alice-durable-turn-id")).toMatch(/^turn-[a-f0-9]{64}$/);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-expose-headers")).toBeNull();
    expect(response.headers.get("x-upstream-control")).toBeNull();
    expect(await response.clone().json()).toEqual({
      id: expect.stringMatching(/^chatcmpl-[a-f0-9]{1,36}$/),
      object: "chat.completion",
      created: expect.any(Number),
      model: "alice-production",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Alice is online." },
          finish_reason: "stop",
        },
      ],
      alice_boundary: aliceChatBoundary,
    });
    const persistRequest = controlRequests.find((request) =>
      new URL(request.url).pathname.endsWith("/conversation/turn"),
    );
    expect(persistRequest).toBeDefined();
    expect(await persistRequest!.json()).toMatchObject({
      expectedAdmission: {
        binding,
        deploymentManifestSha256: release.deploymentManifestSha256,
        admissionGeneration: 1,
      },
      record: {
        turnId: response.headers.get("x-alice-durable-turn-id"),
        userText: "Are you online?",
        assistantText: "Alice is online.",
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        responseHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    });
  });

  test("persists a full-gated normal runtime chat response without inventing a response-only boundary", async () => {
    const controlRequests: Request[] = [];
    const env = await environment({
      onControlRequest: (request) => controlRequests.push(request),
    });
    const { token, jwks } = await accessFixture();
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": token,
          "content-type": "application/json",
          origin: "https://alice.rndrntwrk.com",
          "x-alice-session-id": "owner-primary",
        },
        body: JSON.stringify({
          model: "alice-production",
          messages: [{ role: "user", content: "Use the normal runtime." }],
        }),
      }),
      env,
      async (request) => {
        if (request.url === `${env.ALICE_ACCESS_ISSUER}/cdn-cgi/access/certs`) {
          return Response.json(jwks);
        }
        if (new URL(request.url).pathname === "/api/alice-production/proof") {
          return Response.json(fullRuntimeProof());
        }
        return Response.json({
          id: "chatcmpl-full-runtime",
          object: "chat.completion",
          created: now,
          model: "alice-production",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Normal runtime reached." },
              finish_reason: "stop",
            },
          ],
        });
      },
      now,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: expect.stringMatching(/^chatcmpl-[a-f0-9]{1,36}$/),
      object: "chat.completion",
      created: expect.any(Number),
      model: "alice-production",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Normal runtime reached." },
          finish_reason: "stop",
        },
      ],
    });
    const persistRequest = controlRequests.find((request) =>
      new URL(request.url).pathname.endsWith("/conversation/turn"),
    );
    expect(persistRequest).toBeDefined();
  });

  test("rejects any non-exact proposer-only boundary before durable persistence", async () => {
    for (const boundary of [
      { ...aliceChatBoundary, actionExecution: "enabled" },
      { ...aliceChatBoundary, actionClaim: "published" },
    ]) {
      const controlRequests: Request[] = [];
      const env = await environment({
        onControlRequest: (request) => controlRequests.push(request),
      });
      const { token, jwks } = await accessFixture();
      const response = await handleRequest(
        new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "cf-access-jwt-assertion": token,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "Keep this action-free." }],
          }),
        }),
        env,
        authenticatedFetch(env, jwks, async () =>
          Response.json(
            modalChatResponse("Unsafe boundary.", {
              alice_boundary: boundary,
            }),
          ),
        ),
        now,
      );
      expect(response.status).toBe(503);
      expect(
        controlRequests.some((request) =>
          new URL(request.url).pathname.endsWith("/conversation/turn"),
        ),
      ).toBe(false);
    }
  });

  test("rejects tool, function, and action fields in an otherwise textual completion", async () => {
    const unsafeBodies = [
      modalChatResponse("Tool call hidden beside text.", {
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Tool call hidden beside text.",
              tool_calls: [{ id: "call-1", type: "function" }],
            },
            finish_reason: "stop",
          },
        ],
      }),
      modalChatResponse("Function call hidden beside text.", {
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Function call hidden beside text.",
              function_call: { name: "publish" },
            },
            finish_reason: "stop",
          },
        ],
      }),
      { ...modalChatResponse("Action claim."), actionExecution: "enabled" },
    ];
    for (const unsafeBody of unsafeBodies) {
      const controlRequests: Request[] = [];
      const env = await environment({
        onControlRequest: (request) => controlRequests.push(request),
      });
      const { token, jwks } = await accessFixture();
      const response = await handleRequest(
        new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "cf-access-jwt-assertion": token,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "Return plain text only." }],
          }),
        }),
        env,
        authenticatedFetch(env, jwks, async () => Response.json(unsafeBody)),
        now,
      );
      expect(response.status).toBe(503);
      expect(
        controlRequests.some((request) =>
          new URL(request.url).pathname.endsWith("/conversation/turn"),
        ),
      ).toBe(false);
    }
  });

  test("rejects a completed inference if the admitted release changes before persistence", async () => {
    const state: EnvironmentOptions = {
      admissionGeneration: 1,
      blockingScopes: [],
    };
    const controlRequests: Request[] = [];
    state.onControlRequest = (request) => controlRequests.push(request);
    const env = await environment(state);
    const { token, jwks } = await accessFixture();
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": token,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Do not persist across releases." }],
        }),
      }),
      env,
      authenticatedFetch(env, jwks, async () => {
        state.admissionGeneration = 2;
        state.admissionBinding = {
          ...binding,
          programDigest: `sha256:${"b".repeat(64)}`,
          releaseDigest: `sha256:${"c".repeat(64)}`,
        };
        state.admissionRelease = {
          ...release,
          deploymentManifestSha256: `sha256:${"d".repeat(64)}`,
          modalRevision: 50,
        };
        return Response.json(modalChatResponse("Old release response."));
      }),
      now,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "RUNTIME_ADMISSION_CHANGED",
    });
    expect(
      controlRequests.some((request) =>
        new URL(request.url).pathname.endsWith("/conversation/turn"),
      ),
    ).toBe(false);
  });

  test("rejects a completed inference if PAUSE_ALL closes before persistence", async () => {
    const state: EnvironmentOptions = {
      admissionGeneration: 1,
      blockingScopes: [],
    };
    const controlRequests: Request[] = [];
    state.onControlRequest = (request) => controlRequests.push(request);
    const env = await environment(state);
    const { token, jwks } = await accessFixture();
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": token,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Pause this before commit." }],
        }),
      }),
      env,
      authenticatedFetch(env, jwks, async () => {
        state.blockingScopes!.push("all");
        return Response.json(modalChatResponse("Paused response."));
      }),
      now,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "RUNTIME_PAUSED",
      blockingScopes: ["all"],
    });
    expect(
      controlRequests.some((request) =>
        new URL(request.url).pathname.endsWith("/conversation/turn"),
      ),
    ).toBe(false);
  });

  test("rejects a completed inference if Modal changes release before persistence", async () => {
    const controlRequests: Request[] = [];
    const env = await environment({
      onControlRequest: (request) => controlRequests.push(request),
    });
    const { token, jwks } = await accessFixture();
    let proofCalls = 0;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": token,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Do not persist stale Modal output." }],
        }),
      }),
      env,
      async (request) => {
        if (request.url === `${env.ALICE_ACCESS_ISSUER}/cdn-cgi/access/certs`) {
          return Response.json(jwks);
        }
        if (new URL(request.url).pathname === "/api/alice-production/proof") {
          proofCalls += 1;
          return Response.json(
            runtimeProof(
              proofCalls === 1
                ? {}
                : { runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"0".repeat(64)}` },
            ),
          );
        }
        return Response.json(modalChatResponse("Stale release response."));
      },
      now,
    );
    expect(proofCalls).toBe(2);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "RUNTIME_RELEASE_MISMATCH",
    });
    expect(
      controlRequests.some((request) =>
        new URL(request.url).pathname.endsWith("/conversation/turn"),
      ),
    ).toBe(false);
  });

  test("drops client framing and Host headers when durable chat rewrites the body", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    let forwarded: Request | null = null;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": token,
          "content-type": "application/json",
          "content-length": "1",
          "transfer-encoding": "chunked",
          connection: "close",
          host: "attacker.example",
        },
        body: JSON.stringify({
          model: "alice-production",
          messages: [{ role: "user", content: "Rewrite this request safely." }],
        }),
      }),
      env,
      authenticatedFetch(env, jwks, async (request) => {
        forwarded = request;
        return Response.json(modalChatResponse("Safely rewritten."));
      }),
      now,
    );

    expect(response.status).toBe(200);
    expect(forwarded).not.toBeNull();
    expect(forwarded!.headers.get("content-length")).toBeNull();
    expect(forwarded!.headers.get("transfer-encoding")).toBeNull();
    expect(forwarded!.headers.get("connection")).toBeNull();
    expect(forwarded!.headers.get("host")).toBeNull();
    expect((await forwarded!.json()).messages[0].content).toContain(
      "Rewrite this request safely.",
    );
  });

  test("restores bounded Cloudflare transcript context into a fresh Modal request", async () => {
    const env = await environment({
      context: {
        existingTurn: null,
        recentTurns: [
          {
            turnId: "turn-prior-0001",
            userText: "Remember the blue marker.",
            assistantText: "I will retain that in the durable transcript.",
            requestHash: `sha256:${"8".repeat(64)}`,
            responseHash: `sha256:${"9".repeat(64)}`,
            recordedAt: 1_787_399_000_000,
          },
        ],
      },
    });
    const { token, jwks } = await accessFixture();
    let forwardedBody: Record<string, any> | null = null;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": token,
          "content-type": "application/json",
          "x-alice-session-id": "owner-primary",
        },
        body: JSON.stringify({
          model: "alice-production",
          messages: [{ role: "user", content: "What marker did I name?" }],
        }),
      }),
      env,
      authenticatedFetch(env, jwks, async (request) => {
        forwardedBody = await request.json();
        return Response.json(modalChatResponse("The blue marker."));
      }),
      now,
    );
    expect(response.status).toBe(200);
    expect(forwardedBody?.messages).toHaveLength(1);
    expect(forwardedBody?.messages?.[0]?.content).toContain("Remember the blue marker.");
    expect(forwardedBody?.messages?.[0]?.content).toContain("What marker did I name?");
  });

  test("replays an existing deterministic turn without invoking the model again", async () => {
    const requestBody = JSON.stringify({
      model: "alice-production",
      messages: [{ role: "user", content: "Retry-safe question" }],
    });
    const requestHash = await digest(requestBody);
    const turnHash = await digest(`owner-primary\0${requestHash}`);
    const turnId = `turn-${turnHash.slice("sha256:".length)}`;
    const env = await environment({
      context: {
        existingTurn: {
          turnId,
          userText: "Retry-safe question",
          assistantText: "Previously committed response.",
          requestHash,
          responseHash: `sha256:${"f".repeat(64)}`,
          recordedAt: 1_787_399_000_000,
        },
        recentTurns: [],
      },
    });
    const { token, jwks } = await accessFixture();
    let modelCalls = 0;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": token,
          "content-type": "application/json",
          "x-alice-session-id": "owner-primary",
        },
        body: requestBody,
      }),
      env,
      authenticatedFetch(env, jwks, async () => {
        modelCalls += 1;
        return Response.json({ unsafe: true });
      }),
      now,
    );
    expect(response.status).toBe(200);
    expect(modelCalls).toBe(0);
    expect(response.headers.get("x-alice-durable-turn-id")).toBe(turnId);
    expect(await response.json()).toMatchObject({
      choices: [{ message: { content: "Previously committed response." } }],
    });
  });

  test("rechecks PAUSE_ALL after Session context load before returning a replay", async () => {
    const requestBody = JSON.stringify({
      model: "alice-production",
      messages: [{ role: "user", content: "Replay only while admitted" }],
    });
    const requestHash = await digest(requestBody);
    const turnHash = await digest(`owner-primary\0${requestHash}`);
    const turnId = `turn-${turnHash.slice("sha256:".length)}`;
    const blockingScopes: string[] = [];
    const env = await environment({
      blockingScopes,
      onControlRequest(request) {
        if (new URL(request.url).pathname.endsWith("/conversation/context")) {
          blockingScopes.push("all");
        }
      },
      context: {
        existingTurn: {
          turnId,
          userText: "Replay only while admitted",
          assistantText: "Previously committed response.",
          requestHash,
          responseHash: `sha256:${"f".repeat(64)}`,
          recordedAt: 1_787_399_000_000,
        },
        recentTurns: [],
      },
    });
    const { token, jwks } = await accessFixture();
    let modelCalls = 0;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": token,
          "content-type": "application/json",
          "x-alice-session-id": "owner-primary",
        },
        body: requestBody,
      }),
      env,
      authenticatedFetch(env, jwks, async () => {
        modelCalls += 1;
        return Response.json({ unsafe: true });
      }),
      now,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "RUNTIME_PAUSED",
      blockingScopes: ["all"],
    });
    expect(modelCalls).toBe(0);
  });

  test("rejects SSE negotiation before inference because core v1 persists only complete turns", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    let chatCalls = 0;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "cf-access-jwt-assertion": token,
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: "alice-production",
          stream: false,
          messages: [{ role: "user", content: "Do not stream this." }],
        }),
      }),
      env,
      authenticatedFetch(env, jwks, async () => {
        chatCalls += 1;
        return Response.json({ unsafe: true });
      }),
      now,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "ALICE_DURABLE_CHAT_INVALID",
    });
    expect(chatCalls).toBe(0);
  });

  test("fails closed before owner traffic when Modal proof mismatches the signed release", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    let ownerPathCalls = 0;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/api/health", {
        headers: { "cf-access-jwt-assertion": token },
      }),
      env,
      authenticatedFetch(
        env,
        jwks,
        async () => {
          ownerPathCalls += 1;
          return Response.json({ unsafe: true });
        },
        { runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"0".repeat(64)}` },
      ),
      now,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "RUNTIME_RELEASE_MISMATCH",
    });
    expect(ownerPathCalls).toBe(0);
  });

  test("fails closed before owner traffic when Modal omits an inert framework plugin", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    let ownerPathCalls = 0;
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/api/health", {
        headers: { "cf-access-jwt-assertion": token },
      }),
      env,
      async (request) => {
        if (request.url === `${env.ALICE_ACCESS_ISSUER}/cdn-cgi/access/certs`) {
          return Response.json(jwks);
        }
        if (new URL(request.url).pathname === "/api/alice-production/proof") {
          return Response.json({
            ...runtimeProof(),
            runtimePluginNames: [
              "alice-production-response-only",
              "basic-capabilities",
              "openai",
              "sql",
            ],
          });
        }
        ownerPathCalls += 1;
        return Response.json({ unsafe: true });
      },
      now,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "RUNTIME_RELEASE_MISMATCH",
    });
    expect(ownerPathCalls).toBe(0);
  });

  test("fails closed when Modal reports a different runtime build manifest", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/api/health", {
        headers: { "cf-access-jwt-assertion": token },
      }),
      env,
      authenticatedFetch(
        env,
        jwks,
        async () => Response.json({ unsafe: true }),
        { runtimeBuildManifestSha256: `sha256:${"0".repeat(64)}` },
      ),
      now,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "RUNTIME_RELEASE_MISMATCH",
    });
  });

  test("fails closed when Modal reports a different capability BOM", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/api/health", {
        headers: { "cf-access-jwt-assertion": token },
      }),
      env,
      authenticatedFetch(
        env,
        jwks,
        async () => Response.json({ unsafe: true }),
        { capabilityBomSha256: `sha256:${"0".repeat(64)}` },
      ),
      now,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "RUNTIME_RELEASE_MISMATCH",
    });
  });

  test("fails closed when Modal reports a different deployment receipt", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    const response = await handleRequest(
      new Request("https://alice.rndrntwrk.com/api/health", {
        headers: { "cf-access-jwt-assertion": token },
      }),
      env,
      authenticatedFetch(
        env,
        jwks,
        async () => Response.json({ unsafe: true }),
        { deploymentManifestSha256: `sha256:${"0".repeat(64)}` },
      ),
      now,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "RUNTIME_RELEASE_MISMATCH",
    });
  });

  test("rejects cross-origin preflight and unsafe requests before proxying", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    let upstreamCalls = 0;
    const fetchImpl = async (request: Request) => {
      if (request.url === `${env.ALICE_ACCESS_ISSUER}/cdn-cgi/access/certs`) {
        return Response.json(jwks);
      }
      upstreamCalls += 1;
      return Response.json({ unsafe: true });
    };

    for (const method of ["OPTIONS", "POST"]) {
      const response = await handleRequest(
        new Request("https://alice.rndrntwrk.com/api/plugins/install", {
          method,
          headers: {
            origin: "https://attacker.example",
            "cf-access-jwt-assertion": token,
          },
        }),
        env,
        fetchImpl,
        now,
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        ok: false,
        code: "ALICE_ACCESS_ORIGIN_DENIED",
      });
    }
    expect(upstreamCalls).toBe(0);
  });

  test("denies high-risk and mutable API surfaces at Access before Modal", async () => {
    const env = await environment();
    const { token, jwks } = await accessFixture();
    const seen: Request[] = [];
    for (const [method, pathname] of [
      ["POST", "/api/conversations"],
      ["POST", "/api/wallet/trade/execute"],
      ["POST", "/api/plugins/install"],
      ["POST", "/api/stream/start"],
      ["POST", "/api/terminal/run"],
      ["GET", "/api/wallet/keys"],
      ["GET", "/broadcast/alice-cam"],
      ["GET", "/ws"],
    ]) {
      const response = await handleRequest(
        new Request(`https://alice.rndrntwrk.com${pathname}`, {
          method,
          headers: {
            origin: "https://alice.rndrntwrk.com",
            "cf-access-jwt-assertion": token,
            "content-type": "application/json",
          },
          ...(method === "POST" ? { body: "{}" } : {}),
        }),
        env,
        authenticatedFetch(env, jwks, async (request) => {
          seen.push(request);
          return Response.json({ unsafe: true });
        }),
        now,
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        ok: false,
        code: "ALICE_PRODUCTION_MUTATION_DENIED",
      });
    }
    expect(seen).toHaveLength(0);
  });
});
