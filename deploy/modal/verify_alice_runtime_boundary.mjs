import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXACT_CONFIGURED_PLUGINS = [
  "alice-production-response-only",
  "@elizaos/plugin-sql",
  "@elizaos/plugin-openai",
];

function exactArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function exactRuntimePluginClosure(names) {
  if (
    !Array.isArray(names) ||
    names.length !== 5 ||
    names.some((name) => typeof name !== "string")
  ) {
    return false;
  }
  const unique = [...new Set(names)];
  const sql = unique.filter((name) => name === "sql" || name === "@elizaos/plugin-sql");
  const openai = unique.filter(
    (name) => name === "openai" || name === "@elizaos/plugin-openai",
  );
  return (
    unique.length === 5 &&
    unique.includes("alice-production-response-only") &&
    unique.includes("basic-capabilities") &&
    unique.includes("core-security-hooks") &&
    sql.length === 1 &&
    openai.length === 1
  );
}

export function verifyAliceRuntimeBoundary(proof, expectedRelease = {}) {
  if (
    !proof ||
    typeof proof !== "object" ||
    proof.schemaVersion !== "alice.runtime-boundary-proof.v1" ||
    proof.authorityMode !== "proposer-only" ||
    proof.actionExecution !== "disabled" ||
    proof.actionPlanning !== false ||
    proof.backgroundAuthorityWorkers !== "absent" ||
    !exactArray(proof.configuredPluginPackages, EXACT_CONFIGURED_PLUGINS) ||
    !exactRuntimePluginClosure(proof.runtimePluginNames) ||
    !exactArray(proof.actionNames, []) ||
    !exactArray(proof.evaluatorNames, []) ||
    !exactArray(proof.serviceTypes, []) ||
    !exactArray(proof.taskWorkerNames, [])
  ) {
    throw new Error("Alice runtime boundary proof is not the exact response-only closure");
  }
  const release = proof.release;
  if (
    !release ||
    !/^sha256:[a-f0-9]{64}$/.test(release.programDigest ?? "") ||
    !/^sha256:[a-f0-9]{64}$/.test(release.releaseDigest ?? "") ||
    !/^sha256:[a-f0-9]{64}$/.test(release.policyHash ?? "") ||
    !/^[a-f0-9]{40}$/.test(release.sourceCommit ?? "") ||
    !/^[a-f0-9]{40}$/.test(release.deploymentControllerCommit ?? "") ||
    !/^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/.test(
      release.runtimeImage ?? "",
    ) ||
    !/^sha256:[a-f0-9]{64}$/.test(
      release.runtimeBuildManifestSha256 ?? "",
    ) ||
    !/^sha256:[a-f0-9]{64}$/.test(release.deploymentManifestSha256 ?? "") ||
    !/^[a-f0-9]{40}$/.test(release.elizaCommit ?? "") ||
    !Number.isInteger(release.modalRevision) ||
    release.modalRevision < 49
  ) {
    throw new Error("Alice runtime release identity is invalid");
  }
  for (const [field, expected] of Object.entries(expectedRelease)) {
    if (expected && release[field] !== expected) {
      throw new Error(`Alice runtime release identity mismatch: ${field}`);
    }
  }
  return {
    ok: true,
    pluginCount: proof.runtimePluginNames.length,
    actionCount: 0,
    evaluatorCount: 0,
    serviceTypeCount: 0,
    taskWorkerCount: 0,
    releaseDigest: release.releaseDigest,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  try {
    const proof = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedRelease = {
      sourceCommit: process.env.EXPECTED_SOURCE_COMMIT,
      deploymentControllerCommit:
        process.env.EXPECTED_DEPLOYMENT_CONTROLLER_COMMIT,
      runtimeImage: process.env.EXPECTED_RUNTIME_IMAGE,
      runtimeBuildManifestSha256:
        process.env.EXPECTED_RUNTIME_BUILD_MANIFEST_SHA256,
      deploymentManifestSha256: process.env.EXPECTED_DEPLOYMENT_MANIFEST_SHA256,
      elizaCommit: process.env.EXPECTED_ELIZA_COMMIT,
    };
    process.stdout.write(
      `${JSON.stringify(verifyAliceRuntimeBoundary(proof, expectedRelease))}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
