import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const RUN_ID = /^[1-9][0-9]*$/;
const RELEASE_BRANCH = "release/alice-production-core-2026-08-22";
const ACCOUNT_ID = "036df6c823669b8fa2f66cf4c16eeb29";
const ZONE_ID = "7b24984479ee4cddb6c5d8a9b7a0f2c6";
const FRESH_WINDOW_MS = 5 * 60_000;
const FUTURE_SKEW_MS = 30_000;
const WORKER_ROLES = Object.freeze([
  "access",
  "runtimeHost",
  "control",
  "aiGateway",
  "statePlane",
  "connectorPlane",
]);
const FULL_PRODUCT_SURFACES = Object.freeze({
  root: "full-milady",
  companion: "full-companion",
  broadcast: "alice-cam",
  companionStage: "durable",
});

function invalid() {
  throw new Error("ALICE_TERMINAL_PUBLICATION_INVALID");
}

function object(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalAliceJson(value)).digest("hex")}`;
}

function isoMilliseconds(value) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const canonicalMilliseconds = new Date(milliseconds).toISOString();
  const canonicalSeconds = canonicalMilliseconds.endsWith(".000Z")
    ? canonicalMilliseconds.replace(".000Z", "Z")
    : null;
  return value === canonicalMilliseconds || value === canonicalSeconds
    ? milliseconds
    : null;
}

function freshObservation(value, { afterMs, nowMs }) {
  const observedAtMs = isoMilliseconds(value);
  if (
    observedAtMs === null || !Number.isSafeInteger(afterMs) ||
    !Number.isSafeInteger(nowMs) || observedAtMs < afterMs ||
    observedAtMs > nowMs + FUTURE_SKEW_MS ||
    nowMs - observedAtMs > FRESH_WINDOW_MS
  ) invalid();
  return observedAtMs;
}

function cloudflareTerminalIdentity(value) {
  if (
    value?.schemaVersion !== "alice.cloudflare-live-readback.v2" ||
    value?.accountId !== ACCOUNT_ID || value?.zoneId !== ZONE_ID ||
    value?.terminalSnapshotStable !== true ||
    !object(value?.providerFingerprints) || !object(value?.provider) ||
    !Array.isArray(value?.workflowVersions) ||
    !object(value?.aliceTrafficBindings) || !object(value?.workers) ||
    !WORKER_ROLES.every((role) =>
      object(value.workers[role]))
  ) invalid();
  return {
    schemaVersion: value.schemaVersion,
    accountId: value.accountId,
    zoneId: value.zoneId,
    providerFingerprints: value.providerFingerprints,
    provider: value.provider,
    terminalSnapshotStable: true,
    workflowVersions: value.workflowVersions,
    aliceTrafficBindings: value.aliceTrafficBindings,
    workers: value.workers,
  };
}

function verifyCurrentModalProvider({ current, expected }) {
  const provider = current?.provider;
  const history = provider?.providerHistory;
  const head = history?.[0];
  if (
    current?.schemaVersion !==
      "alice.modal-current-provider-readback.v1" ||
    expected?.schemaVersion !== "alice.modal-provider-readback.v2" ||
    !object(provider) || !Array.isArray(history) || history.length < 1 ||
    provider.appId !== expected.appId ||
    provider.environment !== expected.environment ||
    provider.providerVersion !== expected.providerVersion ||
    head?.providerVersion !== expected.providerVersion ||
    head?.rollbackVersion !== expected.rollbackProviderVersion ||
    head?.clientVersion !== expected.clientVersion ||
    head?.commitHash !== expected.sourceCommit || head?.dirty !== false ||
    !object(provider.functionIds) ||
    canonicalAliceJson(provider.functionIds) !==
      canonicalAliceJson({ alice_web: expected.functionId }) ||
    provider.function?.id !== expected.functionId ||
    provider.function?.name !== expected.function ||
    provider.function?.webUrl !== expected.webUrl ||
    canonicalAliceJson(provider.mountedSecretObjects) !==
      canonicalAliceJson(expected.mountedSecretObjects) ||
    canonicalAliceJson(provider.mountedVolumeIds) !==
      canonicalAliceJson(expected.mountedVolumeIds) ||
    canonicalAliceJson(provider.imageObjectIds) !==
      canonicalAliceJson(expected.imageObjectIds) ||
    canonicalAliceJson(provider.autoscalerEnforcement) !==
      canonicalAliceJson({
        status: "provider-enforced",
        functionId: expected.functionId,
        minContainers: expected.autoscaler?.minContainers,
        maxContainers: expected.autoscaler?.maxContainers,
        bufferContainers: expected.autoscaler?.bufferContainers,
        scaledownWindow: expected.autoscaler?.scaledownWindow,
      })
  ) invalid();
  return provider;
}

export function verifyAliceTerminalPublication({
  acceptance,
  cloudflareLiveReadback,
  cloudflareRollbackProof,
  modalPromotionEvidence,
  currentCloudflareLiveReadback,
  currentModalProviderReadback,
  workflowRun,
  expectedSourceSha,
  expectedRunId,
  expectedRunAttempt,
  nowMs = Date.now(),
}) {
  if (
    !object(acceptance) || !object(cloudflareLiveReadback) ||
    !object(cloudflareRollbackProof) || !object(modalPromotionEvidence) ||
    !object(currentCloudflareLiveReadback) ||
    !object(currentModalProviderReadback) || !object(workflowRun) ||
    !COMMIT.test(expectedSourceSha ?? "") ||
    !RUN_ID.test(String(expectedRunId ?? "")) ||
    !Number.isSafeInteger(expectedRunAttempt) || expectedRunAttempt < 1 ||
    !Number.isSafeInteger(nowMs)
  ) invalid();
  const runId = String(expectedRunId);
  const observedAt = Date.parse(acceptance.observedAt);
  const objectKeys = acceptance.evidence?.persistedObjectKeys;
  const surfaceDigests = acceptance.productSurfaceDigests;
  if (
    acceptance.schemaVersion !== "alice.production-acceptance.v3" ||
    acceptance.terminal !== true ||
    acceptance.publicOrEconomicActionExecuted !== false ||
    acceptance.sourceCommit !== expectedSourceSha ||
    acceptance.deploymentRun?.id !== runId ||
    acceptance.deploymentRun?.attempt !== expectedRunAttempt ||
    acceptance.recoveryOperatorRun?.id !== runId ||
    acceptance.recoveryOperatorRun?.attempt !== expectedRunAttempt ||
    acceptance.recoveryOperatorRun?.job !== "accept" ||
    acceptance.publicationContract?.expectedWorkflowConclusion !== "success" ||
    acceptance.publicationContract?.artifactConsumerMustVerifyWorkflowConclusion !== true ||
    acceptance.publicationContract?.publicationIsFinalSuccessOnlyStep !== true ||
    acceptance.evidence?.persisted !== true ||
    !Array.isArray(objectKeys) || objectKeys.length < 10 ||
    new Set(objectKeys).size !== objectKeys.length ||
    !Number.isFinite(observedAt) ||
    !Array.isArray(acceptance.finalAuthority?.pausedScopes) ||
    acceptance.finalAuthority.pausedScopes.length !== 0 ||
    acceptance.authenticatedRoot !== "full-milady-companion-ui" ||
    acceptance.runtimeProfile !== "full-gated" ||
    canonicalAliceJson(acceptance.productSurfaces) !==
      canonicalAliceJson(FULL_PRODUCT_SURFACES) ||
    !object(surfaceDigests) ||
    canonicalAliceJson(Object.keys(surfaceDigests).sort()) !==
      canonicalAliceJson([
        "broadcastHtmlSha256",
        "companionHtmlSha256",
      ]) ||
    !DIGEST.test(surfaceDigests.broadcastHtmlSha256 ?? "") ||
    !DIGEST.test(surfaceDigests.companionHtmlSha256 ?? "") ||
    !DIGEST.test(acceptance.deploymentManifestSha256 ?? "") ||
    !DIGEST.test(acceptance.binding?.programDigest ?? "") ||
    !DIGEST.test(acceptance.binding?.releaseDigest ?? "") ||
    !DIGEST.test(acceptance.binding?.policyHash ?? "")
  ) invalid();
  if (
    String(workflowRun.id) !== runId ||
    workflowRun.run_attempt !== expectedRunAttempt ||
    workflowRun.head_sha !== expectedSourceSha ||
    workflowRun.head_branch !== RELEASE_BRANCH ||
    workflowRun.event !== "workflow_dispatch" ||
    workflowRun.path !== ".github/workflows/deploy-alice-cloudflare.yml" ||
    workflowRun.status !== "completed" || workflowRun.conclusion !== "success"
  ) invalid();
  const workflowCompletedAtMs = isoMilliseconds(workflowRun.updated_at);
  if (workflowCompletedAtMs === null) invalid();
  if (
    cloudflareLiveReadback.schemaVersion !== "alice.cloudflare-live-readback.v2" ||
    cloudflareLiveReadback.terminalSnapshotStable !== true ||
    cloudflareRollbackProof.schemaVersion !== "alice.cloudflare-rollback-evidence.v2" ||
    modalPromotionEvidence.schemaVersion !== "alice.modal-promotion-evidence.v1" ||
    acceptance.provenance?.cloudflareLiveReadbackSha256 !==
      digest(cloudflareLiveReadback) ||
    acceptance.provenance?.cloudflareRollbackSha256 !==
      digest(cloudflareRollbackProof) ||
    acceptance.provenance?.modalPromotionSha256 !== digest(modalPromotionEvidence)
  ) invalid();
  freshObservation(currentCloudflareLiveReadback.observedAt, {
    afterMs: workflowCompletedAtMs,
    nowMs,
  });
  freshObservation(currentModalProviderReadback.observedAt, {
    afterMs: workflowCompletedAtMs,
    nowMs,
  });
  const archivedCloudflareIdentity =
    cloudflareTerminalIdentity(cloudflareLiveReadback);
  const currentCloudflareIdentity =
    cloudflareTerminalIdentity(currentCloudflareLiveReadback);
  if (
    canonicalAliceJson(archivedCloudflareIdentity) !==
      canonicalAliceJson(currentCloudflareIdentity)
  ) invalid();
  const currentModalProvider = verifyCurrentModalProvider({
    current: currentModalProviderReadback,
    expected: modalPromotionEvidence.providerReadback,
  });
  return {
    schemaVersion: "alice.terminal-publication-verification.v2",
    sourceCommit: expectedSourceSha,
    workflowRunId: runId,
    workflowRunAttempt: expectedRunAttempt,
    workflowConclusion: "success",
    acceptanceSha256: digest(acceptance),
    cloudflareLiveReadbackSha256: digest(cloudflareLiveReadback),
    currentCloudflareLiveReadbackSha256:
      digest(currentCloudflareLiveReadback),
    modalPromotionSha256: digest(modalPromotionEvidence),
    currentModalProviderReadbackSha256: digest(currentModalProviderReadback),
    currentModalProviderVersion: currentModalProvider.providerVersion,
    verifiedAt: new Date(nowMs).toISOString(),
    terminal: true,
  };
}

function readJson(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) invalid();
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 ||
      stat.size > 4 * 1024 * 1024) invalid();
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    invalid();
  }
}

function main() {
  const verification = verifyAliceTerminalPublication({
    acceptance: readJson(process.env.ALICE_PRODUCTION_ACCEPTANCE_PATH),
    cloudflareLiveReadback: readJson(process.env.ALICE_CLOUDFLARE_READBACK_PATH),
    cloudflareRollbackProof: readJson(
      process.env.ALICE_CLOUDFLARE_ROLLBACK_PROOF_PATH,
    ),
    modalPromotionEvidence: readJson(
      process.env.ALICE_MODAL_PROMOTION_EVIDENCE_PATH,
    ),
    currentCloudflareLiveReadback: readJson(
      process.env.ALICE_CURRENT_CLOUDFLARE_READBACK_PATH,
    ),
    currentModalProviderReadback: readJson(
      process.env.ALICE_CURRENT_MODAL_PROVIDER_READBACK_PATH,
    ),
    workflowRun: readJson(process.env.ALICE_WORKFLOW_RUN_READBACK_PATH),
    expectedSourceSha: process.env.ALICE_SOURCE_COMMIT,
    expectedRunId: process.env.ALICE_DEPLOYMENT_RUN_ID,
    expectedRunAttempt: Number(process.env.ALICE_DEPLOYMENT_RUN_ATTEMPT),
  });
  process.stdout.write(`${canonicalAliceJson(verification)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
