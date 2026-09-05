import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import { verifyAliceBootstrapState } from "./alice_cloudflare_bootstrap.mjs";
import {
  verifyAliceCloudflarePrepareEvidence,
  verifyAliceCloudflareRollbackAnchor,
} from "./alice_cloudflare_release.mjs";
import {
  pauseAliceReleaseMachine,
  verifyAliceDeploymentPauseEvidence,
} from "./alice_release_controller.mjs";

const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function invalid(code = "ALICE_DEPLOYMENT_PAUSE_INVALID") {
  throw new Error(code);
}

function absolute(value) {
  return typeof value === "string" && path.isAbsolute(value);
}

function readJson(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size <= 0 ||
      stat.size > 16 * 1024 * 1024
    ) invalid();
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ALICE_")) {
      throw error;
    }
    invalid();
  }
}

function writeReadonly(filePath, value) {
  if (!absolute(filePath) || !fs.existsSync(path.dirname(filePath))) invalid();
  fs.writeFileSync(filePath, `${canonicalAliceJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

function candidateFromAdmission(admission) {
  const containerMode = admission?.schemaVersion === "alice.program-admission.v2";
  const binding = {
    programDigest: admission?.programDigest,
    releaseDigest: admission?.releaseDigest,
    policyHash: admission?.policyHash,
  };
  const release = {
    releaseEpoch: admission?.releaseEpoch,
    sourceCommit: admission?.sourceCommit,
    deploymentControllerCommit: admission?.deploymentControllerCommit,
    runtimeImage: admission?.runtimeImage,
    runtimeBuildManifestSha256: admission?.runtimeBuildManifestSha256,
    capabilityBomSha256: admission?.capabilityBomSha256,
    elizaCommit: admission?.elizaCommit,
    ...(containerMode
      ? { runtimeRevision: admission?.runtimeRevision }
      : { modalRevision: admission?.modalRevision }),
    deploymentManifestSha256: admission?.deploymentManifestSha256,
  };
  const rollbackBoundary = admission?.rollbackBoundary;
  if (
    (!containerMode && admission?.schemaVersion !== "alice.program-admission.v1") ||
    !COMMIT.test(release.sourceCommit ?? "") ||
    !DIGEST.test(release.deploymentManifestSha256 ?? "") ||
    rollbackBoundary !==
      `${containerMode ? "container" : "modal"}:alice-runtime:v${
        containerMode ? release.runtimeRevision : release.modalRevision
      }`
  ) invalid("ALICE_PROGRAM_ADMISSION_INVALID");
  return { binding, release, rollbackBoundary };
}

function previousReleaseFromAnchor(anchor, admission) {
  try {
    const bindings = anchor.previous.workers.control.versionResources.bindings;
    const value = (name) => {
      const matches = bindings.filter(binding => binding.name === name);
      if (matches.length !== 1 || matches[0].type !== "plain_text") invalid();
      return matches[0].text;
    };
    const decode = name => {
      const encoded = value(name);
      if (!/^[A-Za-z0-9_-]+$/.test(encoded ?? "")) invalid();
      return Buffer.from(encoded, "base64url");
    };
    const digest = bytes => `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
    const envelope = JSON.parse(decode("ALICE_PROGRAM_ENVELOPE_B64"));
    const publicJwk = JSON.parse(decode("ALICE_PROGRAM_PUBLIC_JWK_B64"));
    const manifestBytes = decode("ALICE_DEPLOYMENT_MANIFEST_B64");
    const manifest = JSON.parse(manifestBytes);
    const release = envelope.release;
    if (
      envelope.schemaVersion !== "alice.program-envelope.v2" ||
      !DIGEST.test(admission.programPublicJwkSha256 ?? "") ||
      digest(canonicalAliceJson(publicJwk)) !== admission.programPublicJwkSha256 ||
      publicJwk.kty !== "RSA" || Object.hasOwn(publicJwk, "d") ||
      !crypto.verify("RSA-SHA256", Buffer.from(canonicalAliceJson(envelope)),
        crypto.createPublicKey({ key: publicJwk, format: "jwk" }),
        decode("ALICE_PROGRAM_SIGNATURE_B64")) ||
      !Number.isSafeInteger(release?.releaseEpoch) || release.releaseEpoch < 1 ||
      release.releaseEpoch >= admission.releaseEpoch ||
      !Number.isSafeInteger(release.runtimeRevision) || release.runtimeRevision < 49 ||
      !DIGEST.test(release.policyHash ?? "") ||
      release.deploymentManifestSha256 !== digest(manifestBytes) ||
      release.deploymentManifestSha256 !== value("ALICE_DEPLOYMENT_MANIFEST_SHA256") ||
      release.sourceCommit !== manifest.source?.sourceCommit ||
      release.deploymentControllerCommit !== manifest.source?.deploymentControllerCommit ||
      release.runtimeImage !== manifest.source?.runtimeImage ||
      release.runtimeImage !== anchor.previous.containerApplication.target.configuration.image ||
      release.rollbackBoundary !== `container:alice-runtime:v${release.runtimeRevision}`
    ) invalid();
    // This verifies the historical release being paused, not permission to run
    // it again. The authenticated status must independently match this tuple.
    return {
      binding: {
        programDigest: digest(canonicalAliceJson(envelope)),
        releaseDigest: digest(canonicalAliceJson(release)),
        policyHash: release.policyHash,
      },
      deploymentManifestSha256: release.deploymentManifestSha256,
      releaseEpoch: release.releaseEpoch,
      rollbackBoundary: release.rollbackBoundary,
    };
  } catch {
    invalid("ALICE_PREVIOUS_RELEASE_PAUSE_INVALID");
  }
}

export function verifyAliceFirstReleasePauseInputs({
  admission,
  bootstrapState,
  anchor,
  anchorSha256,
  prepareEvidence,
  prepareEvidenceSha256,
  usePreviousRelease = false,
}) {
  const candidateExpected = candidateFromAdmission(admission);
  const bootstrap = verifyAliceBootstrapState(bootstrapState);
  verifyAliceCloudflareRollbackAnchor(anchor, {
    sourceCommit: candidateExpected.release.sourceCommit,
    deploymentManifestSha256:
      candidateExpected.release.deploymentManifestSha256,
  });
  const prepared = verifyAliceCloudflarePrepareEvidence(prepareEvidence, {
    sourceCommit: candidateExpected.release.sourceCommit,
    deploymentManifestSha256:
      candidateExpected.release.deploymentManifestSha256,
  });
  if (
    bootstrap.activeVersionId !==
      anchor.previous.workers.control.serving.versionId ||
    prepared.controlVersionId === bootstrap.activeVersionId ||
    !DIGEST.test(anchorSha256 ?? "") ||
    !DIGEST.test(prepareEvidenceSha256 ?? "")
  ) invalid();
  if (typeof usePreviousRelease !== "boolean") invalid();
  // Installed code alone does not select admission state. The caller's initial
  // status read chooses a tuple; pauseAliceReleaseMachine must prove it exactly.
  const zero = `sha256:${"0".repeat(64)}`;
  const active = {
    binding: {
      programDigest: zero,
      releaseDigest: zero,
      policyHash: zero,
    },
    deploymentManifestSha256: zero,
    releaseEpoch: 0,
    rollbackBoundary: "release:unadmitted",
  };
  return {
    active: usePreviousRelease ? previousReleaseFromAnchor(anchor, admission) : active,
    candidateExpected,
    prepared,
  };
}

export function buildAliceFirstReleasePauseEvidence({
  admission,
  bootstrapState,
  anchor,
  anchorSha256,
  prepareEvidence,
  prepareEvidenceSha256,
  result,
  usePreviousRelease = false,
  observedAt = new Date().toISOString(),
}) {
  const { active, candidateExpected, prepared } =
    verifyAliceFirstReleasePauseInputs({
      admission,
      bootstrapState,
      anchor,
      anchorSha256,
      prepareEvidence,
      prepareEvidenceSha256,
      usePreviousRelease,
    });
  return verifyAliceDeploymentPauseEvidence({
    schemaVersion: "alice.deployment-pause-evidence.v1",
    observedAt,
    sourceCommit: candidateExpected.release.sourceCommit,
    deploymentManifestSha256:
      candidateExpected.release.deploymentManifestSha256,
    rollbackAnchorSha256: anchorSha256,
    prepareControlVersionId: prepared.controlVersionId,
    prepareEvidenceSha256,
    active,
    candidateExpected,
    result,
  }, {
    candidateExpected,
    rollbackAnchorSha256: anchorSha256,
    prepareControlVersionId: prepared.controlVersionId,
    prepareEvidenceSha256,
  });
}

async function main() {
  const admissionPath = process.env.ALICE_PROGRAM_ADMISSION_EVIDENCE_PATH;
  const bootstrapStatePath = process.env.ALICE_BOOTSTRAP_STATE_PATH;
  const anchorPath = process.env.ALICE_CLOUDFLARE_ROLLBACK_ANCHOR_PATH;
  const preparePath = process.env.ALICE_CLOUDFLARE_PREPARE_EVIDENCE_PATH;
  const outputPath = process.env.ALICE_DEPLOYMENT_PAUSE_EVIDENCE_PATH;
  if (![admissionPath, bootstrapStatePath, anchorPath, preparePath, outputPath]
    .every(absolute)) invalid();
  const admission = readJson(admissionPath);
  const bootstrapState = readJson(bootstrapStatePath);
  const anchor = readJson(anchorPath);
  const prepareEvidence = readJson(preparePath);
  const anchorSha256 = `sha256:${crypto.createHash("sha256")
    .update(fs.readFileSync(anchorPath)).digest("hex")}`;
  const prepareEvidenceSha256 = `sha256:${crypto.createHash("sha256")
    .update(fs.readFileSync(preparePath)).digest("hex")}`;
  verifyAliceFirstReleasePauseInputs({
    admission, bootstrapState, anchor, anchorSha256,
    prepareEvidence, prepareEvidenceSha256,
  });
  const statusResponse = await fetch(
    "https://alice-release.rndrntwrk.com/control/internal/v1/deployment/status",
    {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(30_000),
      headers: {
        accept: "application/json", "cache-control": "no-store",
        "cf-access-client-id": process.env.ALICE_RELEASE_ACCESS_CLIENT_ID,
        "cf-access-client-secret": process.env.ALICE_RELEASE_ACCESS_CLIENT_SECRET,
        "x-alice-deployment-pause-token": process.env.ALICE_DEPLOYMENT_PAUSE_TOKEN,
        "x-alice-deployment-edge-nonce": crypto.randomBytes(32).toString("base64url"),
      },
    },
  );
  const statusText = await statusResponse.text();
  if (statusText.length > 32_768) invalid("ALICE_DEPLOYMENT_STATUS_INVALID");
  let status;
  try { status = JSON.parse(statusText); }
  catch { invalid("ALICE_DEPLOYMENT_STATUS_INVALID"); }
  if (!statusResponse.ok || status.ok !== true || status.code !== "DEPLOYMENT_STATUS_READ" ||
    !Number.isSafeInteger(status.authority?.activeReleaseEpoch) ||
    status.authority.activeReleaseEpoch < 0) invalid("ALICE_DEPLOYMENT_STATUS_INVALID");
  const usePreviousRelease = status.authority.activeReleaseEpoch > 0;
  const { active, candidateExpected } = verifyAliceFirstReleasePauseInputs({
    admission,
    bootstrapState,
    anchor,
    anchorSha256,
    prepareEvidence,
    prepareEvidenceSha256,
    usePreviousRelease,
  });
  process.stdout.write(`${JSON.stringify({
    phase: "verified-pause-source",
    activeReleaseEpoch: active.releaseEpoch,
    deploymentManifestSha256: active.deploymentManifestSha256,
    rollbackBoundary: active.rollbackBoundary,
  })}\n`);
  const result = await pauseAliceReleaseMachine({
    fetchImpl: (url, init) => fetch(url, {
      ...init,
      signal: AbortSignal.timeout(30_000),
    }),
    serviceClientId: process.env.ALICE_RELEASE_ACCESS_CLIENT_ID,
    serviceClientSecret: process.env.ALICE_RELEASE_ACCESS_CLIENT_SECRET,
    deploymentPauseToken: process.env.ALICE_DEPLOYMENT_PAUSE_TOKEN,
    active,
    candidateExpected,
    expectedControlVersionId: prepareEvidence.controlVersionId,
  });
  const evidence = buildAliceFirstReleasePauseEvidence({
    admission,
    bootstrapState,
    anchor,
    anchorSha256,
    prepareEvidence,
    prepareEvidenceSha256,
    result,
    usePreviousRelease,
  });
  writeReadonly(outputPath, evidence);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    sourceCommit: evidence.sourceCommit,
    deploymentManifestSha256: evidence.deploymentManifestSha256,
    prepareControlVersionId: evidence.prepareControlVersionId,
    pauseId: evidence.result.pause.pauseId,
  })}\n`);
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
