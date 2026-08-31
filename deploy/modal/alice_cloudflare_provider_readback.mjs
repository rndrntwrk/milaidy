import crypto from "node:crypto";

import {
  ALICE_CLOUDFLARE_TARGET,
  canonicalAliceJson,
  digestAliceEffectiveConfig,
  encodeAliceDeploymentManifest,
  verifyAliceEffectiveConfigBinding,
} from "../../workers/alice-effective-config.js";
import {
  digestAliceDeploymentManifest,
  verifyAliceDeploymentManifest,
} from "./alice_deployment_manifest.mjs";
import {
  assertAliceWranglerMatchesEffectiveConfig,
} from "./alice_cloudflare_config.mjs";
import {
  buildAliceAccessPolicyProviderConfig,
  buildAliceAiGatewayProviderConfig,
  buildAliceVectorizeProviderConfig,
} from "./alice_cloudflare_provider_config.mjs";
import {
  buildAliceCloudflareContinuityConfig,
  digestAliceCloudflareContinuityConfig,
} from "./alice_cloudflare_continuity.mjs";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const NAMESPACE_ID = /^[a-f0-9]{32}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SCRIPT_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const CLOUDFLARE_CONTAINER_IMAGE =
  /^registry\.cloudflare\.com\/036df6c823669b8fa2f66cf4c16eeb29\/alice-runtime@sha256:[a-f0-9]{64}$/;
const ROLES = [
  "access",
  "control",
  "aiGateway",
  "statePlane",
  "connectorPlane",
  "runtimeHost",
];

function mismatch() {
  throw new Error("ALICE_WORKER_PROVIDER_READBACK_MISMATCH");
}

function canonicalEqual(left, right) {
  return canonicalAliceJson(left) === canonicalAliceJson(right);
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function sorted(values) {
  return [...values].sort((left, right) =>
    canonicalAliceJson(left).localeCompare(canonicalAliceJson(right)),
  );
}

function present(value) {
  return value !== undefined && value !== null;
}

function rejectProviderTargetModifiers(binding, names) {
  if (names.some((name) => present(binding?.[name]))) mismatch();
}

function normalizeObservability(value) {
  return JSON.parse(JSON.stringify({
    enabled: value?.enabled,
    head_sampling_rate: value?.head_sampling_rate,
    logs: {
      enabled: value?.logs?.enabled,
      head_sampling_rate: value?.logs?.head_sampling_rate,
      invocation_logs: value?.logs?.invocation_logs,
      persist: value?.logs?.persist,
    },
    traces: {
      enabled: value?.traces?.enabled,
      head_sampling_rate: value?.traces?.head_sampling_rate,
      persist: value?.traces?.persist,
    },
  }));
}

function expectedBindings(config) {
  const result = [];
  for (const [name, text] of Object.entries(config.vars ?? {})) {
    result.push({ name, text: String(text), type: "plain_text" });
  }
  for (const name of config.secrets?.required ?? []) {
    result.push({ name, type: "secret_text" });
  }
  for (const binding of config.services ?? []) {
    result.push({
      name: binding.binding,
      service: binding.service,
      type: "service",
    });
  }
  for (const binding of config.durable_objects?.bindings ?? []) {
    result.push({
      className: binding.class_name,
      name: binding.name,
      scriptName: binding.script_name ?? null,
      type: "durable_object_namespace",
    });
  }
  for (const binding of config.workflows ?? []) {
    result.push({
      className: binding.class_name,
      name: binding.binding,
      type: "workflow",
      workflowName: binding.name,
    });
  }
  for (const binding of config.queues?.producers ?? []) {
    result.push({
      name: binding.binding,
      queueName: binding.queue,
      type: "queue",
    });
  }
  for (const binding of config.r2_buckets ?? []) {
    result.push({
      bucketName: binding.bucket_name,
      name: binding.binding,
      type: "r2_bucket",
    });
  }
  for (const binding of config.d1_databases ?? []) {
    result.push({
      databaseId: binding.database_id,
      name: binding.binding,
      type: "d1",
    });
  }
  for (const binding of config.vectorize ?? []) {
    result.push({
      indexName: binding.index_name,
      name: binding.binding,
      type: "vectorize",
    });
  }
  if (config.ai) result.push({ name: config.ai.binding, type: "ai" });
  if (config.version_metadata) {
    result.push({ name: config.version_metadata.binding, type: "version_metadata" });
  }
  return sorted(result);
}

function providerBinding(binding) {
  switch (binding?.type) {
    case "plain_text":
      return { name: binding.name, text: binding.text, type: binding.type };
    case "secret_text":
      return { name: binding.name, type: binding.type };
    case "service":
      if (
        binding.environment !== undefined &&
        binding.environment !== "production"
      ) {
        mismatch();
      }
      rejectProviderTargetModifiers(binding, [
        "entrypoint",
        "namespace",
        "dispatch_namespace",
      ]);
      return {
        name: binding.name,
        service: binding.service,
        type: binding.type,
      };
    case "durable_object_namespace":
      rejectProviderTargetModifiers(binding, [
        "environment",
        "dispatch_namespace",
        "namespace",
        "namespace_name",
      ]);
      if (
        (present(binding.namespace_id) &&
          !NAMESPACE_ID.test(binding.namespace_id)) ||
        (present(binding.script_name) &&
          (typeof binding.script_name !== "string" ||
            !SCRIPT_NAME.test(binding.script_name) ||
            /[\r\n]/.test(binding.script_name)))
      ) {
        mismatch();
      }
      return {
        className: binding.class_name,
        name: binding.name,
        scriptName: binding.script_name ?? null,
        type: binding.type,
      };
    case "workflow":
      return {
        className: binding.class_name,
        name: binding.name,
        type: binding.type,
        workflowName: binding.workflow_name,
      };
    case "queue":
      return {
        name: binding.name,
        queueName: binding.queue_name,
        type: binding.type,
      };
    case "r2_bucket":
      return {
        bucketName: binding.bucket_name,
        name: binding.name,
        type: binding.type,
      };
    case "d1":
      if (binding.id !== undefined && binding.id !== binding.database_id) {
        mismatch();
      }
      return {
        databaseId: binding.database_id,
        name: binding.name,
        type: binding.type,
      };
    case "vectorize":
      return {
        indexName: binding.index_name,
        name: binding.name,
        type: binding.type,
      };
    case "ai":
    case "version_metadata":
      return { name: binding.name, type: binding.type };
    default:
      mismatch();
  }
}

function providerBindings(version) {
  if (!Array.isArray(version?.resources?.bindings)) mismatch();
  return sorted(version.resources.bindings.map(providerBinding));
}

export function verifyAliceWorkerProviderBindingSnapshot({
  version,
  materializedWranglerConfig,
}) {
  const observed = providerBindings(version);
  const expected = expectedBindings(materializedWranglerConfig ?? {});
  if (!canonicalEqual(observed, expected)) mismatch();
  return observed;
}

function providerDurableObjectNamespaceIds(version) {
  if (!Array.isArray(version?.resources?.bindings)) mismatch();
  return sorted(
    version.resources.bindings
      .filter((binding) => binding?.type === "durable_object_namespace")
      .map((binding) => {
        providerBinding(binding);
        if (!NAMESPACE_ID.test(binding.namespace_id ?? "")) mismatch();
        return {
          className: binding.class_name,
          name: binding.name,
          namespaceId: binding.namespace_id,
          scriptName: binding.script_name ?? null,
        };
      }),
  );
}

function expectedDurableObjectNamespaceIds(config, expected) {
  if (!Array.isArray(expected)) mismatch();
  const expectedBindings = sorted(
    (config.durable_objects?.bindings ?? []).map((binding) => ({
      className: binding.class_name,
      name: binding.name,
      scriptName: binding.script_name ?? null,
    })),
  );
  const normalized = sorted(
    expected.map((binding) => {
      if (
        !binding ||
        typeof binding !== "object" ||
        Array.isArray(binding) ||
        !exactKeys(binding, [
          "className",
          "name",
          "namespaceId",
          "scriptName",
        ]) ||
        !(
          binding.scriptName === null ||
          (typeof binding.scriptName === "string" &&
            SCRIPT_NAME.test(binding.scriptName) &&
            !/[\r\n]/.test(binding.scriptName))
        ) ||
        !NAMESPACE_ID.test(binding.namespaceId ?? "")
      ) {
        mismatch();
      }
      return {
        className: binding.className,
        name: binding.name,
        namespaceId: binding.namespaceId,
        scriptName: binding.scriptName,
      };
    }),
  );
  if (
    normalized.length !== expectedBindings.length ||
    !canonicalEqual(
      normalized.map(({ className, name, scriptName }) => ({
        className,
        name,
        scriptName,
      })),
      expectedBindings,
    )
  ) {
    mismatch();
  }
  return normalized;
}

export function verifyAliceContainerApplicationReadback({
  application,
  applicationInstances,
  expectedApplicationImage,
  materializedWranglerConfig,
  expectedNamespaceId,
}) {
  const container = materializedWranglerConfig?.containers?.[0];
  const expectedImage = expectedApplicationImage ?? container?.image;
  const durableObjectBindings =
    materializedWranglerConfig?.durable_objects?.bindings;
  const health = application?.health?.instances;
  const ports = application?.configuration?.ports;
  // Cloudflare returns the application deployment count and resolved resources
  // here; actual running Containers are verified via applicationInstances.
  if (
    !application ||
    !Array.isArray(applicationInstances) ||
    applicationInstances.length !== 0 ||
    materializedWranglerConfig?.account_id !== ALICE_CLOUDFLARE_TARGET.accountId ||
    !Array.isArray(materializedWranglerConfig?.containers) ||
    materializedWranglerConfig.containers.length !== 1 ||
    !Array.isArray(durableObjectBindings) ||
    durableObjectBindings.length !== 1 ||
    container?.name !== "alice-production-runtime" ||
    container?.class_name !== "AliceRuntimeContainer" ||
    container?.instance_type !== "standard-1" ||
    container?.max_instances !== 1 ||
    durableObjectBindings[0]?.name !== "ALICE_RUNTIME_CONTAINER" ||
    durableObjectBindings[0]?.class_name !== container.class_name ||
    present(durableObjectBindings[0]?.script_name) ||
    !NAMESPACE_ID.test(expectedNamespaceId ?? "") ||
    !UUID.test(application.id ?? "") ||
    application.account_id !== materializedWranglerConfig.account_id ||
    application.name !== container.name ||
    !Number.isSafeInteger(application.version) ||
    application.version < 1 ||
    application.scheduling_policy !== "default" ||
    application.instances !== 1 ||
    application.max_instances !== container.max_instances ||
    !CLOUDFLARE_CONTAINER_IMAGE.test(expectedImage ?? "") ||
    application.configuration?.image !== expectedImage ||
    application.configuration?.vcpu !== 0.5 ||
    application.configuration?.memory_mib !== 4096 ||
    application.configuration?.disk?.size_mb !== 8000 ||
    !(ports === undefined || (Array.isArray(ports) && ports.length === 0)) ||
    application.durable_objects?.namespace_id !== expectedNamespaceId ||
    !health ||
    !exactKeys(health, [
      "active",
      "assigned",
      "failed",
      "healthy",
      "scheduling",
      "starting",
      "stopped",
    ]) ||
    Object.values(health).some(
      (count) => !Number.isSafeInteger(count) || count < 0 || count > 1,
    ) ||
    health.failed !== 0
  ) {
    mismatch();
  }
  return {
    applicationId: application.id,
    applicationName: application.name,
    applicationVersion: application.version,
    image: application.configuration.image,
    instanceType: container.instance_type,
    maxInstances: application.max_instances,
    namespaceId: expectedNamespaceId,
    activeInstances: health.active,
  };
}

function normalizeCompatibilityFlags(value) {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) ||
    value.some((flag) => typeof flag !== "string" || flag.length === 0) ||
    new Set(value).size !== value.length
  ) {
    mismatch();
  }
  return [...value].sort();
}

function verifyCacheDisabled(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    mismatch();
  }
  if (present(settings.cache_options)) {
    if (
      typeof settings.cache_options !== "object" ||
      Array.isArray(settings.cache_options) ||
      settings.cache_options.enabled !== false
    ) {
      mismatch();
    }
  }
  if (present(settings.exports)) {
    if (typeof settings.exports !== "object" || Array.isArray(settings.exports)) {
      mismatch();
    }
    for (const exported of Object.values(settings.exports)) {
      if (
        !exported ||
        typeof exported !== "object" ||
        Array.isArray(exported) ||
        Object.hasOwn(exported, "cache")
      ) {
        mismatch();
      }
    }
  }
}

function expectedRoutes(config) {
  return sorted(
    (config.routes ?? []).map((route) => ({
      pattern: route.pattern,
      script: config.name,
    })),
  );
}

function providerRoutes(routes) {
  if (!Array.isArray(routes)) mismatch();
  return sorted(
    routes.map((route) => ({ pattern: route?.pattern, script: route?.script })),
  );
}

export async function readAliceWorkerMainModule(response) {
  try {
    if (!(response instanceof Response) || !response.ok) mismatch();
    const contentType = response.headers.get("content-type") ?? "";
    if (/^(?:application|text)\/javascript(?:;|$)/i.test(contentType)) {
      return new Uint8Array(await response.arrayBuffer());
    }
    if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) mismatch();
    const parts = await response.formData();
    const metadataPart = parts.get("metadata");
    let mainModule;
    if (metadataPart !== null) {
      const metadataText = typeof metadataPart === "string"
        ? metadataPart
        : metadataPart instanceof Blob
          ? await metadataPart.text()
          : "";
      const metadata = JSON.parse(metadataText);
      if (typeof metadata?.main_module !== "string") mismatch();
      mainModule = parts.get(metadata.main_module);
      if (!(mainModule instanceof Blob)) mismatch();
    } else {
      const moduleParts = [...parts.values()].filter(
        (part) =>
          part instanceof Blob &&
          /^application\/javascript\+module$/i.test(part.type),
      );
      if (moduleParts.length !== 1) mismatch();
      [mainModule] = moduleParts;
    }
    return new Uint8Array(await mainModule.arrayBuffer());
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_WORKER_PROVIDER_READBACK_MISMATCH"
    ) {
      throw error;
    }
    mismatch();
  }
}

function expectedQueueConsumer(config) {
  const consumer = config.queues?.consumers?.[0];
  if (!consumer) return null;
  return {
    deadLetterQueue: consumer.dead_letter_queue,
    queueName: consumer.queue,
    scriptName: config.name,
    settings: {
      batchSize: consumer.max_batch_size,
      maxConcurrency: consumer.max_concurrency,
      maxRetries: consumer.max_retries,
      maxWaitTimeMs: consumer.max_batch_timeout * 1_000,
      retryDelay: consumer.retry_delay,
    },
    type: "worker",
  };
}

function providerQueueConsumer(consumer) {
  if (!consumer) return null;
  const hasScript = Object.hasOwn(consumer, "script");
  const hasScriptName = Object.hasOwn(consumer, "script_name");
  if (hasScript === hasScriptName) mismatch();
  return {
    deadLetterQueue: consumer.dead_letter_queue,
    queueName: consumer.queue_name,
    scriptName: hasScript ? consumer.script : consumer.script_name,
    settings: {
      batchSize: consumer.settings?.batch_size,
      maxConcurrency: consumer.settings?.max_concurrency,
      maxRetries: consumer.settings?.max_retries,
      maxWaitTimeMs: consumer.settings?.max_wait_time_ms,
      retryDelay: consumer.settings?.retry_delay,
    },
    type: consumer.type,
  };
}

function expectedWorkflow(config) {
  const workflow = config.workflows?.[0];
  if (!workflow) return null;
  return {
    className: workflow.class_name,
    name: workflow.name,
    scriptName: config.name,
  };
}

function providerWorkflow(workflow) {
  if (!workflow) return null;
  return {
    className: workflow.class_name,
    name: workflow.name,
    scriptName: workflow.script_name,
  };
}

export async function digestAliceProviderConfig(config) {
  try {
    return await digestAliceEffectiveConfig(config);
  } catch {
    throw new Error("ALICE_PROVIDER_CONTROL_CONFIG_INVALID");
  }
}

export async function verifyAliceProviderControlFingerprints({
  serializedManifest,
  accessPolicyReadback,
  aiGatewayProviderReadback,
  vectorizeProviderReadback,
  cloudflareContinuityReadback,
}) {
  let manifest;
  try {
    manifest = verifyAliceDeploymentManifest(serializedManifest);
  } catch {
    throw new Error("ALICE_PROVIDER_CONTROL_FINGERPRINT_MISMATCH");
  }
  let accessPolicyConfig;
  let aiGatewayProviderConfig;
  let vectorizeProviderConfig;
  let continuityConfig;
  try {
    accessPolicyConfig =
      await buildAliceAccessPolicyProviderConfig(accessPolicyReadback);
    aiGatewayProviderConfig =
      buildAliceAiGatewayProviderConfig(aiGatewayProviderReadback);
    vectorizeProviderConfig =
      buildAliceVectorizeProviderConfig(vectorizeProviderReadback);
    continuityConfig = buildAliceCloudflareContinuityConfig(
      cloudflareContinuityReadback,
    );
  } catch {
    throw new Error("ALICE_PROVIDER_CONTROL_FINGERPRINT_MISMATCH");
  }
  const accessPolicyConfigSha256 =
    await digestAliceProviderConfig(accessPolicyConfig);
  const aiGatewayProviderConfigSha256 =
    await digestAliceProviderConfig(aiGatewayProviderConfig);
  const vectorizeProviderConfigSha256 =
    await digestAliceProviderConfig(vectorizeProviderConfig);
  const continuityConfigSha256 =
    digestAliceCloudflareContinuityConfig(continuityConfig);
  if (
    accessPolicyConfigSha256 !==
      manifest.cloudflare.accessPolicyConfigSha256 ||
    aiGatewayProviderConfigSha256 !==
      manifest.cloudflare.aiGatewayProviderConfigSha256 ||
    vectorizeProviderConfigSha256 !==
      manifest.cloudflare.vectorizeProviderConfigSha256 ||
    continuityConfigSha256 !== manifest.cloudflare.continuityConfigSha256
  ) {
    throw new Error("ALICE_PROVIDER_CONTROL_FINGERPRINT_MISMATCH");
  }
  return {
    accessPolicyConfigSha256,
    aiGatewayProviderConfigSha256,
    vectorizeProviderConfigSha256,
    continuityConfigSha256,
  };
}

export async function verifyAliceWorkerProviderReadback({
  role,
  deployment,
  deploymentAfterContent,
  version,
  routes,
  scriptSettings,
  scriptAndVersionSettings,
  subdomain,
  queueConsumer,
  workflow,
  containerApplication,
  containerApplicationInstances,
  materializedWranglerConfig,
  expectedEffectiveConfig,
  serializedManifest,
  deployedMainModule,
  deploymentMainPath,
  expectedDurableObjectNamespaceIds: expectedNamespaceIds,
}) {
  const providerNamespaceIds = providerDurableObjectNamespaceIds(version);
  const continuityNamespaceIds = expectedDurableObjectNamespaceIds(
    materializedWranglerConfig,
    expectedNamespaceIds,
  );
  const containerApplicationReadback = role === "runtimeHost"
    ? verifyAliceContainerApplicationReadback({
        application: containerApplication,
        applicationInstances: containerApplicationInstances,
        materializedWranglerConfig,
        expectedNamespaceId: continuityNamespaceIds[0]?.namespaceId,
      })
    : null;
  if (
    !ROLES.includes(role) ||
    !deployment ||
    !deploymentAfterContent ||
    !version ||
    !materializedWranglerConfig ||
    materializedWranglerConfig.name !== expectedEffectiveConfig?.worker?.name ||
    (role !== "runtimeHost" &&
      (containerApplication !== undefined ||
        containerApplicationInstances !== undefined))
  ) {
    mismatch();
  }

  const deploymentManifestSha256 =
    digestAliceDeploymentManifest(serializedManifest);
  const manifest = verifyAliceDeploymentManifest(serializedManifest);
  const bundleDigestField = {
    access: "accessWorkerBundleSha256",
    control: "controlWorkerBundleSha256",
    aiGateway: "aiGatewayWorkerBundleSha256",
    statePlane: "statePlaneWorkerBundleSha256",
    connectorPlane: "connectorPlaneWorkerBundleSha256",
    runtimeHost: "runtimeHostWorkerBundleSha256",
  }[role];
  if (
    (typeof deployedMainModule !== "string" &&
      !(deployedMainModule instanceof Uint8Array)) ||
    `sha256:${crypto
      .createHash("sha256")
      .update(deployedMainModule)
      .digest("hex")}` !== manifest.cloudflare[bundleDigestField]
  ) {
    mismatch();
  }
  const manifestBinding = materializedWranglerConfig.vars ?? {};
  if (
    !DIGEST.test(deploymentManifestSha256) ||
    manifestBinding.ALICE_DEPLOYMENT_MANIFEST_SHA256 !==
      deploymentManifestSha256 ||
    manifestBinding.ALICE_DEPLOYMENT_MANIFEST_B64 !==
      encodeAliceDeploymentManifest(serializedManifest)
  ) {
    mismatch();
  }
  try {
    assertAliceWranglerMatchesEffectiveConfig(
      role,
      materializedWranglerConfig,
      expectedEffectiveConfig,
      deploymentMainPath === undefined ? {} : { deploymentMainPath },
    );
    await verifyAliceEffectiveConfigBinding({
      encodedManifest: manifestBinding.ALICE_DEPLOYMENT_MANIFEST_B64,
      expectedManifestSha256: deploymentManifestSha256,
      role,
      effectiveConfig: expectedEffectiveConfig,
    });
  } catch {
    mismatch();
  }

  if (
    !Array.isArray(deployment.versions) ||
    deployment.versions.length !== 1 ||
    deployment.versions[0]?.version_id !== version.id ||
    deployment.versions[0]?.percentage !== 100 ||
    deploymentAfterContent.id !== deployment.id ||
    !canonicalEqual(deploymentAfterContent.versions, deployment.versions) ||
    !Number.isSafeInteger(version.number) ||
    typeof version.resources?.script?.etag !== "string" ||
    version.resources.script.etag.length < 8 ||
    version.resources?.script_runtime?.compatibility_date !==
      materializedWranglerConfig.compatibility_date ||
    !canonicalEqual(
      verifyAliceWorkerProviderBindingSnapshot({
        version,
        materializedWranglerConfig,
      }),
      expectedBindings(materializedWranglerConfig),
    ) ||
    !canonicalEqual(providerNamespaceIds, continuityNamespaceIds) ||
    !canonicalEqual(
      providerRoutes(routes),
      expectedRoutes(materializedWranglerConfig),
    ) ||
    !canonicalEqual(
      normalizeObservability(scriptSettings?.observability),
      normalizeObservability(materializedWranglerConfig.observability),
    ) ||
    !canonicalEqual(
      normalizeCompatibilityFlags(
        version.resources?.script_runtime?.compatibility_flags,
      ),
      normalizeCompatibilityFlags(materializedWranglerConfig.compatibility_flags),
    ) ||
    scriptAndVersionSettings?.compatibility_date !==
      materializedWranglerConfig.compatibility_date ||
    !canonicalEqual(
      normalizeCompatibilityFlags(scriptAndVersionSettings?.compatibility_flags),
      normalizeCompatibilityFlags(materializedWranglerConfig.compatibility_flags),
    ) ||
    !canonicalEqual(
      providerQueueConsumer(queueConsumer),
      expectedQueueConsumer(materializedWranglerConfig),
    ) ||
    !canonicalEqual(
      providerWorkflow(workflow),
      expectedWorkflow(materializedWranglerConfig),
    ) ||
    scriptSettings?.logpush === true ||
    (scriptSettings?.tail_consumers?.length ?? 0) !== 0 ||
    subdomain?.enabled !== materializedWranglerConfig.workers_dev ||
    subdomain?.previews_enabled !== materializedWranglerConfig.preview_urls
  ) {
    mismatch();
  }
  verifyCacheDisabled(version.resources.script_runtime);
  verifyCacheDisabled(scriptAndVersionSettings);

  const signedEffectiveConfigSha256 =
    await digestAliceEffectiveConfig(expectedEffectiveConfig);
  const providerUnverifiableFields = [
    "worker.minify",
    "worker.uploadSourceMaps",
    ...(role === "control"
      ? ["bindings.migrations", "bindings.workflows[0].steps"]
      : []),
  ];
  const sanitizedReadback = {
    schemaVersion: "alice.worker-provider-readback.v2",
    role,
    worker: materializedWranglerConfig.name,
    deploymentId: deployment.id,
    versionId: version.id,
    versionNumber: version.number,
    trafficPercentage: 100,
    scriptEtag: version.resources.script.etag,
    compatibilityDate: version.resources.script_runtime.compatibility_date,
    compatibilityFlags: normalizeCompatibilityFlags(
      version.resources.script_runtime.compatibility_flags,
    ),
    cache: {
      enabled: false,
      entrypointOverrides: [],
    },
    durableObjectNamespaceIds: providerNamespaceIds,
    containerApplication: containerApplicationReadback,
    signedEffectiveConfigSha256,
    providerUnverifiableFields,
    deploymentManifestSha256,
  };
  return {
    ...sanitizedReadback,
    providerReadbackSha256: `sha256:${crypto
      .createHash("sha256")
      .update(canonicalAliceJson(sanitizedReadback))
      .digest("hex")}`,
  };
}
