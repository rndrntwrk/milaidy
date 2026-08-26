import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import * as bootstrapModule from "./alice_cloudflare_bootstrap.mjs";

import {
  buildAliceBootstrapCreationCommand,
  buildAliceBootstrapPromotionCommand,
  buildAliceBootstrapControlConfig,
  ensureAliceBootstrapQueue,
  extractAliceBootstrapNamespaceIds,
  fetchAliceActiveControlVersionId,
  parseAliceWranglerDeployVersionId,
  verifyAliceBootstrapReentryBoundary,
  verifyAliceBootstrapBucket,
  verifyAliceBootstrapQueueConsumer,
} from "./alice_cloudflare_bootstrap.mjs";
import fs from "node:fs";

const sourceConfig = {
  account_id: "036df6c823669b8fa2f66cf4c16eeb29",
  name: "alice-production-control",
  main: "src/index.ts",
  routes: [{ pattern: "alice.rndrntwrk.com/control/*" }],
  workers_dev: false,
  preview_urls: false,
  vars: {
    ALICE_PROGRAM_ENVELOPE_B64: "program",
    ALICE_PROGRAM_SIGNATURE_B64: "signature",
    ALICE_PROGRAM_PUBLIC_JWK_B64: "jwk",
    ALICE_DEPLOYMENT_MANIFEST_SHA256: "manifest",
    ALICE_DEPLOYMENT_MANIFEST_B64: "manifest-b64",
  },
  secrets: { required: ["ALICE_CONTROL_RECOVERY_TOKEN"] },
  queues: {
    producers: [{ binding: "ALICE_EVIDENCE_QUEUE", queue: "alice-production-evidence-v1" }],
    consumers: [{ queue: "alice-production-evidence-v1" }],
  },
  durable_objects: {
    bindings: [
      { name: "ALICE_AUTHORITY", class_name: "AliceAuthority" },
      { name: "ALICE_SESSIONS", class_name: "AliceSession" },
    ],
  },
};

test("materializes an unrouted fail-closed control bootstrap without secret bindings", () => {
  const config = buildAliceBootstrapControlConfig({
    sourceConfig,
    deploymentMainPath: "/release/alice-production-control/index.js",
  });
  assert.deepEqual(config.routes, []);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.queues.consumers, []);
  assert.deepEqual(config.secrets.required, []);
  assert.equal(config.main, "/release/alice-production-control/index.js");
  assert.match(
    config.vars.ALICE_DEPLOYMENT_MANIFEST_SHA256,
    /^sha256:0{64}$/,
  );
  assert.equal(config.vars.ALICE_PROGRAM_SIGNATURE_B64, "invalid");
  assert.deepEqual(sourceConfig.routes, [{ pattern: "alice.rndrntwrk.com/control/*" }]);
});

test("extracts only the exact two provider-assigned Durable Object namespaces", () => {
  const ids = extractAliceBootstrapNamespaceIds({
    resources: {
      bindings: [
        {
          type: "durable_object_namespace",
          name: "ALICE_SESSIONS",
          class_name: "AliceSession",
          namespace_id: "2".repeat(32),
        },
        {
          type: "durable_object_namespace",
          name: "ALICE_AUTHORITY",
          class_name: "AliceAuthority",
          namespace_id: "1".repeat(32),
        },
      ],
    },
  });
  assert.deepEqual(ids, {
    access: [],
    aiGateway: [],
    control: [
      {
        className: "AliceAuthority",
        name: "ALICE_AUTHORITY",
        namespaceId: "1".repeat(32),
      },
      {
        className: "AliceSession",
        name: "ALICE_SESSIONS",
        namespaceId: "2".repeat(32),
      },
    ],
  });
  assert.throws(() =>
    extractAliceBootstrapNamespaceIds({
      resources: { bindings: [{ ...ids.control[0], type: "durable_object_namespace" }] },
    }),
  );
});

test("deploys the unrouted fail-closed bootstrap before attaching one paused consumer", () => {
  assert.deepEqual(
    buildAliceBootstrapCreationCommand({
      controlMain: "/release/alice-production-control/index.js",
      configPath: "/release/control.bootstrap.wrangler.json",
      sourceCommit: "1".repeat(40),
      releaseRunId: "123-1",
    }),
    [
      "deploy",
      "/release/alice-production-control/index.js",
      "--config",
      "/release/control.bootstrap.wrangler.json",
      "--no-bundle",
      "--strict",
      "--tag",
      `alice-continuity-bootstrap-${"1".repeat(40)}-123-1`,
      "--message",
      `Alice unrouted fail-closed continuity bootstrap ${"1".repeat(40)}`,
    ],
  );
  assert.deepEqual(
    buildAliceBootstrapPromotionCommand({
      versionId: "11111111-1111-4111-8111-111111111111",
      configPath: "/release/control.bootstrap.wrangler.json",
    }),
    [
      "versions",
      "deploy",
      "--config",
      "/release/control.bootstrap.wrangler.json",
      "--version-id",
      "11111111-1111-4111-8111-111111111111",
      "--percentage",
      "100",
      "--message",
      "Alice fail-closed continuity bootstrap",
      "--yes",
    ],
  );
  const source = fs.readFileSync(
    new URL("./alice_cloudflare_bootstrap.mjs", import.meta.url),
    "utf8",
  );
  const main = source.slice(source.indexOf("async function main()"));
  assert.ok(main.indexOf("fetchAliceBootstrapResourceSnapshot") >= 0);
  assert.ok(main.indexOf("verifyProtectedRefStillExact") >= 0);
  assert.ok(main.indexOf("verifyProtectedRefStillExact") < main.indexOf("ensureAliceBootstrapQueue"));
  assert.ok(main.indexOf("buildAliceBootstrapPromotionCommand") >= 0);
  assert.ok(main.indexOf("buildAliceBootstrapCreationCommand") >= 0);
  assert.ok(main.indexOf("buildAliceBootstrapCreationCommand") < main.indexOf("ensureConsumer"));
  assert.ok(main.indexOf("buildAliceBootstrapPromotionCommand") < main.indexOf("ensureConsumer"));
  assert.ok(main.indexOf("ensureConsumer") < main.indexOf("fetchAliceCloudflareContinuityState"));
});

test("parses only one exact pinned-Wrangler first-deploy version", () => {
  const versionId = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    parseAliceWranglerDeployVersionId(
      `Uploaded alice-production-control (1.23 sec)\nCurrent Version ID: ${versionId}\n`,
    ),
    versionId,
  );
  for (const output of [
    `Worker Version ID: ${versionId}\n`,
    `Current version ID: ${versionId}\n`,
    `Current Version ID: not-a-version\n`,
    `Current Version ID: ${versionId}\nCurrent Version ID: ${versionId}\n`,
  ]) {
    assert.throws(
      () => parseAliceWranglerDeployVersionId(output),
      /ALICE_CLOUDFLARE_BOOTSTRAP_DEPLOY_VERSION_INVALID/,
    );
  }
});

const activeRecoveryVersionId = "12567b75-bc0e-4451-9e8c-52295ec7af2b";
const newerInactiveVersionId = "193bed86-48b7-4924-8d23-e123fa86ee9a";
const activeRecoveryVersion = {
  id: activeRecoveryVersionId,
  annotations: {
    "workers/tag": `alice-recovery-boundary-${"a".repeat(40)}`,
  },
  resources: {
    bindings: [
      {
        type: "durable_object_namespace",
        name: "ALICE_AUTHORITY",
        class_name: "AliceAuthority",
        namespace_id: "1".repeat(32),
      },
      {
        type: "durable_object_namespace",
        name: "ALICE_SESSIONS",
        class_name: "AliceSession",
        namespace_id: "2".repeat(32),
      },
    ],
  },
};

function activeDeployments(versions = [{
  percentage: 100,
  version_id: activeRecoveryVersionId,
}]) {
  return {
    deployments: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      versions,
    }],
  };
}

function deploymentFetch(result, calls = []) {
  return async (url, options) => {
    const parsed = new URL(url);
    calls.push(parsed);
    assert.equal(options.method, "GET");
    if (parsed.pathname.endsWith("/deployments")) {
      return Response.json({ success: true, result });
    }
    if (
      parsed.pathname.endsWith("/versions") &&
      parsed.searchParams.get("per_page") === "1"
    ) {
      return Response.json({
        success: true,
        result: { items: [{ id: newerInactiveVersionId }] },
      });
    }
    assert.fail(`unexpected provider request: ${parsed.pathname}${parsed.search}`);
  };
}

test("accepts the exact active recovery boundary when a newer upload is inactive", async () => {
  const calls = [];
  const activeVersionId = await fetchAliceActiveControlVersionId({
    fetchImpl: deploymentFetch(activeDeployments(), calls),
    apiToken: "provider-token-value",
  });
  assert.equal(activeVersionId, activeRecoveryVersionId);
  assert.deepEqual(
    verifyAliceBootstrapReentryBoundary({
      activeVersionId,
      expectedVersionId: activeRecoveryVersionId,
      version: activeRecoveryVersion,
    }),
    {
      versionId: activeRecoveryVersionId,
      namespaceIds: {
        access: [],
        aiGateway: [],
        control: [
          {
            className: "AliceAuthority",
            name: "ALICE_AUTHORITY",
            namespaceId: "1".repeat(32),
          },
          {
            className: "AliceSession",
            name: "ALICE_SESSIONS",
            namespaceId: "2".repeat(32),
          },
        ],
      },
    },
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].pathname.endsWith("/deployments"));
  const main = fs.readFileSync(
    new URL("./alice_cloudflare_bootstrap.mjs", import.meta.url),
    "utf8",
  ).slice(fs.readFileSync(
    new URL("./alice_cloudflare_bootstrap.mjs", import.meta.url),
    "utf8",
  ).indexOf("async function main()"));
  assert.doesNotMatch(main, /latestUploadedControlVersionId/);
});

test("rejects multiple or malformed active control versions", async () => {
  for (const deployments of [
    activeDeployments([
      { percentage: 50, version_id: activeRecoveryVersionId },
      { percentage: 50, version_id: newerInactiveVersionId },
    ]),
    activeDeployments([{
      percentage: 99,
      version_id: activeRecoveryVersionId,
    }]),
    activeDeployments([{
      percentage: 100,
      version_id: "not-a-version",
    }]),
  ]) {
    await assert.rejects(
      fetchAliceActiveControlVersionId({
        fetchImpl: deploymentFetch(deployments),
        apiToken: "provider-token-value",
      }),
      /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
    );
  }
});

test("rejects malformed recovery/bootstrap tags and Durable Object bindings", () => {
  for (const tag of [
    "alice-recovery-boundary-main",
    `alice-continuity-bootstrap-${"a".repeat(40)}-123`,
  ]) {
    assert.throws(
      () => verifyAliceBootstrapReentryBoundary({
        activeVersionId: activeRecoveryVersionId,
        expectedVersionId: activeRecoveryVersionId,
        version: {
          ...activeRecoveryVersion,
          annotations: { "workers/tag": tag },
        },
      }),
      /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
    );
  }
  assert.throws(
    () => verifyAliceBootstrapReentryBoundary({
      activeVersionId: activeRecoveryVersionId,
      expectedVersionId: activeRecoveryVersionId,
      version: {
        ...activeRecoveryVersion,
        resources: {
          bindings: activeRecoveryVersion.resources.bindings.map((binding) =>
            binding.name === "ALICE_SESSIONS"
              ? { ...binding, class_name: "WrongSession" }
              : binding
          ),
        },
      },
    }),
    /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
  );
});

test("accepts only Cloudflare's unambiguous Queue consumer script field", () => {
  const consumer = {
    consumer_id: "a".repeat(32),
    queue_name: "alice-production-evidence-v1",
    script: "alice-production-control",
    type: "worker",
    dead_letter_queue: "alice-production-evidence-dlq-v1",
    settings: {
      batch_size: 10,
      max_concurrency: 1,
      max_retries: 3,
      max_wait_time_ms: 5_000,
      retry_delay: 10,
    },
  };
  assert.deepEqual(verifyAliceBootstrapQueueConsumer(consumer), consumer);
  const { script, ...legacyConsumer } = consumer;
  assert.deepEqual(
    verifyAliceBootstrapQueueConsumer({
      ...legacyConsumer,
      script_name: script,
    }),
    { ...legacyConsumer, script_name: script },
  );
  for (const substitution of [
    { ...consumer, script_name: consumer.script },
    { ...consumer, script: "other" },
    { ...consumer, script: undefined },
  ]) {
    assert.throws(
      () => verifyAliceBootstrapQueueConsumer(substitution),
      /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
    );
  }
});

test("snapshots every Alice provider surface twice before the first mutation", () => {
  const source = fs.readFileSync(
    new URL("./alice_cloudflare_bootstrap.mjs", import.meta.url),
    "utf8",
  );
  const snapshot = source.slice(
    source.indexOf("export async function fetchAliceBootstrapResourceSnapshot"),
    source.indexOf("function verifyProtectedRefStillExact"),
  );
  for (const expected of [
    "/access/apps",
    "/access/identity_providers",
    "/devices/posture",
    "/ai-gateway/gateways/",
    "/workers/routes",
    "/workers/domains",
    "/workers/scripts/",
    "/event_subscriptions/subscriptions",
    "/workflows/",
    "/r2/buckets/",
    "/queues",
  ]) {
    assert.match(snapshot, new RegExp(expected.replaceAll("/", "\\/")));
  }
  for (const worker of [
    "accessWorker",
    "controlWorker",
    "aiGatewayWorker",
  ]) {
    assert.match(snapshot, new RegExp(`ALICE_CLOUDFLARE_TARGET\\.${worker}`));
  }
  const main = source.slice(source.indexOf("async function main()"));
  const first = main.indexOf("const preflightFirst = await fetchAliceBootstrapResourceSnapshot");
  const second = main.indexOf("const preflightSecond = await fetchAliceBootstrapResourceSnapshot");
  const firstMutation = main.indexOf("ensureAliceBootstrapQueue");
  assert.ok(first >= 0 && second > first && firstMutation > second);
  assert.match(main, /ALICE_CLOUDFLARE_BOOTSTRAP_PREFLIGHT_DRIFT/);
});

test("reports only a static provider-read operation, HTTP status, and numeric Cloudflare code", async () => {
  const cases = [
    {
      response: () => Response.json({
        success: false,
        errors: [{ code: 9109, message: "provider detail must stay private" }],
      }, { status: 403 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_QUEUES:HTTP_403:CF_9109",
    },
    {
      response: () => new Response("not-json", { status: 502 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_QUEUES:HTTP_502:CF_NONE",
    },
    {
      response: () => Response.json({
        success: false,
        errors: [{ code: 1001 }],
      }, { status: 404 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_QUEUES:HTTP_404:CF_1001",
    },
    {
      response: () => Response.json({
        success: false,
        errors: [{ code: 10000 }],
      }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_QUEUES:HTTP_200:CF_10000",
    },
    {
      response: () => Response.json({ success: true }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_QUEUES:HTTP_200:CF_NONE",
    },
  ];
  for (const fixture of cases) {
    let calls = 0;
    let failure;
    try {
      await ensureAliceBootstrapQueue({
        fetchImpl: async () => {
          calls += 1;
          return fixture.response();
        },
        apiToken: "provider-token-value-must-not-appear",
        name: "alice-production-evidence-v1",
      });
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.message, fixture.expected);
    assert.equal(calls, 1);
    assert.equal(failure.message.includes("provider-token-value"), false);
    assert.equal(failure.message.includes("provider detail"), false);
    assert.equal(failure.message.includes("/accounts/"), false);
  }
});

test("verifies and hashes the exact deploy token identity without retaining the token", async () => {
  const tokenId = "0123456789abcdef0123456789abcdef";
  const apiToken = "provider-token-value-must-not-appear";
  const calls = [];
  const credentialIdSha256 =
    await bootstrapModule.verifyAliceBootstrapDeployToken({
      apiToken,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          success: true,
          errors: [],
          messages: [],
          result: { id: tokenId, status: "active" },
        });
      },
    });
  assert.equal(
    credentialIdSha256,
    `sha256:${crypto.createHash("sha256").update(tokenId).digest("hex")}`,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.endsWith("/user/tokens/verify"), true);
  assert.equal(JSON.stringify(credentialIdSha256).includes(apiToken), false);
});

test("rejects an inactive, malformed, or extended deploy-token identity", async () => {
  for (const result of [
    { id: "0".repeat(32), status: "disabled" },
    { id: "not-a-token-id", status: "active" },
    { id: "0".repeat(32), status: "active", secret: "provider-value" },
  ]) {
    await assert.rejects(
      bootstrapModule.verifyAliceBootstrapDeployToken({
        apiToken: "provider-token-value",
        fetchImpl: async () => Response.json({ success: true, result }),
      }),
      /ALICE_CLOUDFLARE_BOOTSTRAP_DEPLOY_TOKEN_INVALID/,
    );
  }
});

test("binds the verified deploy-token hash before the first provider snapshot", () => {
  const source = fs.readFileSync(
    new URL("./alice_cloudflare_bootstrap.mjs", import.meta.url),
    "utf8",
  );
  const snapshot = source.slice(
    source.indexOf("export async function fetchAliceBootstrapResourceSnapshot"),
    source.indexOf("function verifyProtectedRefStillExact"),
  );
  const main = source.slice(source.indexOf("async function main()"));
  const verify = main.indexOf(
    "const deployCredentialIdSha256 = await verifyAliceBootstrapDeployToken",
  );
  const first = main.indexOf(
    "const preflightFirst = await fetchAliceBootstrapResourceSnapshot",
  );
  assert.ok(verify >= 0 && first > verify);
  assert.match(snapshot, /deployCredentialIdSha256/);
  assert.match(snapshot, /alice\.cloudflare-bootstrap-preflight\.v3/);
});

test("finds the exact paused queue across every provider page without mutating", async () => {
  const calls = [];
  const filler = Array.from({ length: 100 }, (_, index) => ({
    queue_id: `${index}`.padStart(32, "0"),
    queue_name: `unrelated-${index}`,
  }));
  const expected = {
    queue_id: "a".repeat(32),
    queue_name: "alice-production-evidence-v1",
    settings: {
      delivery_delay: 0,
      delivery_paused: true,
      message_retention_period: 86_400,
    },
  };
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ parsed, options });
    assert.equal(options.method, "GET");
    const page = Number(parsed.searchParams.get("page"));
    return Response.json({
      success: true,
      result: page === 1 ? filler : [expected],
      result_info: {
        page,
        per_page: 100,
        count: page === 1 ? 100 : 1,
        total_count: 101,
      },
    });
  };
  const result = await ensureAliceBootstrapQueue({
    fetchImpl,
    apiToken: "provider-token-value",
    name: expected.queue_name,
  });
  assert.deepEqual(result, { created: false, queue: expected });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].parsed.searchParams.get("page"), "2");
});

test("accepts Cloudflare's observed page-one metadata without total_pages", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ parsed, options });
    if (options.method === "POST") {
      return Response.json({ success: true, result: { queue_id: "a".repeat(32) } });
    }
    if (calls.length === 3) {
      return Response.json({
        success: true,
        result: [{
          queue_id: "a".repeat(32),
          queue_name: "alice-production-evidence-v1",
          settings: {
            delivery_delay: 0,
            delivery_paused: true,
            message_retention_period: 86_400,
          },
        }],
      });
    }
    return Response.json({
      success: true,
      result: [],
      result_info: {
        page: 1,
        per_page: 100,
        count: 0,
        total_count: 0,
      },
    });
  };
  const pending = ensureAliceBootstrapQueue({
    fetchImpl,
    apiToken: "provider-token-value",
    name: "alice-production-evidence-v1",
  });
  assert.deepEqual(await pending, {
    created: true,
    queue: {
      queue_id: "a".repeat(32),
      queue_name: "alice-production-evidence-v1",
      settings: {
        delivery_delay: 0,
        delivery_paused: true,
        message_retention_period: 86_400,
      },
    },
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[2].options.method, "GET");
});

test("accepts Cloudflare's canonical uppercase ENAM bucket readback", () => {
  assert.deepEqual(
    verifyAliceBootstrapBucket({
      name: "alice-production-evidence",
      jurisdiction: "default",
      location: "ENAM",
      storage_class: "Standard",
    }),
    {
      name: "alice-production-evidence",
      jurisdiction: "default",
      location: "ENAM",
      storage_class: "Standard",
    },
  );
});
