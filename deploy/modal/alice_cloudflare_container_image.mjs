import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";

const ACCOUNT_ID = "036df6c823669b8fa2f66cf4c16eeb29";
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SOURCE_IMAGE =
  /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/;
const RUNTIME_IMAGE = new RegExp(
  `^registry\\.cloudflare\\.com/${ACCOUNT_ID}/alice-runtime@sha256:[a-f0-9]{64}$`,
);
const TAG = /^alice-[a-f0-9]{12}-[1-9][0-9]*-[1-9][0-9]*$/;
const KEYS = [
  "accountId",
  "buildReusedWithoutRebuild",
  "capabilityBomSha256",
  "observedAt",
  "registryReadbackVerified",
  "runtimeBuildManifestSha256",
  "runtimeDigest",
  "runtimeImage",
  "runtimeRevision",
  "schemaVersion",
  "sourceCommit",
  "sourceDigest",
  "sourceImage",
  "tag",
];

function invalid() {
  throw new Error("ALICE_CLOUDFLARE_CONTAINER_IMAGE_INVALID");
}

function exactKeys(value, keys) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
      JSON.stringify(Object.keys(value).sort()) ===
        JSON.stringify([...keys].sort()),
  );
}

function canonicalTimestamp(value) {
  try {
    return typeof value === "string" && new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function verifyAliceCloudflareContainerImageEvidence(value) {
  if (
    !exactKeys(value, KEYS) ||
    value.schemaVersion !== "alice.cloudflare-container-image.v1" ||
    value.accountId !== ACCOUNT_ID ||
    !canonicalTimestamp(value.observedAt) ||
    !COMMIT.test(value.sourceCommit ?? "") ||
    !SOURCE_IMAGE.test(value.sourceImage ?? "") ||
    !DIGEST.test(value.sourceDigest ?? "") ||
    value.sourceImage !== `ghcr.io/rndrntwrk/milaidy-agent@${value.sourceDigest}` ||
    !RUNTIME_IMAGE.test(value.runtimeImage ?? "") ||
    !DIGEST.test(value.runtimeDigest ?? "") ||
    value.runtimeImage !==
      `registry.cloudflare.com/${ACCOUNT_ID}/alice-runtime@${value.runtimeDigest}` ||
    !Number.isSafeInteger(value.runtimeRevision) ||
    value.runtimeRevision < 49 ||
    !DIGEST.test(value.runtimeBuildManifestSha256 ?? "") ||
    !DIGEST.test(value.capabilityBomSha256 ?? "") ||
    !TAG.test(value.tag ?? "") ||
    !value.tag.startsWith(`alice-${value.sourceCommit.slice(0, 12)}-`) ||
    value.registryReadbackVerified !== true ||
    value.buildReusedWithoutRebuild !== true
  ) {
    invalid();
  }
  return value;
}

export function buildAliceCloudflareContainerImageEvidence(inputs) {
  return verifyAliceCloudflareContainerImageEvidence({
    schemaVersion: "alice.cloudflare-container-image.v1",
    accountId: ACCOUNT_ID,
    observedAt: inputs.observedAt ?? new Date().toISOString(),
    sourceCommit: inputs.sourceCommit,
    sourceImage: inputs.sourceImage,
    sourceDigest: inputs.sourceImage?.slice(inputs.sourceImage.lastIndexOf("@") + 1),
    runtimeImage: inputs.runtimeImage,
    runtimeDigest: inputs.runtimeImage?.slice(inputs.runtimeImage.lastIndexOf("@") + 1),
    runtimeRevision: inputs.runtimeRevision,
    runtimeBuildManifestSha256: inputs.runtimeBuildManifestSha256,
    capabilityBomSha256: inputs.capabilityBomSha256,
    tag: inputs.tag,
    registryReadbackVerified: true,
    buildReusedWithoutRebuild: true,
  });
}

function writeReadonly(filePath, value) {
  if (
    typeof filePath !== "string" || !path.isAbsolute(filePath) ||
    !fs.existsSync(path.dirname(filePath))
  ) invalid();
  fs.writeFileSync(filePath, `${canonicalAliceJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

function main() {
  const evidence = buildAliceCloudflareContainerImageEvidence({
    sourceCommit: process.env.ALICE_SOURCE_COMMIT,
    sourceImage: process.env.ALICE_SOURCE_RUNTIME_IMAGE,
    runtimeImage: process.env.ALICE_CLOUDFLARE_RUNTIME_IMAGE,
    runtimeRevision: Number(process.env.ALICE_RUNTIME_REVISION),
    runtimeBuildManifestSha256:
      process.env.ALICE_RUNTIME_BUILD_MANIFEST_SHA256,
    capabilityBomSha256: process.env.ALICE_CAPABILITY_BOM_SHA256,
    tag: process.env.ALICE_CLOUDFLARE_RUNTIME_TAG,
  });
  writeReadonly(process.env.ALICE_CONTAINER_IMAGE_EVIDENCE_PATH, evidence);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    runtimeImage: evidence.runtimeImage,
    runtimeRevision: evidence.runtimeRevision,
  })}\n`);
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
