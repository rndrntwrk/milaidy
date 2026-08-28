import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { REQUIRED_RUNTIME_PATHS } from "./write_alice_runtime_build_manifest.mjs";

const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function digestBytes(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

export function verifyAliceRuntimeBuildManifest({
  root,
  expectedSourceCommit,
  expectedElizaCommit,
  expectedCapabilityBomSha256,
  expectedManifestSha256,
}) {
  if (
    !COMMIT.test(expectedSourceCommit) ||
    !COMMIT.test(expectedElizaCommit) ||
    !DIGEST.test(expectedCapabilityBomSha256) ||
    !DIGEST.test(expectedManifestSha256)
  ) {
    throw new Error("ALICE_RUNTIME_BUILD_EXPECTATION_INVALID");
  }
  const canonicalRoot = fs.realpathSync(root);
  const manifestPath = fs.realpathSync(
    path.join(canonicalRoot, "alice-runtime-build-manifest.json"),
  );
  if (!manifestPath.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error("ALICE_RUNTIME_BUILD_PATH_ESCAPE");
  }
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifestSha256 = digestBytes(manifestBytes);
  if (manifestSha256 !== expectedManifestSha256) {
    throw new Error("ALICE_RUNTIME_BUILD_MANIFEST_MISMATCH");
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    !exactKeys(manifest, [
      "schemaVersion",
      "sourceCommit",
      "elizaCommit",
      "capabilityBomSha256",
      "runtimePaths",
    ]) ||
    manifest.schemaVersion !== "alice.runtime-build-manifest.v1" ||
    manifest.sourceCommit !== expectedSourceCommit ||
    manifest.elizaCommit !== expectedElizaCommit ||
    manifest.capabilityBomSha256 !== expectedCapabilityBomSha256 ||
    !Array.isArray(manifest.runtimePaths) ||
    manifest.runtimePaths.length !== REQUIRED_RUNTIME_PATHS.length
  ) {
    throw new Error("ALICE_RUNTIME_BUILD_MANIFEST_INVALID");
  }
  for (const [index, relativePath] of REQUIRED_RUNTIME_PATHS.entries()) {
    const entry = manifest.runtimePaths[index];
    if (
      !exactKeys(entry, ["path", "sha256"]) ||
      entry.path !== `/app/${relativePath}` ||
      !DIGEST.test(entry.sha256)
    ) {
      throw new Error("ALICE_RUNTIME_BUILD_MANIFEST_INVALID");
    }
    const absolutePath = fs.realpathSync(path.join(canonicalRoot, relativePath));
    if (
      !absolutePath.startsWith(`${canonicalRoot}${path.sep}`) ||
      !fs.statSync(absolutePath).isFile() ||
      digestBytes(fs.readFileSync(absolutePath)) !== entry.sha256
    ) {
      throw new Error("ALICE_RUNTIME_BUILD_PATH_MISMATCH");
    }
  }
  return {
    ok: true,
    manifestSha256,
    sourceCommit: manifest.sourceCommit,
    elizaCommit: manifest.elizaCommit,
    capabilityBomSha256: manifest.capabilityBomSha256,
    runtimePathCount: manifest.runtimePaths.length,
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const result = verifyAliceRuntimeBuildManifest({
      root: process.env.ALICE_BUILD_ROOT || "/app",
      expectedSourceCommit: process.env.ALICE_SOURCE_COMMIT || "",
      expectedElizaCommit: process.env.ALICE_ELIZA_COMMIT || "",
      expectedCapabilityBomSha256:
        process.env.ALICE_CAPABILITY_BOM_SHA256 || "",
      expectedManifestSha256:
        process.env.ALICE_RUNTIME_BUILD_MANIFEST_SHA256 || "",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
