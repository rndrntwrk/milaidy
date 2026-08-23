import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import {
  digestAliceModalProviderGraph,
  verifyAliceModalRollbackAnchorLayout,
  verifyAliceModalSafeBootstrapReadback,
} from "./alice_modal_release.mjs";

const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const IMAGE = /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/;
const APP_ID = "ap-oFaCNy2jJDFalZienNB2Ht";

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
    value.appId !== APP_ID
  ) {
    invalid("ALICE_MODAL_ROLLBACK_ANCHOR_INVALID");
  }
  const previous = verifyAliceModalRollbackAnchorLayout(value.previous);
  const evidence = value.safeBootstrapEvidence;
  const provider = evidence?.provider;
  const runtime = evidence?.runtime;
  if (
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
  observedAt = new Date().toISOString(),
}) {
  if (!validRelease(release) || !canonicalIsoTimestamp(observedAt)) invalid();
  const provider = verifyAliceModalSafeBootstrapReadback(state, {
    release,
    expectedProviderVersion: LEGACY_PROVIDER_VERSION + 1,
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
  const verifiedJournal = verifyAliceModalLegacyTransitionJournal(journal);
  if (
    !validRelease(release) ||
    canonicalAliceJson(release) !== canonicalAliceJson(verifiedJournal.release) ||
    !canonicalIsoTimestamp(observedAt) ||
    !object(operations) ||
    ![
      "captureLegacy",
      "verifyProtectedRef",
      "deploySafeBootstrap",
      "readSafeBootstrapState",
      "verifySafeBootstrapRuntime",
      "stopApp",
      "verifyAppStopped",
    ].every((name) => typeof operations[name] === "function")
  ) {
    invalid();
  }

  const freshLegacy = await operations.captureLegacy();
  verifyExactLegacyLayout(freshLegacy);
  if (canonicalAliceJson(freshLegacy) !== canonicalAliceJson(verifiedJournal.previous)) {
    invalid("ALICE_MODAL_LEGACY_TRANSITION_CHANGED");
  }

  try {
    await operations.verifyProtectedRef();
    await operations.deploySafeBootstrap();
    const state = await operations.readSafeBootstrapState();
    return buildAliceModalSafeBootstrapResult({
      release,
      state,
      runtime: await operations.verifySafeBootstrapRuntime(),
      observedAt,
    });
  } catch (error) {
    let stopError;
    try {
      await operations.stopApp();
      await operations.verifyAppStopped();
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
    throw failure;
  }
}
