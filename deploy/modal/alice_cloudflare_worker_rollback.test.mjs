import assert from "node:assert/strict";
import test from "node:test";

import {
  captureAliceCloudflareWorkerRollbackState,
  normalizeAliceCloudflareScriptSettings,
  normalizeAliceCloudflareVersionSettings,
  restoreAliceCloudflareWorkerRollbackState,
} from "./alice_cloudflare_worker_rollback.mjs";

test("normalizes every persistent script setting with explicit defaults", () => {
  assert.deepEqual(normalizeAliceCloudflareScriptSettings({}), {
    logpush: false,
    observability: {
      enabled: false,
      head_sampling_rate: null,
      logs: null,
      traces: null,
    },
    tags: [],
    tail_consumers: [],
  });
  assert.deepEqual(
    normalizeAliceCloudflareScriptSettings({
      logpush: false,
      observability: {
        enabled: true,
        head_sampling_rate: 1,
        logs: {
          enabled: true,
          invocation_logs: true,
          destinations: ["cloudflare"],
          head_sampling_rate: 1,
          persist: true,
        },
        traces: {
          enabled: true,
          destinations: ["cloudflare"],
          head_sampling_rate: 1,
          persist: true,
          propagation_policy: "authenticated",
        },
      },
      tags: ["production", "alice"],
      tail_consumers: [{ service: "tail", environment: "production" }],
    }),
    {
      logpush: false,
      observability: {
        enabled: true,
        head_sampling_rate: 1,
        logs: {
          enabled: true,
          invocation_logs: true,
          destinations: ["cloudflare"],
          head_sampling_rate: 1,
          persist: true,
        },
        traces: {
          enabled: true,
          destinations: ["cloudflare"],
          head_sampling_rate: 1,
          persist: true,
          propagation_policy: "authenticated",
        },
      },
      tags: ["alice", "production"],
      tail_consumers: [{
        service: "tail",
        environment: "production",
        namespace: null,
      }],
    },
  );
});

test("captures version settings without secret payloads or server annotations", () => {
  assert.deepEqual(
    normalizeAliceCloudflareVersionSettings({
      annotations: {
        "workers/message": "prior",
        "workers/tag": "prior-tag",
        "workers/triggered_by": "upload",
      },
      bindings: [
        { name: "PUBLIC", text: "visible", type: "plain_text" },
        { name: "SECRET", type: "secret_text" },
        {
          name: "ALICE_CONTROL",
          service: "alice-production-control",
          type: "service",
        },
      ],
      cache_options: { enabled: false },
      compatibility_date: "2026-08-22",
      compatibility_flags: [],
      exports: { default: { state: "created", type: "worker" } },
    }),
    {
      bindings: [
        {
          name: "ALICE_CONTROL",
          service: "alice-production-control",
          type: "service",
        },
        { name: "PUBLIC", text: "visible", type: "plain_text" },
        { name: "SECRET", type: "secret_text" },
      ],
      cache_options: { cross_version_cache: null, enabled: false },
      compatibility_date: "2026-08-22",
      compatibility_flags: [],
      exports: { default: { cache: null, state: "created", type: "worker" } },
      limits: null,
      logpush: false,
      migrations: null,
      observability: {
        enabled: false,
        head_sampling_rate: null,
        logs: null,
        traces: null,
      },
      placement: null,
      tags: [],
      tail_consumers: [],
      usage_model: null,
    },
  );
  assert.throws(
    () => normalizeAliceCloudflareVersionSettings({
      bindings: [{ name: "SECRET", text: "must-not-be-read", type: "secret_text" }],
    }),
    /ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID/,
  );
});

test("rejects unknown script, version, binding, and export fields", () => {
  assert.throws(
    () => normalizeAliceCloudflareScriptSettings({ unknown: true }),
    /ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID/,
  );
  assert.throws(
    () => normalizeAliceCloudflareVersionSettings({ unknown: true }),
    /ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID/,
  );
  assert.throws(
    () => normalizeAliceCloudflareVersionSettings({
      bindings: [{ name: "AI", type: "ai", ambient_authority: true }],
    }),
    /ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID/,
  );
  assert.throws(
    () => normalizeAliceCloudflareVersionSettings({
      exports: { default: { type: "worker", unknown: true } },
    }),
    /ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID/,
  );
});

test("restores persistent settings and proves the prior serving version twice", async () => {
  const accountId = "036df6c823669b8fa2f66cf4c16eeb29";
  const workers = {
    "alice-access-gateway": [
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111112",
    ],
    "alice-production-control": [
      "22222222-2222-4222-8222-222222222221",
      "22222222-2222-4222-8222-222222222222",
    ],
    "alice-ai-gateway": [
      "33333333-3333-4333-8333-333333333331",
      "33333333-3333-4333-8333-333333333333",
    ],
  };
  const scriptSettings = Object.fromEntries(
    Object.keys(workers).map((worker) => [worker, {}]),
  );
  const patches = [];
  const deploymentReads = {};
  let interleaveAccessDeployment = false;
  const json = (result) => new Response(
    JSON.stringify({ success: true, result }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    const match = url.pathname.match(/\/workers\/scripts\/([^/]+)(.*)$/);
    assert.ok(match);
    const worker = match[1];
    const suffix = match[2];
    assert.ok(Object.hasOwn(workers, worker));
    const [deploymentId, versionId] = workers[worker];
    if (init?.method === "PATCH" && suffix === "/script-settings") {
      const body = JSON.parse(init.body);
      patches.push({ worker, body });
      scriptSettings[worker] = body;
      return json(body);
    }
    assert.equal(init?.method, "GET");
    if (suffix === "/deployments") {
      deploymentReads[worker] = (deploymentReads[worker] ?? 0) + 1;
      const observedDeploymentId =
        interleaveAccessDeployment &&
        worker === "alice-access-gateway" &&
        deploymentReads[worker] % 2 === 0
          ? "44444444-4444-4444-8444-444444444444"
          : deploymentId;
      return json({
        deployments: [{
          id: observedDeploymentId,
          versions: [{ percentage: 100, version_id: versionId }],
        }],
      });
    }
    if (suffix === `/versions/${versionId}`) {
      return json({
        id: versionId,
        resources: { script: { etag: `etag-${worker}` } },
      });
    }
    if (suffix === "/content/v2") {
      return new Response(`export default ${JSON.stringify(worker)};\n`, {
        status: 200,
        headers: {
          "content-type": "application/javascript",
          etag: `"etag-${worker}"`,
        },
      });
    }
    if (suffix === "/script-settings") return json(scriptSettings[worker]);
    if (suffix === "/settings") {
      return json({
        bindings: [{ name: "SECRET", type: "secret_text" }],
        cache_options: { enabled: false },
        compatibility_date: "2026-08-22",
        compatibility_flags: [],
        exports: { default: { state: "created", type: "worker" } },
      });
    }
    throw new Error(`unexpected ${url}`);
  };

  const expected = await captureAliceCloudflareWorkerRollbackState({
    fetchImpl,
    apiToken: "test-api-token",
    baseUrl: "https://api.cloudflare.test/client/v4",
  });
  for (const worker of Object.keys(scriptSettings)) {
    scriptSettings[worker] = {
      logpush: true,
      observability: { enabled: true },
      tags: ["candidate"],
      tail_consumers: [],
    };
  }
  workers["alice-access-gateway"][0] =
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  workers["alice-production-control"][0] =
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  workers["alice-ai-gateway"][0] =
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const restored = await restoreAliceCloudflareWorkerRollbackState({
    expected,
    fetchImpl,
    apiToken: "test-api-token",
    baseUrl: "https://api.cloudflare.test/client/v4",
  });
  assert.deepEqual(restored.restored, {
    ...expected,
    access: {
      ...expected.access,
      serving: {
        ...expected.access.serving,
        deploymentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    },
    control: {
      ...expected.control,
      serving: {
        ...expected.control.serving,
        deploymentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    },
    aiGateway: {
      ...expected.aiGateway,
      serving: {
        ...expected.aiGateway.serving,
        deploymentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
    },
  });
  assert.deepEqual(restored.deployments.access, {
    previousDeploymentId: "11111111-1111-4111-8111-111111111111",
    rollbackDeploymentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    versionId: "11111111-1111-4111-8111-111111111112",
  });
  assert.equal(patches.length, 3);
  for (const patch of patches) {
    assert.deepEqual(patch.body, {
      logpush: false,
      observability: { enabled: false },
      tags: [],
      tail_consumers: [],
    });
  }
  assert.equal(
    JSON.stringify(restored).includes("must-not-be-read"),
    false,
  );
  interleaveAccessDeployment = true;
  for (const worker of Object.keys(deploymentReads)) deploymentReads[worker] = 0;
  await assert.rejects(
    () => captureAliceCloudflareWorkerRollbackState({
      fetchImpl,
      apiToken: "test-api-token",
      baseUrl: "https://api.cloudflare.test/client/v4",
    }),
    /ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID/,
  );
});
