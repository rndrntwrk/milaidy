import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  assertReplayAdmission,
  canonicalOwnerHash,
  compareCloudflareReplaySnapshots,
} from "./alice-provider-replay-evidence.mjs";

function invalid(code) {
  throw new Error(code);
}

function absolute(value) {
  return typeof value === "string" && path.isAbsolute(value);
}

function readBytes(filePath, maxBytes = 4 * 1024 * 1024) {
  if (!absolute(filePath)) invalid("ALICE_REPLAY_EVIDENCE_PATH_INVALID");
  const stat = fs.lstatSync(filePath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 2 ||
    stat.size > maxBytes
  ) {
    invalid("ALICE_REPLAY_EVIDENCE_PATH_INVALID");
  }
  return fs.readFileSync(filePath);
}

function readJson(filePath, maxBytes) {
  try {
    return JSON.parse(readBytes(filePath, maxBytes).toString("utf8"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_REPLAY_EVIDENCE_PATH_INVALID"
    ) {
      throw error;
    }
    invalid("ALICE_REPLAY_EVIDENCE_INVALID");
  }
}

function fileMetric(filePath, maxBytes) {
  const value = readBytes(filePath, maxBytes);
  return {
    bytes: value.byteLength,
    sha256: `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`,
  };
}

function main() {
  if (process.env.ALICE_REPLAY_MUTATION_DISABLED !== "1") {
    invalid("ALICE_REPLAY_MUTATION_CUTOFF_REQUIRED");
  }
  const beforePath = process.env.ALICE_REPLAY_BEFORE_PATH;
  const afterPath = process.env.ALICE_REPLAY_AFTER_PATH;
  const manifestPath = process.env.ALICE_DEPLOYMENT_MANIFEST_PATH;
  const admissionPath = process.env.ALICE_PROGRAM_ADMISSION_EVIDENCE_PATH;
  const workerArtifactPath = process.env.ALICE_WORKER_BUNDLE_ARTIFACT_PATH;
  const artifactRecordPath = process.env.ALICE_REPLAY_ARTIFACT_RECORD_PATH;
  const configDir = process.env.ALICE_WRANGLER_OUTPUT_DIR;
  const outputPath = process.env.ALICE_REPLAY_EVIDENCE_OUTPUT;
  if (
    ![
      beforePath,
      afterPath,
      manifestPath,
      admissionPath,
      workerArtifactPath,
      artifactRecordPath,
      configDir,
      outputPath,
    ].every(absolute) ||
    !fs.statSync(configDir).isDirectory() ||
    !fs.statSync(path.dirname(outputPath)).isDirectory() ||
    fs.existsSync(outputPath)
  ) {
    invalid("ALICE_REPLAY_EVIDENCE_PATH_INVALID");
  }
  const before = readJson(beforePath);
  const after = readJson(afterPath);
  const providerComparison = compareCloudflareReplaySnapshots(before, after);
  const ownerHash = canonicalOwnerHash("alice-owner@rndrntwrk.com");
  const configPaths = ["access", "control", "aiGateway"].map((role) =>
    path.join(configDir, `${role}.wrangler.json`),
  );
  const admission = assertReplayAdmission({
    sourceSha: process.env.ALICE_SOURCE_COMMIT,
    buildRunId: process.env.ALICE_BUILD_RUN_ID,
    workerArtifactName: process.env.ALICE_WORKER_ARTIFACT_NAME,
    workerArtifactDigest: process.env.ALICE_WORKER_ARTIFACT_DIGEST,
    runtimeImage: process.env.ALICE_RUNTIME_IMAGE,
    runtimeBuildManifestSha256:
      process.env.ALICE_RUNTIME_BUILD_MANIFEST_SHA256,
    releaseEpoch: process.env.ALICE_RELEASE_EPOCH,
    modalRevision: process.env.ALICE_MODAL_REVISION,
    policyHash: process.env.ALICE_POLICY_HASH,
    ownerHash,
    manifestPath,
    programAdmissionPath: admissionPath,
    workerArtifactPath,
    wranglerConfigPaths: configPaths,
  });
  const artifactRecord = readJson(artifactRecordPath, 64 * 1024);
  if (
    artifactRecord?.count !== 1 ||
    artifactRecord?.name !== process.env.ALICE_WORKER_ARTIFACT_NAME ||
    artifactRecord?.digest !== process.env.ALICE_WORKER_ARTIFACT_DIGEST ||
    artifactRecord?.expired !== false
  ) {
    invalid("ALICE_REPLAY_EXACT_ONE_ARTIFACT_INVALID");
  }
  const result = {
    schemaVersion: "alice.provider-replay-evidence.v1",
    ok: true,
    mutationDisabled: true,
    release: {
      sourceSha: admission.sourceSha,
      buildRunId: admission.buildRunId,
      runtimeImage: admission.runtimeImage,
      runtimeBuildManifestSha256: admission.runtimeBuildManifestSha256,
      releaseEpoch: Number(process.env.ALICE_RELEASE_EPOCH),
      modalRevision: Number(process.env.ALICE_MODAL_REVISION),
      policyHash: process.env.ALICE_POLICY_HASH,
    },
    workerArtifact: {
      name: artifactRecord.name,
      digest: artifactRecord.digest,
      exactOne: true,
    },
    owner: {
      email: "alice-owner@rndrntwrk.com",
      emailSha256: ownerHash,
    },
    providerState: {
      identical: providerComparison.identical,
      sha256: providerComparison.stateSha256,
      beforeRawEvidence: before.rawEvidence,
      afterRawEvidence: after.rawEvidence,
    },
    materialization: {
      deploymentManifest: fileMetric(manifestPath),
      programAdmission: fileMetric(admissionPath),
      workerBundleArtifact: fileMetric(workerArtifactPath),
      wranglerConfigs: Object.fromEntries(
        ["access", "control", "aiGateway"].map((role, index) => [
          role,
          fileMetric(configPaths[index]),
        ]),
      ),
    },
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(result)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputPath,
    providerStateSha256: providerComparison.stateSha256,
    deploymentManifestSha256: result.materialization.deploymentManifest.sha256,
  })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
