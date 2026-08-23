import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_RUNTIME_PATHS = Object.freeze([
  "milady.mjs",
  "deploy/modal/write_alice_runtime_build_manifest.mjs",
  "deploy/modal/verify_alice_runtime_build_manifest.mjs",
  "eliza/packages/app-core/scripts/docker-entrypoint.sh",
  "node_modules/@miladyai/agent/src/api/alice-production-chat.ts",
  "node_modules/@miladyai/agent/src/api/alice-production-proof.ts",
  "node_modules/@miladyai/agent/src/runtime/alice-production-plugin-policy.ts",
]);

const COMMIT = /^[a-f0-9]{40}$/;

function fileDigest(absolutePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex")}`;
}

export function buildAliceRuntimeBuildManifest({ root, sourceCommit, elizaCommit }) {
  if (!COMMIT.test(sourceCommit) || !COMMIT.test(elizaCommit)) {
    throw new Error("ALICE_RUNTIME_BUILD_IDENTITY_INVALID");
  }
  const canonicalRoot = fs.realpathSync(root);
  const runtimePaths = REQUIRED_RUNTIME_PATHS.map((relativePath) => {
    const absolutePath = fs.realpathSync(path.join(canonicalRoot, relativePath));
    if (!absolutePath.startsWith(`${canonicalRoot}${path.sep}`)) {
      throw new Error("ALICE_RUNTIME_BUILD_PATH_ESCAPE");
    }
    if (!fs.statSync(absolutePath).isFile()) {
      throw new Error("ALICE_RUNTIME_BUILD_PATH_INVALID");
    }
    return {
      path: `/app/${relativePath}`,
      sha256: fileDigest(absolutePath),
    };
  });
  return {
    schemaVersion: "alice.runtime-build-manifest.v1",
    sourceCommit,
    elizaCommit,
    runtimePaths,
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const root = process.env.ALICE_BUILD_ROOT || "/app";
    const manifest = buildAliceRuntimeBuildManifest({
      root,
      sourceCommit: process.env.REVISION || "",
      elizaCommit: process.env.ELIZA_REVISION || "",
    });
    const outputPath = path.join(root, "alice-runtime-build-manifest.json");
    fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o444,
    });
    process.stdout.write(`${outputPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
