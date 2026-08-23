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
    elizaCommit: admission?.elizaCommit,
    modalRevision: admission?.modalRevision,
    deploymentManifestSha256: admission?.deploymentManifestSha256,
  };
  const rollbackBoundary = admission?.rollbackBoundary;
  if (
    admission?.schemaVersion !== "alice.program-admission.v1" ||
    !COMMIT.test(release.sourceCommit ?? "") ||
    !DIGEST.test(release.deploymentManifestSha256 ?? "") ||
    rollbackBoundary !== `modal:alice-runtime:v${release.modalRevision}`
  ) invalid("ALICE_PROGRAM_ADMISSION_INVALID");
  return { binding, release, rollbackBoundary };
}

export function verifyAliceFirstReleasePauseInputs({
  admission,
  bootstrapState,
  anchor,
  anchorSha256,
  prepareEvidence,
  prepareEvidenceSha256,
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
    bootstrap.mode !== "bootstrap" ||
    bootstrap.activeVersionId !==
      anchor.previous.workers.control.serving.versionId ||
    prepared.controlVersionId === bootstrap.activeVersionId ||
    !DIGEST.test(anchorSha256 ?? "") ||
    !DIGEST.test(prepareEvidenceSha256 ?? "")
  ) invalid();
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
  return { active, candidateExpected, prepared };
}

export function buildAliceFirstReleasePauseEvidence({
  admission,
  bootstrapState,
  anchor,
  anchorSha256,
  prepareEvidence,
  prepareEvidenceSha256,
  result,
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
  const { active, candidateExpected } = verifyAliceFirstReleasePauseInputs({
    admission,
    bootstrapState,
    anchor,
    anchorSha256,
    prepareEvidence,
    prepareEvidenceSha256,
  });
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
  });
  const evidence = buildAliceFirstReleasePauseEvidence({
    admission,
    bootstrapState,
    anchor,
    anchorSha256,
    prepareEvidence,
    prepareEvidenceSha256,
    result,
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
