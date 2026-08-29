import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  buildAliceContainerAccessEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceConnectorPlaneEffectiveConfig,
  buildAliceContainerControlEffectiveConfig,
  buildAliceRuntimeHostEffectiveConfig,
  buildAliceStatePlaneEffectiveConfig,
} from "../../workers/alice-effective-config.js";
import {
  materializeAliceWranglerConfig,
} from "./alice_cloudflare_config.mjs";
import {
  buildAliceDeploymentManifest,
  serializeAliceDeploymentManifest,
} from "./alice_deployment_manifest.mjs";
import {
  readAliceWorkerMainModule,
  verifyAliceContainerApplicationReadback,
  verifyAliceProviderControlFingerprints,
  verifyAliceWorkerProviderBindingSnapshot,
  verifyAliceWorkerProviderReadback,
} from "./alice_cloudflare_provider_readback.mjs";
import * as providerReadback from "./alice_cloudflare_provider_readback.mjs";
import {
  buildAliceAccessPolicyProviderConfig,
  buildAliceAiGatewayProviderConfig,
  buildAliceVectorizeProviderConfig,
} from "./alice_cloudflare_provider_config.mjs";
import {
  aliceTestCloudflareContinuityReadback,
  aliceTestProviderReadbacks,
  aliceTestVerifiedWorkerBundleArtifact,
} from "./test-fixtures/alice_provider_readbacks.mjs";

const {
  accessPolicyReadback,
  aiGatewayProviderReadback,
  vectorizeProviderReadback,
} =
  aliceTestProviderReadbacks({ accessAudience: "alice-access-audience" });
const owner = accessPolicyReadback.ownerEmailSha256;
const accessPolicyConfig =
  await buildAliceAccessPolicyProviderConfig(accessPolicyReadback);
const aiGatewayProviderConfig =
  buildAliceAiGatewayProviderConfig(aiGatewayProviderReadback);
const vectorizeProviderConfig =
  buildAliceVectorizeProviderConfig(vectorizeProviderReadback);
const workerModules = {
  access: "export default { fetch() { return new Response('access'); } };\n",
  control: "export default { fetch() { return new Response('control'); } };\n",
  aiGateway: "export default { fetch() { return new Response('ai'); } };\n",
  statePlane: "export default { fetch() { return new Response('state'); } };\n",
  connectorPlane:
    "export default { fetch() { return new Response('connector'); } };\n",
};
const workerBundleArtifact = aliceTestVerifiedWorkerBundleArtifact({
  sourceCommit: "1".repeat(40),
  workerModules,
});
const cloudflareContinuityReadback = aliceTestCloudflareContinuityReadback();
const runtimeContainerImage =
  `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"4".repeat(64)}`;

const source = {
  access: JSON.parse(
    fs.readFileSync(
      new URL("../../workers/alice-access-gateway/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ),
  control: JSON.parse(
    fs.readFileSync(
      new URL("../../workers/alice-production-control/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ),
  aiGateway: JSON.parse(
    fs.readFileSync(
      new URL("../../workers/alice-ai-gateway/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ),
  statePlane: JSON.parse(
    fs.readFileSync(
      new URL("../../workers/alice-state-plane/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ),
  connectorPlane: JSON.parse(
    fs.readFileSync(
      new URL("../../workers/alice-connector-plane/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ),
};
const effective = {
  access: buildAliceContainerAccessEffectiveConfig({
    accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
    accessAudience: "alice-access-audience",
    ownerEmailSha256: owner,
    runtimeImage: runtimeContainerImage,
  }),
  runtimeHost: buildAliceRuntimeHostEffectiveConfig({
    runtimeImage: runtimeContainerImage,
  }),
  control: buildAliceContainerControlEffectiveConfig({
    accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
    accessAudience: "alice-access-audience",
    ownerEmailSha256: owner,
    modelDailyBudgetUnits: 10_000,
    runtimeRevision: 49,
    releaseAccessAudience: "alice-release-controller-audience",
    releaseServiceTokenIdSha256: "R".repeat(43),
  }),
  aiGateway: buildAliceAiGatewayEffectiveConfig(),
  statePlane: buildAliceStatePlaneEffectiveConfig({
    databaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }),
  connectorPlane: buildAliceConnectorPlaneEffectiveConfig({
    providerActivation: "disabled",
  }),
};

const manifest = await buildAliceDeploymentManifest({
  releaseEpoch: 1,
  sourceCommit: "1".repeat(40),
  deploymentControllerCommit: "2".repeat(40),
  elizaCommit: "3".repeat(40),
  runtimeImage: runtimeContainerImage,
  runtimeBuildManifestSha256: `sha256:${"5".repeat(64)}`,
  capabilityBomSha256: `sha256:${"a".repeat(64)}`,
  runtimeRevision: 49,
  policyHash: `sha256:${"6".repeat(64)}`,
  rollbackBoundary: "container:alice-runtime:v49",
  accessEffectiveConfig: effective.access,
  runtimeHostEffectiveConfig: effective.runtimeHost,
  controlEffectiveConfig: effective.control,
  aiGatewayEffectiveConfig: effective.aiGateway,
  statePlaneEffectiveConfig: effective.statePlane,
  connectorPlaneEffectiveConfig: effective.connectorPlane,
  accessPolicyReadback,
  aiGatewayProviderReadback,
  vectorizeProviderReadback,
  cloudflareContinuityReadback,
  workerBundleArtifact,
});
const serializedManifest = serializeAliceDeploymentManifest(manifest);

function deploymentValues(role) {
  const common = {
    accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
    accessAudience: "alice-access-audience",
    ownerEmailSha256: owner,
    deploymentManifestSha256: `sha256:${"0".repeat(64)}`,
    deploymentManifestB64: "pending",
  };
  if (role === "access") {
    return { ...common, runtimeImage: runtimeContainerImage };
  }
  if (role === "control") {
    return {
      ...common,
      modelDailyBudgetUnits: 10_000,
      runtimeRevision: 49,
      releaseAccessAudience: "alice-release-controller-audience",
      releaseServiceTokenIdSha256: "R".repeat(43),
      programEnvelopeB64: "program-envelope",
      programSignatureB64: "program-signature",
      programPublicJwkB64: "program-public-jwk",
    };
  }
  if (role === "statePlane") {
    return {
      ...common,
      stateDatabaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
  }
  if (role === "connectorPlane") {
    return { ...common, providerActivation: "disabled" };
  }
  return common;
}

function providerBindings(config) {
  const bindings = [];
  for (const [name, text] of Object.entries(config.vars ?? {})) {
    bindings.push({ name, text: String(text), type: "plain_text" });
  }
  for (const name of config.secrets?.required ?? []) {
    bindings.push({ name, type: "secret_text" });
  }
  for (const binding of config.services ?? []) {
    bindings.push({
      name: binding.binding,
      service: binding.service,
      type: "service",
    });
  }
  for (const binding of config.durable_objects?.bindings ?? []) {
    bindings.push({
      class_name: binding.class_name,
      name: binding.name,
      namespace_id: crypto
        .createHash("sha256")
        .update(`${binding.name}:${binding.class_name}`)
        .digest("hex")
        .slice(0, 32),
      script_name: binding.script_name ?? null,
      type: "durable_object_namespace",
    });
  }
  for (const binding of config.workflows ?? []) {
    bindings.push({
      class_name: binding.class_name,
      name: binding.binding,
      type: "workflow",
      workflow_name: binding.name,
    });
  }
  for (const binding of config.queues?.producers ?? []) {
    bindings.push({
      name: binding.binding,
      queue_name: binding.queue,
      type: "queue",
    });
  }
  for (const binding of config.r2_buckets ?? []) {
    bindings.push({
      bucket_name: binding.bucket_name,
      name: binding.binding,
      type: "r2_bucket",
    });
  }
  for (const binding of config.d1_databases ?? []) {
    bindings.push({
      database_id: binding.database_id,
      name: binding.binding,
      type: "d1",
    });
  }
  for (const binding of config.vectorize ?? []) {
    bindings.push({
      index_name: binding.index_name,
      name: binding.binding,
      type: "vectorize",
    });
  }
  if (config.ai) bindings.push({ name: config.ai.binding, type: "ai" });
  if (config.version_metadata) {
    bindings.push({ name: config.version_metadata.binding, type: "version_metadata" });
  }
  return bindings;
}

test("admits exact D1 and Vectorize version resources for the private state plane", () => {
  assert.equal(
    typeof providerReadback.verifyAliceWorkerProviderBindingSnapshot,
    "function",
  );
  const config = {
    vars: {},
    secrets: { required: [] },
    d1_databases: [{
      binding: "ALICE_STATE_DB",
      database_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }],
    vectorize: [{
      binding: "ALICE_MEMORY_INDEX",
      index_name: "alice-memory-v1",
    }],
  };
  const version = {
    resources: {
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
    },
  };
  assert.deepEqual(
    providerReadback.verifyAliceWorkerProviderBindingSnapshot({
      version,
      materializedWranglerConfig: config,
    }),
    [
      {
        databaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "ALICE_STATE_DB",
        type: "d1",
      },
      {
        indexName: "alice-memory-v1",
        name: "ALICE_MEMORY_INDEX",
        type: "vectorize",
      },
    ],
  );
  assert.throws(
    () => providerReadback.verifyAliceWorkerProviderBindingSnapshot({
      version: {
        resources: {
          bindings: version.resources.bindings.map((binding) =>
            binding.type === "d1"
              ? { ...binding, database_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }
              : binding),
        },
      },
      materializedWranglerConfig: config,
    }),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );
});

function fixture(role) {
  const config = materializeAliceWranglerConfig(
    role,
    source[role],
    deploymentValues(role),
  );
  const encoded = Buffer.from(serializedManifest).toString("base64url");
  config.vars.ALICE_DEPLOYMENT_MANIFEST_SHA256 =
    `sha256:${crypto.createHash("sha256").update(serializedManifest).digest("hex")}`;
  config.vars.ALICE_DEPLOYMENT_MANIFEST_B64 = encoded;
  const versionId = `${role}-version-id`;
  const bindings = providerBindings(config);
  const expectedDurableObjectNamespaceIds = bindings
    .filter((binding) => binding.type === "durable_object_namespace")
    .map((binding) => ({
      className: binding.class_name,
      name: binding.name,
      namespaceId: binding.namespace_id,
      scriptName: binding.script_name ?? null,
    }));
  const queue = config.queues?.consumers?.[0];
  const workflow = config.workflows?.[0];
  const deployment = {
    id: `${role}-deployment-id`,
    versions: [{ percentage: 100, version_id: versionId }],
  };
  return {
    role,
    expectedEffectiveConfig: effective[role],
    materializedWranglerConfig: config,
    serializedManifest,
    deployedMainModule: workerModules[role],
    deployment,
    deploymentAfterContent: JSON.parse(JSON.stringify(deployment)),
    version: {
      id: versionId,
      number: 49,
      resources: {
        bindings,
        script: { etag: `${role}-script-etag` },
        script_runtime: {
          cache_options: { enabled: false },
          compatibility_date: config.compatibility_date,
          compatibility_flags: [],
          exports: { default: { state: "created", type: "worker" } },
        },
      },
    },
    routes: (config.routes ?? []).map((route) => ({
      pattern: route.pattern,
      script: config.name,
    })),
    scriptSettings: {
      observability: JSON.parse(JSON.stringify(config.observability)),
    },
    scriptAndVersionSettings: {
      cache_options: { enabled: false },
      compatibility_date: config.compatibility_date,
      compatibility_flags: [],
      exports: { default: { state: "created", type: "worker" } },
    },
    subdomain: {
      enabled: config.workers_dev,
      previews_enabled: config.preview_urls,
    },
    queueConsumer: queue
      ? {
          dead_letter_queue: queue.dead_letter_queue,
          queue_name: queue.queue,
          script_name: config.name,
          settings: {
            batch_size: queue.max_batch_size,
            max_concurrency: queue.max_concurrency,
            max_retries: queue.max_retries,
            max_wait_time_ms: queue.max_batch_timeout * 1_000,
            retry_delay: queue.retry_delay,
          },
          type: "worker",
        }
      : undefined,
    workflow: workflow
      ? {
          class_name: workflow.class_name,
          name: workflow.name,
          script_name: config.name,
        }
      : undefined,
    expectedDurableObjectNamespaceIds,
  };
}

test("preserves the exact external Access reference to the runtimeHost namespace", () => {
  const namespaceId = "5".repeat(32);
  const externalConfig = {
    durable_objects: {
      bindings: [{
        class_name: "AliceRuntimeContainer",
        name: "ALICE_RUNTIME_CONTAINER",
        script_name: "alice-runtime-container-host",
      }],
    },
  };
  const externalVersion = {
    resources: {
      bindings: [{
        class_name: "AliceRuntimeContainer",
        name: "ALICE_RUNTIME_CONTAINER",
        namespace_id: namespaceId,
        script_name: "alice-runtime-container-host",
        type: "durable_object_namespace",
      }],
    },
  };
  assert.deepEqual(
    verifyAliceWorkerProviderBindingSnapshot({
      version: externalVersion,
      materializedWranglerConfig: externalConfig,
    }),
    [{
      className: "AliceRuntimeContainer",
      name: "ALICE_RUNTIME_CONTAINER",
      scriptName: "alice-runtime-container-host",
      type: "durable_object_namespace",
    }],
  );

  const localConfig = {
    durable_objects: {
      bindings: [{
        class_name: "AliceRuntimeContainer",
        name: "ALICE_RUNTIME_CONTAINER",
      }],
    },
  };
  const localVersion = structuredClone(externalVersion);
  delete localVersion.resources.bindings[0].script_name;
  assert.deepEqual(
    verifyAliceWorkerProviderBindingSnapshot({
      version: localVersion,
      materializedWranglerConfig: localConfig,
    }),
    [{
      className: "AliceRuntimeContainer",
      name: "ALICE_RUNTIME_CONTAINER",
      scriptName: null,
      type: "durable_object_namespace",
    }],
  );

  for (const scriptName of ["other-host", "", "alice-runtime-container-host\n"]) {
    const substituted = structuredClone(externalVersion);
    substituted.resources.bindings[0].script_name = scriptName;
    assert.throws(
      () => verifyAliceWorkerProviderBindingSnapshot({
        version: substituted,
        materializedWranglerConfig: externalConfig,
      }),
      /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
    );
  }
});

test("normalizes only the inert max-one runtimeHost container application", () => {
  const namespaceId = "5".repeat(32);
  const image =
    `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"4".repeat(64)}`;
  const application = {
    id: "55555555-5555-4555-8555-555555555555",
    account_id: "036df6c823669b8fa2f66cf4c16eeb29",
    created_at: "2026-08-29T12:00:00.000Z",
    name: "alice-production-runtime",
    version: 1,
    scheduling_policy: "default",
    instances: 0,
    max_instances: 1,
    configuration: {
      image,
      instance_type: "standard-1",
      ports: [],
    },
    durable_objects: { namespace_id: namespaceId },
    health: {
      instances: {
        active: 0,
        healthy: 0,
        failed: 0,
        starting: 0,
        scheduling: 0,
      },
    },
  };
  const config = {
    account_id: application.account_id,
    containers: [{
      class_name: "AliceRuntimeContainer",
      image,
      instance_type: "standard-1",
      max_instances: 1,
      name: application.name,
    }],
    durable_objects: {
      bindings: [{
        class_name: "AliceRuntimeContainer",
        name: "ALICE_RUNTIME_CONTAINER",
      }],
    },
  };
  assert.deepEqual(
    verifyAliceContainerApplicationReadback({
      application,
      applicationInstances: [],
      materializedWranglerConfig: config,
      expectedNamespaceId: namespaceId,
    }),
    {
      applicationId: application.id,
      applicationName: application.name,
      applicationVersion: 1,
      image,
      instanceType: "standard-1",
      maxInstances: 1,
      namespaceId,
      activeInstances: 0,
    },
  );

  const substitutions = [
    { ...application, instances: 1 },
    { ...application, max_instances: 2 },
    { ...application, name: "other-runtime" },
    { ...application, durable_objects: { namespace_id: "6".repeat(32) } },
    {
      ...application,
      configuration: { ...application.configuration, image: `${image}-other` },
    },
    {
      ...application,
      configuration: { ...application.configuration, ports: [{ port: 2138 }] },
    },
    {
      ...application,
      health: {
        instances: { ...application.health.instances, starting: 1 },
      },
    },
  ];
  for (const substituted of substitutions) {
    assert.throws(
      () => verifyAliceContainerApplicationReadback({
        application: substituted,
        applicationInstances: [],
        materializedWranglerConfig: config,
        expectedNamespaceId: namespaceId,
      }),
      /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
    );
  }
  assert.throws(
    () => verifyAliceContainerApplicationReadback({
      application,
      applicationInstances: [{ id: "unexpected-running-instance" }],
      materializedWranglerConfig: config,
      expectedNamespaceId: namespaceId,
    }),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );
});

test("accepts only a 100 percent deployed Worker version matching the signed effective config", async () => {
  for (const role of [
    "access",
    "control",
    "aiGateway",
    "statePlane",
    "connectorPlane",
  ]) {
    const readback = await verifyAliceWorkerProviderReadback(fixture(role));
    assert.equal(readback.role, role);
    assert.equal(readback.versionId, `${role}-version-id`);
    assert.equal(readback.trafficPercentage, 100);
    assert.match(readback.providerReadbackSha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(readback.signedEffectiveConfigSha256, /^sha256:[a-f0-9]{64}$/);
    assert.ok(Array.isArray(readback.providerUnverifiableFields));
    assert.ok(Array.isArray(readback.durableObjectNamespaceIds));
    for (const binding of readback.durableObjectNamespaceIds) {
      assert.match(binding.namespaceId, /^[a-f0-9]{32}$/);
    }
  }
  const connector = fixture("connectorPlane");
  const connectorBindingNames = connector.version.resources.bindings.map(
    ({ name }) => name,
  );
  for (const forbiddenProviderBinding of [
    "ALICE_DISCORD_PRIVATE_DESTINATION_ID",
    "ALICE_TELEGRAM_PRIVATE_DESTINATION_ID",
    "DISCORD_API_TOKEN",
    "DISCORD_APPLICATION_ID",
    "TELEGRAM_BOT_TOKEN",
  ]) {
    assert.equal(connectorBindingNames.includes(forbiddenProviderBinding), false);
  }
  assert.deepEqual(connector.routes, []);
  assert.deepEqual(connector.subdomain, {
    enabled: false,
    previews_enabled: false,
  });
});

test("extracts the exact provider main-module bytes from Cloudflare multipart content", async () => {
  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({ main_module: "index.js" }),
  );
  form.set(
    "index.js",
    new Blob([workerModules.access], { type: "application/javascript+module" }),
    "index.js",
  );
  const bytes = await readAliceWorkerMainModule(new Response(form));
  assert.equal(new TextDecoder().decode(bytes), workerModules.access);

  const missing = new FormData();
  missing.set("metadata", JSON.stringify({ main_module: "absent.js" }));
  await assert.rejects(
    () => readAliceWorkerMainModule(new Response(missing)),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );
});

test("rejects traffic, binding, and observability substitutions in provider state", async () => {
  for (const extraBinding of [
    {
      name: "ALICE_DISCORD_PRIVATE_DESTINATION_ID",
      text: "unadmitted-destination",
      type: "plain_text",
    },
    { name: "DISCORD_API_TOKEN", type: "secret_text" },
  ]) {
    const activatedConnector = fixture("connectorPlane");
    activatedConnector.version.resources.bindings.push(extraBinding);
    await assert.rejects(
      () => verifyAliceWorkerProviderReadback(activatedConnector),
      /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
    );
  }

  const traffic = fixture("access");
  traffic.deployment.versions[0].percentage = 99;
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(traffic),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const race = fixture("access");
  race.deploymentAfterContent.versions[0].version_id = "raced-version";
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(race),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const binding = fixture("access");
  binding.version.resources.bindings.find((item) => item.type === "service").service =
    "alice-control-substituted";
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(binding),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  for (const [field, value] of [
    ["environment", "staging"],
    ["entrypoint", "alternate"],
  ]) {
    const targetedService = fixture("access");
    targetedService.version.resources.bindings.find(
      (item) => item.type === "service",
    )[field] = value;
    await assert.rejects(
      () => verifyAliceWorkerProviderReadback(targetedService),
      /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
    );
  }

  const missingNamespaceId = fixture("control");
  delete missingNamespaceId.version.resources.bindings.find(
    (item) => item.type === "durable_object_namespace",
  ).namespace_id;
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(missingNamespaceId),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const substitutedNamespaceId = fixture("control");
  substitutedNamespaceId.version.resources.bindings.find(
    (item) => item.type === "durable_object_namespace",
  ).namespace_id = "f".repeat(32);
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(substitutedNamespaceId),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  for (const [field, value] of [
    ["script_name", "external-control"],
    ["environment", "staging"],
    ["dispatch_namespace", "external-dispatch"],
    ["namespace_id", "not-a-provider-namespace-id"],
  ]) {
    const targetedNamespace = fixture("control");
    targetedNamespace.version.resources.bindings.find(
      (item) => item.type === "durable_object_namespace",
    )[field] = value;
    await assert.rejects(
      () => verifyAliceWorkerProviderReadback(targetedNamespace),
      /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
    );
  }

  const deployConfig = fixture("access");
  deployConfig.materializedWranglerConfig.vars.ALICE_CLOUDFLARE_RUNTIME_IMAGE =
    `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"f".repeat(64)}`;
  deployConfig.version.resources.bindings.find(
    (item) => item.name === "ALICE_CLOUDFLARE_RUNTIME_IMAGE",
  ).text = `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"f".repeat(64)}`;
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(deployConfig),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const observability = fixture("control");
  observability.scriptSettings.observability.traces.persist = false;
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(observability),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const compatibilityFlag = fixture("access");
  compatibilityFlag.version.resources.script_runtime.compatibility_flags = [
    "nodejs_compat",
  ];
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(compatibilityFlag),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const settingsCompatibilityFlag = fixture("access");
  settingsCompatibilityFlag.scriptAndVersionSettings.compatibility_flags = [
    "nodejs_compat",
  ];
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(settingsCompatibilityFlag),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const globalCache = fixture("access");
  globalCache.scriptAndVersionSettings.cache_options.enabled = true;
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(globalCache),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const entrypointCache = fixture("access");
  entrypointCache.scriptAndVersionSettings.exports.default.cache = {
    enabled: true,
  };
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(entrypointCache),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const code = fixture("access");
  code.deployedMainModule += "// same config, altered code\n";
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(code),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const missingConsumer = fixture("control");
  delete missingConsumer.queueConsumer;
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(missingConsumer),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const dlq = fixture("control");
  dlq.queueConsumer.dead_letter_queue = "alice-wrong-dlq";
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(dlq),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );

  const missingWorkflow = fixture("control");
  delete missingWorkflow.workflow;
  await assert.rejects(
    () => verifyAliceWorkerProviderReadback(missingWorkflow),
    /ALICE_WORKER_PROVIDER_READBACK_MISMATCH/,
  );
});

test("binds exact Access and AI Gateway provider settings into the deployment manifest", async () => {
  const result = await verifyAliceProviderControlFingerprints({
    serializedManifest,
    accessPolicyReadback,
    aiGatewayProviderReadback,
    vectorizeProviderReadback,
    cloudflareContinuityReadback,
  });
  assert.equal(
    result.accessPolicyConfigSha256,
    manifest.cloudflare.accessPolicyConfigSha256,
  );
  assert.equal(
    result.aiGatewayProviderConfigSha256,
    manifest.cloudflare.aiGatewayProviderConfigSha256,
  );
  assert.equal(
    result.vectorizeProviderConfigSha256,
    manifest.cloudflare.vectorizeProviderConfigSha256,
  );
  assert.equal(
    result.continuityConfigSha256,
    manifest.cloudflare.continuityConfigSha256,
  );

  await assert.rejects(
    () => verifyAliceProviderControlFingerprints({
      serializedManifest,
      accessPolicyReadback: {
        ...accessPolicyReadback,
        policies: [{
          ...accessPolicyReadback.policies[0],
          require: accessPolicyReadback.policies[0].require.filter(
            (rule) => !("device_posture" in rule),
          ),
        }],
      },
      aiGatewayProviderReadback,
      vectorizeProviderReadback,
      cloudflareContinuityReadback,
    }),
    /ALICE_PROVIDER_CONTROL_FINGERPRINT_MISMATCH/,
  );
  await assert.rejects(
    () => verifyAliceProviderControlFingerprints({
      serializedManifest,
      accessPolicyReadback,
      aiGatewayProviderReadback: {
        ...aiGatewayProviderReadback,
        cache_ttl: 300,
      },
      vectorizeProviderReadback,
      cloudflareContinuityReadback,
    }),
    /ALICE_PROVIDER_CONTROL_FINGERPRINT_MISMATCH/,
  );
  await assert.rejects(
    () => verifyAliceProviderControlFingerprints({
      serializedManifest,
      accessPolicyReadback,
      aiGatewayProviderReadback,
      vectorizeProviderReadback,
      cloudflareContinuityReadback: {
        ...cloudflareContinuityReadback,
        workflow: {
          ...cloudflareContinuityReadback.workflow,
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        },
      },
    }),
    /ALICE_PROVIDER_CONTROL_FINGERPRINT_MISMATCH/,
  );
  await assert.rejects(
    () => verifyAliceProviderControlFingerprints({
      serializedManifest,
      accessPolicyReadback,
      aiGatewayProviderReadback,
      vectorizeProviderReadback: {
        ...vectorizeProviderReadback,
        config: { dimensions: 768, metric: "dot-product" },
      },
      cloudflareContinuityReadback,
    }),
    /ALICE_PROVIDER_CONTROL_FINGERPRINT_MISMATCH/,
  );
});
