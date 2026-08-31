import assert from "node:assert/strict";
import test from "node:test";

import * as rollback from "./alice_cloudflare_worker_rollback.mjs";
import {
  aliceTestLiveWorkerRollbackReadbacks,
} from "./test-fixtures/alice_provider_readbacks.mjs";

const {
  captureAliceCloudflareWorkerRollbackState,
  normalizeAliceCloudflareScriptSettings,
  restoreAliceCloudflareWorkerRollbackState,
} = rollback;

function sixRoleRollbackReadbacks() {
  return {
    ...aliceTestLiveWorkerRollbackReadbacks(),
    runtimeHost: {
      worker: "alice-runtime-container-host",
      deployment: {
        deployments: [{
          id: "66666666-6666-4666-8666-666666666661",
          versions: [{
            percentage: 100,
            version_id: "66666666-6666-4666-8666-666666666666",
          }],
        }],
      },
      version: {
        id: "66666666-6666-4666-8666-666666666666",
        resources: {
          bindings: [
            { name: "AI", project: "alice-production", type: "ai" },
            {
              database_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              name: "ALICE_STATE_DB",
              type: "d1",
            },
            {
              class_name: "AliceRuntimeContainer",
              name: "ALICE_RUNTIME_CONTAINER",
              namespace_id: "55555555555555555555555555555555",
              type: "durable_object_namespace",
            },
            { name: "ALICE_RUNTIME_API_TOKEN", type: "secret_text" },
          ],
          script: {
            etag: "runtime-host-live-etag",
            handlers: [],
            last_deployed_from: "wrangler",
            named_handlers: [{
              handlers: ["class"],
              name: "AliceRuntimeContainer",
            }],
          },
          script_runtime: {
            compatibility_date: "2026-08-22",
            containers: [{ class_name: "AliceRuntimeContainer" }],
            migration_tag: "v2-alice-runtime-container",
            usage_model: "standard",
          },
        },
      },
      scriptSettings: {
        logpush: false,
        observability: null,
        tags: null,
        tail_consumers: null,
      },
    },
  };
}

test("normalizes every persistent script setting with explicit defaults", () => {
  assert.deepEqual(normalizeAliceCloudflareScriptSettings({}), {
    logpush: false,
    observability: {
      enabled: false,
      head_sampling_rate: null,
      logs: null,
      redact_query_string: false,
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
        redact_query_string: false,
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
        redact_query_string: false,
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

test("normalizes immutable version resources and exact provider-owned binding values", () => {
  assert.equal(typeof rollback.normalizeAliceCloudflareVersionResources, "function");
  const fixtures = sixRoleRollbackReadbacks();
  const access = rollback.normalizeAliceCloudflareVersionResources(
    fixtures.access.version.resources,
  );
  assert.deepEqual(access.script, { etag: "access-live-etag" });
  assert.deepEqual(access.script_runtime, {
    cache_options: null,
    compatibility_date: "2026-02-18",
    compatibility_flags: [],
    exports: {},
    limits: null,
    migration_tag: null,
    usage_model: "standard",
  });
  for (const name of ["UPSTREAM_HOST_HEADER", "UPSTREAM_ORIGIN"]) {
    assert.equal(access.bindings.find((binding) => binding.name === name).text, "");
  }
  const ai = rollback.normalizeAliceCloudflareVersionResources(
    fixtures.aiGateway.version.resources,
  );
  assert.equal(ai.bindings.find(({ name }) => name === "AI").project, "alice-production");
  const runtimeHost = rollback.normalizeAliceCloudflareVersionResources(
    fixtures.runtimeHost.version.resources,
  );
  assert.deepEqual(runtimeHost.script_runtime.containers, [
    { class_name: "AliceRuntimeContainer" },
  ]);
  assert.equal(runtimeHost.script_runtime.migration_tag, "v2-alice-runtime-container");
  assert.equal(
    runtimeHost.bindings.find(({ name }) => name === "ALICE_RUNTIME_CONTAINER")
      .namespace_id,
    "55555555555555555555555555555555",
  );
  const legacyAccess = rollback.normalizeAliceCloudflareVersionResources({
    ...fixtures.access.version.resources,
    bindings: [{
      class_name: "AliceRuntimeContainer",
      name: "ALICE_RUNTIME_CONTAINER",
      namespace_id: "55555555555555555555555555555555",
      type: "durable_object_namespace",
    }],
    script_runtime: {
      compatibility_date: "2026-08-22",
      migration_tag: "v2-alice-runtime-container",
      usage_model: "standard",
    },
  });
  assert.equal(
    Object.hasOwn(
      legacyAccess.bindings.find(
        ({ name }) => name === "ALICE_RUNTIME_CONTAINER",
      ),
      "script_name",
    ),
    false,
    "the rollback anchor must preserve a legacy Access-owned namespace exactly",
  );
  assert.equal(
    legacyAccess.script_runtime.migration_tag,
    "v2-alice-runtime-container",
  );
  const externalAccess = rollback.normalizeAliceCloudflareVersionResources({
    ...fixtures.access.version.resources,
    bindings: [{
      class_name: "AliceRuntimeContainer",
      name: "ALICE_RUNTIME_CONTAINER",
      namespace_id: "55555555555555555555555555555555",
      script_name: "alice-runtime-container-host",
      type: "durable_object_namespace",
    }],
  });
  assert.equal(
    externalAccess.bindings[0].script_name,
    "alice-runtime-container-host",
  );
  const state = rollback.normalizeAliceCloudflareVersionResources({
    ...fixtures.aiGateway.version.resources,
    bindings: [
      {
        database_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "ALICE_STATE_DB",
        type: "d1",
      },
      {
        index_name: "alice-memory-v1",
        name: "ALICE_MEMORY_INDEX",
        type: "vectorize",
      },
    ],
  });
  assert.deepEqual(state.bindings, [
    {
      database_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "ALICE_STATE_DB",
      type: "d1",
    },
    {
      index_name: "alice-memory-v1",
      name: "ALICE_MEMORY_INDEX",
      type: "vectorize",
    },
  ]);
});

test("rejects malformed immutable resources and provider additions", () => {
  for (const observability of [
    { enabled: true, redact_query_string: null },
    { enabled: true, redact_query_string: "false" },
  ]) {
    assert.throws(
      () => normalizeAliceCloudflareScriptSettings({ observability }),
      /ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID/,
    );
  }
  assert.equal(typeof rollback.normalizeAliceCloudflareVersionResources, "function");
  const fixtures = sixRoleRollbackReadbacks();
  const invalidBindings = [
    { name: "", text: "", type: "plain_text" },
    { name: "EMPTY", text: "", type: "" },
    { name: "CRLF", text: "bad\nvalue", type: "plain_text" },
    { name: "QUEUE", queue_name: "", type: "queue" },
    { name: "SERVICE", service: "", type: "service" },
    { bucket_name: "", name: "BUCKET", type: "r2_bucket" },
  ];
  for (const binding of invalidBindings) {
    assert.throws(
      () => rollback.normalizeAliceCloudflareVersionResources({
        ...fixtures.access.version.resources,
        bindings: [binding],
      }),
      /ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID/,
    );
  }
  for (const project of ["", "bad\nproject", false]) {
    assert.throws(
      () => rollback.normalizeAliceCloudflareVersionResources({
        ...fixtures.aiGateway.version.resources,
        bindings: [{ name: "AI", project, type: "ai" }],
      }),
      /ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID/,
    );
  }
  for (const resources of [
    { ...fixtures.access.version.resources, unknown: true },
    { ...fixtures.access.version.resources, script: {} },
    { ...fixtures.access.version.resources, script_runtime: { placement: {} } },
    {
      ...fixtures.runtimeHost.version.resources,
      script_runtime: {
        ...fixtures.runtimeHost.version.resources.script_runtime,
        containers: [{ class_name: "" }],
      },
    },
  ]) {
    assert.throws(
      () => rollback.normalizeAliceCloudflareVersionResources(resources),
      /ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID/,
    );
  }
});

test("captures the production-shaped current response for every Alice Worker", async () => {
  const fixtures = sixRoleRollbackReadbacks();
  const json = (result) => new Response(
    JSON.stringify({ success: true, result }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
  const fetchImpl = async (input, init) => {
    assert.equal(init?.method, "GET");
    const url = new URL(input);
    const match = url.pathname.match(/\/workers\/scripts\/([^/]+)(.*)$/);
    assert.ok(match);
    const fixture = Object.values(fixtures).find(({ worker }) => worker === match[1]);
    assert.ok(fixture);
    const suffix = match[2];
    if (suffix === "/deployments") return json(fixture.deployment);
    if (suffix === `/versions/${fixture.version.id}`) return json(fixture.version);
    if (suffix === "/script-settings") return json(fixture.scriptSettings);
    throw new Error(`unexpected ${url}`);
  };

  const captured = await captureAliceCloudflareWorkerRollbackState({
    fetchImpl,
    apiToken: "test-api-token",
    baseUrl: "https://api.cloudflare.test/client/v4",
  });
  assert.deepEqual(Object.keys(captured), [
    "access",
    "runtimeHost",
    "control",
    "aiGateway",
    "statePlane",
    "connectorPlane",
  ]);
  assert.deepEqual(captured.access.scriptSettings, {
    logpush: false,
    observability: null,
    tags: null,
    tail_consumers: null,
  });
  assert.equal(captured.access.versionResources.script.etag, "access-live-etag");
  assert.equal(
    captured.access.versionResources.bindings.find(
      ({ name }) => name === "UPSTREAM_ORIGIN",
    ).text,
    "",
  );
  for (const role of ["control", "aiGateway"]) {
    assert.equal(captured[role].scriptSettings.observability.redact_query_string, false);
  }
  assert.equal(
    captured.aiGateway.versionResources.bindings.find(({ name }) => name === "AI").project,
    "alice-production",
  );
  assert.equal(
    captured.statePlane.versionResources.bindings.find(
      ({ name }) => name === "ALICE_STATE_DB",
    ).database_id,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
  assert.equal(
    captured.connectorPlane.versionResources.bindings.find(
      ({ name }) => name === "ALICE_CONNECTOR_OUTBOUND",
    ).namespace_id,
    "44444444444444444444444444444444",
  );
  assert.equal(
    captured.runtimeHost.versionResources.script_runtime.migration_tag,
    "v2-alice-runtime-container",
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
    "alice-state-plane": [
      "44444444-4444-4444-8444-444444444441",
      "44444444-4444-4444-8444-444444444444",
    ],
    "alice-connector-plane": [
      "55555555-5555-4555-8555-555555555551",
      "55555555-5555-4555-8555-555555555555",
    ],
    "alice-runtime-container-host": [
      "66666666-6666-4666-8666-666666666661",
      "66666666-6666-4666-8666-666666666666",
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
        resources: {
          bindings: [{ name: "SECRET", type: "secret_text" }],
          script: { etag: `etag-${worker}` },
          script_runtime: {
            compatibility_date: "2026-08-22",
            ...(worker === "alice-runtime-container-host"
              ? { migration_tag: "v2-alice-runtime-container" }
              : {}),
            usage_model: "standard",
          },
        },
      });
    }
    if (suffix === "/script-settings") return json(scriptSettings[worker]);
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
  workers["alice-state-plane"][0] =
    "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  workers["alice-connector-plane"][0] =
    "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  workers["alice-runtime-container-host"][0] =
    "ffffffff-ffff-4fff-8fff-ffffffffffff";
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
    statePlane: {
      ...expected.statePlane,
      serving: {
        ...expected.statePlane.serving,
        deploymentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
    },
    connectorPlane: {
      ...expected.connectorPlane,
      serving: {
        ...expected.connectorPlane.serving,
        deploymentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
    },
    runtimeHost: {
      ...expected.runtimeHost,
      serving: {
        ...expected.runtimeHost.serving,
        deploymentId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      },
    },
  });
  assert.deepEqual(restored.deployments.access, {
    previousDeploymentId: "11111111-1111-4111-8111-111111111111",
    rollbackDeploymentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    versionId: "11111111-1111-4111-8111-111111111112",
  });
  assert.deepEqual(restored.deployments.runtimeHost, {
    previousDeploymentId: "66666666-6666-4666-8666-666666666661",
    rollbackDeploymentId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    versionId: "66666666-6666-4666-8666-666666666666",
  });
  assert.equal(
    restored.restored.runtimeHost.versionResources.script_runtime.migration_tag,
    "v2-alice-runtime-container",
  );
  assert.equal(patches.length, 6);
  assert.deepEqual(patches.map(({ worker }) => worker), [
    "alice-access-gateway",
    "alice-runtime-container-host",
    "alice-connector-plane",
    "alice-ai-gateway",
    "alice-production-control",
    "alice-state-plane",
  ]);
  for (const patch of patches) {
    assert.deepEqual(patch.body, {
      logpush: false,
      observability: { enabled: false, redact_query_string: false },
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
