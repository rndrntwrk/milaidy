import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";

const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const WRANGLER_VERSION = "4.122.0";
const verifiedArtifacts = new WeakSet();
const BUNDLES = Object.freeze({
  access: Object.freeze({
    path: "alice-access-gateway/index.js",
    manifestField: "accessWorkerBundleSha256",
  }),
  control: Object.freeze({
    path: "alice-production-control/index.js",
    manifestField: "controlWorkerBundleSha256",
  }),
  aiGateway: Object.freeze({
    path: "alice-ai-gateway/index.js",
    manifestField: "aiGatewayWorkerBundleSha256",
  }),
  statePlane: Object.freeze({
    path: "alice-state-plane/index.js",
    manifestField: "statePlaneWorkerBundleSha256",
  }),
  connectorPlane: Object.freeze({
    path: "alice-connector-plane/index.js",
    manifestField: "connectorPlaneWorkerBundleSha256",
  }),
});
const MIGRATIONS = Object.freeze([
  "alice-state-plane/migrations/0001_alice_state.sql",
  "alice-state-plane/migrations/0002_execution_records.sql",
  "alice-state-plane/migrations/0003_eliza_database.sql",
]);

function artifactInvalid() {
  throw new Error("ALICE_WORKER_BUNDLE_ARTIFACT_INVALID");
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function digestFile(filePath) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex")}`;
}

function bundleFile(root, relativePath) {
  if (typeof root !== "string" || !path.isAbsolute(root)) artifactInvalid();
  const candidate = path.join(root, relativePath);
  if (path.relative(root, candidate) !== relativePath) artifactInvalid();
  let stat;
  try {
    stat = fs.lstatSync(candidate);
  } catch {
    artifactInvalid();
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    artifactInvalid();
  }
  return candidate;
}

function validateMigrationDirectory(root) {
  if (typeof root !== "string" || !path.isAbsolute(root)) artifactInvalid();
  const relativeDirectory = path.dirname(MIGRATIONS[0]);
  const directory = path.join(root, relativeDirectory);
  let stat;
  let entries;
  try {
    stat = fs.lstatSync(directory);
    entries = fs.readdirSync(directory).sort();
  } catch {
    artifactInvalid();
  }
  const expected = MIGRATIONS.map((migrationPath) =>
    path.basename(migrationPath)
  ).sort();
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    JSON.stringify(entries) !== JSON.stringify(expected)
  ) {
    artifactInvalid();
  }
}

function validArtifactShape(value) {
  return (
    exactKeys(value, [
      "schemaVersion",
      "sourceCommit",
      "wranglerVersion",
      "bundles",
      "migrations",
    ]) &&
    value.schemaVersion === "alice.worker-bundle-artifact.v2" &&
    COMMIT.test(value.sourceCommit ?? "") &&
    value.wranglerVersion === WRANGLER_VERSION &&
    exactKeys(value.bundles, Object.keys(BUNDLES)) &&
    Object.entries(BUNDLES).every(([role, expected]) =>
      exactKeys(value.bundles[role], ["path", "sha256"]) &&
      value.bundles[role].path === expected.path &&
      DIGEST.test(value.bundles[role].sha256 ?? ""),
    ) &&
    Array.isArray(value.migrations) &&
    value.migrations.length === MIGRATIONS.length &&
    value.migrations.every(
      (migration, index) =>
        exactKeys(migration, ["path", "sha256"]) &&
        migration.path === MIGRATIONS[index] &&
        DIGEST.test(migration.sha256 ?? ""),
    )
  );
}

export function buildAliceWorkerBundleArtifact({
  root,
  sourceCommit,
  wranglerVersion,
}) {
  if (
    !COMMIT.test(sourceCommit ?? "") ||
    wranglerVersion !== WRANGLER_VERSION
  ) {
    artifactInvalid();
  }
  const bundles = {};
  for (const [role, expected] of Object.entries(BUNDLES)) {
    bundles[role] = {
      path: expected.path,
      sha256: digestFile(bundleFile(root, expected.path)),
    };
  }
  validateMigrationDirectory(root);
  return {
    schemaVersion: "alice.worker-bundle-artifact.v2",
    sourceCommit,
    wranglerVersion,
    bundles,
    migrations: MIGRATIONS.map((migrationPath) => ({
      path: migrationPath,
      sha256: digestFile(bundleFile(root, migrationPath)),
    })),
  };
}

export function serializeAliceWorkerBundleArtifact(artifact) {
  if (!validArtifactShape(artifact)) artifactInvalid();
  return `${canonicalAliceJson(artifact)}\n`;
}

export function verifyAliceWorkerBundleArtifact(
  serializedArtifact,
  { root, expectedSourceCommit },
) {
  if (
    typeof serializedArtifact !== "string" ||
    !serializedArtifact.endsWith("\n") ||
    serializedArtifact.endsWith("\n\n")
  ) {
    artifactInvalid();
  }
  let artifact;
  try {
    artifact = JSON.parse(serializedArtifact);
  } catch {
    artifactInvalid();
  }
  if (
    !validArtifactShape(artifact) ||
    serializeAliceWorkerBundleArtifact(artifact) !== serializedArtifact ||
    artifact.sourceCommit !== expectedSourceCommit
  ) {
    artifactInvalid();
  }
  for (const [role, expected] of Object.entries(BUNDLES)) {
    if (
      digestFile(bundleFile(root, expected.path)) !==
        artifact.bundles[role].sha256
    ) {
      artifactInvalid();
    }
  }
  validateMigrationDirectory(root);
  for (const migration of artifact.migrations) {
    if (
      digestFile(bundleFile(root, migration.path)) !== migration.sha256
    ) {
      artifactInvalid();
    }
  }
  verifiedArtifacts.add(artifact);
  return artifact;
}

export function aliceWorkerBundleDigests(artifact) {
  if (!verifiedArtifacts.has(artifact) || !validArtifactShape(artifact)) {
    artifactInvalid();
  }
  return Object.fromEntries(
    Object.entries(artifact.bundles).map(([role, bundle]) => [
      role,
      bundle.sha256,
    ]),
  );
}

export function aliceWorkerMigrationSetDigest(artifact) {
  if (!verifiedArtifacts.has(artifact) || !validArtifactShape(artifact)) {
    artifactInvalid();
  }
  return `sha256:${crypto
    .createHash("sha256")
    .update(canonicalAliceJson(artifact.migrations))
    .digest("hex")}`;
}

export function assertAliceWorkerBundleArtifactMatchesDeploymentManifest({
  serializedArtifact,
  artifactRoot,
  manifest,
}) {
  let artifact;
  try {
    artifact = verifyAliceWorkerBundleArtifact(serializedArtifact, {
      root: artifactRoot,
      expectedSourceCommit: manifest?.source?.sourceCommit,
    });
  } catch {
    throw new Error("ALICE_WORKER_BUNDLE_MANIFEST_MISMATCH");
  }
  for (const [role, expected] of Object.entries(BUNDLES)) {
    if (
      manifest?.cloudflare?.[expected.manifestField] !==
        artifact.bundles[role].sha256
    ) {
      throw new Error("ALICE_WORKER_BUNDLE_MANIFEST_MISMATCH");
    }
  }
  if (
    manifest?.cloudflare?.stateMigrationSetSha256 !==
      aliceWorkerMigrationSetDigest(artifact)
  ) {
    throw new Error("ALICE_WORKER_BUNDLE_MANIFEST_MISMATCH");
  }
  return artifact;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const root = process.env.ALICE_WORKER_BUNDLE_ROOT;
    const outputPath = process.env.ALICE_WORKER_BUNDLE_ARTIFACT_PATH;
    if (
      !root ||
      !path.isAbsolute(root) ||
      !outputPath ||
      !path.isAbsolute(outputPath) ||
      path.dirname(outputPath) !== root
    ) {
      artifactInvalid();
    }
    const artifact = buildAliceWorkerBundleArtifact({
      root,
      sourceCommit: process.env.ALICE_SOURCE_COMMIT,
      wranglerVersion: process.env.ALICE_WRANGLER_VERSION,
    });
    fs.writeFileSync(
      outputPath,
      serializeAliceWorkerBundleArtifact(artifact),
      { encoding: "utf8", mode: 0o444, flag: "wx" },
    );
    process.stdout.write(
      `${JSON.stringify({ ok: true, outputPath, sourceCommit: artifact.sourceCommit })}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
