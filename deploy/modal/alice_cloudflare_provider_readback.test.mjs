import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  buildAliceAccessEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceControlEffectiveConfig,
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
  verifyAliceProviderControlFingerprints,
  verifyAliceWorkerProviderReadback,
} from "./alice_cloudflare_provider_readback.mjs";
import {
  buildAliceAccessPolicyProviderConfig,
  buildAliceAiGatewayProviderConfig,
} from "./alice_cloudflare_provider_config.mjs";
import {
  aliceTestCloudflareContinuityReadback,
  aliceTestProviderReadbacks,
  aliceTestVerifiedWorkerBundleArtifact,
} from "./test-fixtures/alice_provider_readbacks.mjs";

const { accessPolicyReadback, aiGatewayProviderReadback } =
  aliceTestProviderReadbacks({ accessAudience: "alice-access-audience" });
const owner = accessPolicyReadback.ownerEmailSha256;
const accessPolicyConfig =
  await buildAliceAccessPolicyProviderConfig(accessPolicyReadback);
const aiGatewayProviderConfig =
  buildAliceAiGatewayProviderConfig(aiGatewayProviderReadback);
const workerModules = {
  access: "export default { fetch() { return new Response('access'); } };\n",
  control: "export default { fetch() { return new Response('control'); } };\n",
  aiGateway: "export default { fetch() { return new Response('ai'); } };\n",
};
const workerBundleArtifact = aliceTestVerifiedWorkerBundleArtifact({
  sourceCommit: "1".repeat(40),
  workerModules,
});
const cloudflareContinuityReadback = aliceTestCloudflareContinuityReadback();

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
};
const effective = {
  access: buildAliceAccessEffectiveConfig({
    accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
    accessAudience: "alice-access-audience",
    ownerEmailSha256: owner,
    upstreamOrigin: "https://rndrntwrk--alice.modal.run",
  }),
  control: buildAliceControlEffectiveConfig({
    accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
    accessAudience: "alice-access-audience",
    ownerEmailSha256: owner,
    modelDailyBudgetUnits: 10_000,
    modalRevision: 49,
    releaseAccessAudience: "alice-release-controller-audience",
    releaseServiceTokenIdSha256: "R".repeat(43),
  }),
  aiGateway: buildAliceAiGatewayEffectiveConfig(),
};

const manifest = await buildAliceDeploymentManifest({
  releaseEpoch: 1,
  sourceCommit: "1".repeat(40),
  deploymentControllerCommit: "2".repeat(40),
  elizaCommit: "3".repeat(40),
  runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"4".repeat(64)}`,
  runtimeBuildManifestSha256: `sha256:${"5".repeat(64)}`,
  capabilityBomSha256: `sha256:${"a".repeat(64)}`,
  modalRevision: 49,
  policyHash: `sha256:${"6".repeat(64)}`,
  rollbackBoundary: "modal:alice-runtime:v49",
  accessEffectiveConfig: effective.access,
  controlEffectiveConfig: effective.control,
  aiGatewayEffectiveConfig: effective.aiGateway,
  accessPolicyReadback,
  aiGatewayProviderReadback,
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
    return { ...common, upstreamOrigin: "https://rndrntwrk--alice.modal.run" };
  }
  if (role === "control") {
    return {
      ...common,
      modelDailyBudgetUnits: 10_000,
      modalRevision: 49,
      releaseAccessAudience: "alice-release-controller-audience",
      releaseServiceTokenIdSha256: "R".repeat(43),
      programEnvelopeB64: "program-envelope",
      programSignatureB64: "program-signature",
      programPublicJwkB64: "program-public-jwk",
    };
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
  if (config.ai) bindings.push({ name: config.ai.binding, type: "ai" });
  if (config.version_metadata) {
    bindings.push({ name: config.version_metadata.binding, type: "version_metadata" });
  }
  return bindings;
}

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

test("accepts only a 100 percent deployed Worker version matching the signed effective config", async () => {
  for (const role of ["access", "control", "aiGateway"]) {
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
  deployConfig.materializedWranglerConfig.vars.ALICE_UPSTREAM_ORIGIN =
    "https://rndrntwrk--alice-substituted.modal.run";
  deployConfig.version.resources.bindings.find(
    (item) => item.name === "ALICE_UPSTREAM_ORIGIN",
  ).text = "https://rndrntwrk--alice-substituted.modal.run";
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
      cloudflareContinuityReadback,
    }),
    /ALICE_PROVIDER_CONTROL_FINGERPRINT_MISMATCH/,
  );
  await assert.rejects(
    () => verifyAliceProviderControlFingerprints({
      serializedManifest,
      accessPolicyReadback,
      aiGatewayProviderReadback,
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
});
