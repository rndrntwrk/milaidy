import crypto from "node:crypto";
import path from "node:path";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const IMAGE = /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/;
const MODAL_REVISION = /^(?:49|[5-9][0-9]|[1-9][0-9]{2,})$/;
const RELEASE_SECRET =
  /^alice-production-core-[a-f0-9]{64}-[1-9][0-9]*-[1-9][0-9]*$/;
const APP_ID = /^ap-[A-Za-z0-9]{20,32}$/;
const FUNCTION_ID = /^fu-[A-Za-z0-9]{20,32}$/;
const WORKSPACE_ID = "ac-heK8sGJBc367raQUx6R59o";
const USER_ID = "us-rJM1ZZiySURgAhBEOqvR16";
const APP_NAME = "alice-runtime";
const ENVIRONMENT = "main";
const WEB_URL = "https://rndrntwrk--alice.modal.run";
const MODAL_VERSION = "1.5.4";
const PROVIDER_VERSION = /^[1-9][0-9]*$/;
const SECRET_ID = /^st-[A-Za-z0-9]{20,32}$/;
const IMAGE_ID = /^im-[A-Za-z0-9]{20,32}$/;

const RELEASE_METADATA_KEYS = [
  "ALICE_PROGRAM_DIGEST",
  "ALICE_RELEASE_DIGEST",
  "ALICE_POLICY_HASH",
  "ALICE_SOURCE_COMMIT",
  "ALICE_DEPLOYMENT_CONTROLLER_COMMIT",
  "ALICE_RUNTIME_IMAGE",
  "ALICE_RUNTIME_BUILD_MANIFEST_SHA256",
  "ALICE_DEPLOYMENT_MANIFEST_SHA256",
  "ALICE_ELIZA_COMMIT",
  "ALICE_MODAL_REVISION",
];
const SCOPED_SECRET_KEYS = [
  "MILADY_API_TOKEN",
  "OPENAI_API_KEY",
  "MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET",
  "ELIZA_VAULT_PASSPHRASE",
];
const COMMAND_RELEASE_KEYS = [
  "ALICE_MODAL_RELEASE_SECRET_NAME",
  "ALICE_MODAL_REVISION",
  "ALICE_RUNTIME_IMAGE",
];
const SAFE_ENV_KEYS = [
  "PATH",
  "LANG",
  "LC_ALL",
  "TZ",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
];
const DENIED_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "PYTHONPATH",
  "PYTHONHOME",
  "PYTHONSTARTUP",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
];

function invalid(code = "ALICE_MODAL_RELEASE_INVALID") {
  throw new Error(code);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function secure(value) {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 4096 &&
    !/[\0\r\n]/.test(value)
  );
}

function modalTokenSecret(value) {
  return (
    typeof value === "string" &&
    /^as-[A-Za-z0-9_-]{22}$/.test(value)
  );
}

export function deriveAliceRuntimeReleaseCredential({
  rootSecret,
  releaseDigest,
}) {
  if (!secure(rootSecret) || !DIGEST.test(releaseDigest ?? "")) {
    invalid("ALICE_RUNTIME_RELEASE_CREDENTIAL_INVALID");
  }
  const token = `art1_${crypto
    .createHmac("sha256", rootSecret)
    .update("alice.runtime-release-token.v1\0", "utf8")
    .update(releaseDigest, "utf8")
    .digest("base64url")}`;
  const saltedSha256 = `sha256:${crypto
    .createHash("sha256")
    .update(`${releaseDigest}:${token}`, "utf8")
    .digest("hex")}`;
  const evidenceQueueHmacKey = `aeq1_${crypto
    .createHmac("sha256", rootSecret)
    .update("alice.evidence-queue-hmac.v1\0deployment-root", "utf8")
    .digest("base64url")}`;
  return { token, saltedSha256, evidenceQueueHmacKey };
}

function exactKeys(value, keys) {
  return (
    object(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function validRelease(release) {
  return Boolean(
    exactKeys(release, [
      "programDigest",
      "releaseDigest",
      "policyHash",
      "sourceCommit",
      "deploymentControllerCommit",
      "runtimeImage",
      "runtimeBuildManifestSha256",
      "deploymentManifestSha256",
      "elizaCommit",
      "modalRevision",
    ]) &&
    DIGEST.test(release.programDigest) &&
    DIGEST.test(release.releaseDigest) &&
    DIGEST.test(release.policyHash) &&
    COMMIT.test(release.sourceCommit) &&
    COMMIT.test(release.deploymentControllerCommit) &&
    IMAGE.test(release.runtimeImage) &&
    DIGEST.test(release.runtimeBuildManifestSha256) &&
    DIGEST.test(release.deploymentManifestSha256) &&
    COMMIT.test(release.elizaCommit) &&
    Number.isSafeInteger(release.modalRevision) &&
    release.modalRevision >= 49
  );
}

export function buildAliceModalReleaseSecret({ release, releaseRunId, scoped }) {
  if (
    !validRelease(release) ||
    !/^[1-9][0-9]*-[1-9][0-9]*$/.test(releaseRunId ?? "") ||
    !exactKeys(scoped, SCOPED_SECRET_KEYS) ||
    !SCOPED_SECRET_KEYS.every((key) => secure(scoped[key])) ||
    new Set(SCOPED_SECRET_KEYS.map((key) => scoped[key])).size !==
      SCOPED_SECRET_KEYS.length
  ) {
    invalid("ALICE_MODAL_SECRET_INVALID");
  }
  const name =
    `alice-production-core-${release.releaseDigest.slice("sha256:".length)}` +
    `-${releaseRunId}`;
  const values = {
    ALICE_PROGRAM_DIGEST: release.programDigest,
    ALICE_RELEASE_DIGEST: release.releaseDigest,
    ALICE_POLICY_HASH: release.policyHash,
    ALICE_SOURCE_COMMIT: release.sourceCommit,
    ALICE_DEPLOYMENT_CONTROLLER_COMMIT: release.deploymentControllerCommit,
    ALICE_RUNTIME_IMAGE: release.runtimeImage,
    ALICE_RUNTIME_BUILD_MANIFEST_SHA256:
      release.runtimeBuildManifestSha256,
    ALICE_DEPLOYMENT_MANIFEST_SHA256:
      release.deploymentManifestSha256,
    ALICE_ELIZA_COMMIT: release.elizaCommit,
    ALICE_MODAL_REVISION: String(release.modalRevision),
    ...scoped,
  };
  if (!RELEASE_SECRET.test(name) || !exactKeys(values, [
    ...RELEASE_METADATA_KEYS,
    ...SCOPED_SECRET_KEYS,
  ])) {
    invalid("ALICE_MODAL_SECRET_INVALID");
  }
  return { name, values };
}

export function aliceModalCommandEnv(ambient = process.env) {
  if (
    !object(ambient) ||
    typeof ambient.MODAL_TOKEN_ID !== "string" ||
    !/^ak-[A-Za-z0-9_-]{8,128}$/.test(ambient.MODAL_TOKEN_ID) ||
    !modalTokenSecret(ambient.MODAL_TOKEN_SECRET) ||
    DENIED_ENV_KEYS.some((key) => ambient[key] !== undefined) ||
    ambient.MODAL_ENVIRONMENT !== undefined &&
      ambient.MODAL_ENVIRONMENT !== ENVIRONMENT ||
    !RELEASE_SECRET.test(ambient.ALICE_MODAL_RELEASE_SECRET_NAME ?? "") ||
    !MODAL_REVISION.test(ambient.ALICE_MODAL_REVISION ?? "") ||
    !IMAGE.test(ambient.ALICE_RUNTIME_IMAGE ?? "")
  ) {
    invalid("ALICE_MODAL_COMMAND_ENV_INVALID");
  }
  const child = {
    MODAL_TOKEN_ID: ambient.MODAL_TOKEN_ID,
    MODAL_TOKEN_SECRET: ambient.MODAL_TOKEN_SECRET,
    MODAL_ENVIRONMENT: ENVIRONMENT,
  };
  for (const key of SAFE_ENV_KEYS) {
    if (typeof ambient[key] === "string" && ambient[key].length > 0) {
      child[key] = ambient[key];
    }
  }
  for (const key of COMMAND_RELEASE_KEYS) child[key] = ambient[key];
  return child;
}

export function buildAliceModalReleaseCommands({
  modalBin,
  pythonBin,
  sourceRoot,
  secretName,
  secretJsonPath,
  sourceCommit,
  deploymentManifestSha256,
  modalRevision,
}) {
  if (
    !path.isAbsolute(modalBin ?? "") ||
    !path.isAbsolute(pythonBin ?? "") ||
    !path.isAbsolute(sourceRoot ?? "") ||
    !path.isAbsolute(secretJsonPath ?? "") ||
    !RELEASE_SECRET.test(secretName ?? "") ||
    !COMMIT.test(sourceCommit ?? "") ||
    !DIGEST.test(deploymentManifestSha256 ?? "") ||
    !Number.isSafeInteger(modalRevision) ||
    modalRevision < 49
  ) {
    invalid();
  }
  const tag = `alice-${sourceCommit.slice(0, 12)}-${deploymentManifestSha256.slice(7, 19)}`;
  return {
    version: ["--version"],
    tokenInfo: ["token", "info"],
    environments: ["environment", "list", "--json"],
    apps: ["app", "list", "--env", ENVIRONMENT, "--json"],
    history: ["app", "history", APP_NAME, "--env", ENVIRONMENT, "--json"],
    secrets: ["secret", "list", "--env", ENVIRONMENT, "--json"],
    containers: ["container", "list", "--env", ENVIRONMENT, "--json"],
    createSecret: [
      "secret",
      "create",
      secretName,
      "--env",
      ENVIRONMENT,
      "--from-json",
      secretJsonPath,
    ],
    deployBootstrap: [
      "deploy",
      "--env",
      ENVIRONMENT,
      "--name",
      APP_NAME,
      "--tag",
      `alice-safe-${sourceCommit.slice(0, 12)}-${deploymentManifestSha256.slice(7, 19)}`,
      "--strategy",
      "recreate",
      path.join(sourceRoot, "deploy/modal/alice_safe_bootstrap.py"),
    ],
    deploy: [
      "deploy",
      "--env",
      ENVIRONMENT,
      "--name",
      APP_NAME,
      "--tag",
      tag,
      "--strategy",
      "recreate",
      path.join(sourceRoot, "deploy/modal/alice_registry_runtime.py"),
    ],
    providerReadback: [
      path.join(sourceRoot, "deploy/modal/alice_modal_provider_readback.py"),
      secretName,
    ],
    providerCaptureCurrent: [
      path.join(sourceRoot, "deploy/modal/alice_modal_provider_readback.py"),
      "--capture-current",
    ],
    providerCaptureStoppedReentry: [
      path.join(sourceRoot, "deploy/modal/alice_modal_provider_readback.py"),
      "--capture-stopped-reentry",
    ],
    providerEnforceCurrent: [
      path.join(sourceRoot, "deploy/modal/alice_modal_provider_readback.py"),
      "--enforce-current",
    ],
    providerSafeBootstrap: [
      path.join(sourceRoot, "deploy/modal/alice_modal_provider_readback.py"),
      "--safe-bootstrap",
    ],
    providerSecretInventory: [
      path.join(sourceRoot, "deploy/modal/alice_modal_provider_readback.py"),
      "--secret-inventory",
    ],
  };
}

export function buildAliceModalStopCommand(appId) {
  if (!APP_ID.test(appId ?? "")) {
    invalid("ALICE_MODAL_COMMAND_INVALID");
  }
  return ["app", "stop", appId, "--env", ENVIRONMENT, "--yes"];
}

export function buildAliceModalRollbackCommands({
  previousProviderVersion,
  candidateProviderVersion,
}) {
  if (
    !Number.isSafeInteger(previousProviderVersion) ||
    previousProviderVersion < 1 ||
    !Number.isSafeInteger(candidateProviderVersion) ||
    candidateProviderVersion <= previousProviderVersion
  ) {
    invalid("ALICE_MODAL_PROVIDER_VERSION_INVALID");
  }
  const rollback = (providerVersion) => [
    "app",
    "rollback",
    APP_NAME,
    `v${providerVersion}`,
    "--env",
    ENVIRONMENT,
    "--strategy",
    "recreate",
  ];
  return {
    rollback: rollback(previousProviderVersion),
    forward: rollback(candidateProviderVersion),
  };
}

function parseJson(value, code) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed) && !object(parsed)) invalid(code);
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === code) throw error;
    invalid(code);
  }
}

function parseTokenInfo(value) {
  if (typeof value !== "string" || value.length > 8192) {
    invalid("ALICE_MODAL_WORKSPACE_INVALID");
  }
  const workspace = value.match(/^Workspace:\s+rndrntwrk \((ac-[A-Za-z0-9]+)\)$/m);
  const user = value.match(/^User:\s+rndrntwrk \((us-[A-Za-z0-9]+)\)$/m);
  if (workspace?.[1] !== WORKSPACE_ID || user?.[1] !== USER_ID) {
    invalid("ALICE_MODAL_WORKSPACE_INVALID");
  }
  return { workspaceId: workspace[1], userId: user[1] };
}

function providerHistoryHead(layout) {
  const head = layout?.providerHistory?.[0];
  if (
    !Array.isArray(layout?.providerHistory) ||
    layout.providerHistory.length < 1 ||
    !exactKeys(head, [
      "clientVersion",
      "commitHash",
      "deployedBy",
      "dirty",
      "providerVersion",
      "rollbackVersion",
    ]) ||
    !Number.isSafeInteger(head.providerVersion) ||
    head.providerVersion < 1 ||
    !Number.isSafeInteger(head.rollbackVersion) ||
    head.rollbackVersion < 0 ||
    head.rollbackVersion >= head.providerVersion ||
    !/^1\.5\.[0-9]+$/.test(head.clientVersion ?? "") ||
    head.deployedBy !== "rndrntwrk" ||
    !COMMIT.test(head.commitHash ?? "") ||
    typeof head.dirty !== "boolean"
  ) {
    invalid("ALICE_MODAL_HISTORY_INVALID");
  }
  return head;
}

function verifyProviderLayout(layout) {
  if (
    !exactKeys(layout, [
      "appId",
      "autoscalerEnforcement",
      "environment",
      "function",
      "functionIds",
      "imageObjectIds",
      "mountedSecretObjects",
      "mountedVolumeIds",
      "providerHistory",
      "providerVersion",
    ]) ||
    !APP_ID.test(layout.appId ?? "") ||
    layout.environment !== ENVIRONMENT ||
    !Number.isSafeInteger(layout.providerVersion) ||
    layout.providerVersion < 1 ||
    !exactKeys(layout.functionIds, ["alice_web"]) ||
    !FUNCTION_ID.test(layout.functionIds.alice_web ?? "") ||
    !exactKeys(layout.function, ["id", "inputFormats", "name", "webUrl"]) ||
    layout.function.name !== "alice_web" ||
    layout.function.id !== layout.functionIds.alice_web ||
    layout.function.webUrl !== WEB_URL ||
    JSON.stringify(layout.function.inputFormats) !==
      JSON.stringify(["DATA_FORMAT_ASGI"]) ||
    !Array.isArray(layout.mountedSecretObjects) ||
    layout.mountedSecretObjects.some((entry) =>
      !exactKeys(entry, ["id", "name"]) ||
      !SECRET_ID.test(entry.id ?? "") ||
      typeof entry.name !== "string" ||
      !/^[a-z0-9][a-z0-9-]{2,127}$/.test(entry.name)) ||
    new Set(layout.mountedSecretObjects.map((entry) => entry.id)).size !==
      layout.mountedSecretObjects.length ||
    new Set(layout.mountedSecretObjects.map((entry) => entry.name)).size !==
      layout.mountedSecretObjects.length ||
    !Array.isArray(layout.mountedVolumeIds) ||
    layout.mountedVolumeIds.some((id) => !/^vo-[A-Za-z0-9]{20,32}$/.test(id)) ||
    !Array.isArray(layout.imageObjectIds) ||
    layout.imageObjectIds.length !== 1 ||
    !IMAGE_ID.test(layout.imageObjectIds[0] ?? "") ||
    !(
      exactKeys(layout.autoscalerEnforcement, ["status"]) &&
      layout.autoscalerEnforcement.status === "provider-unverifiable" ||
      exactKeys(layout.autoscalerEnforcement, [
        "bufferContainers",
        "functionId",
        "maxContainers",
        "minContainers",
        "scaledownWindow",
        "status",
      ]) &&
      layout.autoscalerEnforcement.status === "provider-enforced" &&
      layout.autoscalerEnforcement.functionId === layout.function.id &&
      layout.autoscalerEnforcement.minContainers === 0 &&
      layout.autoscalerEnforcement.maxContainers === 1 &&
      layout.autoscalerEnforcement.bufferContainers === 0 &&
      layout.autoscalerEnforcement.scaledownWindow === 300
    )
  ) {
    invalid("ALICE_MODAL_PROVIDER_READBACK_INVALID");
  }
  const head = providerHistoryHead(layout);
  if (
    head.providerVersion !== layout.providerVersion ||
    !PROVIDER_VERSION.test(String(layout.providerVersion))
  ) {
    invalid("ALICE_MODAL_PROVIDER_READBACK_INVALID");
  }
  return layout;
}

function providerGraph(layout) {
  verifyProviderLayout(layout);
  return {
    appId: layout.appId,
    environment: layout.environment,
    functionIds: layout.functionIds,
    function: layout.function,
    mountedSecretObjects: layout.mountedSecretObjects,
    mountedVolumeIds: layout.mountedVolumeIds,
    imageObjectIds: layout.imageObjectIds,
    autoscalerEnforcement: layout.autoscalerEnforcement,
  };
}

export function verifyAliceModalRollbackAnchorLayout(layout) {
  verifyProviderLayout(layout);
  const head = providerHistoryHead(layout);
  if (
    head.dirty !== false ||
    head.clientVersion !== MODAL_VERSION ||
    layout.autoscalerEnforcement.status !== "provider-enforced" ||
    layout.mountedVolumeIds.length !== 0
  ) {
    invalid("ALICE_MODAL_ROLLBACK_ANCHOR_INVALID");
  }
  return layout;
}

export function verifyAliceModalStoppedRecoveryLayout(layout) {
  verifyProviderLayout(layout);
  const head = providerHistoryHead(layout);
  if (
    head.dirty !== false ||
    head.clientVersion !== MODAL_VERSION ||
    head.rollbackVersion !== 0 ||
    layout.autoscalerEnforcement.status !== "provider-unverifiable" ||
    layout.mountedSecretObjects.length !== 0 ||
    layout.mountedVolumeIds.length !== 0
  ) {
    invalid("ALICE_MODAL_STOPPED_REENTRY_INVALID");
  }
  return layout;
}

export function verifyAliceModalSafeBootstrapReadback(value, {
  release,
  expectedProviderVersion,
  recreatedFromAppId = null,
}) {
  if (
    !validRelease(release) ||
    !Number.isSafeInteger(expectedProviderVersion) ||
    expectedProviderVersion < 1 ||
    recreatedFromAppId !== null &&
      (!APP_ID.test(recreatedFromAppId) || expectedProviderVersion !== 1)
  ) {
    invalid("ALICE_MODAL_SAFE_BOOTSTRAP_INVALID");
  }
  const token = parseTokenInfo(value?.tokenInfo);
  const environments = parseJson(
    value?.environments,
    "ALICE_MODAL_ENVIRONMENT_INVALID",
  );
  const apps = parseJson(value?.apps, "ALICE_MODAL_APP_INVALID");
  const history = parseJson(value?.history, "ALICE_MODAL_HISTORY_INVALID");
  const containers = parseJson(value?.containers, "ALICE_MODAL_IDLE_INVALID");
  const layout = verifyAliceModalRollbackAnchorLayout(
    parseJson(value?.layout, "ALICE_MODAL_LAYOUT_INVALID"),
  );
  const head = providerHistoryHead(layout);
  if (
    environments.length !== 1 ||
    environments[0]?.name !== ENVIRONMENT ||
    environments[0]?.web_suffix !== "" ||
    ![true, "True"].includes(environments[0]?.active) ||
    apps.length !== 1 ||
    apps[0]?.description !== APP_NAME ||
    apps[0]?.state !== "deployed" ||
    apps[0]?.tasks !== "0" ||
    apps[0]?.app_id !== layout.appId ||
    containers.length !== 0 ||
    history.length < 1 ||
    history[0]?.version !== `v${expectedProviderVersion}` ||
    history[0]?.client !== MODAL_VERSION ||
    history[0]?.deployed_by !== "rndrntwrk" ||
    history[0]?.commit !== release.sourceCommit.slice(0, 7) ||
    layout.providerVersion !== expectedProviderVersion ||
    recreatedFromAppId !== null && layout.appId === recreatedFromAppId ||
    head.rollbackVersion !== 0 ||
    head.commitHash !== release.sourceCommit ||
    JSON.stringify(layout.mountedSecretObjects.map((item) => item.name)) !==
      JSON.stringify([]) ||
    layout.mountedVolumeIds.length !== 0
  ) {
    invalid("ALICE_MODAL_SAFE_BOOTSTRAP_INVALID");
  }
  return {
    schemaVersion: "alice.modal-safe-bootstrap-provider.v1",
    safeBootstrap: true,
    workspace: "rndrntwrk",
    workspaceId: token.workspaceId,
    userId: token.userId,
    environment: ENVIRONMENT,
    appId: layout.appId,
    app: APP_NAME,
    providerVersion: layout.providerVersion,
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256: release.deploymentManifestSha256,
    functionId: layout.function.id,
    webUrl: layout.function.webUrl,
    mountedSecretObjects: layout.mountedSecretObjects,
    mountedVolumeIds: [],
    imageObjectIds: layout.imageObjectIds,
    autoscaler: {
      minContainers: 0,
      maxContainers: 1,
      bufferContainers: 0,
      scaledownWindow: 300,
    },
  };
}

export function digestAliceModalProviderGraph(layout) {
  return digestAliceModalEvidence(providerGraph(layout));
}

export function verifyAliceModalProviderReadback(value, {
  release,
  secretName,
  expectedProviderVersion,
  expectedRollbackVersion = 0,
}) {
  if (
    !validRelease(release) ||
    !secretName?.startsWith(
      `alice-production-core-${release.releaseDigest.slice("sha256:".length)}-`,
    ) ||
    !RELEASE_SECRET.test(secretName) ||
    !Number.isSafeInteger(expectedProviderVersion) ||
    expectedProviderVersion < 1 ||
    !Number.isSafeInteger(expectedRollbackVersion) ||
    expectedRollbackVersion < 0 ||
    expectedRollbackVersion >= expectedProviderVersion
  ) {
    invalid();
  }
  const token = parseTokenInfo(value?.tokenInfo);
  const environments = parseJson(value?.environments, "ALICE_MODAL_ENVIRONMENT_INVALID");
  const apps = parseJson(value?.apps, "ALICE_MODAL_APP_INVALID");
  const history = parseJson(value?.history, "ALICE_MODAL_HISTORY_INVALID");
  const containers = parseJson(value?.containers, "ALICE_MODAL_IDLE_INVALID");
  const layout = verifyProviderLayout(
    parseJson(value?.layout, "ALICE_MODAL_LAYOUT_INVALID"),
  );
  const expectedSecretObjects = ["alice-ghcr-registry", secretName].sort();
  if (
    environments.length !== 1 ||
    environments[0]?.name !== ENVIRONMENT ||
    environments[0]?.web_suffix !== "" ||
    ![true, "True"].includes(environments[0]?.active) ||
    apps.length !== 1 ||
    apps[0]?.description !== APP_NAME ||
    apps[0]?.state !== "deployed" ||
    apps[0]?.tasks !== "0" ||
    !APP_ID.test(apps[0]?.app_id ?? "") ||
    containers.length !== 0 ||
    history.length < 1 ||
    history[0]?.version !== `v${expectedProviderVersion}` ||
    history[0]?.client !== MODAL_VERSION ||
    history[0]?.deployed_by !== "rndrntwrk" ||
    history[0]?.commit !== release.sourceCommit.slice(0, 7) ||
    layout.appId !== apps[0].app_id ||
    layout.providerVersion !== expectedProviderVersion ||
    providerHistoryHead(layout).rollbackVersion !== expectedRollbackVersion ||
    providerHistoryHead(layout).clientVersion !== MODAL_VERSION ||
    providerHistoryHead(layout).commitHash !== release.sourceCommit ||
    providerHistoryHead(layout).dirty !== false ||
    layout.autoscalerEnforcement.status !== "provider-enforced" ||
    JSON.stringify(layout.mountedSecretObjects.map((entry) => entry.name).sort()) !==
      JSON.stringify(expectedSecretObjects) ||
    layout.mountedVolumeIds.length !== 0
  ) {
    invalid("ALICE_MODAL_PROVIDER_READBACK_INVALID");
  }
  return {
    schemaVersion: "alice.modal-provider-readback.v2",
    workspace: "rndrntwrk",
    workspaceId: token.workspaceId,
    userId: token.userId,
    environment: ENVIRONMENT,
    appId: apps[0].app_id,
    app: APP_NAME,
    functionId: layout.function.id,
    function: layout.function.name,
    webUrl: WEB_URL,
    aliceModalRevision: release.modalRevision,
    providerVersion: expectedProviderVersion,
    rollbackProviderVersion: expectedRollbackVersion,
    clientVersion: MODAL_VERSION,
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256: release.deploymentManifestSha256,
    releaseSecretName: secretName,
    mountedSecretObjects: layout.mountedSecretObjects,
    unadmittedSecretMounts: [],
    mountedVolumeIds: [],
    imageObjectIds: layout.imageObjectIds,
    autoscaler: {
      minContainers: 0,
      maxContainers: 1,
      bufferContainers: 0,
      scaledownWindow: 300,
    },
  };
}

export function verifyAliceModalProviderTerminalCoherence({
  before,
  after,
  release,
  secretName,
  expectedProviderVersion,
  expectedRollbackVersion = 0,
}) {
  const expected = {
    release,
    secretName,
    expectedProviderVersion,
    expectedRollbackVersion,
  };
  const beforeReadback = verifyAliceModalProviderReadback(before, expected);
  const afterReadback = verifyAliceModalProviderReadback(after, expected);
  if (JSON.stringify(beforeReadback) !== JSON.stringify(afterReadback)) {
    invalid("ALICE_MODAL_PROVIDER_COHERENCE_INVALID");
  }
  return afterReadback;
}

export function verifyAliceModalProviderRestoration({ expected, restored }) {
  verifyProviderLayout(expected);
  verifyProviderLayout(restored);
  const expectedHead = providerHistoryHead(expected);
  const restoredHead = providerHistoryHead(restored);
  if (
    restored.appId !== expected.appId ||
    expected.autoscalerEnforcement.status !== "provider-enforced" ||
    restored.autoscalerEnforcement.status !== "provider-enforced" ||
    restored.providerVersion <= expected.providerVersion ||
    restoredHead.rollbackVersion !== expected.providerVersion ||
    restoredHead.clientVersion !== MODAL_VERSION ||
    restoredHead.dirty !== false ||
    restoredHead.commitHash !== expectedHead.commitHash ||
    JSON.stringify(providerGraph(restored)) !==
      JSON.stringify(providerGraph(expected))
  ) {
    invalid("ALICE_MODAL_ROLLBACK_PROOF_INVALID");
  }
  return {
    schemaVersion: "alice.modal-restoration-proof.v1",
    appId: expected.appId,
    expectedProviderVersion: expected.providerVersion,
    restorationProviderVersion: restored.providerVersion,
    graphSha256: digestAliceModalEvidence(providerGraph(expected)),
  };
}

export function verifyAliceModalProviderTransition({
  previous,
  candidate,
  rolledBack,
  forwarded,
}) {
  for (const layout of [previous, candidate, rolledBack, forwarded]) {
    verifyProviderLayout(layout);
  }
  const previousHead = providerHistoryHead(previous);
  const candidateHead = providerHistoryHead(candidate);
  const rollbackHead = providerHistoryHead(rolledBack);
  const forwardHead = providerHistoryHead(forwarded);
  verifyAliceModalProviderRestoration({
    expected: previous,
    restored: rolledBack,
  });
  if (
    candidate.appId !== previous.appId ||
    rolledBack.appId !== previous.appId ||
    forwarded.appId !== previous.appId ||
    previousHead.rollbackVersion !== 0 ||
    candidateHead.rollbackVersion !== 0 ||
    candidateHead.clientVersion !== MODAL_VERSION ||
    candidateHead.dirty !== false ||
    candidate.autoscalerEnforcement.status !== "provider-enforced" ||
    rolledBack.autoscalerEnforcement.status !== "provider-enforced" ||
    forwarded.autoscalerEnforcement.status !== "provider-enforced" ||
    candidate.providerVersion <= previous.providerVersion ||
    rolledBack.providerVersion <= candidate.providerVersion ||
    rollbackHead.rollbackVersion !== previous.providerVersion ||
    rollbackHead.clientVersion !== MODAL_VERSION ||
    rollbackHead.dirty !== false ||
    rollbackHead.commitHash !== previousHead.commitHash ||
    forwarded.providerVersion <= rolledBack.providerVersion ||
    forwardHead.rollbackVersion !== candidate.providerVersion ||
    forwardHead.clientVersion !== MODAL_VERSION ||
    forwardHead.dirty !== false ||
    forwardHead.commitHash !== candidateHead.commitHash ||
    JSON.stringify(providerGraph(rolledBack)) !==
      JSON.stringify(providerGraph(previous)) ||
    JSON.stringify(providerGraph(forwarded)) !==
      JSON.stringify(providerGraph(candidate))
  ) {
    invalid("ALICE_MODAL_ROLLBACK_PROOF_INVALID");
  }
  return {
    schemaVersion: "alice.modal-rollback-forward-proof.v1",
    previousProviderVersion: previous.providerVersion,
    candidateProviderVersion: candidate.providerVersion,
    rollbackProviderVersion: rolledBack.providerVersion,
    forwardProviderVersion: forwarded.providerVersion,
    previousGraphSha256: digestAliceModalEvidence(providerGraph(previous)),
    candidateGraphSha256: digestAliceModalEvidence(providerGraph(candidate)),
  };
}

function exactRuntimeRelease(observed, release) {
  return Boolean(
    object(observed) &&
    observed.programDigest === release.programDigest &&
    observed.releaseDigest === release.releaseDigest &&
    observed.policyHash === release.policyHash &&
    observed.sourceCommit === release.sourceCommit &&
    observed.deploymentControllerCommit === release.deploymentControllerCommit &&
    observed.runtimeImage === release.runtimeImage &&
    observed.runtimeBuildManifestSha256 === release.runtimeBuildManifestSha256 &&
    observed.deploymentManifestSha256 === release.deploymentManifestSha256 &&
    observed.elizaCommit === release.elizaCommit &&
    observed.modalRevision === release.modalRevision
  );
}

async function responseJson(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 64 * 1024) invalid("ALICE_MODAL_RUNTIME_READBACK_INVALID");
  try {
    return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
  } catch {
    invalid("ALICE_MODAL_RUNTIME_READBACK_INVALID");
  }
}

async function responseText(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 4096) invalid("ALICE_MODAL_PROXY_AUTH_INVALID");
  try {
    return new TextDecoder("utf8", { fatal: true }).decode(bytes).trim();
  } catch {
    invalid("ALICE_MODAL_PROXY_AUTH_INVALID");
  }
}

export async function verifyAliceModalRuntimeHttp({
  fetchImpl = globalThis.fetch,
  release,
  modalProxyKey,
  modalProxySecret,
  apiToken,
}) {
  if (
    typeof fetchImpl !== "function" ||
    !validRelease(release) ||
    !/^wk-[A-Za-z0-9_-]{16,256}$/.test(modalProxyKey ?? "") ||
    !/^ws-[A-Za-z0-9_-]{16,256}$/.test(modalProxySecret ?? "") ||
    !secure(apiToken)
  ) {
    invalid();
  }
  const unauthenticated = await fetchImpl(`${WEB_URL}/api/health`, {
    redirect: "manual",
    headers: { accept: "application/json" },
  });
  const unauthenticatedRejection = await responseText(unauthenticated);
  if (
    unauthenticated.status !== 401 ||
    !unauthenticated.headers.get("content-type")?.toLowerCase()
      .startsWith("text/plain") ||
    unauthenticatedRejection !==
      "modal-http: missing credentials for proxy authorization"
  ) {
    invalid("ALICE_MODAL_PROXY_AUTH_INVALID");
  }
  const modalHeaders = {
    accept: "application/json",
    "modal-key": modalProxyKey,
    "modal-secret": modalProxySecret,
  };
  const liveness = await fetchImpl(`${WEB_URL}/health/live`, {
    redirect: "manual",
    headers: modalHeaders,
  });
  if (!liveness.ok) invalid("ALICE_MODAL_LIVENESS_INVALID");
  const authenticatedHeaders = {
    ...modalHeaders,
    authorization: `Bearer ${apiToken}`,
  };
  const readiness = await fetchImpl(`${WEB_URL}/health/ready`, {
    redirect: "manual",
    headers: authenticatedHeaders,
  });
  const health = await responseJson(readiness);
  if (
    !readiness.ok ||
    health.ok !== true ||
    health.ready !== true ||
    health.agentState !== "running"
  ) {
    invalid("ALICE_MODAL_READINESS_INVALID");
  }
  const proofResponse = await fetchImpl(
    `${WEB_URL}/api/alice-production/proof`,
    { redirect: "manual", headers: authenticatedHeaders },
  );
  const proof = await responseJson(proofResponse);
  if (
    !proofResponse.ok ||
    proof.schemaVersion !== "alice.runtime-boundary-proof.v1" ||
    proof.authorityMode !== "proposer-only" ||
    proof.actionExecution !== "disabled" ||
    proof.actionPlanning !== false ||
    proof.backgroundAuthorityWorkers !== "absent" ||
    !["actionNames", "evaluatorNames", "serviceTypes", "taskWorkerNames"]
      .every((key) => Array.isArray(proof[key]) && proof[key].length === 0) ||
    !exactRuntimeRelease(proof.release, release)
  ) {
    invalid("ALICE_MODAL_RUNTIME_READBACK_INVALID");
  }
  return {
    schemaVersion: "alice.modal-runtime-http-readback.v1",
    origin: WEB_URL,
    unauthenticatedDetailedHealthStatus: 401,
    unauthenticatedRejection,
    modalProxyAuthVerified: true,
    livenessStatus: liveness.status,
    readinessStatus: readiness.status,
    proofStatus: proofResponse.status,
    release: proof.release,
    authorityMode: "proposer-only",
    actionExecution: "disabled",
  };
}

export function digestAliceModalEvidence(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
