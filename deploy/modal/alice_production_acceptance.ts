import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import { signRecoveryReceipt } from "../../workers/alice-production-control/src/recovery";
import {
  admitAliceReleaseOwner,
  pauseAliceReleaseMachine,
  resumeAliceReleaseOwner,
  validateAliceOwnerAuthorization,
} from "./alice_release_controller.mjs";
import {
  resolveAliceCandidateWorkflowVersion,
  runAliceWorkflowBindingCanary,
} from "./alice_workflow_binding_canary.mjs";
import { verifyAliceCloudflareContainerImageEvidence } from
  "./alice_cloudflare_container_image.mjs";

const OWNER_ORIGIN = "https://alice.rndrntwrk.com";
const ACCOUNT_ID = "036df6c823669b8fa2f66cf4c16eeb29";
const ZONE_ID = "7b24984479ee4cddb6c5d8a9b7a0f2c6";
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const RUN_ID = /^[1-9][0-9]*$/;
const VERSION_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const EVIDENCE_CURSOR = /^[A-Za-z0-9._~=-]{1,1024}$/;
const REQUIRED_EVIDENCE_KINDS = Object.freeze({
  "control.pause": 1,
  "control.resume": 2,
  "intent.authorization": 1,
  "model.reservation": 1,
  "plan.authorization": 1,
  "plan.created": 1,
  "session.conversation": 1,
  "session.task": 2,
});
const FULL_CORE_COMPOSITION = Object.freeze([
  "bridge:eliza",
  "capabilities:basic",
  "security:core-hooks",
  "memory:sql",
  "skills:agent-skills",
  "hooks:eliza",
  "connectors:eliza",
]);
const FULL_REQUIRED_CONFIGURED_PLUGINS = Object.freeze([
  "eliza",
  "@elizaos/plugin-sql",
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-openai",
]);
const FULL_REQUIRED_RUNTIME_PLUGINS = Object.freeze([
  "@elizaos/plugin-agent-skills",
  "basic-capabilities",
  "core-security-hooks",
  "eliza",
  "openai",
  "sql",
]);

function invalid(code = "ALICE_PRODUCTION_ACCEPTANCE_INVALID"): never {
  throw new Error(code);
}

function object(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function secure(value: unknown, minimum = 16): value is string {
  return typeof value === "string" && value.length >= minimum &&
    value.length <= 16_384 && !/[\0\r\n]/.test(value);
}

function exact(left: unknown, right: unknown): boolean {
  return canonicalAliceJson(left) === canonicalAliceJson(right);
}

function digestBytes(bytes: Uint8Array | string): string {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function releaseExpected(admission: Record<string, any>) {
  const containerMode = admission.schemaVersion === "alice.program-admission.v2";
  const binding = {
    programDigest: admission.programDigest,
    releaseDigest: admission.releaseDigest,
    policyHash: admission.policyHash,
  };
  const release: Record<string, any> = {
    releaseEpoch: admission.releaseEpoch,
    sourceCommit: admission.sourceCommit,
    deploymentControllerCommit: admission.deploymentControllerCommit,
    runtimeImage: admission.runtimeImage,
    runtimeBuildManifestSha256: admission.runtimeBuildManifestSha256,
    capabilityBomSha256: admission.capabilityBomSha256,
    elizaCommit: admission.elizaCommit,
    ...(containerMode
      ? { runtimeRevision: admission.runtimeRevision }
      : { modalRevision: admission.modalRevision }),
    deploymentManifestSha256: admission.deploymentManifestSha256,
  };
  if (
    (!containerMode && admission.schemaVersion !== "alice.program-admission.v1") ||
    ![binding.programDigest, binding.releaseDigest, binding.policyHash,
      release.runtimeBuildManifestSha256,
      release.capabilityBomSha256,
      release.deploymentManifestSha256].every((value) => DIGEST.test(value)) ||
    ![release.sourceCommit, release.deploymentControllerCommit,
      release.elizaCommit].every((value) => COMMIT.test(value)) ||
    !Number.isSafeInteger(release.releaseEpoch) || release.releaseEpoch < 1 ||
    !Number.isSafeInteger(
      containerMode ? release.runtimeRevision : release.modalRevision,
    ) ||
    (containerMode ? release.runtimeRevision : release.modalRevision) < 49 ||
    release.runtimeImage !== admission.runtimeImage ||
    admission.rollbackBoundary !==
      `${containerMode ? "container" : "modal"}:alice-runtime:v${
        containerMode ? release.runtimeRevision : release.modalRevision
      }`
  ) invalid();
  return { binding, release, rollbackBoundary: admission.rollbackBoundary };
}

function ownerHeaders(ownerAuthorization: string, method = "GET") {
  return {
    accept: "application/json",
    "cache-control": "no-store",
    cookie: `CF_Authorization=${ownerAuthorization}`,
    origin: OWNER_ORIGIN,
    "sec-fetch-site": "same-origin",
    ...(method === "GET" ? {} : { "content-type": "application/json" }),
  };
}

async function boundedBody(response: Response, maxBytes = 512 * 1024) {
  if (!(response instanceof Response)) invalid();
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) invalid();
  return bytes;
}

async function boundedJson(response: Response, maxBytes = 512 * 1024) {
  try {
    const bytes = await boundedBody(response, maxBytes);
    const value = JSON.parse(new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes));
    if (!object(value)) invalid();
    return value;
  } catch (error) {
    if (error instanceof Error && error.message ===
      "ALICE_PRODUCTION_ACCEPTANCE_INVALID") throw error;
    invalid();
  }
}

async function ownerJson(
  fetchImpl: typeof fetch,
  ownerAuthorization: string,
  pathname: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetchImpl(`${OWNER_ORIGIN}${pathname}`, {
    method,
    headers: ownerHeaders(ownerAuthorization, method),
    redirect: "manual",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, value: await boundedJson(response) };
}

function normalizedPausedScopes(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((scope) =>
    typeof scope !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/.test(scope))) {
    invalid();
  }
  const normalized = [...value].sort();
  if (new Set(normalized).size !== normalized.length) invalid();
  return normalized;
}

function assertCandidateState(
  value: Record<string, any>,
  expected: any,
  expectedPausedScopes: string[],
): Record<string, any> {
  const authority = value.authority;
  const observedPausedScopes = normalizedPausedScopes(authority?.pausedScopes);
  const intendedPausedScopes = normalizedPausedScopes(expectedPausedScopes);
  if (
    value.ok !== true || !object(authority) ||
    !exact(authority.binding, expected.binding) ||
    authority.deploymentManifestSha256 !==
      expected.release.deploymentManifestSha256 ||
    authority.activeReleaseEpoch !== expected.release.releaseEpoch ||
    authority.rollbackBoundary !== expected.rollbackBoundary ||
    !exact(observedPausedScopes, intendedPausedScopes)
  ) invalid();
  return { ...authority, pausedScopes: observedPausedScopes };
}

type EvidenceObject = {
  key: string;
  kind: string;
  size: number;
  uploaded: string;
};

async function listEvidenceSnapshot({
  fetchImpl,
  ownerAuthorization,
  releaseDigest,
  dates,
}: {
  fetchImpl: typeof fetch;
  ownerAuthorization: string;
  releaseDigest: string;
  dates: string[];
}): Promise<Map<string, EvidenceObject>> {
  const releaseHex = releaseDigest.slice("sha256:".length);
  const snapshot = new Map<string, EvidenceObject>();
  for (const date of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) invalid();
    let cursor: string | null = null;
    for (let page = 1; page <= 100; page += 1) {
      const query = cursor
        ? `?date=${date}&cursor=${encodeURIComponent(cursor)}`
        : `?date=${date}`;
      const result = await ownerJson(
        fetchImpl,
        ownerAuthorization,
        `/control/api/v1/evidence${query}`,
      );
      if (
        !result.response.ok || result.value.ok !== true ||
        result.value.releaseDigest !== releaseDigest ||
        result.value.date !== date || !Array.isArray(result.value.objects) ||
        typeof result.value.truncated !== "boolean" ||
        !(result.value.nextCursor === null ||
          EVIDENCE_CURSOR.test(result.value.nextCursor ?? "")) ||
        result.value.truncated !== (result.value.nextCursor !== null)
      ) invalid();
      for (const candidate of result.value.objects) {
        const uploadedMs = Date.parse(candidate?.uploaded);
        const match = typeof candidate?.key === "string"
          ? candidate.key.match(new RegExp(
            `^${date}/${releaseHex}/([a-z][a-z0-9]*(?:\\.[a-z0-9]+)+)/` +
              `([a-zA-Z0-9][a-zA-Z0-9._:-]{7,127})\\.json$`,
          ))
          : null;
        if (
          !match || !Number.isSafeInteger(candidate?.size) || candidate.size < 1 ||
          !Number.isFinite(uploadedMs) ||
          new Date(uploadedMs).toISOString() !== candidate.uploaded ||
          snapshot.has(candidate.key)
        ) invalid();
        snapshot.set(candidate.key, {
          key: candidate.key,
          kind: match[1]!,
          size: candidate.size,
          uploaded: candidate.uploaded,
        });
      }
      if (!result.value.truncated) break;
      cursor = result.value.nextCursor;
      if (page === 100) invalid();
    }
  }
  return snapshot;
}

async function ownerPauseAll({
  fetchImpl,
  ownerAuthorization,
  expected,
}: {
  fetchImpl: typeof fetch;
  ownerAuthorization: string;
  expected: any;
}) {
  const { response, value } = await ownerJson(
    fetchImpl,
    ownerAuthorization,
    "/control/api/v1/pauses/all",
    "POST",
    {},
  );
  const pause = value.result?.pause;
  if (
    !response.ok || value.ok !== true || value.evidenceQueued !== true ||
    value.result?.ok !== true ||
    !["SCOPE_PAUSED", "SCOPE_ALREADY_PAUSED"].includes(value.result.code) ||
    !object(pause) || !exact(pause.binding, expected.binding) ||
    pause.deploymentManifestSha256 !==
      expected.release.deploymentManifestSha256 ||
    pause.rollbackBoundary !== expected.rollbackBoundary
  ) invalid();
  return pause;
}

async function resumePause({
  fetchImpl,
  signReceiptImpl,
  ownerAuthorization,
  owner,
  recoveryToken,
  pause,
  pauseExpected,
  currentExpected,
  nowMs,
  nonce,
}: Record<string, any>) {
  const receipt = await signReceiptImpl({
    schemaVersion: "alice.recovery-receipt.v3",
    action: "control.resume",
    scope: "all",
    pauseId: pause.pauseId,
    pausedAt: pause.pausedAt,
    subject: owner.actor,
    pauseBinding: pause.binding,
    pauseDeploymentManifestSha256: pause.deploymentManifestSha256,
    pauseRollbackBoundary: pause.rollbackBoundary,
    currentBinding: currentExpected.binding,
    currentDeploymentManifestSha256:
      currentExpected.release.deploymentManifestSha256,
    currentReleaseEpoch: currentExpected.release.releaseEpoch,
    currentRollbackBoundary: currentExpected.rollbackBoundary,
    issuedAt: nowMs,
    expiresAt: nowMs + 5 * 60_000,
    nonce,
  }, recoveryToken);
  await resumeAliceReleaseOwner({
    fetchImpl,
    ownerAuthorization,
    owner,
    recoveryReceipt: receipt,
    pause,
    pauseExpected,
    currentExpected,
    nowMs,
  });
  return digestBytes(receipt);
}

function validateProviderRollbackForward(
  cloudflareRollback: Record<string, any>,
  cloudflareLive: Record<string, any>,
  providerPromotion: Record<string, any>,
  expected: any,
) {
  const containerMode = Object.hasOwn(expected.release, "runtimeRevision");
  const modalPromotion = containerMode ? null : providerPromotion;
  const modalProof = modalPromotion?.rollbackForwardProof;
  const modalRelease = modalPromotion?.release;
  if (
    cloudflareRollback.schemaVersion !==
      "alice.cloudflare-rollback-evidence.v1" ||
    cloudflareRollback.accountId !== ACCOUNT_ID ||
    !object(cloudflareRollback.workflowVersionContinuity) ||
    cloudflareLive.schemaVersion !== "alice.cloudflare-live-readback.v1" ||
    cloudflareLive.accountId !== ACCOUNT_ID || cloudflareLive.zoneId !== ZONE_ID ||
    cloudflareLive.terminalSnapshotStable !== true ||
    !object(cloudflareLive.workers) ||
    !["access", "control", "aiGateway"].every((role) =>
      object(cloudflareLive.workers[role])) ||
    (!containerMode &&
      (modalPromotion?.schemaVersion !== "alice.modal-promotion-evidence.v1" ||
        !object(modalRelease) ||
        modalRelease.sourceCommit !== expected.release.sourceCommit ||
        modalRelease.releaseDigest !== expected.binding.releaseDigest ||
        modalRelease.deploymentManifestSha256 !==
          expected.release.deploymentManifestSha256 ||
        !object(modalProof) ||
        modalProof.schemaVersion !== "alice.modal-rollback-forward-proof.v1" ||
        ![modalProof.previousProviderVersion, modalProof.candidateProviderVersion,
          modalProof.rollbackProviderVersion, modalProof.forwardProviderVersion]
          .every((value) => Number.isSafeInteger(value) && value > 0) ||
        !(modalProof.previousProviderVersion < modalProof.candidateProviderVersion &&
          modalProof.candidateProviderVersion < modalProof.rollbackProviderVersion &&
          modalProof.rollbackProviderVersion < modalProof.forwardProviderVersion) ||
        !DIGEST.test(modalProof.previousGraphSha256 ?? "") ||
        !DIGEST.test(modalProof.candidateGraphSha256 ?? "") ||
        modalPromotion.terminalProviderVersion !== modalProof.forwardProviderVersion))
  ) invalid();
  if (containerMode) {
    const container = verifyAliceCloudflareContainerImageEvidence(
      providerPromotion,
    );
    if (
      container.sourceCommit !== expected.release.sourceCommit ||
      container.runtimeImage !== expected.release.runtimeImage ||
      container.runtimeRevision !== expected.release.runtimeRevision ||
      container.runtimeBuildManifestSha256 !==
        expected.release.runtimeBuildManifestSha256 ||
      container.capabilityBomSha256 !== expected.release.capabilityBomSha256
    ) invalid();
    return {
      cloudflareRollbackSha256: digestBytes(canonicalAliceJson(cloudflareRollback)),
      cloudflareLiveReadbackSha256: digestBytes(canonicalAliceJson(cloudflareLive)),
      containerImageEvidenceSha256: digestBytes(canonicalAliceJson(container)),
      runtimeImage: container.runtimeImage,
      runtimeRevision: container.runtimeRevision,
    };
  }
  return {
    cloudflareRollbackSha256: digestBytes(canonicalAliceJson(cloudflareRollback)),
    cloudflareLiveReadbackSha256: digestBytes(canonicalAliceJson(cloudflareLive)),
    modalPromotionSha256: digestBytes(canonicalAliceJson(modalPromotion)),
    modalPreviousProviderVersion: modalProof.previousProviderVersion,
    modalCandidateProviderVersion: modalProof.candidateProviderVersion,
    modalRollbackProviderVersion: modalProof.rollbackProviderVersion,
    modalForwardProviderVersion: modalProof.forwardProviderVersion,
  };
}

function verifyFullRuntimePage(
  response: Response,
  html: string,
) {
  const csp = response.headers.get("content-security-policy") ?? "";
  if (
    response.status !== 200 ||
    response.headers.get("content-type") !== "text/html; charset=utf-8" ||
    csp.includes("'unsafe-eval'") ||
    !/<div\s+id=["']root["']\s*>/.test(html) ||
    !/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']\/assets\/[a-zA-Z0-9._/-]+["'][^>]*><\/script>/.test(
      html,
    ) ||
    html.includes('id="alice-transcript"') ||
    html.includes('id="alice-chat"')
  ) invalid();
  return digestBytes(html);
}

function exactStrings(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && exact(value, expected);
}

function verifyFullRuntimeProof(proof: Record<string, any>, expected: any) {
  if (
    proof.schemaVersion !== "alice.full-runtime-boundary-proof.v1" ||
    proof.authorityMode !== "proposer-only" ||
    proof.runtimeProfile !== "full-gated" ||
    proof.bridgePlugin !== "eliza" ||
    proof.actionPlanning !== true ||
    !exactStrings(proof.coreComposition, FULL_CORE_COMPOSITION) ||
    !exactStrings(
      proof.requiredConfiguredPluginPackages,
      FULL_REQUIRED_CONFIGURED_PLUGINS,
    ) ||
    !exactStrings(
      proof.requiredRuntimePluginNames,
      FULL_REQUIRED_RUNTIME_PLUGINS,
    ) ||
    proof.release?.releaseDigest !== expected.binding.releaseDigest ||
    proof.release?.deploymentManifestSha256 !==
      expected.release.deploymentManifestSha256
  ) invalid();
}

function verifyCompanionStage(value: Record<string, any>) {
  const camera = value.state?.camera;
  if (
    value.ok !== true || !object(camera) ||
    ![camera.zoom, camera.yaw, camera.pitch, camera.pan].every(
      (candidate) => typeof candidate === "number" && Number.isFinite(candidate),
    ) ||
    camera.zoom < 0 || camera.zoom > 1 ||
    camera.yaw < -Math.PI || camera.yaw > Math.PI ||
    camera.pitch < -Math.PI / 2 || camera.pitch > Math.PI / 2 ||
    camera.pan < -5 || camera.pan > 5
  ) invalid();
}

export async function runAliceProductionAcceptance(input: Record<string, any>) {
  const {
    fetchImpl = globalThis.fetch,
    sleepImpl = (milliseconds: number) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now = Date.now,
    randomUuid = crypto.randomUUID,
    signReceiptImpl = signRecoveryReceipt,
    workflowCanaryImpl = runAliceWorkflowBindingCanary,
    ownerAuthorization,
    ownerAccess,
    controlRecoveryToken,
    releaseAccessClientId,
    releaseAccessClientSecret,
    deploymentPauseToken,
    cloudflareApiToken,
    deploymentRunId,
    deploymentRunAttempt,
    recoveryOperatorRunId,
    recoveryOperatorRunAttempt,
    recoveryOperatorJob,
    expectedWorkflowConclusion,
    manifest,
    programAdmission,
    deploymentPauseEvidence,
    rollbackAnchor,
    cloudflareRollbackProof,
    cloudflareLiveReadback,
    modalPromotionEvidence,
    containerImageEvidence,
  } = input;
  if (
    typeof fetchImpl !== "function" || typeof sleepImpl !== "function" ||
    typeof now !== "function" || typeof randomUuid !== "function" ||
    typeof signReceiptImpl !== "function" ||
    typeof workflowCanaryImpl !== "function" ||
    !secure(ownerAuthorization, 32) || !secure(controlRecoveryToken, 32) ||
    !secure(releaseAccessClientId, 8) ||
    !secure(releaseAccessClientSecret, 32) ||
    !secure(deploymentPauseToken, 32) || !secure(cloudflareApiToken, 16) ||
    !RUN_ID.test(deploymentRunId ?? "") ||
    !Number.isSafeInteger(deploymentRunAttempt) || deploymentRunAttempt < 1 ||
    !RUN_ID.test(recoveryOperatorRunId ?? "") ||
    !Number.isSafeInteger(recoveryOperatorRunAttempt) ||
    recoveryOperatorRunAttempt < 1 ||
    recoveryOperatorJob !== "accept" ||
    expectedWorkflowConclusion !== "success" ||
    !object(ownerAccess) || !object(manifest) || !object(programAdmission) ||
    !object(deploymentPauseEvidence) || !object(rollbackAnchor) ||
    !object(cloudflareRollbackProof) || !object(cloudflareLiveReadback)
  ) invalid();

  const expected = releaseExpected(programAdmission);
  const containerMode = Object.hasOwn(expected.release, "runtimeRevision");
  const providerPromotionEvidence = containerMode
    ? containerImageEvidence
    : modalPromotionEvidence;
  if (!object(providerPromotionEvidence)) invalid();
  if (
    manifest.schemaVersion !==
      (containerMode
        ? "alice.deployment-manifest.v2"
        : "alice.deployment-manifest.v1") ||
    manifest.source.sourceCommit !== expected.release.sourceCommit ||
    manifest.source.deploymentControllerCommit !==
      expected.release.deploymentControllerCommit ||
    manifest.source.runtimeImage !== expected.release.runtimeImage ||
    manifest.release.releaseEpoch !== expected.release.releaseEpoch ||
    manifest.release[containerMode ? "runtimeRevision" : "modalRevision"] !==
      expected.release[containerMode ? "runtimeRevision" : "modalRevision"] ||
    manifest.release.policyHash !== expected.binding.policyHash ||
    deploymentPauseEvidence.schemaVersion !==
      "alice.deployment-pause-evidence.v1" ||
    !exact(deploymentPauseEvidence.candidateExpected, expected) ||
    !VERSION_ID.test(deploymentPauseEvidence.prepareControlVersionId ?? "") ||
    deploymentPauseEvidence.result?.controlVersionId !==
      deploymentPauseEvidence.prepareControlVersionId ||
    deploymentPauseEvidence.result?.edgeReadinessConfirmed !== true ||
    !object(deploymentPauseEvidence.active) ||
    !object(deploymentPauseEvidence.result?.pause) ||
    rollbackAnchor.schemaVersion !== "alice.cloudflare-rollback-anchor.v6"
  ) invalid();

  const manifestBytes = `${canonicalAliceJson(manifest)}\n`;
  if (digestBytes(manifestBytes) !== expected.release.deploymentManifestSha256) {
    invalid();
  }
  const providerProof = validateProviderRollbackForward(
    cloudflareRollbackProof,
    cloudflareLiveReadback,
    providerPromotionEvidence,
    expected,
  );
  const workflowId = cloudflareLiveReadback.provider?.continuityConfig?.workflow?.id;
  const workflowVersion = resolveAliceCandidateWorkflowVersion({
    previous: rollbackAnchor.previous?.workflowVersions,
    current: cloudflareLiveReadback.workflowVersions,
    expectedWorkflowId: workflowId,
  });
  const startedAt = now();
  if (!Number.isSafeInteger(startedAt) || startedAt < 1) invalid();
  const owner = await validateAliceOwnerAuthorization(ownerAuthorization, {
    issuer: ownerAccess.issuer,
    audience: ownerAccess.audience,
    ownerEmailSha256: ownerAccess.ownerEmailSha256,
    nowSeconds: Math.floor(startedAt / 1000),
  });

  const unauthenticated = await fetchImpl(`${OWNER_ORIGIN}/`, {
    method: "GET",
    redirect: "manual",
    headers: { accept: "text/html", "cache-control": "no-store" },
  });
  if (unauthenticated.status < 300 && unauthenticated.status !== 401 &&
      unauthenticated.status !== 403) invalid();
  await boundedBody(unauthenticated);

  let activated = false;
  let resumed = false;
  let currentPause: Record<string, any> | null = null;
  try {
    await admitAliceReleaseOwner({
      fetchImpl,
      ownerAuthorization,
      owner,
      expected,
      deploymentPaused: true,
    });
    activated = true;
    currentPause = deploymentPauseEvidence.result.pause;
    const startedDate = new Date(startedAt).toISOString().slice(0, 10);
    const evidenceBefore = await listEvidenceSnapshot({
      fetchImpl,
      ownerAuthorization,
      releaseDigest: expected.binding.releaseDigest,
      dates: [startedDate],
    });
    const initialReceiptSha256 = await resumePause({
      fetchImpl,
      signReceiptImpl,
      ownerAuthorization,
      owner,
      recoveryToken: controlRecoveryToken,
      pause: currentPause,
      pauseExpected: deploymentPauseEvidence.active,
      currentExpected: expected,
      nowMs: now(),
      nonce: `acceptance-initial-${randomUuid()}`,
    });
    resumed = true;
    currentPause = null;

    const rootResponse = await fetchImpl(`${OWNER_ORIGIN}/`, {
      method: "GET",
      headers: {
        ...ownerHeaders(ownerAuthorization),
        accept: "text/html",
      },
      redirect: "manual",
    });
    const rootHtml = new TextDecoder().decode(await boundedBody(rootResponse));
    const rootHtmlSha256 = verifyFullRuntimePage(rootResponse, rootHtml);
    const companionResponse = await fetchImpl(`${OWNER_ORIGIN}/companion`, {
      method: "GET",
      headers: { ...ownerHeaders(ownerAuthorization), accept: "text/html" },
      redirect: "manual",
    });
    const companionHtml = new TextDecoder().decode(
      await boundedBody(companionResponse),
    );
    const companionHtmlSha256 = verifyFullRuntimePage(
      companionResponse,
      companionHtml,
    );
    const broadcastResponse = await fetchImpl(
      `${OWNER_ORIGIN}/broadcast/alice-cam`,
      {
        method: "GET",
        headers: { ...ownerHeaders(ownerAuthorization), accept: "text/html" },
        redirect: "manual",
      },
    );
    const broadcastHtml = new TextDecoder().decode(
      await boundedBody(broadcastResponse),
    );
    const broadcastHtmlSha256 = verifyFullRuntimePage(
      broadcastResponse,
      broadcastHtml,
    );

    const health = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/control/health",
    );
    if (!health.response.ok || health.value.ok !== true ||
        health.value.status !== "ready" ||
        health.value.releaseAdmission !== "admitted" ||
        !exact(health.value.authority?.binding, expected.binding) ||
        health.value.release?.programDigest !== expected.binding.programDigest ||
        health.value.release?.releaseDigest !== expected.binding.releaseDigest ||
        health.value.release?.policyHash !== expected.binding.policyHash ||
        health.value.release?.sourceCommit !== expected.release.sourceCommit ||
        health.value.release?.runtimeImage !== expected.release.runtimeImage ||
        health.value.release?.deploymentManifestSha256 !==
          expected.release.deploymentManifestSha256 ||
        health.value.controls?.highRiskActions !== "disabled" ||
        health.value.controls?.capabilityGrant !==
          "disabled-pending-device-bound-webauthn") invalid();

    const gateway = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/__alice_gateway/healthz",
    );
    if (!gateway.response.ok || gateway.value.ok !== true ||
        gateway.value.releaseDigest !== expected.binding.releaseDigest ||
        gateway.value.deploymentManifestSha256 !==
          expected.release.deploymentManifestSha256) invalid();

    const ready = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/health/ready",
    );
    if (!ready.response.ok || ready.value.ok !== true ||
        ready.value.ready !== true || ready.value.agentState !== "running") {
      invalid();
    }

    const runtime = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/api/health",
    );
    if (!runtime.response.ok || runtime.value.ready !== true ||
        runtime.value.runtime !== "ok" || runtime.value.database !== "ok" ||
        runtime.value.agentState !== "running" ||
        runtime.value.startup?.phase !== "ready" ||
        !Number.isSafeInteger(runtime.value.plugins?.loaded) ||
        runtime.value.plugins.loaded < FULL_REQUIRED_RUNTIME_PLUGINS.length ||
        runtime.value.plugins?.failed !== 0 ||
        runtime.value.aliceRelease?.releaseDigest !== expected.binding.releaseDigest ||
        runtime.value.aliceRelease?.deploymentManifestSha256 !==
          expected.release.deploymentManifestSha256) invalid();

    const proof = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/api/alice-production/proof",
    );
    if (!proof.response.ok) invalid();
    verifyFullRuntimeProof(proof.value, expected);

    const companionStage = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/api/companion/stage",
    );
    if (!companionStage.response.ok) invalid();
    verifyCompanionStage(companionStage.value);

    const grant = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/control/api/v1/capabilities/grant",
      "POST",
      {},
    );
    if (grant.response.status !== 403 || grant.value.ok !== false ||
        grant.value.code !== "CAPABILITY_GRANT_DISABLED") invalid();
    const revoke = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/control/api/v1/capabilities/acceptance-unissued/revoke",
      "POST",
      {},
    );
    if (revoke.response.status !== 404 || revoke.value.ok !== false ||
        revoke.value.code !== "CAPABILITY_NOT_FOUND") invalid();

    const preBudgetState = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/control/api/v1/state",
    );
    const authority = assertCandidateState(preBudgetState.value, expected, []);
    const maxUnits = authority.budget?.maxUnits;
    if (!Number.isSafeInteger(maxUnits) || maxUnits < 1 || maxUnits > 10_000) {
      invalid();
    }
    const budgetRequestId = `acceptance-budget-${randomUuid()}`;
    const reserved = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/control/api/v1/model/reserve",
      "POST",
      {
        ...expected.binding,
        requestId: `${budgetRequestId}-one`,
        model: "workers-ai/@cf/openai/gpt-oss-20b",
        estimatedUnits: 1,
      },
    );
    if (!reserved.response.ok || reserved.value.ok !== true ||
        reserved.value.decision?.allowed !== true ||
        reserved.value.decision?.code !== "MODEL_BUDGET_RESERVED") invalid();
    const exceeded = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/control/api/v1/model/reserve",
      "POST",
      {
        ...expected.binding,
        requestId: `${budgetRequestId}-exceeded`,
        model: "workers-ai/@cf/openai/gpt-oss-20b",
        estimatedUnits: maxUnits,
      },
    );
    if (!exceeded.response.ok || exceeded.value.ok !== true ||
        exceeded.value.decision?.allowed !== false ||
        exceeded.value.decision?.code !== "MODEL_BUDGET_EXCEEDED") invalid();

    const sessionId = `acceptance-chat-${randomUuid()}`;
    const requestKey = `acceptance-turn-${randomUuid()}`;
    const prompt = "Reply with a short acknowledgement of this production canary.";
    const chatBody = {
      model: "alice-production",
      stream: false,
      messages: [{ role: "user", content: prompt }],
    };
    const chatHeaders = {
      ...ownerHeaders(ownerAuthorization, "POST"),
      "idempotency-key": requestKey,
      "x-alice-session-id": sessionId,
    };
    const chatResponse = await fetchImpl(`${OWNER_ORIGIN}/v1/chat/completions`, {
      method: "POST",
      headers: chatHeaders,
      body: JSON.stringify(chatBody),
      redirect: "manual",
    });
    const chatValue = await boundedJson(chatResponse);
    const turnId = chatResponse.headers.get("x-alice-durable-turn-id") ?? "";
    if (!chatResponse.ok ||
        chatResponse.headers.get("x-alice-durable-session-id") !== sessionId ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(turnId) ||
        typeof chatValue.choices?.[0]?.message?.content !== "string" ||
        chatValue.choices[0].message.content.length < 1 ||
        Object.hasOwn(chatValue, "alice_boundary")) invalid();
    const replayResponse = await fetchImpl(`${OWNER_ORIGIN}/v1/chat/completions`, {
      method: "POST",
      headers: chatHeaders,
      body: JSON.stringify(chatBody),
      redirect: "manual",
    });
    const replayValue = await boundedJson(replayResponse);
    if (!replayResponse.ok ||
        replayResponse.headers.get("x-alice-durable-session-id") !== sessionId ||
        replayResponse.headers.get("x-alice-durable-turn-id") !== turnId ||
        !exact(replayValue, chatValue)) invalid();
    const initialSession = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      `/control/api/v1/sessions/${sessionId}`,
    );
    const session = initialSession.value.session;
    const turn = session?.conversationTurns?.find(
      (candidate: Record<string, any>) => candidate.turnId === turnId,
    );
    if (!initialSession.response.ok || initialSession.value.ok !== true ||
        session?.schemaVersion !== "alice.session-ledger.v1" ||
        session.sessionId !== sessionId || !exact(session.binding, expected.binding) ||
        session.conversationTurnCount < 1 || turn?.userText !== prompt ||
        turn?.assistantText !== chatValue.choices[0].message.content) invalid();

    const workflowEvidence = await workflowCanaryImpl({
      fetchImpl,
      sleepImpl,
      now,
      randomUuid,
      ownerAuthorization,
      apiToken: cloudflareApiToken,
      binding: expected.binding,
      deploymentManifestSha256:
        expected.release.deploymentManifestSha256,
      expectedWorkflowId: workflowId,
      expectedWorkflowVersionId: workflowVersion.id,
    });
    if (workflowEvidence.status !== "complete" ||
        workflowEvidence.externalActionExecuted !== false ||
        workflowEvidence.binding.releaseDigest !== expected.binding.releaseDigest) {
      invalid();
    }
    const workflowSession = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      `/control/api/v1/sessions/${workflowEvidence.sessionId}`,
    );
    if (!workflowSession.response.ok || workflowSession.value.ok !== true ||
        workflowSession.value.session?.tasks?.[workflowEvidence.planId]?.state !==
          "waiting") invalid();

    currentPause = await ownerPauseAll({
      fetchImpl,
      ownerAuthorization,
      expected,
    });
    const pausedChat = await fetchImpl(`${OWNER_ORIGIN}/v1/chat/completions`, {
      method: "POST",
      headers: {
        ...chatHeaders,
        "idempotency-key": `paused-${randomUuid()}`,
      },
      body: JSON.stringify(chatBody),
      redirect: "manual",
    });
    const pausedChatValue = await boundedJson(pausedChat);
    if (pausedChat.status !== 503 || pausedChatValue.ok !== false ||
        pausedChatValue.code !== "RUNTIME_PAUSED" ||
        !Array.isArray(pausedChatValue.blockingScopes) ||
        !pausedChatValue.blockingScopes.includes("all")) invalid();
    const pausedState = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/control/api/v1/state",
    );
    assertCandidateState(pausedState.value, expected, ["all"]);

    const pauseReceiptSha256 = await resumePause({
      fetchImpl,
      signReceiptImpl,
      ownerAuthorization,
      owner,
      recoveryToken: controlRecoveryToken,
      pause: currentPause,
      pauseExpected: expected,
      currentExpected: expected,
      nowMs: now(),
      nonce: `acceptance-final-${randomUuid()}`,
    });
    currentPause = null;

    const recoveredSession = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      `/control/api/v1/sessions/${sessionId}`,
    );
    if (!recoveredSession.response.ok || recoveredSession.value.ok !== true ||
        !exact(recoveredSession.value.session, session)) invalid();
    const finalState = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/control/api/v1/state",
    );
    const finalAuthority = assertCandidateState(finalState.value, expected, []);
    const finalGateway = await ownerJson(
      fetchImpl,
      ownerAuthorization,
      "/__alice_gateway/healthz",
    );
    if (!finalGateway.response.ok || finalGateway.value.ok !== true ||
        finalGateway.value.releaseDigest !== expected.binding.releaseDigest) invalid();

    let evidenceDelta: EvidenceObject[] | null = null;
    let observedKindCounts: Record<string, number> | null = null;
    let evidenceDates: string[] = [];
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const observedAt = now();
      if (!Number.isSafeInteger(observedAt) || observedAt < startedAt) invalid();
      const finalDate = new Date(observedAt).toISOString().slice(0, 10);
      evidenceDates = [...new Set([startedDate, finalDate])];
      const evidenceAfter = await listEvidenceSnapshot({
        fetchImpl,
        ownerAuthorization,
        releaseDigest: expected.binding.releaseDigest,
        dates: evidenceDates,
      });
      const delta = [...evidenceAfter.values()]
        .filter((candidate) => !evidenceBefore.has(candidate.key));
      const counts: Record<string, number> = {};
      for (const candidate of delta) {
        const uploadedMs = Date.parse(candidate.uploaded);
        if (uploadedMs < startedAt - 60_000 || uploadedMs > observedAt + 60_000) {
          invalid();
        }
        counts[candidate.kind] = (counts[candidate.kind] ?? 0) + 1;
      }
      const exactPlanCreatedId = `evt-plan-created-${crypto
        .createHash("sha256")
        .update(`created:${workflowEvidence.planId}`)
        .digest("hex").slice(0, 32)}`;
      const exactPlanAuthorizationId = `evt-plan-${crypto
        .createHash("sha256")
        .update(`${workflowEvidence.planId}:${workflowEvidence.intentId}`)
        .digest("hex").slice(0, 32)}`;
      const exactPlanKeysPresent = [
        ["plan.created", exactPlanCreatedId],
        ["plan.authorization", exactPlanAuthorizationId],
      ].every(([kind, eventId]) => delta.some((candidate) =>
        candidate.kind === kind && candidate.key.endsWith(`/${eventId}.json`)));
      if (exactPlanKeysPresent &&
          Object.entries(REQUIRED_EVIDENCE_KINDS).every(
            ([kind, minimum]) => (counts[kind] ?? 0) >= minimum,
          )) {
        evidenceDelta = delta.sort((left, right) => left.key.localeCompare(right.key));
        observedKindCounts = Object.fromEntries(
          Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
        );
        break;
      }
      if (attempt < 60) await sleepImpl(1_000);
    }
    if (!evidenceDelta || !observedKindCounts) invalid();

    return {
      schemaVersion: "alice.production-acceptance.v2",
      observedAt: new Date(now()).toISOString(),
      accountId: ACCOUNT_ID,
      zoneId: ZONE_ID,
      sourceCommit: expected.release.sourceCommit,
      deploymentManifestSha256:
        expected.release.deploymentManifestSha256,
      binding: expected.binding,
      releaseEpoch: expected.release.releaseEpoch,
      ...(containerMode
        ? { runtimeRevision: expected.release.runtimeRevision }
        : { modalRevision: expected.release.modalRevision }),
      deploymentRun: {
        id: deploymentRunId,
        attempt: deploymentRunAttempt,
      },
      recoveryOperatorRun: {
        id: recoveryOperatorRunId,
        attempt: recoveryOperatorRunAttempt,
        job: recoveryOperatorJob,
      },
      publicationContract: {
        expectedWorkflowConclusion,
        artifactConsumerMustVerifyWorkflowConclusion: true,
        publicationIsFinalSuccessOnlyStep: true,
      },
      ownerAuthorization: "verified-cloudflare-access-jwt",
      unauthenticatedRoot: "denied-or-access-redirect",
      authenticatedRoot: "full-milady-companion-ui",
      rootHtmlSha256,
      runtimeProfile: "full-gated",
      productSurfaces: {
        root: "full-milady",
        companion: "full-companion",
        broadcast: "alice-cam",
        companionStage: "durable",
      },
      productSurfaceDigests: {
        companionHtmlSha256,
        broadcastHtmlSha256,
      },
      health: "ready",
      durableChat: {
        sessionId,
        turnId,
        responseSha256: digestBytes(canonicalAliceJson(chatValue)),
        idempotentReplay: true,
        recoveredAfterPauseResume: true,
      },
      durableWorkflowTask: {
        workflowId,
        workflowVersionId: workflowVersion.id,
        planId: workflowEvidence.planId,
        sessionId: workflowEvidence.sessionId,
        state: "waiting",
        externalActionExecuted: false,
      },
      failClosedGates: {
        capabilityGrant: "disabled",
        unissuedCapabilityRevoke: "not-found",
        modelBudgetOverspend: "denied",
        pauseAll: "chat-denied",
      },
      recoveryReceipts: {
        initialReceiptSha256,
        pauseReceiptSha256,
      },
      evidence: {
        dates: evidenceDates,
        baselineObjectCount: evidenceBefore.size,
        currentRunObjectCount: evidenceDelta.length,
        requiredKinds: REQUIRED_EVIDENCE_KINDS,
        observedKindCounts,
        persistedObjectKeys: evidenceDelta.map((candidate) => candidate.key),
        persisted: true,
      },
      finalAuthority: {
        admissionGeneration: finalAuthority.admissionGeneration,
        pausedScopes: finalAuthority.pausedScopes,
        rollbackBoundary: finalAuthority.rollbackBoundary,
      },
      provenance: {
        runtimeBoundaryProofSha256: digestBytes(canonicalAliceJson(proof.value)),
        workflowCanarySha256: digestBytes(canonicalAliceJson(workflowEvidence)),
        ...providerProof,
      },
      higherRiskCapabilities: "disabled",
      publicOrEconomicActionExecuted: false,
      terminal: true,
    };
  } catch (error) {
    if (activated) {
      try {
        if (!currentPause) {
          currentPause = await ownerPauseAll({
            fetchImpl,
            ownerAuthorization,
            expected,
          });
        }
      } catch (ownerPauseError) {
        try {
          await pauseAliceReleaseMachine({
            fetchImpl,
            serviceClientId: releaseAccessClientId,
            serviceClientSecret: releaseAccessClientSecret,
            deploymentPauseToken,
            active: expected,
            candidateExpected: expected,
            expectedControlVersionId:
              deploymentPauseEvidence.prepareControlVersionId,
          });
        } catch (machinePauseError) {
          throw new AggregateError(
            [error, ownerPauseError, machinePauseError],
            "ALICE_PRODUCTION_ACCEPTANCE_AND_FAIL_CLOSED_FAILED",
          );
        }
      }
    }
    throw error;
  }
}

function readJson(filePath: string) {
  if (!path.isAbsolute(filePath)) invalid();
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 ||
      stat.size > 4 * 1024 * 1024) invalid();
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeReadonly(filePath: string, value: unknown) {
  if (!path.isAbsolute(filePath) || !fs.existsSync(path.dirname(filePath))) {
    invalid();
  }
  fs.writeFileSync(filePath, `${canonicalAliceJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

async function main() {
  const programAdmission = readJson(
    process.env.ALICE_PROGRAM_ADMISSION_EVIDENCE_PATH ?? "",
  );
  const containerMode = programAdmission.schemaVersion ===
    "alice.program-admission.v2";
  const evidence = await runAliceProductionAcceptance({
    ownerAuthorization: process.env.ALICE_OWNER_AUTHORIZATION,
    ownerAccess: {
      issuer: process.env.ALICE_ACCESS_ISSUER,
      audience: process.env.ALICE_ACCESS_AUDIENCE,
      ownerEmailSha256: process.env.ALICE_OWNER_EMAIL_SHA256,
    },
    controlRecoveryToken: process.env.ALICE_CONTROL_RECOVERY_TOKEN,
    releaseAccessClientId: process.env.ALICE_RELEASE_ACCESS_CLIENT_ID,
    releaseAccessClientSecret: process.env.ALICE_RELEASE_ACCESS_CLIENT_SECRET,
    deploymentPauseToken: process.env.ALICE_DEPLOYMENT_PAUSE_TOKEN,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    deploymentRunId: process.env.ALICE_DEPLOYMENT_RUN_ID,
    deploymentRunAttempt: Number(process.env.ALICE_DEPLOYMENT_RUN_ATTEMPT),
    recoveryOperatorRunId: process.env.ALICE_RECOVERY_OPERATOR_RUN_ID,
    recoveryOperatorRunAttempt: Number(
      process.env.ALICE_RECOVERY_OPERATOR_RUN_ATTEMPT,
    ),
    recoveryOperatorJob: process.env.ALICE_RECOVERY_OPERATOR_JOB,
    expectedWorkflowConclusion: process.env.ALICE_EXPECTED_WORKFLOW_CONCLUSION,
    manifest: readJson(process.env.ALICE_DEPLOYMENT_MANIFEST_PATH ?? ""),
    programAdmission,
    deploymentPauseEvidence: readJson(
      process.env.ALICE_DEPLOYMENT_PAUSE_EVIDENCE_PATH ?? "",
    ),
    rollbackAnchor: readJson(
      process.env.ALICE_CLOUDFLARE_ROLLBACK_ANCHOR_PATH ?? "",
    ),
    cloudflareRollbackProof: readJson(
      process.env.ALICE_CLOUDFLARE_ROLLBACK_PROOF_PATH ?? "",
    ),
    cloudflareLiveReadback: readJson(
      process.env.ALICE_CLOUDFLARE_READBACK_PATH ?? "",
    ),
    ...(containerMode
      ? {
          containerImageEvidence: readJson(
            process.env.ALICE_CONTAINER_IMAGE_EVIDENCE_PATH ?? "",
          ),
        }
      : {
          modalPromotionEvidence: readJson(
            process.env.ALICE_MODAL_PROMOTION_EVIDENCE_PATH ?? "",
          ),
        }),
  });
  writeReadonly(process.env.ALICE_PRODUCTION_ACCEPTANCE_PATH ?? "", evidence);
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
