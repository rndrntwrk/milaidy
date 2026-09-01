import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildAliceAccessEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceConnectorPlaneEffectiveConfig,
  buildAliceControlEffectiveConfig,
  buildAliceStatePlaneEffectiveConfig,
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

import worker from "./index.mjs";

const TOKEN = "alice-gateway-test-token-32-bytes";
const CONTROL_TOKEN = "alice-control-test-token-at-least-32-bytes";
const RELEASE_BINDING = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};
const providerReadbacks = aliceTestProviderReadbacks({
  accessAudience: "alice-access-audience",
});
const TEST_DEPLOYMENT_MANIFEST = await buildAliceDeploymentManifest({
  releaseEpoch: 1,
  sourceCommit: "4".repeat(40),
  deploymentControllerCommit: "5".repeat(40),
  elizaCommit: "6".repeat(40),
  runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"7".repeat(64)}`,
  runtimeBuildManifestSha256: `sha256:${"8".repeat(64)}`,
  capabilityBomSha256: `sha256:${"9".repeat(64)}`,
  modalRevision: 49,
  policyHash: RELEASE_BINDING.policyHash,
  rollbackBoundary: "modal:alice-runtime:v49",
  ...providerReadbacks,
  cloudflareContinuityReadback: aliceTestCloudflareContinuityReadback(),
  workerBundleArtifact: aliceTestVerifiedWorkerBundleArtifact({
    sourceCommit: "4".repeat(40),
  }),
  accessEffectiveConfig: buildAliceAccessEffectiveConfig({
    accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
    accessAudience: "alice-access-audience",
    ownerEmailSha256: providerReadbacks.accessPolicyReadback.ownerEmailSha256,
    upstreamOrigin: "https://rndrntwrk--alice.modal.run",
  }),
  controlEffectiveConfig: buildAliceControlEffectiveConfig({
    accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
    accessAudience: "alice-access-audience",
    ownerEmailSha256: providerReadbacks.accessPolicyReadback.ownerEmailSha256,
    modelDailyBudgetUnits: 10_000,
    modalRevision: 49,
    releaseAccessAudience: "alice-release-controller-audience",
    releaseServiceTokenIdSha256: "R".repeat(43),
  }),
  aiGatewayEffectiveConfig: buildAliceAiGatewayEffectiveConfig(),
  statePlaneEffectiveConfig: buildAliceStatePlaneEffectiveConfig({
    databaseId: "11111111-2222-3333-4444-555555555555",
  }),
  connectorPlaneEffectiveConfig: buildAliceConnectorPlaneEffectiveConfig({
    providerActivation: "disabled",
  }),
});
const TEST_DEPLOYMENT_MANIFEST_BYTES = serializeAliceDeploymentManifest(
  TEST_DEPLOYMENT_MANIFEST,
);
const TEST_DEPLOYMENT_MANIFEST_SHA256 = digestAliceDeploymentManifest(
  TEST_DEPLOYMENT_MANIFEST_BYTES,
);
const RUNTIME_RELEASE_TOKEN_SHA256 = `sha256:${createHash("sha256")
  .update(`${RELEASE_BINDING.releaseDigest}:${TOKEN}`)
  .digest("hex")}`;

function jsonRequest(path, body, headers = {}) {
  return new Request(`https://alice-ai.example.test${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      "x-alice-request-id": "request-gateway-test-0001",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createEnv(options = {}) {
  const directCalls = [];
  const controlCalls = [];
  let gatewayCalls = 0;

  const env = {
    ALICE_RUNTIME_RELEASE_TOKEN_SHA256:
      options.runtimeReleaseTokenSha256 ?? RUNTIME_RELEASE_TOKEN_SHA256,
    ALICE_AI_CONTROL_SERVICE_TOKEN: CONTROL_TOKEN,
    ALICE_DEPLOYMENT_MANIFEST_SHA256: TEST_DEPLOYMENT_MANIFEST_SHA256,
    ALICE_DEPLOYMENT_MANIFEST_B64: encodeAliceDeploymentManifest(
      TEST_DEPLOYMENT_MANIFEST_BYTES,
    ),
    ALICE_CONTROL: {
      async fetch(input, init = {}) {
        if (options.controlUnavailable) throw new Error("control unavailable");
        const url = new URL(typeof input === "string" ? input : input.url);
        const authorization = new Headers(init.headers).get("x-alice-service-token");
        assert.equal(authorization, CONTROL_TOKEN);
        if (url.pathname === "/control/internal/v1/model/binding") {
          return Response.json({
            ok: true,
            binding: options.releaseBinding ?? RELEASE_BINDING,
            deploymentManifestSha256:
              options.deploymentManifestSha256 ??
              TEST_DEPLOYMENT_MANIFEST_SHA256,
            pausedScopes: [],
          });
        }
        if (url.pathname === "/control/internal/v1/model/reserve") {
          const body = JSON.parse(init.body);
          controlCalls.push(body);
          const decision = options.controlDecision ?? {
            allowed: true,
            code: "MODEL_BUDGET_RESERVED",
            reservationId: body.requestId,
            usedUnits: body.estimatedUnits,
            maxUnits: 10000,
          };
          return Response.json({ ok: true, decision });
        }
        return Response.json({ ok: false }, { status: 404 });
      },
    },
    AI: {
      gateway() {
        gatewayCalls += 1;
        throw new Error("AI Gateway must not be used by the direct Workers AI route");
      },
      async run(model, input, options) {
        directCalls.push({ model, input, options });
        if (typeof env.__testUpstreamErrorMessage === "string") {
          throw new Error(env.__testUpstreamErrorMessage);
        }
        if (model === "@cf/openai/gpt-oss-120b") {
          const upstream =
            'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[{"delta":{"content":"ok"}}]}\n\n' +
            'data: {"response":"","usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n' +
            "data: [DONE]\n\n";
          const bytes = new TextEncoder().encode(upstream);
          return new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.slice(0, 73));
              controller.enqueue(bytes.slice(73));
              controller.close();
            },
          });
        }
        if (model === "@cf/openai/gpt-oss-20b") {
          return {
            id: "chatcmpl-sync-test",
            object: "chat.completion",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Alice is online." },
                finish_reason: "stop",
              },
            ],
          };
        }
        return {
          data: [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
          ],
          shape: [2, 3],
          pooling: "cls",
        };
      },
    },
  };

  return {
    env,
    directCalls,
    controlCalls,
    gatewayCallCount: () => gatewayCalls,
  };
}

test("health is public and reports the pinned production models", async () => {
  const { env } = createEnv();
  const response = await worker.fetch(
    new Request("https://alice-ai.example.test/healthz"),
    env
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "alice-ai-gateway",
    inference: "workers-ai-binding",
    aiGateway: "alice-production",
    controlPlane: "alice-production-control",
    deploymentManifestSha256: TEST_DEPLOYMENT_MANIFEST_SHA256,
    models: {
      chat: [
        "workers-ai/@cf/openai/gpt-oss-20b",
        "workers-ai/@cf/openai/gpt-oss-120b",
      ],
      embeddings: ["@cf/baai/bge-m3"],
    },
  });
});

test("health fails closed on a substituted deployment manifest binding", async () => {
  const { env } = createEnv();
  env.ALICE_DEPLOYMENT_MANIFEST_SHA256 = `sha256:${"f".repeat(64)}`;
  const response = await worker.fetch(
    new Request("https://alice-ai.example.test/healthz"),
    env,
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "effective_config_mismatch");
});

test("chat requires the exact bearer token", async () => {
  const { env, directCalls, controlCalls, gatewayCallCount } = createEnv();
  const body = {
    model: "workers-ai/@cf/openai/gpt-oss-20b",
    messages: [{ role: "user", content: "hello" }],
  };

  for (const authorization of [undefined, "Bearer wrong-token", `Basic ${TOKEN}`]) {
    const headers = { "content-type": "application/json" };
    if (authorization) headers.authorization = authorization;
    const response = await worker.fetch(
      new Request("https://alice-ai.example.test/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      env
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "invalid_api_key");
  }

  assert.equal(directCalls.length, 0);
  assert.equal(controlCalls.length, 0);
  assert.equal(gatewayCallCount(), 0);
});

test("a gateway token is cryptographically bound to the active runtime release", async () => {
  const nextBinding = {
    ...RELEASE_BINDING,
    releaseDigest: `sha256:${"4".repeat(64)}`,
  };
  const nextToken = "alice-gateway-next-release-token-32-bytes";
  const nextTokenSha256 = `sha256:${createHash("sha256")
    .update(`${nextBinding.releaseDigest}:${nextToken}`)
    .digest("hex")}`;
  const { env, directCalls, controlCalls, gatewayCallCount } = createEnv({
    releaseBinding: nextBinding,
    runtimeReleaseTokenSha256: nextTokenSha256,
  });
  const response = await worker.fetch(
    jsonRequest("/v1/chat/completions", {
      model: "workers-ai/@cf/openai/gpt-oss-20b",
      messages: [{ role: "user", content: "hello" }],
    }),
    env
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "invalid_api_key");
  assert.equal(controlCalls.length, 0);
  assert.equal(directCalls.length, 0);
  assert.equal(gatewayCallCount(), 0);
});

test("chat rejects unsupported models before inference", async () => {
  const { env, directCalls, controlCalls, gatewayCallCount } = createEnv();
  const response = await worker.fetch(
    jsonRequest("/v1/chat/completions", {
      model: "openai/gpt-5.5",
      messages: [{ role: "user", content: "hello" }],
    }),
    env
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "model_not_allowed");
  assert.equal(directCalls.length, 0);
  assert.equal(controlCalls.length, 0);
  assert.equal(gatewayCallCount(), 0);
});

test("chat preserves response-only OpenAI streaming after budget reservation", async () => {
  const { env, directCalls, controlCalls, gatewayCallCount } = createEnv();
  const body = {
    model: "workers-ai/@cf/openai/gpt-oss-120b",
    messages: [{ role: "user", content: "stream a bounded response" }],
    stream: true,
  };

  const response = await worker.fetch(jsonRequest("/v1/chat/completions", body), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const streamed = await response.text();
  assert.match(streamed, /chatcmpl-test/);
  assert.match(streamed, /data: \[DONE\]/);
  assert.doesNotMatch(streamed, /"response"/);
  assert.deepEqual(directCalls, [
    {
      model: "@cf/openai/gpt-oss-120b",
      input: {
        messages: body.messages,
        stream: true,
        max_tokens: 1024,
      },
      options: {
        gateway: {
          id: "alice-production",
          skipCache: true,
          cacheTtl: 0,
          collectLog: false,
        },
      },
    },
  ]);
  assert.equal(controlCalls.length, 1);
  assert.deepEqual(controlCalls[0], {
    requestId: controlCalls[0].requestId,
    model: body.model,
    estimatedUnits: controlCalls[0].estimatedUnits,
    ...RELEASE_BINDING,
  });
  assert.match(controlCalls[0].requestId, /^request-[0-9a-f-]{36}$/);
  assert.notEqual(controlCalls[0].requestId, "request-gateway-test-0001");
  assert.ok(Number.isInteger(controlCalls[0].estimatedUnits));
  assert.equal(
    controlCalls[0].estimatedUnits,
    new TextEncoder().encode(JSON.stringify(body)).byteLength +
      1024
  );
  assert.equal(gatewayCallCount(), 0);
});

test("chat rejects every unapproved or authority-shaped provider field before charging", async () => {
  for (const extra of [
    { functions: [{ name: "execute" }] },
    { max_completion_tokens: 4096 },
    { n: 8 },
    { provider: { routing: "unbounded" } },
  ]) {
    const { env, directCalls, controlCalls } = createEnv();
    const response = await worker.fetch(
      jsonRequest("/v1/chat/completions", {
        model: "workers-ai/@cf/openai/gpt-oss-20b",
        messages: [{ role: "user", content: "hello" }],
        ...extra,
      }),
      env,
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "field_not_allowed");
    assert.equal(controlCalls.length, 0);
    assert.equal(directCalls.length, 0);
  }
});

test("a caller cannot reuse a client request id to bypass model charging", async () => {
  const { env, controlCalls } = createEnv();
  const body = {
    model: "workers-ai/@cf/openai/gpt-oss-20b",
    messages: [{ role: "user", content: "hello" }],
  };
  const first = await worker.fetch(jsonRequest("/v1/chat/completions", body), env);
  const second = await worker.fetch(jsonRequest("/v1/chat/completions", body), env);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(controlCalls.length, 2);
  assert.notEqual(controlCalls[0].requestId, controlCalls[1].requestId);
  assert.ok(controlCalls.every((call) => call.requestId !== "request-gateway-test-0001"));
});

test("chat preserves a synchronous OpenAI-compatible completion from Workers AI", async () => {
  const { env, directCalls, controlCalls, gatewayCallCount } = createEnv();
  const body = {
    model: "workers-ai/@cf/openai/gpt-oss-20b",
    messages: [{ role: "user", content: "Are you online?" }],
    tools: [{ type: "function", function: { name: "HANDLE_RESPONSE" } }],
    tool_choice: "required",
    prompt_cache_key: "alice-stage-1-prefix",
  };

  const response = await worker.fetch(jsonRequest("/v1/chat/completions", body), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    id: "chatcmpl-sync-test",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "Alice is online." },
        finish_reason: "stop",
      },
    ],
  });
  assert.deepEqual(directCalls, [
    {
      model: "@cf/openai/gpt-oss-20b",
      input: {
        messages: body.messages,
        tools: body.tools,
        tool_choice: "required",
        max_tokens: 1024,
      },
      options: {
        gateway: {
          id: "alice-production",
          skipCache: true,
          cacheTtl: 0,
          collectLog: false,
        },
      },
    },
  ]);
  assert.equal(controlCalls.length, 1);
  assert.equal(gatewayCallCount(), 0);
});

test("embeddings reserve the full UTF-8 byte ceiling for adversarial text", async () => {
  const { env, controlCalls } = createEnv();
  const input = ["漢字。！", "!!!!!!!!!"];
  const response = await worker.fetch(
    jsonRequest("/v1/embeddings", { model: "@cf/baai/bge-m3", input }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(controlCalls.length, 1);
  assert.equal(
    controlCalls[0].estimatedUnits,
    input.reduce(
      (total, value) => total + new TextEncoder().encode(value).byteLength,
      input.length,
    ),
  );
});

test("embeddings return an OpenAI-compatible response from Workers AI", async () => {
  const { env, directCalls, controlCalls, gatewayCallCount } = createEnv();
  const response = await worker.fetch(
    jsonRequest("/v1/embeddings", {
      model: "@cf/baai/bge-m3",
      input: ["alice", "arcade"],
    }),
    env
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    object: "list",
    model: "@cf/baai/bge-m3",
    data: [
      { object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] },
      { object: "embedding", index: 1, embedding: [0.4, 0.5, 0.6] },
    ],
    usage: { prompt_tokens: 0, total_tokens: 0 },
  });
  assert.deepEqual(directCalls, [
    {
      model: "@cf/baai/bge-m3",
      input: { text: ["alice", "arcade"], truncate_inputs: false },
      options: {
        gateway: {
          id: "alice-production",
          skipCache: true,
          cacheTtl: 0,
          collectLog: false,
        },
      },
    },
  ]);
  assert.equal(controlCalls.length, 1);
  assert.equal(
    controlCalls[0].estimatedUnits,
    new TextEncoder().encode("alicearcade").byteLength + 2,
  );
  assert.equal(gatewayCallCount(), 0);
});

test("request bodies are bounded even without content-length", async () => {
  const { env, directCalls, controlCalls, gatewayCallCount } = createEnv();
  const oversized = new Uint8Array(1_048_577).fill(65);
  const request = new Request("https://alice-ai.example.test/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(oversized);
        controller.close();
      },
    }),
    duplex: "half",
  });

  const response = await worker.fetch(request, env);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "request_too_large");
  assert.equal(directCalls.length, 0);
  assert.equal(controlCalls.length, 0);
  assert.equal(gatewayCallCount(), 0);
});

test("model pause or budget denial blocks inference before Workers AI", async () => {
  const { env, directCalls, controlCalls } = createEnv({
    controlDecision: {
      allowed: false,
      code: "PAUSED_MODEL",
      usedUnits: 10,
      maxUnits: 10000,
    },
  });
  const response = await worker.fetch(
    jsonRequest("/v1/chat/completions", {
      model: "workers-ai/@cf/openai/gpt-oss-20b",
      messages: [{ role: "user", content: "hello" }],
    }),
    env
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "model_control_denied");
  assert.equal(controlCalls.length, 1);
  assert.equal(directCalls.length, 0);
});

test("control-plane outage fails closed before inference", async () => {
  const { env, directCalls, controlCalls } = createEnv({ controlUnavailable: true });
  const response = await worker.fetch(
    jsonRequest("/v1/chat/completions", {
      model: "workers-ai/@cf/openai/gpt-oss-20b",
      messages: [{ role: "user", content: "hello" }],
    }),
    env
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "control_plane_unavailable");
  assert.equal(controlCalls.length, 0);
  assert.equal(directCalls.length, 0);
});

test("upstream failures never log provider messages or request content", async () => {
  const sensitive = "provider-secret: owner prompt must never be logged";
  const logs = [];
  const original = console.error;
  console.error = (value) => logs.push(String(value));
  try {
    for (const [path, body] of [
      [
        "/v1/chat/completions",
        {
          model: "workers-ai/@cf/openai/gpt-oss-20b",
          messages: [{ role: "user", content: "private owner prompt" }],
        },
      ],
      [
        "/v1/embeddings",
        { model: "@cf/baai/bge-m3", input: "private embedding text" },
      ],
    ]) {
      const { env } = createEnv();
      env.__testUpstreamErrorMessage = sensitive;
      const response = await worker.fetch(jsonRequest(path, body), env);
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, "upstream_error");
    }
  } finally {
    console.error = original;
  }
  assert.equal(logs.length, 2);
  assert.ok(logs.every((line) => line.includes("alice_ai_gateway_upstream_error")));
  assert.ok(logs.every((line) => !line.includes(sensitive)));
  assert.ok(logs.every((line) => !line.includes("private owner prompt")));
  assert.ok(logs.every((line) => !line.includes("private embedding text")));
  assert.ok(logs.every((line) => !line.includes('"error"')));
});

test("method, media type, and route handling fail closed", async () => {
  const { env } = createEnv();

  const method = await worker.fetch(
    new Request("https://alice-ai.example.test/v1/chat/completions", {
      method: "GET",
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
    env
  );
  assert.equal(method.status, 405);

  const media = await worker.fetch(
    new Request("https://alice-ai.example.test/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "text/plain",
      },
      body: "hello",
    }),
    env
  );
  assert.equal(media.status, 415);

  const route = await worker.fetch(
    new Request("https://alice-ai.example.test/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
    env
  );
  assert.equal(route.status, 404);
});
