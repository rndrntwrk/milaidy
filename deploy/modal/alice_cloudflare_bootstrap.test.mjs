import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAliceBootstrapCreationCommand,
  buildAliceBootstrapPromotionCommand,
  buildAliceBootstrapControlConfig,
  ensureAliceBootstrapQueue,
  extractAliceBootstrapNamespaceIds,
  verifyAliceBootstrapBucket,
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
