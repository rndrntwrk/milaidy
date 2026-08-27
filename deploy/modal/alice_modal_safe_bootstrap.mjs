import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import {
  digestAliceModalProviderGraph,
  verifyAliceModalRollbackAnchorLayout,
  verifyAliceModalSafeBootstrapReadback,
  verifyAliceModalStoppedRecoveryLayout,
} from "./alice_modal_release.mjs";

const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const IMAGE = /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/;
const APP_ID_PATTERN = /^ap-[A-Za-z0-9]{20,32}$/;
const CONTAINER_ID_PATTERN = /^ta-[A-Za-z0-9]{20,32}$/;
const APP_ID = "ap-oFaCNy2jJDFalZienNB2Ht";
const SAFE_BOOTSTRAP_FAILURE_CODES = Object.freeze({
  "protected-ref": new Set([
    "ALICE_MODAL_PROTECTED_REF_INVALID",
  ]),
  "deploy-bootstrap": new Set([
    "ALICE_MODAL_SAFE_BOOTSTRAP_DEPLOY_FAILED",
  ]),
  "provider-readback": new Set([
    "ALICE_MODAL_LAYOUT_INVALID",
    "ALICE_MODAL_WORKSPACE_INVALID",
    "ALICE_MODAL_ENVIRONMENT_INVALID",
    "ALICE_MODAL_APP_INVALID",
    "ALICE_MODAL_HISTORY_INVALID",
    "ALICE_MODAL_IDLE_INVALID",
    "ALICE_MODAL_SAFE_BOOTSTRAP_INVALID",
    "ALICE_MODAL_ROLLBACK_ANCHOR_INVALID",
  ]),
  "runtime-http": new Set([
    "ALICE_MODAL_SAFE_BOOTSTRAP_PROXY_INVALID",
    "ALICE_MODAL_SAFE_BOOTSTRAP_RUNTIME_INVALID",
  ]),
});
const DEFAULT_SAFE_BOOTSTRAP_FAILURE_CODE = Object.freeze({
  "protected-ref": "ALICE_MODAL_PROTECTED_REF_INVALID",
  "deploy-bootstrap": "ALICE_MODAL_SAFE_BOOTSTRAP_DEPLOY_FAILED",
  "provider-readback": "ALICE_MODAL_SAFE_BOOTSTRAP_INVALID",
  "runtime-http": "ALICE_MODAL_SAFE_BOOTSTRAP_RUNTIME_INVALID",
});

const LEGACY_PROVIDER_VERSION = 48;
const LEGACY_HEAD = Object.freeze({
  providerVersion: 48,
  rollbackVersion: 0,
  clientVersion: "1.5.0",
  deployedBy: "rndrntwrk",
  commitHash: "be30eaaa36741347fdf468b6247de6529f25ff2b",
  dirty: false,
});
const LEGACY_FUNCTION_ID = "fu-fm2fP3cNQPgCIqe7QoBIHn";
const LEGACY_IMAGE_ID = "im-uqZXCsMeoubO36BvfdQSDT";
const LEGACY_SECRETS = Object.freeze([
  { id: "st-TU930BfNl1jK3wZ9ZcYtEn", name: "alice-capture-api-token" },
  { id: "st-j4YWJkXzvQKIc4OWlRQH62", name: "alice-cloudflare-ai" },
  { id: "st-em904Ts5jgkuESl7afKErN", name: "alice-runtime" },
  { id: "st-AbLeNv3yRqufY3ZuhAMq94", name: "alice-stream-control" },
  { id: "st-n7j9WvyEPfqOpaL31OgpX4", name: "alice-stream-destinations" },
  { id: "st-Z4x242VHLlCPrUtzRhTVvp", name: "alice-wallet" },
]);

function invalid(code = "ALICE_MODAL_SAFE_BOOTSTRAP_INVALID") {
  throw new Error(code);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value) &&
    canonicalAliceJson(Object.keys(value).sort()) ===
      canonicalAliceJson([...keys].sort());
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validRelease(value) {
  return Boolean(
    exactKeys(value, [
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
    DIGEST.test(value.programDigest ?? "") &&
    DIGEST.test(value.releaseDigest ?? "") &&
    DIGEST.test(value.policyHash ?? "") &&
    COMMIT.test(value.sourceCommit ?? "") &&
    COMMIT.test(value.deploymentControllerCommit ?? "") &&
    IMAGE.test(value.runtimeImage ?? "") &&
    DIGEST.test(value.runtimeBuildManifestSha256 ?? "") &&
    DIGEST.test(value.deploymentManifestSha256 ?? "") &&
    COMMIT.test(value.elizaCommit ?? "") &&
    Number.isSafeInteger(value.modalRevision) &&
    value.modalRevision >= 49
  );
}

function verifyExactLegacyLayout(previous) {
  if (
    !exactKeys(previous, [
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
    previous.appId !== APP_ID ||
    previous.environment !== "main" ||
    previous.providerVersion !== LEGACY_PROVIDER_VERSION ||
    canonicalAliceJson(previous.providerHistory) !==
      canonicalAliceJson([LEGACY_HEAD]) ||
    canonicalAliceJson(previous.functionIds) !==
      canonicalAliceJson({ alice_web: LEGACY_FUNCTION_ID }) ||
    canonicalAliceJson(previous.function) !== canonicalAliceJson({
      name: "alice_web",
      id: LEGACY_FUNCTION_ID,
      webUrl: "https://rndrntwrk--alice.modal.run",
      inputFormats: ["DATA_FORMAT_ASGI"],
    }) ||
    canonicalAliceJson(previous.mountedSecretObjects) !==
      canonicalAliceJson(LEGACY_SECRETS) ||
    canonicalAliceJson(previous.mountedVolumeIds) !== "[]" ||
    canonicalAliceJson(previous.imageObjectIds) !==
      canonicalAliceJson([LEGACY_IMAGE_ID]) ||
    canonicalAliceJson(previous.autoscalerEnforcement) !==
      canonicalAliceJson({ status: "provider-unverifiable" })
  ) {
    invalid("ALICE_MODAL_LEGACY_TRANSITION_INVALID");
  }
  return previous;
}

export function buildAliceModalLegacyTransitionJournal({
  previous,
  release,
  observedAt = new Date().toISOString(),
}) {
  verifyExactLegacyLayout(previous);
  if (!validRelease(release) || !canonicalIsoTimestamp(observedAt)) {
    invalid("ALICE_MODAL_LEGACY_TRANSITION_INVALID");
  }
  return {
    schemaVersion: "alice.modal-legacy-transition.v1",
    observedAt,
    failureBoundary: "stop-alice-runtime",
    release,
    appId: APP_ID,
    previousProviderVersion: LEGACY_PROVIDER_VERSION,
    previousGraphSha256: digestAliceModalProviderGraph(previous),
    previous,
  };
}

export function verifyAliceModalLegacyTransitionJournal(value) {
  if (
    !exactKeys(value, [
      "schemaVersion",
      "observedAt",
      "failureBoundary",
      "release",
      "appId",
      "previousProviderVersion",
      "previousGraphSha256",
      "previous",
    ]) ||
    value.schemaVersion !== "alice.modal-legacy-transition.v1" ||
    !canonicalIsoTimestamp(value.observedAt) ||
    value.failureBoundary !== "stop-alice-runtime" ||
    !validRelease(value.release) ||
    value.appId !== APP_ID ||
    value.previousProviderVersion !== LEGACY_PROVIDER_VERSION
  ) {
    invalid("ALICE_MODAL_LEGACY_TRANSITION_INVALID");
  }
  verifyExactLegacyLayout(value.previous);
  if (value.previousGraphSha256 !== digestAliceModalProviderGraph(value.previous)) {
    invalid("ALICE_MODAL_LEGACY_TRANSITION_INVALID");
  }
  return value;
}

function verifyStoppedSafeBootstrapLayout(previous) {
  let verified;
  try {
    verified = verifyAliceModalStoppedRecoveryLayout(previous);
  } catch {
    invalid("ALICE_MODAL_STOPPED_REENTRY_INVALID");
  }
  const head = verified.providerHistory[0];
  if (
    !APP_ID_PATTERN.test(verified.appId ?? "") ||
    verified.environment !== "main" ||
    verified.providerVersion < 1 ||
    head.providerVersion !== verified.providerVersion ||
    head.rollbackVersion !== 0 ||
    verified.mountedSecretObjects.length !== 0 ||
    verified.mountedVolumeIds.length !== 0 ||
    verified.autoscalerEnforcement.status !== "provider-unverifiable"
  ) {
    invalid("ALICE_MODAL_STOPPED_REENTRY_INVALID");
  }
  return verified;
}

export function buildAliceModalStoppedReentryJournal({
  previous,
  release,
  observedAt = new Date().toISOString(),
}) {
  const verified = verifyStoppedSafeBootstrapLayout(previous);
  if (!validRelease(release) || !canonicalIsoTimestamp(observedAt)) {
    invalid("ALICE_MODAL_STOPPED_REENTRY_INVALID");
  }
  return {
    schemaVersion: "alice.modal-stopped-reentry.v1",
    observedAt,
    failureBoundary: "restart-stopped-safe-bootstrap",
    release,
    appId: verified.appId,
    previousProviderVersion: verified.providerVersion,
    previousGraphSha256: digestAliceModalProviderGraph(verified),
    previous: verified,
  };
}

export function verifyAliceModalStoppedReentryJournal(value) {
  if (
    !exactKeys(value, [
      "schemaVersion",
      "observedAt",
      "failureBoundary",
      "release",
      "appId",
      "previousProviderVersion",
      "previousGraphSha256",
      "previous",
    ]) ||
    value.schemaVersion !== "alice.modal-stopped-reentry.v1" ||
    !canonicalIsoTimestamp(value.observedAt) ||
    value.failureBoundary !== "restart-stopped-safe-bootstrap" ||
    !validRelease(value.release) ||
    !APP_ID_PATTERN.test(value.appId ?? "") ||
    !Number.isSafeInteger(value.previousProviderVersion) ||
    value.previousProviderVersion < 1
  ) {
    invalid("ALICE_MODAL_STOPPED_REENTRY_INVALID");
  }
  const previous = verifyStoppedSafeBootstrapLayout(value.previous);
  if (
    value.appId !== previous.appId ||
    value.previousProviderVersion !== previous.providerVersion ||
    value.previousGraphSha256 !== digestAliceModalProviderGraph(previous)
  ) {
    invalid("ALICE_MODAL_STOPPED_REENTRY_INVALID");
  }
  return value;
}

export function verifyAliceModalTransitionJournal(value) {
  return value?.schemaVersion === "alice.modal-stopped-reentry.v1"
    ? verifyAliceModalStoppedReentryJournal(value)
    : verifyAliceModalLegacyTransitionJournal(value);
}

export async function captureAliceModalStopBoundary({
  release,
  captureCurrent,
  captureStopped,
  observedAt = new Date().toISOString(),
}) {
  if (
    !validRelease(release) ||
    typeof captureCurrent !== "function" ||
    typeof captureStopped !== "function" ||
    !canonicalIsoTimestamp(observedAt)
  ) {
    invalid("ALICE_MODAL_STOPPED_REENTRY_INVALID");
  }
  let current;
  try {
    current = await captureCurrent();
  } catch {
    return {
      action: "transition",
      journal: buildAliceModalStoppedReentryJournal({
        previous: await captureStopped(),
        release,
        observedAt,
      }),
    };
  }
  try {
    return {
      action: "transition",
      journal: buildAliceModalLegacyTransitionJournal({
        previous: current,
        release,
        observedAt,
      }),
    };
  } catch (error) {
    if (error?.message !== "ALICE_MODAL_LEGACY_TRANSITION_INVALID") throw error;
    return { action: "active-safe-reentry" };
  }
}

export function verifyAliceModalSafeRollbackAnchor(value, { release }) {
  if (
    !validRelease(release) ||
    !exactKeys(value, [
      "schemaVersion",
      "capturedAt",
      "sourceCommit",
      "deploymentManifestSha256",
      "appId",
      "previous",
      "safeBootstrapEvidence",
    ]) ||
    value.schemaVersion !== "alice.modal-rollback-anchor.v2" ||
    !canonicalIsoTimestamp(value.capturedAt) ||
    !COMMIT.test(value.sourceCommit ?? "") ||
    !DIGEST.test(value.deploymentManifestSha256 ?? "") ||
    !APP_ID_PATTERN.test(value.appId ?? "")
  ) {
    invalid("ALICE_MODAL_ROLLBACK_ANCHOR_INVALID");
  }
  const previous = verifyAliceModalRollbackAnchorLayout(value.previous);
  const evidence = value.safeBootstrapEvidence;
  const provider = evidence?.provider;
  const runtime = evidence?.runtime;
  if (
    value.appId !== previous.appId ||
    !exactKeys(evidence, [
      "schemaVersion",
      "observedAt",
      "safeBootstrap",
      "provider",
      "runtime",
    ]) ||
    evidence.schemaVersion !== "alice.modal-safe-bootstrap-evidence.v1" ||
    evidence.observedAt !== value.capturedAt ||
    evidence.safeBootstrap !== true ||
    !exactKeys(provider, [
      "schemaVersion",
      "safeBootstrap",
      "workspace",
      "workspaceId",
      "userId",
      "environment",
      "appId",
      "app",
      "providerVersion",
      "sourceCommit",
      "deploymentManifestSha256",
      "functionId",
      "webUrl",
      "mountedSecretObjects",
      "mountedVolumeIds",
      "imageObjectIds",
      "autoscaler",
    ]) ||
    provider.schemaVersion !== "alice.modal-safe-bootstrap-provider.v1" ||
    provider.safeBootstrap !== true ||
    provider.workspace !== "rndrntwrk" ||
    provider.workspaceId !== "ac-heK8sGJBc367raQUx6R59o" ||
    provider.userId !== "us-rJM1ZZiySURgAhBEOqvR16" ||
    provider.environment !== "main" ||
    provider.appId !== previous.appId ||
    provider.app !== "alice-runtime" ||
    provider.providerVersion !== previous.providerVersion ||
    provider.sourceCommit !== value.sourceCommit ||
    provider.deploymentManifestSha256 !== value.deploymentManifestSha256 ||
    provider.functionId !== previous.function.id ||
    provider.webUrl !== previous.function.webUrl ||
    canonicalAliceJson(provider.mountedSecretObjects) !==
      canonicalAliceJson(previous.mountedSecretObjects) ||
    canonicalAliceJson(provider.mountedVolumeIds) !== "[]" ||
    canonicalAliceJson(provider.imageObjectIds) !==
      canonicalAliceJson(previous.imageObjectIds) ||
    canonicalAliceJson(provider.autoscaler) !== canonicalAliceJson({
      minContainers: 0,
      maxContainers: 1,
      bufferContainers: 0,
      scaledownWindow: 300,
    }) ||
    canonicalAliceJson(runtime?.release) !== canonicalAliceJson(release) ||
    value.sourceCommit !== release.sourceCommit ||
    value.deploymentManifestSha256 !== release.deploymentManifestSha256
  ) {
    invalid("ALICE_MODAL_ROLLBACK_ANCHOR_INVALID");
  }
  verifyRuntimeEvidence(runtime, release);
  return value;
}

export function resolveAliceModalSafeRecovery({
  release,
  transition,
  anchor,
  mutationJournalPresent,
  observedAt = new Date().toISOString(),
}) {
  if (
    !validRelease(release) ||
    !canonicalIsoTimestamp(observedAt) ||
    typeof mutationJournalPresent !== "boolean" ||
    (transition !== null && !object(transition)) ||
    (anchor !== null && !object(anchor))
  ) {
    invalid("ALICE_MODAL_RECOVERY_STATE_INVALID");
  }
  if (transition !== null) {
    const verifiedTransition = verifyAliceModalTransitionJournal(transition);
    if (
      canonicalAliceJson(verifiedTransition.release) !==
        canonicalAliceJson(release)
    ) {
      invalid("ALICE_MODAL_LEGACY_TRANSITION_INVALID");
    }
  }
  if (anchor !== null) {
    verifyAliceModalSafeRollbackAnchor(anchor, { release });
  }
  if (mutationJournalPresent && anchor === null) {
    invalid("ALICE_MODAL_RECOVERY_STATE_INVALID");
  }
  const action = anchor !== null
    ? mutationJournalPresent ? "emergency-rollback" : "safe-anchor"
    : transition !== null ? "stop-if-unanchored" : "pre-modal-noop";
  return {
    schemaVersion: "alice.modal-recovery-decision.v1",
    observedAt,
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256: release.deploymentManifestSha256,
    action,
    transitionPresent: transition !== null,
    anchorPresent: anchor !== null,
    mutationJournalPresent,
  };
}

function selectAliceAppState(value, expectedAppId = null) {
  if (
    !exactKeys(value, ["apps", "containers"]) ||
    !Array.isArray(value.apps) ||
    !Array.isArray(value.containers)
  ) {
    return null;
  }
  const aliceApps = value.apps.filter(
    (app) => app?.description === "alice-runtime",
  );
  if (aliceApps.length !== 1) return null;
  const app = aliceApps[0];
  if (
    !APP_ID_PATTERN.test(app?.app_id ?? "") ||
    expectedAppId !== null && app.app_id !== expectedAppId ||
    !["deployed", "stopped"].includes(app?.state) ||
    !/^(?:0|[1-9][0-9]*)$/.test(app?.tasks ?? "")
  ) {
    return null;
  }
  const containers = [];
  for (const container of value.containers) {
    if (
      !exactKeys(container, [
        "container_id",
        "app_id",
        "app_name",
        "start_time",
      ]) ||
      !CONTAINER_ID_PATTERN.test(container.container_id ?? "") ||
      !APP_ID_PATTERN.test(container.app_id ?? "") ||
      typeof container.app_name !== "string" ||
      container.app_name.length === 0 ||
      /[\0\r\n]/.test(container.app_name) ||
      typeof container.start_time !== "string" ||
      container.start_time.length === 0 ||
      /[\0\r\n]/.test(container.start_time)
    ) {
      return null;
    }
    const boundApps = value.apps.filter(
      (candidate) => candidate?.app_id === container.app_id,
    );
    if (
      boundApps.length !== 1 ||
      boundApps[0]?.description !== container.app_name
    ) {
      return null;
    }
    if (container.app_id === app.app_id) containers.push(container);
  }
  return {
    appId: app.app_id,
    state: app.state,
    tasks: app.tasks,
    containers,
  };
}

function exactStoppedAliceAppState(value, expectedAppId = null) {
  const state = selectAliceAppState(value, expectedAppId);
  return state?.state === "stopped" &&
      state.tasks === "0" &&
      state.containers.length === 0
    ? state
    : null;
}

export async function stopAliceModalIfUnanchored({
  readState,
  stopApp,
  wait = (milliseconds) => new Promise((resolve) =>
    setTimeout(resolve, milliseconds)),
}) {
  if (
    typeof readState !== "function" ||
    typeof stopApp !== "function" ||
    typeof wait !== "function"
  ) {
    invalid("ALICE_MODAL_SAFE_STOP_INVALID");
  }

  let initial;
  try {
    initial = selectAliceAppState(await readState());
  } catch {
    invalid("ALICE_MODAL_SAFE_STOP_INVALID");
  }
  if (initial === null) invalid("ALICE_MODAL_SAFE_STOP_INVALID");
  if (
    initial.state === "stopped" &&
    initial.tasks === "0" &&
    initial.containers.length === 0
  ) {
    return {
      stopped: true,
      stopAttempted: false,
      stopCommandSucceeded: null,
    };
  }

  let stopCommandSucceeded = true;
  try {
    await stopApp(initial.appId);
  } catch {
    stopCommandSucceeded = false;
  }

  for (let attempt = 1; attempt <= 13; attempt += 1) {
    try {
      const state = exactStoppedAliceAppState(
        await readState(),
        initial.appId,
      );
      if (state !== null) {
        return {
          stopped: true,
          stopAttempted: true,
          stopCommandSucceeded,
        };
      }
    } catch {
      // Only the exact authoritative stopped readback admits recovery.
    }
    if (attempt < 13) await wait(5_000);
  }
  invalid(
    stopCommandSucceeded
      ? "ALICE_MODAL_SAFE_STOP_INVALID"
      : "ALICE_MODAL_SAFE_STOP_FAILED",
  );
}

export function verifyAliceModalSafeBootstrapFailure(value, { release }) {
  const allowedCodes = SAFE_BOOTSTRAP_FAILURE_CODES[value?.stage];
  if (
    !validRelease(release) ||
    !exactKeys(value, [
      "schemaVersion",
      "observedAt",
      "sourceCommit",
      "deploymentManifestSha256",
      "stage",
      "code",
      "safeStopVerified",
    ]) ||
    value.schemaVersion !== "alice.modal-safe-bootstrap-failure.v1" ||
    !canonicalIsoTimestamp(value.observedAt) ||
    value.sourceCommit !== release.sourceCommit ||
    value.deploymentManifestSha256 !== release.deploymentManifestSha256 ||
    !(allowedCodes instanceof Set) ||
    !allowedCodes.has(value.code) ||
    typeof value.safeStopVerified !== "boolean"
  ) {
    invalid("ALICE_MODAL_SAFE_BOOTSTRAP_FAILURE_INVALID");
  }
  return value;
}

export function buildAliceModalSafeBootstrapFailure({
  release,
  observedAt,
  stage,
  error,
  safeStopVerified,
}) {
  const message = error instanceof Error ? error.message : "";
  const code = SAFE_BOOTSTRAP_FAILURE_CODES[stage]?.has(message)
    ? message
    : DEFAULT_SAFE_BOOTSTRAP_FAILURE_CODE[stage];
  return verifyAliceModalSafeBootstrapFailure({
    schemaVersion: "alice.modal-safe-bootstrap-failure.v1",
    observedAt,
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256: release.deploymentManifestSha256,
    stage,
    code,
    safeStopVerified,
  }, { release });
}

function verifyRuntimeEvidence(value, release) {
  if (
    !exactKeys(value, [
      "schemaVersion",
      "unauthenticatedStatus",
      "authenticatedStatus",
      "safeBootstrap",
      "paused",
      "ready",
      "release",
    ]) ||
    value.schemaVersion !== "alice.modal-safe-bootstrap-runtime.v1" ||
    value.unauthenticatedStatus !== 401 ||
    value.authenticatedStatus !== 503 ||
    value.safeBootstrap !== true ||
    value.paused !== true ||
    value.ready !== false ||
    canonicalAliceJson(value.release) !== canonicalAliceJson(release)
  ) {
    invalid("ALICE_MODAL_SAFE_BOOTSTRAP_RUNTIME_INVALID");
  }
  return value;
}

async function boundedResponse(response, code) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 64 * 1024) invalid(code);
  try {
    return {
      text: new TextDecoder("utf8", { fatal: true }).decode(bytes).trim(),
      json: () => JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)),
    };
  } catch {
    invalid(code);
  }
}

export async function verifyAliceModalSafeBootstrapHttp({
  fetchImpl = globalThis.fetch,
  release,
  modalProxyKey,
  modalProxySecret,
}) {
  if (
    typeof fetchImpl !== "function" ||
    !validRelease(release) ||
    !/^wk-[A-Za-z0-9_-]{16,256}$/.test(modalProxyKey ?? "") ||
    !/^ws-[A-Za-z0-9_-]{16,256}$/.test(modalProxySecret ?? "")
  ) {
    invalid();
  }
  const url = "https://rndrntwrk--alice.modal.run/api/health";
  const unauthenticated = await fetchImpl(url, {
    redirect: "manual",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const rejection = await boundedResponse(
    unauthenticated,
    "ALICE_MODAL_SAFE_BOOTSTRAP_PROXY_INVALID",
  );
  if (
    unauthenticated.status !== 401 ||
    !unauthenticated.headers.get("content-type")?.toLowerCase()
      .startsWith("text/plain") ||
    rejection.text !== "modal-http: missing credentials for proxy authorization"
  ) {
    invalid("ALICE_MODAL_SAFE_BOOTSTRAP_PROXY_INVALID");
  }
  const authenticated = await fetchImpl(url, {
    redirect: "manual",
    headers: {
      accept: "application/json",
      "modal-key": modalProxyKey,
      "modal-secret": modalProxySecret,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const payloadBytes = await boundedResponse(
    authenticated,
    "ALICE_MODAL_SAFE_BOOTSTRAP_RUNTIME_INVALID",
  );
  let payload;
  try {
    payload = payloadBytes.json();
  } catch {
    invalid("ALICE_MODAL_SAFE_BOOTSTRAP_RUNTIME_INVALID");
  }
  const runtime = {
    schemaVersion: "alice.modal-safe-bootstrap-runtime.v1",
    unauthenticatedStatus: unauthenticated.status,
    authenticatedStatus: authenticated.status,
    safeBootstrap: payload?.safeBootstrap,
    paused: payload?.paused,
    ready: payload?.ready,
    release: payload?.release,
  };
  if (
    authenticated.status !== 503 ||
    !authenticated.headers.get("content-type")?.toLowerCase()
      .startsWith("application/json") ||
    !exactKeys(payload, [
      "status",
      "agentState",
      "safeBootstrap",
      "paused",
      "ready",
      "release",
    ]) ||
    payload.status !== "paused" ||
    payload.agentState !== "safe-bootstrap"
  ) {
    invalid("ALICE_MODAL_SAFE_BOOTSTRAP_RUNTIME_INVALID");
  }
  return verifyRuntimeEvidence(runtime, release);
}

export function buildAliceModalSafeBootstrapResult({
  release,
  state,
  runtime,
  expectedProviderVersion = LEGACY_PROVIDER_VERSION + 1,
  recreatedFromAppId = null,
  observedAt = new Date().toISOString(),
}) {
  if (!validRelease(release) || !canonicalIsoTimestamp(observedAt)) invalid();
  const provider = verifyAliceModalSafeBootstrapReadback(state, {
    release,
    expectedProviderVersion,
    recreatedFromAppId,
  });
  const verifiedRuntime = verifyRuntimeEvidence(runtime, release);
  const previous = verifyAliceModalRollbackAnchorLayout(state.layout);
  const safeBootstrapEvidence = {
    schemaVersion: "alice.modal-safe-bootstrap-evidence.v1",
    observedAt,
    safeBootstrap: true,
    provider,
    runtime: verifiedRuntime,
  };
  const anchor = verifyAliceModalSafeRollbackAnchor({
    schemaVersion: "alice.modal-rollback-anchor.v2",
    capturedAt: observedAt,
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256: release.deploymentManifestSha256,
    appId: previous.appId,
    previous,
    safeBootstrapEvidence,
  }, { release });
  return {
    schemaVersion: "alice.modal-safe-bootstrap-result.v1",
    anchor,
    safeBootstrapEvidence,
  };
}

export async function orchestrateAliceModalSafeBootstrap({
  journal,
  release,
  operations,
  observedAt = new Date().toISOString(),
}) {
  const verifiedJournal = verifyAliceModalTransitionJournal(journal);
  const stoppedReentry =
    verifiedJournal.schemaVersion === "alice.modal-stopped-reentry.v1";
  const capturePrevious = stoppedReentry
    ? operations?.captureStopped
    : operations?.captureLegacy;
  if (
    !validRelease(release) ||
    canonicalAliceJson(release) !== canonicalAliceJson(verifiedJournal.release) ||
    !canonicalIsoTimestamp(observedAt) ||
    !object(operations) ||
    ![
      "verifyProtectedRef",
      "deploySafeBootstrap",
      "readSafeBootstrapState",
      "verifySafeBootstrapRuntime",
      "stopIfUnanchored",
    ].every((name) => typeof operations[name] === "function") ||
    typeof capturePrevious !== "function"
  ) {
    invalid();
  }

  const freshPrevious = await capturePrevious();
  if (stoppedReentry) {
    verifyStoppedSafeBootstrapLayout(freshPrevious);
  } else {
    verifyExactLegacyLayout(freshPrevious);
  }
  if (
    canonicalAliceJson(freshPrevious) !==
      canonicalAliceJson(verifiedJournal.previous)
  ) {
    invalid(
      stoppedReentry
        ? "ALICE_MODAL_STOPPED_REENTRY_CHANGED"
        : "ALICE_MODAL_LEGACY_TRANSITION_CHANGED",
    );
  }

  let failureStage = "protected-ref";
  try {
    await operations.verifyProtectedRef();
    failureStage = "deploy-bootstrap";
    await operations.deploySafeBootstrap();
    failureStage = "provider-readback";
    const state = await operations.readSafeBootstrapState();
    failureStage = "runtime-http";
    const runtime = await operations.verifySafeBootstrapRuntime();
    failureStage = "provider-readback";
    return buildAliceModalSafeBootstrapResult({
      release,
      state,
      runtime,
      expectedProviderVersion: stoppedReentry
        ? 1
        : verifiedJournal.previousProviderVersion + 1,
      recreatedFromAppId: stoppedReentry ? verifiedJournal.appId : null,
      observedAt,
    });
  } catch (error) {
    let stopError;
    try {
      await operations.stopIfUnanchored();
    } catch (caught) {
      stopError = caught;
    }
    const failure = new AggregateError(
      stopError ? [error, stopError] : [error],
      stopError
        ? "ALICE_MODAL_SAFE_BOOTSTRAP_AND_STOP_FAILED"
        : "ALICE_MODAL_SAFE_BOOTSTRAP_FAILED_APP_STOPPED",
    );
    failure.modalSafeStopVerified = !stopError;
    failure.modalSafeBootstrapFailure = buildAliceModalSafeBootstrapFailure({
      release,
      observedAt,
      stage: failureStage,
      error,
      safeStopVerified: !stopError,
    });
    throw failure;
  }
}
