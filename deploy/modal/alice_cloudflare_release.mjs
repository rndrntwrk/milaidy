import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ALICE_CLOUDFLARE_TARGET,
  canonicalAliceJson,
  verifyAliceEffectiveConfigBinding,
} from "../../workers/alice-effective-config.js";
import {
  aliceEffectiveConfigFromWrangler,
} from "./alice_cloudflare_config.mjs";
import {
  fetchAliceCloudflareContinuityState,
  fetchAliceCloudflarePostDeploymentReadback,
  fetchAliceCloudflareWorkflowVersionState,
  verifyAliceCloudflareWorkflowVersionSnapshot,
} from "./alice_cloudflare_live_readback.mjs";
import {
  buildAliceCandidateCloudflareContinuityReadback,
  buildAliceCloudflareContinuityConfig,
  digestAliceCloudflareContinuityConfig,
  verifyAliceCloudflareContinuityConfig,
} from "./alice_cloudflare_continuity.mjs";
import {
  aliceExpectedProductionTrafficState,
  aliceExpectedReleaseControlTrafficState,
  aliceTrafficSemanticState,
  applyAliceCandidateTrafficState,
  fetchAliceCloudflareTrafficState,
  planAliceCandidateTrafficMutations,
  restoreAliceTrafficState,
} from "./alice_cloudflare_traffic.mjs";
import {
  captureAliceCloudflareWorkerRollbackState,
  restoreAliceCloudflareWorkerRollbackState,
  verifyAliceCloudflareWorkerRollbackStateSnapshot,
} from "./alice_cloudflare_worker_rollback.mjs";
import {
  digestAliceDeploymentManifest,
  verifyAliceDeploymentManifest,
} from "./alice_deployment_manifest.mjs";
import {
  assertAliceWorkerBundleArtifactMatchesDeploymentManifest,
} from "./alice_worker_bundle_artifact.mjs";
import { verifyAliceDeploymentPauseEvidence } from "./alice_release_controller.mjs";

const PROTECTED_BRANCH = "release/alice-production-core-2026-08-22";
const REPOSITORY = "rndrntwrk/milaidy";
const SIGNER_WORKFLOW =
  "rndrntwrk/milaidy/.github/workflows/build-cloud-agent.yml";
const WRANGLER_VERSION = "4.122.0";
const API_BASE = "https://api.cloudflare.com/client/v4";
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const RESOURCE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const VERSION_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const RELEASE_RUN_ID = /^[1-9][0-9]*-[1-9][0-9]*$/;
const CONTAINER_IMAGE =
  /^registry\.cloudflare\.com\/036df6c823669b8fa2f66cf4c16eeb29\/alice-runtime@sha256:[a-f0-9]{64}$/;
const NAMESPACE_ID = /^[a-f0-9]{32}$/;
const ROLES = [
  "access",
  "runtimeHost",
  "control",
  "aiGateway",
  "statePlane",
  "connectorPlane",
];
const UPLOAD_ORDER = [
  "control",
  "statePlane",
  "aiGateway",
  "connectorPlane",
  "runtimeHost",
  "access",
];
const STATE_MIGRATIONS = Object.freeze([
  "0001_alice_state.sql",
  "0002_execution_records.sql",
  "0003_eliza_database.sql",
]);
const ROLLBACK_ORDER = [
  "access",
  "runtimeHost",
  "connectorPlane",
  "aiGateway",
  "control",
  "statePlane",
];
const WRANGLER_ENV_ALLOWLIST = ["PATH", "LANG", "LC_ALL", "TZ"];
const WRANGLER_ENV_DENYLIST = [
  "CLOUDFLARE_API_BASE_URL",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "NODE_USE_ENV_PROXY",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_EXTRA_CA_CERTS",
  "NODE_TLS_REJECT_UNAUTHORIZED",
];
const WORKERS = Object.freeze({
  access: ALICE_CLOUDFLARE_TARGET.accessWorker,
  runtimeHost: ALICE_CLOUDFLARE_TARGET.runtimeHostWorker,
  control: ALICE_CLOUDFLARE_TARGET.controlWorker,
  aiGateway: ALICE_CLOUDFLARE_TARGET.aiGatewayWorker,
  statePlane: ALICE_CLOUDFLARE_TARGET.statePlaneWorker,
  connectorPlane: ALICE_CLOUDFLARE_TARGET.connectorPlaneWorker,
});

function releaseInvalid(message = "ALICE_CLOUDFLARE_RELEASE_INVALID") {
  throw new Error(message);
}

function absolute(value) {
  return typeof value === "string" && path.isAbsolute(value);
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

function normalizedContainerConfiguration(value) {
  const standardOne = value?.instance_type === "standard-1" || (
    value?.vcpu === 0.5 &&
    value?.memory_mib === 4096 &&
    value?.disk?.size_mb === 8000
  );
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !CONTAINER_IMAGE.test(value.image ?? "") ||
    !standardOne ||
    value.observability?.logs?.enabled !== true
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_INVALID");
  }
  return {
    image: value.image,
    instance_type: "standard-1",
    observability: { logs: { enabled: true } },
  };
}

export function normalizeAliceContainerApplicationRollbackState(value) {
  const application = value?.application;
  const applicationVersions = value?.applicationVersions;
  const applicationInstances = value?.applicationInstances;
  const health = application?.health?.instances;
  if (
    !application ||
    !Array.isArray(applicationVersions) ||
    !Array.isArray(applicationInstances) ||
    applicationInstances.length > 1 ||
    applicationInstances.some(
      (instance) => !instance || typeof instance !== "object" ||
        Array.isArray(instance),
    ) ||
    !VERSION_ID.test(application.id ?? "") ||
    application.account_id !== ALICE_CLOUDFLARE_TARGET.accountId ||
    application.name !== "alice-production-runtime" ||
    !Number.isSafeInteger(application.version) ||
    application.version < 1 ||
    application.scheduling_policy !== "default" ||
    application.max_instances !== 1 ||
    application.rollout_active_grace_period !== 0 ||
    !NAMESPACE_ID.test(application.durable_objects?.namespace_id ?? "") ||
    !health ||
    health.failed !== 0 ||
    (application.active_rollout_id !== undefined &&
      application.active_rollout_id !== null &&
      application.active_rollout_id !== "") ||
    applicationVersions.some(
      (version) =>
        !Number.isSafeInteger(version?.version) ||
        version.version < 1 ||
        !Number.isSafeInteger(version?.percentage) ||
        ![0, 100].includes(version.percentage),
    )
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_INVALID");
  }
  const activeVersions = applicationVersions.filter(
    (version) => version.percentage === 100,
  );
  if (
    activeVersions.length !== 1 ||
    activeVersions[0].version !== application.version
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_INVALID");
  }
  const applicationConfiguration = normalizedContainerConfiguration(
    application.configuration,
  );
  const activeConfiguration = normalizedContainerConfiguration(
    activeVersions[0].configuration,
  );
  if (
    canonicalAliceJson(applicationConfiguration) !==
      canonicalAliceJson(activeConfiguration)
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_INVALID");
  }
  return {
    schemaVersion: "alice.container-application-state.v1",
    accountId: application.account_id,
    applicationId: application.id,
    applicationName: application.name,
    applicationVersion: application.version,
    namespaceId: application.durable_objects.namespace_id,
    schedulingPolicy: application.scheduling_policy,
    maxInstances: application.max_instances,
    rolloutActiveGracePeriod: application.rollout_active_grace_period,
    target: { configuration: applicationConfiguration },
  };
}

function verifyAliceContainerApplicationRollbackState(value) {
  if (
    !exactKeys(value, [
      "schemaVersion",
      "accountId",
      "applicationId",
      "applicationName",
      "applicationVersion",
      "namespaceId",
      "schedulingPolicy",
      "maxInstances",
      "rolloutActiveGracePeriod",
      "target",
    ]) ||
    value.schemaVersion !== "alice.container-application-state.v1" ||
    value.accountId !== ALICE_CLOUDFLARE_TARGET.accountId ||
    !VERSION_ID.test(value.applicationId ?? "") ||
    value.applicationName !== "alice-production-runtime" ||
    !Number.isSafeInteger(value.applicationVersion) ||
    value.applicationVersion < 1 ||
    !NAMESPACE_ID.test(value.namespaceId ?? "") ||
    value.schedulingPolicy !== "default" ||
    value.maxInstances !== 1 ||
    value.rolloutActiveGracePeriod !== 0 ||
    !exactKeys(value.target, ["configuration"])
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_INVALID");
  }
  normalizedContainerConfiguration(value.target.configuration);
  return value;
}

export function buildAliceCandidateContainerApplicationTarget({
  previous,
  materializedWranglerConfig,
}) {
  const container = materializedWranglerConfig?.containers?.[0];
  const durableObjectBindings =
    materializedWranglerConfig?.durable_objects?.bindings;
  if (
    verifyAliceContainerApplicationRollbackState(previous) !== previous ||
    materializedWranglerConfig?.account_id !== previous.accountId ||
    !Array.isArray(materializedWranglerConfig?.containers) ||
    materializedWranglerConfig.containers.length !== 1 ||
    !Array.isArray(durableObjectBindings) ||
    durableObjectBindings.length !== 1 ||
    container?.name !== previous.applicationName ||
    container?.class_name !== "AliceRuntimeContainer" ||
    container?.instance_type !== "standard-1" ||
    container?.max_instances !== previous.maxInstances ||
    durableObjectBindings[0]?.name !== "ALICE_RUNTIME_CONTAINER" ||
    durableObjectBindings[0]?.class_name !== container.class_name ||
    Object.hasOwn(durableObjectBindings[0], "script_name") ||
    previous.schedulingPolicy !== "default" ||
    previous.rolloutActiveGracePeriod !== 0
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_TARGET_INVALID");
  }
  return {
    configuration: normalizedContainerConfiguration({
      image: container.image,
      instance_type: container.instance_type,
      observability: materializedWranglerConfig.observability,
    }),
  };
}

function verifyContainerApplicationIdentity(current, expected) {
  const currentIdentity = {
    schemaVersion: current?.schemaVersion,
    accountId: current?.accountId,
    applicationId: current?.applicationId,
    applicationName: current?.applicationName,
    namespaceId: current?.namespaceId,
    schedulingPolicy: current?.schedulingPolicy,
    maxInstances: current?.maxInstances,
    rolloutActiveGracePeriod: current?.rolloutActiveGracePeriod,
  };
  const expectedIdentity = {
    schemaVersion: expected?.schemaVersion,
    accountId: expected?.accountId,
    applicationId: expected?.applicationId,
    applicationName: expected?.applicationName,
    namespaceId: expected?.namespaceId,
    schedulingPolicy: expected?.schedulingPolicy,
    maxInstances: expected?.maxInstances,
    rolloutActiveGracePeriod: expected?.rolloutActiveGracePeriod,
  };
  if (
    canonicalAliceJson(currentIdentity) !== canonicalAliceJson(expectedIdentity)
  ) releaseInvalid("ALICE_CONTAINER_APPLICATION_DRIFTED");
}

function verifyContainerApplicationRollout({ rollout, current, target }) {
  if (
    !VERSION_ID.test(rollout?.id ?? "") ||
    rollout.current_version !== current.applicationVersion ||
    !Number.isSafeInteger(rollout.target_version) ||
    rollout.target_version <= rollout.current_version ||
    !["pending", "progressing", "completed"].includes(rollout.status) ||
    canonicalAliceJson(normalizedContainerConfiguration(
      rollout.current_configuration,
    )) !== canonicalAliceJson(current.target.configuration) ||
    canonicalAliceJson(normalizedContainerConfiguration(
      rollout.target_configuration,
    )) !== canonicalAliceJson(target.configuration)
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_ROLLOUT_INVALID");
  }
  return rollout;
}

export async function transitionAliceContainerApplication({
  expectedCurrent,
  target,
  apiToken,
  fetchImpl = globalThis.fetch,
  operations,
}) {
  verifyAliceContainerApplicationRollbackState(expectedCurrent);
  const resolvedOperations = operations ?? aliceContainerApplicationOperations({
    apiToken,
    fetchImpl,
  });
  if (
    typeof resolvedOperations?.fetchApplication !== "function" ||
    typeof resolvedOperations?.createRollout !== "function" ||
    typeof resolvedOperations?.fetchRollout !== "function" ||
    typeof resolvedOperations?.sleep !== "function"
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_TRANSITION_INVALID");
  }
  const current = await resolvedOperations.fetchApplication();
  verifyContainerApplicationIdentity(current, expectedCurrent);
  if (canonicalAliceJson(current) !== canonicalAliceJson(expectedCurrent)) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_DRIFTED");
  }
  normalizedContainerConfiguration(target?.configuration);
  if (canonicalAliceJson(current.target) === canonicalAliceJson(target)) {
    return { changed: false, current, rollout: null };
  }
  const rollout = verifyContainerApplicationRollout({
    rollout: await resolvedOperations.createRollout({
      applicationId: current.applicationId,
      target,
      body: {
        description: "Alice protected immutable image transition",
        strategy: "rolling",
        target_configuration: target.configuration,
        step_percentage: 100,
        kind: "full_auto",
      },
    }),
    current,
    target,
  });
  let terminalRollout = rollout;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (terminalRollout.status === "completed") break;
    await resolvedOperations.sleep(2_000);
    terminalRollout = verifyContainerApplicationRollout({
      rollout: await resolvedOperations.fetchRollout({
        applicationId: current.applicationId,
        rollout,
      }),
      current,
      target,
    });
  }
  if (terminalRollout.status !== "completed") {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_ROLLOUT_INVALID");
  }
  const after = await resolvedOperations.fetchApplication();
  verifyContainerApplicationIdentity(after, current);
  if (
    after.applicationVersion !== rollout.target_version ||
    canonicalAliceJson(after.target) !== canonicalAliceJson(target)
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_ROLLOUT_INVALID");
  }
  return { changed: true, current: after, rollout: terminalRollout };
}

async function aliceContainerApiJson({
  fetchImpl,
  apiToken,
  method = "GET",
  pathname,
  body,
}) {
  if (
    typeof fetchImpl !== "function" ||
    typeof apiToken !== "string" ||
    apiToken.length < 32 ||
    typeof pathname !== "string" ||
    !pathname.startsWith(`/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/containers/`)
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_PROVIDER_INVALID");
  }
  const response = await fetchImpl(`${API_BASE}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${apiToken}`,
      accept: "application/json",
      "cache-control": "no-cache",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!(response instanceof Response) || !response.ok) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_PROVIDER_INVALID");
  }
  let envelope;
  try {
    envelope = await response.json();
  } catch {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_PROVIDER_INVALID");
  }
  if (envelope?.success !== true || !("result" in envelope)) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_PROVIDER_INVALID");
  }
  return envelope.result;
}

async function fetchAliceContainerApplicationRollbackState({
  fetchImpl = globalThis.fetch,
  apiToken,
}) {
  const base = `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/containers`;
  const applications = await aliceContainerApiJson({
    fetchImpl,
    apiToken,
    pathname: `${base}/applications?name=alice-production-runtime`,
  });
  if (
    !Array.isArray(applications) ||
    applications.length !== 1 ||
    applications[0]?.name !== "alice-production-runtime" ||
    !VERSION_ID.test(applications[0]?.id ?? "")
  ) {
    releaseInvalid("ALICE_CONTAINER_APPLICATION_PROVIDER_INVALID");
  }
  const applicationId = applications[0].id;
  const [application, applicationVersions, instancePage] = await Promise.all([
    aliceContainerApiJson({
      fetchImpl,
      apiToken,
      pathname: `${base}/applications/${applicationId}`,
    }),
    aliceContainerApiJson({
      fetchImpl,
      apiToken,
      pathname: `${base}/applications/${applicationId}/versions`,
    }),
    aliceContainerApiJson({
      fetchImpl,
      apiToken,
      pathname: `${base}/applications/${applicationId}/instances`,
    }),
  ]);
  return normalizeAliceContainerApplicationRollbackState({
    application,
    applicationVersions,
    applicationInstances: instancePage?.instances,
  });
}

function aliceContainerApplicationOperations({ apiToken, fetchImpl }) {
  const base = `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/containers`;
  return {
    fetchApplication: () => fetchAliceContainerApplicationRollbackState({
      apiToken,
      fetchImpl,
    }),
    createRollout: ({ applicationId, body }) => aliceContainerApiJson({
      fetchImpl,
      apiToken,
      method: "POST",
      pathname: `${base}/applications/${applicationId}/rollouts`,
      body,
    }),
    fetchRollout: ({ applicationId, rollout }) => aliceContainerApiJson({
      fetchImpl,
      apiToken,
      pathname:
        `${base}/applications/${applicationId}/rollouts/${rollout.id}`,
    }),
    sleep: (milliseconds) => new Promise(
      (resolve) => setTimeout(resolve, milliseconds),
    ),
  };
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function configPath(configDir, role) {
  return path.join(configDir, `${role}.wrangler.json`);
}

function bundlePath(bundleRoot, role) {
  return path.join(bundleRoot, WORKERS[role], "index.js");
}

export function buildAliceEvidenceQueueUpdate(queue, deliveryPaused) {
  if (
    !RESOURCE_ID.test(queue?.queue_id ?? "") ||
    queue?.queue_name !== ALICE_CLOUDFLARE_TARGET.evidenceQueue ||
    queue?.settings?.delivery_delay !== 0 ||
    typeof queue?.settings?.delivery_paused !== "boolean" ||
    queue?.settings?.message_retention_period !== 86_400 ||
    typeof deliveryPaused !== "boolean"
  ) {
    releaseInvalid("ALICE_EVIDENCE_QUEUE_STATE_INVALID");
  }
  return {
    pathname:
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/queues/${queue.queue_id}`,
    body: {
      queue_name: ALICE_CLOUDFLARE_TARGET.evidenceQueue,
      settings: {
        delivery_delay: 0,
        delivery_paused: deliveryPaused,
        message_retention_period: 86_400,
      },
    },
  };
}

function buildAliceContinuityQueueUpdate(queue, expectedQueue) {
  if (
    !RESOURCE_ID.test(queue?.queue_id ?? "") ||
    queue.queue_id !== expectedQueue?.id ||
    queue.queue_name !== expectedQueue?.name ||
    ![
      ALICE_CLOUDFLARE_TARGET.evidenceQueue,
      ALICE_CLOUDFLARE_TARGET.evidenceDlq,
    ].includes(queue.queue_name) ||
    typeof expectedQueue?.deliveryPaused !== "boolean" ||
    expectedQueue?.settings?.deliveryDelay !== 0 ||
    expectedQueue?.settings?.messageRetentionPeriod !== 86_400
  ) {
    releaseInvalid("ALICE_EVIDENCE_QUEUE_STATE_INVALID");
  }
  return {
    pathname:
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/queues/${queue.queue_id}`,
    body: {
      queue_name: queue.queue_name,
      settings: {
        delivery_delay: expectedQueue.settings.deliveryDelay,
        delivery_paused: expectedQueue.deliveryPaused,
        message_retention_period:
          expectedQueue.settings.messageRetentionPeriod,
      },
    },
  };
}

function run(binary, argv, options = {}) {
  const execution = spawnSync(binary, argv, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 16 * 1024 * 1024,
    timeout: options.timeoutMs ?? 10 * 60 * 1000,
  });
  if (execution.error || execution.status !== 0) {
    const detail = [execution.stdout, execution.stderr]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8_000);
    throw new Error(
      `${options.errorCode ?? "ALICE_RELEASE_COMMAND_FAILED"}${
        detail ? `\n${detail}` : ""
      }`,
    );
  }
  return execution.stdout;
}

function sha256File(filePath) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex")}`;
}

export function verifyAliceWorkerUploadBytes({
  signedSha256,
  signedSize,
  uploadSha256,
  uploadSize,
}) {
  if (
    !DIGEST.test(signedSha256 ?? "") ||
    !Number.isSafeInteger(signedSize) ||
    signedSize <= 0 ||
    !DIGEST.test(uploadSha256 ?? "") ||
    !Number.isSafeInteger(uploadSize) ||
    uploadSize <= 0 ||
    signedSha256 !== uploadSha256 ||
    signedSize !== uploadSize
  ) {
    releaseInvalid("ALICE_WORKER_DRY_RUN_INVALID");
  }
  return { sha256: uploadSha256, size: uploadSize };
}

function aliceDryRunFiles(root, relative = "") {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, relative), {
      withFileTypes: true,
    });
  } catch {
    releaseInvalid("ALICE_WORKER_DRY_RUN_INVALID");
  }
  return entries.flatMap((entry) => {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      releaseInvalid("ALICE_WORKER_DRY_RUN_INVALID");
    }
    if (entry.isDirectory()) return aliceDryRunFiles(root, child);
    if (!entry.isFile()) releaseInvalid("ALICE_WORKER_DRY_RUN_INVALID");
    return [child];
  });
}

export function verifyAliceWorkerDryRunDirectory({
  signedBundlePath,
  outdir,
  expectedSha256,
}) {
  if (
    !absolute(signedBundlePath) ||
    !absolute(outdir) ||
    !DIGEST.test(expectedSha256 ?? "")
  ) {
    releaseInvalid("ALICE_WORKER_DRY_RUN_INVALID");
  }
  let signedStat;
  let outdirStat;
  try {
    signedStat = fs.lstatSync(signedBundlePath);
    outdirStat = fs.lstatSync(outdir);
  } catch {
    releaseInvalid("ALICE_WORKER_DRY_RUN_INVALID");
  }
  if (
    !signedStat.isFile() ||
    signedStat.isSymbolicLink() ||
    signedStat.size <= 0 ||
    !outdirStat.isDirectory() ||
    outdirStat.isSymbolicLink()
  ) {
    releaseInvalid("ALICE_WORKER_DRY_RUN_INVALID");
  }
  const files = aliceDryRunFiles(outdir);
  if (
    !files.includes("index.js") ||
    files.some(
      (file) => file !== "index.js" && /\.(?:[cm]?js|wasm)$/i.test(file),
    )
  ) {
    releaseInvalid("ALICE_WORKER_DRY_RUN_INVALID");
  }
  const uploadPath = path.join(outdir, "index.js");
  const signedBytes = fs.readFileSync(signedBundlePath);
  const uploadBytes = fs.readFileSync(uploadPath);
  const signedSha256 = sha256File(signedBundlePath);
  const uploadSha256 = sha256File(uploadPath);
  if (signedSha256 !== expectedSha256 || !signedBytes.equals(uploadBytes)) {
    releaseInvalid("ALICE_WORKER_DRY_RUN_INVALID");
  }
  return verifyAliceWorkerUploadBytes({
    signedSha256,
    signedSize: signedBytes.byteLength,
    uploadSha256,
    uploadSize: uploadBytes.byteLength,
  });
}

function readJson(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
      releaseInvalid();
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ALICE_")) {
      throw error;
    }
    releaseInvalid();
  }
}

function writeReadonly(filePath, value) {
  if (!absolute(filePath) || !fs.existsSync(path.dirname(filePath))) {
    releaseInvalid();
  }
  fs.writeFileSync(filePath, `${canonicalAliceJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

export function buildAliceProtectedCloudflareCommands({
  wranglerBin,
  configDir,
  bundleRoot,
  sourceCommit,
  releaseRunId,
  uploadedVersions,
  rollbackVersions,
}) {
  if (
    !absolute(wranglerBin) ||
    !absolute(configDir) ||
    !absolute(bundleRoot) ||
    !COMMIT.test(sourceCommit ?? "") ||
    !RELEASE_RUN_ID.test(releaseRunId ?? "") ||
    !rollbackVersions ||
    typeof rollbackVersions !== "object"
  ) {
    releaseInvalid();
  }
  if (
    uploadedVersions !== undefined &&
    (!exactKeys(uploadedVersions, ROLES) ||
      !ROLES.every((role) => VERSION_ID.test(uploadedVersions[role] ?? "")))
  ) {
    releaseInvalid("ALICE_WORKER_UPLOAD_VERSION_INVALID");
  }
  const tag = `alice-${sourceCommit}-${releaseRunId}`;
  const uploads = UPLOAD_ORDER.map((role) => ({
    role,
    bundlePath: bundlePath(bundleRoot, role),
    argv: [
      "versions",
      "upload",
      bundlePath(bundleRoot, role),
      "--config",
      configPath(configDir, role),
      "--no-bundle",
      "--strict",
      "--tag",
      tag,
      "--message",
      `Alice protected release ${sourceCommit}`,
    ],
  }));
  const promotions = uploadedVersions === undefined ? [] : UPLOAD_ORDER.map((role) => ({
    role,
    argv: [
      "versions",
      "deploy",
      "--config",
      configPath(configDir, role),
      "--version-id",
      uploadedVersions[role],
      "--percentage",
      "100",
      "--message",
      `Alice protected release ${sourceCommit}`,
      "--yes",
    ],
  }));
  const rollbacks = ROLLBACK_ORDER.flatMap((role) => {
    const versionId = rollbackVersions[role];
    if (versionId === null || versionId === undefined) return [];
    if (!VERSION_ID.test(versionId)) releaseInvalid();
    return [{
      role,
      argv: [
        "versions",
        "deploy",
        "--config",
        configPath(configDir, role),
        "--version-id",
        versionId,
        "--percentage",
        "100",
        "--message",
        `Alice rollback from ${sourceCommit}`,
        "--yes",
      ],
    }];
  });
  return { uploads, promotions, rollbacks };
}

export function parseAliceWranglerUploadVersionId(output) {
  if (typeof output !== "string") {
    releaseInvalid("ALICE_WORKER_UPLOAD_VERSION_INVALID");
  }
  const matches = output
    .split(/\r?\n/)
    .map((line) => line.match(/^Worker Version ID:\s*([a-f0-9-]+)\s*$/))
    .filter(Boolean);
  if (matches.length !== 1 || !VERSION_ID.test(matches[0][1] ?? "")) {
    releaseInvalid("ALICE_WORKER_UPLOAD_VERSION_INVALID");
  }
  return matches[0][1];
}

function parseAlicePendingStateMigrations(output) {
  if (typeof output !== "string") {
    releaseInvalid("ALICE_STATE_MIGRATION_READBACK_INVALID");
  }
  const migrations = [...output.matchAll(
    /(?:^|[^A-Za-z0-9_.-])([0-9]{4}_[A-Za-z0-9_-]+\.sql)(?=$|[^A-Za-z0-9_.-])/g,
  )].map((match) => match[1]);
  if (new Set(migrations).size !== migrations.length) {
    releaseInvalid("ALICE_STATE_MIGRATION_READBACK_INVALID");
  }
  if (migrations.length === 0) {
    if (!output.includes("No migrations to apply!")) {
      releaseInvalid("ALICE_STATE_MIGRATION_READBACK_INVALID");
    }
    return [];
  }
  const suffixes = STATE_MIGRATIONS.map((_, index) =>
    STATE_MIGRATIONS.slice(index)
  );
  if (
    !output.includes("Migrations to be applied:") ||
    !suffixes.some(
      (suffix) => canonicalAliceJson(suffix) === canonicalAliceJson(migrations),
    )
  ) {
    releaseInvalid("ALICE_STATE_MIGRATION_READBACK_INVALID");
  }
  return migrations;
}

export function applyAliceStateMigrationsBeforeWorkerMutation({
  wranglerBin,
  sourceRoot,
  configPath: stateConfigPath,
  commandEnv,
  runCommand = run,
}) {
  if (
    !absolute(wranglerBin) ||
    !absolute(sourceRoot) ||
    !absolute(stateConfigPath) ||
    path.basename(stateConfigPath) !== "statePlane.wrangler.json" ||
    !commandEnv ||
    typeof commandEnv !== "object" ||
    typeof runCommand !== "function"
  ) {
    releaseInvalid("ALICE_STATE_MIGRATION_READBACK_INVALID");
  }
  const common = [
    ALICE_CLOUDFLARE_TARGET.stateDatabase,
    "--remote",
    "--config",
    stateConfigPath,
  ];
  const list = () => parseAlicePendingStateMigrations(
    runCommand(wranglerBin, ["d1", "migrations", "list", ...common], {
      cwd: sourceRoot,
      env: commandEnv,
      errorCode: "ALICE_STATE_MIGRATION_READBACK_INVALID",
    }),
  );
  const pending = list();
  if (pending.length === 0) {
    return { applied: [], remoteVerified: true };
  }
  runCommand(wranglerBin, ["d1", "migrations", "apply", ...common], {
    cwd: sourceRoot,
    env: commandEnv,
    errorCode: "ALICE_STATE_MIGRATION_APPLY_FAILED",
  });
  if (list().length !== 0) {
    releaseInvalid("ALICE_STATE_MIGRATION_READBACK_INVALID");
  }
  return { applied: pending, remoteVerified: true };
}

export function aliceCloudflareCommandEnv(ambient = process.env) {
  if (
    !ambient ||
    typeof ambient !== "object" ||
    typeof ambient.CLOUDFLARE_API_TOKEN !== "string" ||
    ambient.CLOUDFLARE_API_TOKEN.length < 16 ||
    (ambient.CLOUDFLARE_ACCOUNT_ID !== undefined &&
      ambient.CLOUDFLARE_ACCOUNT_ID !== ALICE_CLOUDFLARE_TARGET.accountId)
  ) {
    releaseInvalid("ALICE_CLOUDFLARE_ACCOUNT_INVALID");
  }
  const denied = Object.keys(ambient).some(
    (name) =>
      WRANGLER_ENV_DENYLIST.includes(name.toUpperCase()) ||
      /^WRANGLER_/i.test(name) ||
      (/^CLOUDFLARE_/i.test(name) &&
        !["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].includes(
          name.toUpperCase(),
        )),
  );
  if (denied) releaseInvalid("ALICE_CLOUDFLARE_COMMAND_ENV_INVALID");
  const commandEnv = {
    CLOUDFLARE_API_TOKEN: ambient.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: ALICE_CLOUDFLARE_TARGET.accountId,
  };
  for (const name of WRANGLER_ENV_ALLOWLIST) {
    if (typeof ambient[name] === "string" && ambient[name].length > 0) {
      commandEnv[name] = ambient[name];
    }
  }
  return commandEnv;
}

function verifyProtectedSource({ sourceRoot, sourceCommit }) {
  if (!absolute(sourceRoot) || !COMMIT.test(sourceCommit ?? "")) releaseInvalid();
  const head = run("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    errorCode: "ALICE_RELEASE_SOURCE_INVALID",
  }).trim();
  const branch = process.env.GITHUB_REF
    ? process.env.GITHUB_REF.replace(/^refs\/heads\//, "")
    : run("git", ["branch", "--show-current"], {
        cwd: sourceRoot,
        errorCode: "ALICE_RELEASE_SOURCE_INVALID",
      }).trim();
  const dirty = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: sourceRoot,
    errorCode: "ALICE_RELEASE_SOURCE_INVALID",
  });
  if (
    head !== sourceCommit ||
    branch !== PROTECTED_BRANCH ||
    (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sourceCommit) ||
    dirty !== ""
  ) {
    releaseInvalid("ALICE_RELEASE_SOURCE_INVALID");
  }
}

function verifyWrangler(wranglerBin, sourceRoot) {
  if (!absolute(wranglerBin)) releaseInvalid();
  const output = run(wranglerBin, ["--version"], {
    cwd: sourceRoot,
    env: aliceCloudflareCommandEnv(),
    errorCode: "ALICE_WRANGLER_VERSION_INVALID",
  });
  const versions = output.match(/\b\d+\.\d+\.\d+\b/g) ?? [];
  if (versions.length !== 1 || versions[0] !== WRANGLER_VERSION) {
    releaseInvalid("ALICE_WRANGLER_VERSION_INVALID");
  }
}

function verifyBun(bunBin, sourceRoot) {
  if (!absolute(bunBin)) releaseInvalid();
  const output = run(bunBin, ["--version"], {
    cwd: sourceRoot,
    errorCode: "ALICE_BUN_VERSION_INVALID",
  }).trim();
  if (output !== "1.3.14") {
    releaseInvalid("ALICE_BUN_VERSION_INVALID");
  }
}

function verifyGitHubAttestations({ sourceRoot, sourceCommit, artifactRoot }) {
  for (const filePath of [
    path.join(artifactRoot, "alice-worker-bundles.json"),
    ...ROLES.map((role) => bundlePath(artifactRoot, role)),
  ]) {
    run(
      "gh",
      [
        "attestation",
        "verify",
        filePath,
        "--repo",
        REPOSITORY,
        "--signer-workflow",
        SIGNER_WORKFLOW,
        "--source-digest",
        sourceCommit,
        "--source-ref",
        `refs/heads/${PROTECTED_BRANCH}`,
        "--deny-self-hosted-runners",
      ],
      {
        cwd: sourceRoot,
        errorCode: "ALICE_WORKER_ATTESTATION_INVALID",
      },
    );
  }
}

function verifyProtectedRefStillExact({ sourceRoot, sourceCommit }) {
  const protectedRefSha = run(
    "gh",
    [
      "api",
      `repos/${REPOSITORY}/git/ref/heads/${PROTECTED_BRANCH}`,
      "--jq",
      ".object.sha",
    ],
    {
      cwd: sourceRoot,
      errorCode: "ALICE_PROTECTED_REF_READBACK_INVALID",
    },
  ).trim();
  if (protectedRefSha !== sourceCommit) {
    releaseInvalid("ALICE_PROTECTED_REF_READBACK_INVALID");
  }
}

async function verifyReleaseArtifacts({
  sourceRoot,
  manifestPath,
  artifactPath,
  artifactRoot,
  configDir,
}) {
  if (
    ![sourceRoot, manifestPath, artifactPath, artifactRoot, configDir].every(absolute) ||
    path.dirname(artifactPath) !== artifactRoot
  ) {
    releaseInvalid();
  }
  const serializedManifest = fs.readFileSync(manifestPath, "utf8");
  const manifest = verifyAliceDeploymentManifest(serializedManifest);
  const serializedArtifact = fs.readFileSync(artifactPath, "utf8");
  assertAliceWorkerBundleArtifactMatchesDeploymentManifest({
    serializedArtifact,
    artifactRoot,
    manifest,
  });
  const deploymentManifestSha256 =
    digestAliceDeploymentManifest(serializedManifest);
  const configs = {};
  const effectiveConfigs = {};
  for (const role of ROLES) {
    const roleConfigPath = configPath(configDir, role);
    const config = readJson(roleConfigPath);
    const expectedMain = bundlePath(artifactRoot, role);
    if (
      config.name !== WORKERS[role] ||
      canonicalAliceJson(config.unsafe) !==
        canonicalAliceJson({ metadata: { keep_bindings: [] } })
    ) {
      releaseInvalid("ALICE_RELEASE_CONFIG_INVALID");
    }
    const effectiveConfig = aliceEffectiveConfigFromWrangler(role, config, {
      artifactRoot,
      configPath: roleConfigPath,
    });
    if (path.resolve(path.dirname(roleConfigPath), config.main) !== expectedMain) {
      releaseInvalid("ALICE_RELEASE_CONFIG_INVALID");
    }
    await verifyAliceEffectiveConfigBinding({
      encodedManifest: config.vars?.ALICE_DEPLOYMENT_MANIFEST_B64,
      expectedManifestSha256: deploymentManifestSha256,
      role,
      effectiveConfig,
    });
    if (
      config.vars?.ALICE_DEPLOYMENT_MANIFEST_SHA256 !==
        deploymentManifestSha256
    ) {
      releaseInvalid("ALICE_RELEASE_CONFIG_INVALID");
    }
    configs[role] = config;
    effectiveConfigs[role] = effectiveConfig;
  }
  if (manifest.source.sourceCommit !== process.env.ALICE_SOURCE_COMMIT) {
    releaseInvalid("ALICE_RELEASE_SOURCE_INVALID");
  }
  return {
    serializedManifest,
    manifest,
    deploymentManifestSha256,
    configs,
    effectiveConfigs,
  };
}

function runProgramAdmissionPreflight({
  bunBin,
  sourceRoot,
  configDir,
  evidencePath,
  release,
}) {
  const credentialRoot = path.dirname(evidencePath);
  const externalCredentialPaths = [
    process.env.ALICE_RUNTIME_RELEASE_TOKEN_FILE,
    process.env.ALICE_RUNTIME_RELEASE_TOKEN_SHA256_FILE,
    process.env.ALICE_EVIDENCE_QUEUE_HMAC_KEY_FILE,
  ];
  const hasExternalCredentials = externalCredentialPaths.every(absolute);
  if (
    !hasExternalCredentials &&
    externalCredentialPaths.some((value) => value !== undefined)
  ) {
    releaseInvalid("ALICE_RUNTIME_RELEASE_CREDENTIAL_INVALID");
  }
  const runtimeTokenPath = hasExternalCredentials
    ? externalCredentialPaths[0]
    : path.join(credentialRoot, ".alice-runtime-release-token");
  const runtimeTokenSha256Path = hasExternalCredentials
    ? externalCredentialPaths[1]
    : path.join(credentialRoot, ".alice-runtime-release-token-sha256");
  const evidenceQueueHmacKeyPath = hasExternalCredentials
    ? externalCredentialPaths[2]
    : path.join(credentialRoot, ".alice-evidence-queue-hmac-key");
  let evidence;
  let credential;
  try {
    if (!hasExternalCredentials) {
      run(
        bunBin,
        [path.join(sourceRoot, "deploy/modal/verify_alice_program_admission.ts")],
        {
          cwd: sourceRoot,
          env: {
            ...process.env,
            ALICE_WRANGLER_OUTPUT_DIR: configDir,
            ALICE_PROGRAM_ADMISSION_EVIDENCE_PATH: evidencePath,
            ALICE_RUNTIME_RELEASE_TOKEN_FILE: runtimeTokenPath,
            ALICE_RUNTIME_RELEASE_TOKEN_SHA256_FILE: runtimeTokenSha256Path,
            ALICE_EVIDENCE_QUEUE_HMAC_KEY_FILE: evidenceQueueHmacKeyPath,
          },
          errorCode: "ALICE_PROGRAM_ADMISSION_INVALID",
        },
      );
    }
    evidence = readJson(evidencePath);
    const tokenStat = fs.lstatSync(runtimeTokenPath);
    const digestStat = fs.lstatSync(runtimeTokenSha256Path);
    const evidenceHmacStat = fs.lstatSync(evidenceQueueHmacKeyPath);
    if (
      !tokenStat.isFile() ||
      tokenStat.isSymbolicLink() ||
      (tokenStat.mode & 0o777) !== 0o600 ||
      !digestStat.isFile() ||
      digestStat.isSymbolicLink() ||
      (digestStat.mode & 0o777) !== 0o444 ||
      !evidenceHmacStat.isFile() ||
      evidenceHmacStat.isSymbolicLink() ||
      (evidenceHmacStat.mode & 0o777) !== 0o600
    ) {
      releaseInvalid("ALICE_RUNTIME_RELEASE_CREDENTIAL_INVALID");
    }
    credential = {
      token: fs.readFileSync(runtimeTokenPath, "utf8"),
      saltedSha256: fs.readFileSync(runtimeTokenSha256Path, "utf8"),
      evidenceQueueHmacKey: fs.readFileSync(evidenceQueueHmacKeyPath, "utf8"),
    };
  } finally {
    if (!hasExternalCredentials) {
      fs.rmSync(runtimeTokenPath, { force: true });
      fs.rmSync(runtimeTokenSha256Path, { force: true });
      fs.rmSync(evidenceQueueHmacKeyPath, { force: true });
    }
  }
  const envelope = release.configs.control.vars?.ALICE_PROGRAM_ENVELOPE_B64;
  const signature = release.configs.control.vars?.ALICE_PROGRAM_SIGNATURE_B64;
  const publicJwk = release.configs.control.vars?.ALICE_PROGRAM_PUBLIC_JWK_B64;
  const containerMode = [
    "alice.deployment-manifest.v2",
    "alice.deployment-manifest.v3",
  ].includes(release.manifest.schemaVersion);
  if (
    !exactKeys(evidence, [
      "accessProxySecretFormatVerified",
      "admittedAt",
      "deploymentControllerCommit",
      "deploymentManifestSha256",
      "elizaCommit",
      containerMode ? "runtimeRevision" : "modalRevision",
      ...(containerMode
        ? ["containerRuntimeSecretMappingsVerified"]
        : ["modalProxyTokenPairVerified", "modalRuntimeSecretMappingsVerified"]),
      "policyHash",
      "programDigest",
      "programPublicJwkSha256",
      "releaseDigest",
      "releaseEpoch",
      "rollbackBoundary",
      "runtimeBuildManifestSha256",
      "capabilityBomSha256",
      "runtimeImage",
      "runtimeReleaseTokenBindingVerified",
      "recoveryKeyUnavailableToDeployment",
      "schemaVersion",
      "serviceTokenPairsVerified",
      "sourceCommit",
    ]) ||
    evidence.schemaVersion !==
      (containerMode ? "alice.program-admission.v2" : "alice.program-admission.v1") ||
    !canonicalIsoTimestamp(evidence.admittedAt) ||
    evidence.sourceCommit !== release.manifest.source.sourceCommit ||
    evidence.deploymentControllerCommit !==
      release.manifest.source.deploymentControllerCommit ||
    evidence.elizaCommit !== release.manifest.source.elizaCommit ||
    evidence.runtimeImage !== release.manifest.source.runtimeImage ||
    evidence.runtimeBuildManifestSha256 !==
      release.manifest.source.runtimeBuildManifestSha256 ||
    evidence.capabilityBomSha256 !==
      release.manifest.source.capabilityBomSha256 ||
    evidence.deploymentManifestSha256 !==
      release.deploymentManifestSha256 ||
    evidence.policyHash !== release.manifest.release.policyHash ||
    evidence.releaseEpoch !== release.manifest.release.releaseEpoch ||
    evidence[containerMode ? "runtimeRevision" : "modalRevision"] !==
      release.manifest.release[
        containerMode ? "runtimeRevision" : "modalRevision"
      ] ||
    evidence.rollbackBoundary !== release.manifest.release.rollbackBoundary ||
    !DIGEST.test(evidence.programPublicJwkSha256 ?? "") ||
    !DIGEST.test(evidence.programDigest ?? "") ||
    !DIGEST.test(evidence.releaseDigest ?? "") ||
    evidence.serviceTokenPairsVerified !== true ||
    evidence.runtimeReleaseTokenBindingVerified !== true ||
    evidence.accessProxySecretFormatVerified !== true ||
    (containerMode
      ? evidence.containerRuntimeSecretMappingsVerified !== true
      : evidence.modalProxyTokenPairVerified !== true ||
        evidence.modalRuntimeSecretMappingsVerified !== true) ||
    evidence.recoveryKeyUnavailableToDeployment !== true ||
    typeof envelope !== "string" ||
    typeof signature !== "string" ||
    typeof publicJwk !== "string"
  ) {
    releaseInvalid("ALICE_PROGRAM_ADMISSION_INVALID");
  }
  if (
    typeof credential?.token !== "string" ||
    credential.token.length < 32 ||
    !DIGEST.test(credential?.saltedSha256 ?? "") ||
    !/^aeq1_[A-Za-z0-9_-]{43}$/.test(credential?.evidenceQueueHmacKey ?? "")
  ) {
    releaseInvalid("ALICE_RUNTIME_RELEASE_CREDENTIAL_INVALID");
  }
  return { credential, evidence };
}

async function createRollbackAnchor({
  apiToken,
  sourceCommit,
  deploymentManifestSha256,
  expectedDurableObjectNamespaceIds,
  outputPath,
}) {
  const workers = await captureAliceCloudflareWorkerRollbackState({ apiToken });
  const containerApplication =
    await fetchAliceContainerApplicationRollbackState({ apiToken });
  const trafficState = await fetchAliceCloudflareTrafficState({ apiToken });
  const continuity = await fetchAliceCloudflareContinuityState({
    apiToken,
    expectedDurableObjectNamespaceIds,
  });
  const workflowVersions = await fetchAliceCloudflareWorkflowVersionState({
    apiToken,
    expectedWorkflowId: continuity.readback.workflow.id,
  });
  const terminalWorkers = await captureAliceCloudflareWorkerRollbackState({
    apiToken,
  });
  const terminalContainerApplication =
    await fetchAliceContainerApplicationRollbackState({ apiToken });
  const terminalTrafficState = await fetchAliceCloudflareTrafficState({
    apiToken,
  });
  const terminalContinuity = await fetchAliceCloudflareContinuityState({
    apiToken,
    expectedDurableObjectNamespaceIds,
  });
  const terminalWorkflowVersions =
    await fetchAliceCloudflareWorkflowVersionState({
      apiToken,
      expectedWorkflowId: terminalContinuity.readback.workflow.id,
    });
  if (
    canonicalAliceJson(workers) !== canonicalAliceJson(terminalWorkers) ||
    canonicalAliceJson(containerApplication) !==
      canonicalAliceJson(terminalContainerApplication) ||
    canonicalAliceJson(trafficState) !==
      canonicalAliceJson(terminalTrafficState) ||
    canonicalAliceJson(continuity.sanitized) !==
      canonicalAliceJson(terminalContinuity.sanitized) ||
    canonicalAliceJson(workflowVersions) !==
      canonicalAliceJson(terminalWorkflowVersions)
  ) {
    releaseInvalid("ALICE_ROLLBACK_ANCHOR_INVALID");
  }
  const anchor = {
    schemaVersion: "alice.cloudflare-rollback-anchor.v7",
    accountId: ALICE_CLOUDFLARE_TARGET.accountId,
    candidate: { sourceCommit, deploymentManifestSha256 },
    previous: {
      capturedAt: new Date().toISOString(),
      coherent: true,
      containerApplication,
      continuityConfig: continuity.sanitized,
      trafficState,
      workflowVersions,
      workers,
    },
  };
  verifyAliceCloudflareRollbackAnchor(anchor, {
    sourceCommit,
    deploymentManifestSha256,
  });
  writeReadonly(outputPath, anchor);
  return anchor;
}

export function verifyAliceCloudflareRollbackAnchor(
  anchor,
  { sourceCommit, deploymentManifestSha256 },
) {
  if (
    !COMMIT.test(sourceCommit ?? "") ||
    !DIGEST.test(deploymentManifestSha256 ?? "") ||
    !exactKeys(anchor, [
      "accountId",
      "candidate",
      "previous",
      "schemaVersion",
    ]) ||
    anchor.schemaVersion !== "alice.cloudflare-rollback-anchor.v7" ||
    anchor.accountId !== ALICE_CLOUDFLARE_TARGET.accountId ||
    !exactKeys(anchor.candidate, [
      "deploymentManifestSha256",
      "sourceCommit",
    ]) ||
    anchor.candidate.sourceCommit !== sourceCommit ||
    anchor.candidate.deploymentManifestSha256 !== deploymentManifestSha256 ||
    !exactKeys(anchor.previous, [
      "capturedAt",
      "coherent",
      "containerApplication",
      "continuityConfig",
      "trafficState",
      "workflowVersions",
      "workers",
    ]) ||
    !canonicalIsoTimestamp(anchor.previous.capturedAt) ||
    typeof anchor.previous.coherent !== "boolean" ||
    anchor.previous.coherent !== true
  ) {
    releaseInvalid("ALICE_ROLLBACK_ANCHOR_INVALID");
  }
  try {
    verifyAliceContainerApplicationRollbackState(
      anchor.previous.containerApplication,
    );
    verifyAliceCloudflareContinuityConfig(anchor.previous.continuityConfig);
    verifyAliceCloudflareWorkflowVersionSnapshot(
      anchor.previous.workflowVersions,
      anchor.previous.continuityConfig.workflow.id,
    );
  } catch {
    releaseInvalid("ALICE_ROLLBACK_ANCHOR_INVALID");
  }
  try {
    verifyAliceCloudflareWorkerRollbackStateSnapshot(
      anchor.previous.workers,
    );
  } catch {
    releaseInvalid("ALICE_ROLLBACK_ANCHOR_INVALID");
  }
  try {
    aliceTrafficSemanticState(anchor.previous.trafficState);
  } catch {
    releaseInvalid("ALICE_ROLLBACK_ANCHOR_INVALID");
  }
  return anchor;
}

export function verifyAliceWorkflowRollbackContinuity({
  expected,
  current,
  expectedWorkflowId,
}) {
  try {
    const previous = verifyAliceCloudflareWorkflowVersionSnapshot(
      expected,
      expectedWorkflowId,
    );
    const observed = verifyAliceCloudflareWorkflowVersionSnapshot(
      current,
      expectedWorkflowId,
    );
    const byId = new Map(observed.map((version) => [version.id, version]));
    for (const version of previous) {
      if (
        canonicalAliceJson(byId.get(version.id)) !==
          canonicalAliceJson(version)
      ) {
        releaseInvalid("ALICE_CLOUDFLARE_WORKFLOW_ROLLBACK_INVALID");
      }
    }
    return { current: observed, previousVersionsPreserved: true };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_CLOUDFLARE_WORKFLOW_ROLLBACK_INVALID"
    ) {
      throw error;
    }
    releaseInvalid("ALICE_CLOUDFLARE_WORKFLOW_ROLLBACK_INVALID");
  }
}

export function readAliceCloudflareRollbackAnchor(
  filePath,
  sourceCommit,
  expectedDeploymentManifestSha256,
) {
  const anchor = readJson(filePath);
  return verifyAliceCloudflareRollbackAnchor(anchor, {
    sourceCommit,
    deploymentManifestSha256: expectedDeploymentManifestSha256,
  });
}

export function verifyAliceCloudflarePreparedState({
  anchor,
  uploadedVersions,
  workers,
  containerApplication,
  traffic,
}) {
  if (
    !exactKeys(uploadedVersions, ROLES) ||
    !ROLES.every((role) => VERSION_ID.test(uploadedVersions[role] ?? ""))
  ) {
    releaseInvalid("ALICE_CLOUDFLARE_PREPARE_INVALID");
  }
  try {
    verifyAliceCloudflareWorkerRollbackStateSnapshot(workers);
  } catch {
    releaseInvalid("ALICE_CLOUDFLARE_PREPARE_INVALID");
  }
  const expectedTraffic = aliceExpectedReleaseControlTrafficState(
    anchor.previous.trafficState,
  );
  if (
    workers.control.serving.versionId !== uploadedVersions.control ||
    canonicalAliceJson(workers.access) !==
      canonicalAliceJson(anchor.previous.workers.access) ||
    canonicalAliceJson(workers.aiGateway) !==
      canonicalAliceJson(anchor.previous.workers.aiGateway) ||
    canonicalAliceJson(workers.statePlane) !==
      canonicalAliceJson(anchor.previous.workers.statePlane) ||
    canonicalAliceJson(workers.connectorPlane) !==
      canonicalAliceJson(anchor.previous.workers.connectorPlane) ||
    canonicalAliceJson(containerApplication) !==
      canonicalAliceJson(anchor.previous.containerApplication) ||
    canonicalAliceJson(aliceTrafficSemanticState(traffic)) !==
      canonicalAliceJson(expectedTraffic)
  ) {
    releaseInvalid("ALICE_CLOUDFLARE_PREPARE_INVALID");
  }
  return {
    controlVersionId: uploadedVersions.control,
    uploadedVersions,
    traffic,
  };
}

export function verifyAliceCloudflareAnchorStillCurrent({
  anchor,
  workers,
  containerApplication,
  traffic,
  continuityConfig,
  workflowVersions,
}) {
  try {
    verifyAliceContainerApplicationRollbackState(containerApplication);
    verifyAliceCloudflareWorkerRollbackStateSnapshot(workers);
    aliceTrafficSemanticState(traffic);
    verifyAliceCloudflareContinuityConfig(continuityConfig);
    verifyAliceCloudflareWorkflowVersionSnapshot(
      workflowVersions,
      anchor.previous.continuityConfig.workflow.id,
    );
  } catch {
    releaseInvalid("ALICE_CLOUDFLARE_ANCHOR_DRIFTED");
  }
  if (
    canonicalAliceJson(workers) !==
      canonicalAliceJson(anchor.previous.workers) ||
    canonicalAliceJson(containerApplication) !==
      canonicalAliceJson(anchor.previous.containerApplication) ||
    canonicalAliceJson(traffic) !==
      canonicalAliceJson(anchor.previous.trafficState) ||
    canonicalAliceJson(continuityConfig) !==
      canonicalAliceJson(anchor.previous.continuityConfig) ||
    canonicalAliceJson(workflowVersions) !==
      canonicalAliceJson(anchor.previous.workflowVersions)
  ) releaseInvalid("ALICE_CLOUDFLARE_ANCHOR_DRIFTED");
  return { anchorFresh: true };
}

export function verifyAliceCloudflarePrepareEvidence(
  value,
  { sourceCommit, deploymentManifestSha256 },
) {
  if (
    !exactKeys(value, [
      "schemaVersion",
      "observedAt",
      "sourceCommit",
      "deploymentManifestSha256",
      "controlVersionId",
      "uploadedVersions",
      "traffic",
    ]) ||
    value.schemaVersion !== "alice.cloudflare-prepare-evidence.v1" ||
    !canonicalIsoTimestamp(value.observedAt) ||
    value.sourceCommit !== sourceCommit ||
    value.deploymentManifestSha256 !== deploymentManifestSha256 ||
    !VERSION_ID.test(value.controlVersionId ?? "") ||
    !exactKeys(value.uploadedVersions, ROLES) ||
    !ROLES.every((role) => VERSION_ID.test(value.uploadedVersions[role] ?? "")) ||
    value.controlVersionId !== value.uploadedVersions.control
  ) {
    releaseInvalid("ALICE_CLOUDFLARE_PREPARE_INVALID");
  }
  try {
    aliceTrafficSemanticState(value.traffic);
  } catch {
    releaseInvalid("ALICE_CLOUDFLARE_PREPARE_INVALID");
  }
  return value;
}

export function materializeAliceWorkerSecretFiles(
  configs,
  secretOverrides = {},
) {
  const containerMode = configs?.runtimeHost?.secrets?.required?.includes(
    "ALICE_RUNTIME_IMAGE",
  );
  const expectedOverrides = [
    "ALICE_EVIDENCE_QUEUE_HMAC_KEY",
    "ALICE_RUNTIME_RELEASE_TOKEN_SHA256",
    ...(containerMode
      ? [
          "ALICE_CAPABILITY_BOM_SHA256",
          "ALICE_DEPLOYMENT_CONTROLLER_COMMIT",
          "ALICE_ELIZA_COMMIT",
          "ALICE_POLICY_HASH",
          "ALICE_PROGRAM_DIGEST",
          "ALICE_RELEASE_DIGEST",
          "ALICE_RUNTIME_API_TOKEN",
          "ALICE_RUNTIME_BUILD_MANIFEST_SHA256",
          "ALICE_RUNTIME_IMAGE",
          "ALICE_RUNTIME_RELEASE_TOKEN",
          "ALICE_RUNTIME_REVISION",
          "ALICE_RUNTIME_VAULT_PASSPHRASE",
          "ALICE_SOURCE_COMMIT",
        ]
      : []),
  ];
  if (
    !exactKeys(secretOverrides, expectedOverrides) ||
    (containerMode &&
      (configs.runtimeHost.containers?.length !== 1 ||
        secretOverrides.ALICE_RUNTIME_IMAGE !==
          configs.runtimeHost.containers[0]?.image))
  ) {
    releaseInvalid("ALICE_RELEASE_SECRETS_INVALID");
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-worker-secrets."));
  fs.chmodSync(root, 0o700);
  const paths = {};
  try {
    for (const role of ROLES) {
      const names = configs[role].secrets?.required;
      if (
        !Array.isArray(names) ||
        names.length === 0 ||
        new Set(names).size !== names.length
      ) {
        releaseInvalid("ALICE_RELEASE_SECRETS_INVALID");
      }
      const values = {};
      for (const name of names) {
        if (role === "control" && name === "ALICE_CONTROL_RECOVERY_TOKEN") {
          continue;
        }
        const value = Object.hasOwn(secretOverrides, name)
          ? secretOverrides[name]
          : process.env[name];
        if (
          !/^[A-Z][A-Z0-9_]+$/.test(name) ||
          typeof value !== "string" ||
          (name === "ALICE_RUNTIME_REVISION"
            ? !/^(?:49|[5-9][0-9]|[1-9][0-9]{2,})$/.test(value)
            : value.length < 16)
        ) {
          releaseInvalid("ALICE_RELEASE_SECRETS_INVALID");
        }
        values[name] = value;
      }
      const filePath = path.join(root, `${role}.json`);
      fs.writeFileSync(filePath, JSON.stringify(values), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      paths[role] = filePath;
    }
    return { root, paths };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function dryRunExactBundles({
  wranglerBin,
  sourceRoot,
  commands,
  secretPaths,
  manifest,
  commandEnv,
}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-worker-dry-run."));
  try {
    for (const command of commands.uploads) {
      const outdir = path.join(root, command.role);
      run(
        wranglerBin,
        [
          ...command.argv,
          "--secrets-file",
          secretPaths[command.role],
          "--dry-run",
          "--outdir",
          outdir,
        ],
        {
          cwd: sourceRoot,
          env: commandEnv,
          errorCode: "ALICE_WORKER_DRY_RUN_INVALID",
        },
      );
      const digestField = {
        access: "accessWorkerBundleSha256",
        runtimeHost: "runtimeHostWorkerBundleSha256",
        control: "controlWorkerBundleSha256",
        aiGateway: "aiGatewayWorkerBundleSha256",
        statePlane: "statePlaneWorkerBundleSha256",
        connectorPlane: "connectorPlaneWorkerBundleSha256",
      }[command.role];
      verifyAliceWorkerDryRunDirectory({
        signedBundlePath: command.bundlePath,
        outdir,
        expectedSha256: manifest.cloudflare[digestField],
      });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function readSignedContinuity({
  fetchImpl = globalThis.fetch,
  apiToken,
  expectedDurableObjectNamespaceIds,
  expectedDigest,
  expectedQueueDeliveryPaused,
}) {
  const state = await fetchAliceCloudflareContinuityState({
    fetchImpl,
    apiToken,
    expectedDurableObjectNamespaceIds,
  });
  if (
    typeof expectedQueueDeliveryPaused !== "boolean" ||
    state.readback.queue?.settings?.delivery_paused !==
      expectedQueueDeliveryPaused ||
    state.readback.deadLetterQueue?.settings?.delivery_paused !== true
  ) {
    releaseInvalid("ALICE_CONTINUITY_CHANGED_DURING_PROMOTION");
  }
  const candidateReadback = expectedQueueDeliveryPaused
    ? buildAliceCandidateCloudflareContinuityReadback(state.readback)
    : state.readback;
  const candidateConfig = buildAliceCloudflareContinuityConfig(
    candidateReadback,
  );
  if (digestAliceCloudflareContinuityConfig(candidateConfig) !== expectedDigest) {
    releaseInvalid("ALICE_CONTINUITY_CHANGED_DURING_PROMOTION");
  }
  return { ...state, candidateConfig };
}

async function putCloudflareJson({
  fetchImpl,
  apiToken,
  pathname,
  body,
}) {
  const response = await fetchImpl(`${API_BASE}${pathname}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${apiToken}`,
      accept: "application/json",
      "cache-control": "no-cache",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!(response instanceof Response) || !response.ok) {
    releaseInvalid("ALICE_EVIDENCE_QUEUE_STATE_INVALID");
  }
  let value;
  try {
    value = await response.json();
  } catch {
    releaseInvalid("ALICE_EVIDENCE_QUEUE_STATE_INVALID");
  }
  if (value?.success !== true || !("result" in value)) {
    releaseInvalid("ALICE_EVIDENCE_QUEUE_STATE_INVALID");
  }
  return value.result;
}

export async function setAliceEvidenceQueueDeliveryPaused({
  fetchImpl = globalThis.fetch,
  apiToken,
  expectedDurableObjectNamespaceIds,
  expectedContinuityDigest,
  deliveryPaused,
}) {
  const before = await fetchAliceCloudflareContinuityState({
    fetchImpl,
    apiToken,
    expectedDurableObjectNamespaceIds,
  });
  if (before.readback.deadLetterQueue?.settings?.delivery_paused !== true) {
    releaseInvalid("ALICE_EVIDENCE_QUEUE_STATE_INVALID");
  }
  const update = buildAliceEvidenceQueueUpdate(
    before.readback.queue,
    deliveryPaused,
  );
  const mutated =
    before.readback.queue.settings.delivery_paused !== deliveryPaused;
  if (mutated) {
    await putCloudflareJson({ fetchImpl, apiToken, ...update });
  }
  const after = await readSignedContinuity({
    fetchImpl,
    apiToken,
    expectedDurableObjectNamespaceIds,
    expectedDigest: expectedContinuityDigest,
    expectedQueueDeliveryPaused: deliveryPaused,
  });
  return { before: before.readback, after: after.readback, mutated };
}

export async function restoreAliceCloudflareContinuityState({
  fetchImpl = globalThis.fetch,
  apiToken,
  expectedDurableObjectNamespaceIds,
  expectedConfig,
}) {
  verifyAliceCloudflareContinuityConfig(expectedConfig);
  const before = await fetchAliceCloudflareContinuityState({
    fetchImpl,
    apiToken,
    expectedDurableObjectNamespaceIds,
  });
  const projected = structuredClone(before.sanitized);
  projected.evidenceQueue.deliveryPaused =
    expectedConfig.evidenceQueue.deliveryPaused;
  projected.evidenceDeadLetterQueue.deliveryPaused =
    expectedConfig.evidenceDeadLetterQueue.deliveryPaused;
  if (canonicalAliceJson(projected) !== canonicalAliceJson(expectedConfig)) {
    releaseInvalid("ALICE_EVIDENCE_QUEUE_STATE_INVALID");
  }
  const mutations = [];
  for (const [rawQueue, expectedQueue] of [
    [before.readback.queue, expectedConfig.evidenceQueue],
    [before.readback.deadLetterQueue, expectedConfig.evidenceDeadLetterQueue],
  ]) {
    if (rawQueue.settings.delivery_paused !== expectedQueue.deliveryPaused) {
      const update = buildAliceContinuityQueueUpdate(rawQueue, expectedQueue);
      await putCloudflareJson({ fetchImpl, apiToken, ...update });
      mutations.push(expectedQueue.name);
    }
  }
  const after = await fetchAliceCloudflareContinuityState({
    fetchImpl,
    apiToken,
    expectedDurableObjectNamespaceIds,
  });
  if (canonicalAliceJson(after.sanitized) !== canonicalAliceJson(expectedConfig)) {
    releaseInvalid("ALICE_EVIDENCE_QUEUE_STATE_INVALID");
  }
  return {
    before: before.sanitized,
    after: after.sanitized,
    mutations,
  };
}

export async function executeAliceCloudflareRollbacks({
  wranglerBin,
  sourceRoot,
  commands,
  commandEnv,
  apiToken,
  anchor,
  expectedDurableObjectNamespaceIds,
  expectedContinuityDigest,
  operations = {},
}) {
  const fetchWorkflowVersions = operations.fetchWorkflowVersions ??
    ((options) => fetchAliceCloudflareWorkflowVersionState(options));
  const pauseEvidenceQueue = operations.pauseEvidenceQueue ??
    ((options) => setAliceEvidenceQueueDeliveryPaused(options));
  const runRollbackCommand = operations.runRollbackCommand ??
    ((command) => run(wranglerBin, command.argv, {
      cwd: sourceRoot,
      env: commandEnv,
      errorCode: `ALICE_${command.role.toUpperCase()}_ROLLBACK_FAILED`,
    }));
  const restoreTraffic = operations.restoreTraffic ??
    ((options) => restoreAliceTrafficState(options));
  const restoreWorkers = operations.restoreWorkers ??
    ((options) => restoreAliceCloudflareWorkerRollbackState(options));
  const restoreContinuity = operations.restoreContinuity ??
    ((options) => restoreAliceCloudflareContinuityState(options));
  const restoreContainerApplication = operations.restoreContainerApplication ??
    (async () => {
      const current = await fetchAliceContainerApplicationRollbackState({
        apiToken,
      });
      return transitionAliceContainerApplication({
        apiToken,
        expectedCurrent: current,
        target: anchor.previous.containerApplication.target,
      });
    });
  const failures = [];
  const workflowVersionsBeforeRollback =
    await fetchWorkflowVersions({
      apiToken,
      expectedWorkflowId: anchor.previous.continuityConfig.workflow.id,
    });
  verifyAliceWorkflowRollbackContinuity({
    expected: anchor.previous.workflowVersions,
    current: workflowVersionsBeforeRollback,
    expectedWorkflowId: anchor.previous.continuityConfig.workflow.id,
  });
  const queueSafety = await pauseEvidenceQueue({
    apiToken,
    expectedDurableObjectNamespaceIds,
    expectedContinuityDigest,
    deliveryPaused: true,
  });
  const failClosed = async () => {
    let failClosedQueueSafety;
    let failClosedQueueSafetyVerified = false;
    try {
      failClosedQueueSafety = await pauseEvidenceQueue({
        apiToken,
        expectedDurableObjectNamespaceIds,
        expectedContinuityDigest,
        deliveryPaused: true,
      });
      failClosedQueueSafetyVerified = true;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
    const failure = new Error(
      `ALICE_CLOUDFLARE_ROLLBACK_FAILED\n` +
      `failClosedQueueSafetyVerified=${failClosedQueueSafetyVerified}\n` +
      failures.join("\n"),
    );
    failure.failClosedQueueSafety = failClosedQueueSafety;
    throw failure;
  };
  const edgeRollbacks = commands.rollbacks.filter(
    (command) => ["access", "runtimeHost"].includes(command.role),
  );
  const internalRollbacks = commands.rollbacks.filter(
    (command) => !["access", "runtimeHost"].includes(command.role),
  );
  for (const command of edgeRollbacks) {
    try {
      runRollbackCommand(command);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  let containerApplication;
  try {
    containerApplication = await restoreContainerApplication({
      apiToken,
      expected: anchor.previous.containerApplication,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  for (const command of internalRollbacks) {
    try {
      runRollbackCommand(command);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  let traffic;
  let workers;
  let continuity;
  let workflowVersionContinuity;
  try {
    traffic = await restoreTraffic({
      apiToken,
      expected: anchor.previous.trafficState,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  try {
    workers = await restoreWorkers({
      apiToken,
      expected: anchor.previous.workers,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  if (failures.length > 0) await failClosed();
  try {
    const workflowVersionsAfterRollback =
      await fetchWorkflowVersions({
        apiToken,
        expectedWorkflowId: anchor.previous.continuityConfig.workflow.id,
      });
    if (
      canonicalAliceJson(workflowVersionsBeforeRollback) !==
        canonicalAliceJson(workflowVersionsAfterRollback)
    ) {
      releaseInvalid("ALICE_CLOUDFLARE_WORKFLOW_ROLLBACK_INVALID");
    }
    workflowVersionContinuity = verifyAliceWorkflowRollbackContinuity({
      expected: anchor.previous.workflowVersions,
      current: workflowVersionsAfterRollback,
      expectedWorkflowId: anchor.previous.continuityConfig.workflow.id,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  if (failures.length > 0) await failClosed();
  try {
    continuity = await restoreContinuity({
      apiToken,
      expectedDurableObjectNamespaceIds,
      expectedConfig: anchor.previous.continuityConfig,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    await failClosed();
  }
  return {
    schemaVersion: "alice.cloudflare-rollback-evidence.v2",
    accountId: ALICE_CLOUDFLARE_TARGET.accountId,
    observedAt: new Date().toISOString(),
    traffic: traffic.after,
    containerApplication: containerApplication.current,
    workerDeployments: workers.deployments,
    workers: workers.restored,
    continuityConfig: continuity.after,
    continuityRestoration: {
      mode: anchor.previous.continuityConfig.evidenceQueue.deliveryPaused
        ? "bootstrap-non-serving-paused"
        : "prior-serving-state-restored",
      mutations: continuity.mutations,
    },
    queueSafety,
    workflowVersionContinuity,
  };
}

const executeRollbacks = executeAliceCloudflareRollbacks;

async function main() {
  const ambientFetch = globalThis.fetch;
  if (typeof ambientFetch !== "function") releaseInvalid();
  globalThis.fetch = (input, init = {}) => ambientFetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(60_000),
  });
  const sourceRoot = process.env.ALICE_SOURCE_ROOT;
  const wranglerBin = process.env.ALICE_WRANGLER_BIN;
  const bunBin = process.env.ALICE_BUN_BIN;
  const artifactRoot = process.env.ALICE_WORKER_BUNDLE_ROOT;
  const artifactPath = process.env.ALICE_WORKER_BUNDLE_ARTIFACT_PATH;
  const manifestPath = process.env.ALICE_DEPLOYMENT_MANIFEST_PATH;
  const configDir = process.env.ALICE_WRANGLER_OUTPUT_DIR;
  const rollbackAnchorPath =
    process.env.ALICE_CLOUDFLARE_ROLLBACK_ANCHOR_PATH;
  const readbackPath = process.env.ALICE_CLOUDFLARE_READBACK_PATH;
  const rollbackProofPath =
    process.env.ALICE_CLOUDFLARE_ROLLBACK_PROOF_PATH;
  const prepareEvidencePath =
    process.env.ALICE_CLOUDFLARE_PREPARE_EVIDENCE_PATH;
  const pauseEvidencePath =
    process.env.ALICE_DEPLOYMENT_PAUSE_EVIDENCE_PATH;
  const namespaceIdsPath =
    process.env.ALICE_EXPECTED_DO_NAMESPACE_IDS_PATH;
  const programAdmissionEvidencePath =
    process.env.ALICE_PROGRAM_ADMISSION_EVIDENCE_PATH;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const phase = process.env.ALICE_CLOUDFLARE_RELEASE_PHASE;
  const releaseRunId = process.env.ALICE_RELEASE_RUN_ID;
  if (
    ![sourceRoot, wranglerBin, bunBin, artifactRoot, artifactPath, manifestPath,
      configDir, rollbackAnchorPath, readbackPath,
      rollbackProofPath, prepareEvidencePath, pauseEvidencePath,
      programAdmissionEvidencePath, namespaceIdsPath]
      .every(absolute) ||
    typeof apiToken !== "string" ||
    apiToken.length < 16 ||
    !["capture", "prepare", "promote", "rollback", "verify"].includes(phase) ||
    !RELEASE_RUN_ID.test(releaseRunId ?? "")
  ) {
    releaseInvalid();
  }

  const release = await verifyReleaseArtifacts({
    sourceRoot,
    manifestPath,
    artifactPath,
    artifactRoot,
    configDir,
  });
  const expectedDurableObjectNamespaceIds = readJson(namespaceIdsPath);
  const sourceCommit = release.manifest.source.sourceCommit;
  verifyProtectedSource({ sourceRoot, sourceCommit });
  verifyWrangler(wranglerBin, sourceRoot);
  const confirmation = `${sourceCommit}:${release.deploymentManifestSha256}`;
  if (process.env.ALICE_PRODUCTION_RELEASE_CONFIRM !== confirmation) {
    releaseInvalid("ALICE_PRODUCTION_RELEASE_CONFIRM_INVALID");
  }
  if (phase === "rollback") {
    const rollbackAnchor = readAliceCloudflareRollbackAnchor(
      rollbackAnchorPath,
      sourceCommit,
      release.deploymentManifestSha256,
    );
    const rollbackVersions = Object.fromEntries(
      ROLES.map((role) => [
        role,
        rollbackAnchor.previous.workers[role]?.serving?.versionId ?? null,
      ]),
    );
    const rollbackCommands = buildAliceProtectedCloudflareCommands({
      wranglerBin,
      configDir,
      bundleRoot: artifactRoot,
      sourceCommit,
      releaseRunId,
      rollbackVersions,
    });
    const rollbackEvidence = await executeRollbacks({
      wranglerBin,
      sourceRoot,
      commands: rollbackCommands,
      commandEnv: aliceCloudflareCommandEnv(),
      apiToken,
      anchor: rollbackAnchor,
      expectedDurableObjectNamespaceIds,
      expectedContinuityDigest:
        release.manifest.cloudflare.continuityConfigSha256,
    });
    writeReadonly(readbackPath, rollbackEvidence);
    return;
  }

  verifyBun(bunBin, sourceRoot);
  verifyGitHubAttestations({ sourceRoot, sourceCommit, artifactRoot });
  const admission = runProgramAdmissionPreflight({
    bunBin,
    sourceRoot,
    configDir,
    evidencePath: programAdmissionEvidencePath,
    release,
  });

  if (phase === "capture") {
    verifyProtectedRefStillExact({ sourceRoot, sourceCommit });
    await createRollbackAnchor({
      apiToken,
      sourceCommit,
      deploymentManifestSha256: release.deploymentManifestSha256,
      expectedDurableObjectNamespaceIds,
      outputPath: rollbackAnchorPath,
    });
    return;
  }
  const anchor = readAliceCloudflareRollbackAnchor(
    rollbackAnchorPath,
    sourceCommit,
    release.deploymentManifestSha256,
  );
  const rollbackVersions = Object.fromEntries(
    ROLES.map((role) => [
      role,
      anchor.previous.workers[role]?.serving?.versionId ?? null,
    ]),
  );
  const commands = buildAliceProtectedCloudflareCommands({
    wranglerBin,
    configDir,
    bundleRoot: artifactRoot,
    sourceCommit,
    releaseRunId,
    rollbackVersions,
  });
  const commandEnv = aliceCloudflareCommandEnv();
  const verifyLive = async () =>
    fetchAliceCloudflarePostDeploymentReadback({
      apiToken,
      ownerEmailSha256:
        release.configs.access.vars.ALICE_OWNER_EMAIL_SHA256,
      accessAudience: release.configs.access.vars.ALICE_ACCESS_AUDIENCE,
      releaseAccessAudience:
        release.configs.control.vars.ALICE_RELEASE_ACCESS_AUDIENCE,
      releaseServiceTokenIdSha256:
        release.configs.control.vars.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
      serializedManifest: release.serializedManifest,
      materializedWranglerConfigs: release.configs,
      expectedEffectiveConfigs: release.effectiveConfigs,
      expectedDurableObjectNamespaceIds,
    });
  if (phase === "verify") {
    writeReadonly(readbackPath, await verifyLive());
    return;
  }

  if (phase === "prepare") {
    const containerMode = [
      "alice.deployment-manifest.v2",
      "alice.deployment-manifest.v3",
    ].includes(release.manifest.schemaVersion);
    const secrets = materializeAliceWorkerSecretFiles(release.configs, {
      ALICE_EVIDENCE_QUEUE_HMAC_KEY:
        admission.credential.evidenceQueueHmacKey,
      ALICE_RUNTIME_RELEASE_TOKEN_SHA256:
        admission.credential.saltedSha256,
      ...(containerMode
        ? {
            ALICE_CAPABILITY_BOM_SHA256:
              admission.evidence.capabilityBomSha256,
            ALICE_DEPLOYMENT_CONTROLLER_COMMIT:
              admission.evidence.deploymentControllerCommit,
            ALICE_ELIZA_COMMIT: admission.evidence.elizaCommit,
            ALICE_POLICY_HASH: admission.evidence.policyHash,
            ALICE_PROGRAM_DIGEST: admission.evidence.programDigest,
            ALICE_RELEASE_DIGEST: admission.evidence.releaseDigest,
            ALICE_RUNTIME_API_TOKEN: process.env.MILADY_API_TOKEN,
            ALICE_RUNTIME_BUILD_MANIFEST_SHA256:
              admission.evidence.runtimeBuildManifestSha256,
            ALICE_RUNTIME_IMAGE: admission.evidence.runtimeImage,
            ALICE_RUNTIME_RELEASE_TOKEN: admission.credential.token,
            ALICE_RUNTIME_REVISION: String(
              admission.evidence.runtimeRevision,
            ),
            ALICE_RUNTIME_VAULT_PASSPHRASE:
              process.env.ELIZA_VAULT_PASSPHRASE,
            ALICE_SOURCE_COMMIT: admission.evidence.sourceCommit,
          }
        : {}),
    });
    let rollbackRequired = false;
    try {
      verifyProtectedRefStillExact({ sourceRoot, sourceCommit });
      const freshWorkers = await captureAliceCloudflareWorkerRollbackState({
        apiToken,
      });
      const freshContainerApplication =
        await fetchAliceContainerApplicationRollbackState({ apiToken });
      const freshTraffic = await fetchAliceCloudflareTrafficState({ apiToken });
      const freshContinuity = await fetchAliceCloudflareContinuityState({
        apiToken,
        expectedDurableObjectNamespaceIds,
      });
      const freshWorkflowVersions =
        await fetchAliceCloudflareWorkflowVersionState({
          apiToken,
          expectedWorkflowId: freshContinuity.readback.workflow.id,
        });
      verifyAliceCloudflareAnchorStillCurrent({
        anchor,
        workers: freshWorkers,
        containerApplication: freshContainerApplication,
        traffic: freshTraffic,
        continuityConfig: freshContinuity.sanitized,
        workflowVersions: freshWorkflowVersions,
      });
      dryRunExactBundles({
        wranglerBin,
        sourceRoot,
        commands,
        secretPaths: secrets.paths,
        manifest: release.manifest,
        commandEnv,
      });
      verifyProtectedRefStillExact({ sourceRoot, sourceCommit });
      applyAliceStateMigrationsBeforeWorkerMutation({
        wranglerBin,
        sourceRoot,
        configPath: configPath(configDir, "statePlane"),
        commandEnv,
      });
      verifyProtectedRefStillExact({ sourceRoot, sourceCommit });
      rollbackRequired = true;
      await setAliceEvidenceQueueDeliveryPaused({
        apiToken,
        expectedDurableObjectNamespaceIds,
        expectedContinuityDigest:
          release.manifest.cloudflare.continuityConfigSha256,
        deliveryPaused: true,
      });
      const uploadedVersions = {};
      for (const command of commands.uploads) {
        const output = run(wranglerBin, [
          ...command.argv,
          "--secrets-file",
          secrets.paths[command.role],
        ], {
          cwd: sourceRoot,
          env: commandEnv,
          errorCode: "ALICE_WORKER_UPLOAD_FAILED",
        });
        uploadedVersions[command.role] =
          parseAliceWranglerUploadVersionId(output);
      }
      verifyProtectedRefStillExact({ sourceRoot, sourceCommit });
      const prePromotionTraffic = await fetchAliceCloudflareTrafficState({
        apiToken,
      });
      if (
        canonicalAliceJson(prePromotionTraffic) !==
          canonicalAliceJson(anchor.previous.trafficState)
      ) releaseInvalid("ALICE_TRAFFIC_CHANGED_BEFORE_PROMOTION");
      const promotionCommands = buildAliceProtectedCloudflareCommands({
        wranglerBin,
        configDir,
        bundleRoot: artifactRoot,
        sourceCommit,
        releaseRunId,
        uploadedVersions,
        rollbackVersions,
      });
      const controlPromotion = promotionCommands.promotions.find(
        (command) => command.role === "control",
      );
      if (!controlPromotion) releaseInvalid();
      run(wranglerBin, controlPromotion.argv, {
        cwd: sourceRoot,
        env: commandEnv,
        errorCode: "ALICE_CONTROL_PREPARE_FAILED",
      });
      await applyAliceCandidateTrafficState({
        apiToken,
        expected: aliceExpectedReleaseControlTrafficState(
          anchor.previous.trafficState,
        ),
      });
      const workers = await captureAliceCloudflareWorkerRollbackState({
        apiToken,
      });
      const containerApplication =
        await fetchAliceContainerApplicationRollbackState({ apiToken });
      const traffic = await fetchAliceCloudflareTrafficState({ apiToken });
      const prepared = verifyAliceCloudflarePreparedState({
        anchor,
        uploadedVersions,
        workers,
        containerApplication,
        traffic,
      });
      writeReadonly(prepareEvidencePath, verifyAliceCloudflarePrepareEvidence({
        schemaVersion: "alice.cloudflare-prepare-evidence.v1",
        observedAt: new Date().toISOString(),
        sourceCommit,
        deploymentManifestSha256: release.deploymentManifestSha256,
        ...prepared,
      }, {
        sourceCommit,
        deploymentManifestSha256: release.deploymentManifestSha256,
      }));
      return;
    } catch (error) {
      if (rollbackRequired) {
        try {
          const rollbackEvidence = await executeRollbacks({
            wranglerBin,
            sourceRoot,
            commands,
            commandEnv,
            apiToken,
            anchor,
            expectedDurableObjectNamespaceIds,
            expectedContinuityDigest:
              release.manifest.cloudflare.continuityConfigSha256,
          });
          if (!fs.existsSync(readbackPath)) {
            writeReadonly(readbackPath, rollbackEvidence);
          }
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "ALICE_RELEASE_AND_ROLLBACK_FAILED",
          );
        }
      }
      throw error;
    } finally {
      fs.rmSync(secrets.root, { recursive: true, force: true });
    }
  }

  const prepareEvidence = verifyAliceCloudflarePrepareEvidence(
    readJson(prepareEvidencePath),
    {
      sourceCommit,
      deploymentManifestSha256: release.deploymentManifestSha256,
    },
  );
  const containerMode = admission.evidence.schemaVersion ===
    "alice.program-admission.v2";
  const candidateExpected = {
    binding: {
      programDigest: admission.evidence.programDigest,
      releaseDigest: admission.evidence.releaseDigest,
      policyHash: admission.evidence.policyHash,
    },
    release: {
      releaseEpoch: admission.evidence.releaseEpoch,
      sourceCommit: admission.evidence.sourceCommit,
      deploymentControllerCommit:
        admission.evidence.deploymentControllerCommit,
      runtimeImage: admission.evidence.runtimeImage,
      runtimeBuildManifestSha256:
        admission.evidence.runtimeBuildManifestSha256,
      capabilityBomSha256: admission.evidence.capabilityBomSha256,
      elizaCommit: admission.evidence.elizaCommit,
      ...(containerMode
        ? { runtimeRevision: admission.evidence.runtimeRevision }
        : { modalRevision: admission.evidence.modalRevision }),
      deploymentManifestSha256:
        admission.evidence.deploymentManifestSha256,
    },
    rollbackBoundary: admission.evidence.rollbackBoundary,
  };
  verifyAliceDeploymentPauseEvidence(readJson(pauseEvidencePath), {
    candidateExpected,
    rollbackAnchorSha256: sha256File(rollbackAnchorPath),
    prepareControlVersionId: prepareEvidence.controlVersionId,
    prepareEvidenceSha256: sha256File(prepareEvidencePath),
  });
  const preparedWorkers = await captureAliceCloudflareWorkerRollbackState({
    apiToken,
  });
  const preparedContainerApplication =
    await fetchAliceContainerApplicationRollbackState({ apiToken });
  const preparedTraffic = await fetchAliceCloudflareTrafficState({ apiToken });
  verifyAliceCloudflarePreparedState({
    anchor,
    uploadedVersions: prepareEvidence.uploadedVersions,
    workers: preparedWorkers,
    containerApplication: preparedContainerApplication,
    traffic: preparedTraffic,
  });
  const continuityBeforePromotion = await readSignedContinuity({
    apiToken,
    expectedDurableObjectNamespaceIds,
    expectedDigest: release.manifest.cloudflare.continuityConfigSha256,
    expectedQueueDeliveryPaused: true,
  });
  const promotionCommands = buildAliceProtectedCloudflareCommands({
    wranglerBin,
    configDir,
    bundleRoot: artifactRoot,
    sourceCommit,
    releaseRunId,
    uploadedVersions: prepareEvidence.uploadedVersions,
    rollbackVersions,
  });
  const candidateContainerTarget =
    buildAliceCandidateContainerApplicationTarget({
      previous: anchor.previous.containerApplication,
      materializedWranglerConfig: release.configs.runtimeHost,
    });
  const promoteWorkers = (roles, errorCode) => {
    for (const role of roles) {
      const command = promotionCommands.promotions.find(
        (candidate) => candidate.role === role,
      );
      if (!command) releaseInvalid("ALICE_WORKER_PROMOTION_INVALID");
      run(wranglerBin, command.argv, {
        cwd: sourceRoot,
        env: commandEnv,
        errorCode,
      });
    }
  };
  try {
    verifyProtectedRefStillExact({ sourceRoot, sourceCommit });
    promoteWorkers(
      ["statePlane", "aiGateway", "connectorPlane"],
      "ALICE_WORKER_PROMOTION_FAILED",
    );
    await transitionAliceContainerApplication({
      apiToken,
      expectedCurrent: anchor.previous.containerApplication,
      target: candidateContainerTarget,
    });
    promoteWorkers(
      ["runtimeHost", "access"],
      "ALICE_WORKER_PROMOTION_FAILED",
    );
    await applyAliceCandidateTrafficState({
      apiToken,
      expected: aliceExpectedProductionTrafficState(),
    });
    await setAliceEvidenceQueueDeliveryPaused({
      apiToken,
      expectedDurableObjectNamespaceIds,
      expectedContinuityDigest:
        release.manifest.cloudflare.continuityConfigSha256,
      deliveryPaused: false,
    });
    const continuityAfterPromotion = await readSignedContinuity({
      apiToken,
      expectedDurableObjectNamespaceIds,
      expectedDigest: release.manifest.cloudflare.continuityConfigSha256,
      expectedQueueDeliveryPaused: false,
    });
    if (
      canonicalAliceJson(continuityBeforePromotion.candidateConfig) !==
        canonicalAliceJson(continuityAfterPromotion.candidateConfig)
    ) releaseInvalid("ALICE_CONTINUITY_CHANGED_DURING_PROMOTION");
    await verifyLive();
    const rollbackEvidence = await executeRollbacks({
      wranglerBin,
      sourceRoot,
      commands,
      commandEnv,
      apiToken,
      anchor,
      expectedDurableObjectNamespaceIds,
      expectedContinuityDigest:
        release.manifest.cloudflare.continuityConfigSha256,
    });
    writeReadonly(rollbackProofPath, rollbackEvidence);
    try {
      verifyProtectedRefStillExact({ sourceRoot, sourceCommit });
      await setAliceEvidenceQueueDeliveryPaused({
        apiToken,
        expectedDurableObjectNamespaceIds,
        expectedContinuityDigest:
          release.manifest.cloudflare.continuityConfigSha256,
        deliveryPaused: true,
      });
      promoteWorkers(
        ["control", "statePlane", "aiGateway", "connectorPlane"],
        "ALICE_WORKER_FORWARD_RESTORATION_FAILED",
      );
      await transitionAliceContainerApplication({
        apiToken,
        expectedCurrent: anchor.previous.containerApplication,
        target: candidateContainerTarget,
      });
      promoteWorkers(
        ["runtimeHost", "access"],
        "ALICE_WORKER_FORWARD_RESTORATION_FAILED",
      );
      await applyAliceCandidateTrafficState({
        apiToken,
        expected: aliceExpectedProductionTrafficState(),
      });
      await setAliceEvidenceQueueDeliveryPaused({
        apiToken,
        expectedDurableObjectNamespaceIds,
        expectedContinuityDigest:
          release.manifest.cloudflare.continuityConfigSha256,
        deliveryPaused: false,
      });
      await readSignedContinuity({
        apiToken,
        expectedDurableObjectNamespaceIds,
        expectedDigest: release.manifest.cloudflare.continuityConfigSha256,
        expectedQueueDeliveryPaused: false,
      });
      writeReadonly(readbackPath, await verifyLive());
    } catch (forwardError) {
      try {
        await executeRollbacks({
          wranglerBin,
          sourceRoot,
          commands,
          commandEnv,
          apiToken,
          anchor,
          expectedDurableObjectNamespaceIds,
          expectedContinuityDigest:
            release.manifest.cloudflare.continuityConfigSha256,
        });
      } catch (secondRollbackError) {
        throw new AggregateError(
          [forwardError, secondRollbackError],
          "ALICE_CLOUDFLARE_FORWARD_AND_ROLLBACK_FAILED",
        );
      }
      throw new AggregateError(
        [forwardError],
        "ALICE_CLOUDFLARE_FORWARD_FAILED_ROLLBACK_RESTORED",
      );
    }
  } catch (error) {
    try {
      const rollbackEvidence = await executeRollbacks({
        wranglerBin,
        sourceRoot,
        commands,
        commandEnv,
        apiToken,
        anchor,
        expectedDurableObjectNamespaceIds,
        expectedContinuityDigest:
          release.manifest.cloudflare.continuityConfigSha256,
      });
      if (!fs.existsSync(readbackPath)) {
        writeReadonly(readbackPath, rollbackEvidence);
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "ALICE_RELEASE_AND_ROLLBACK_FAILED",
      );
    }
    throw error;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
