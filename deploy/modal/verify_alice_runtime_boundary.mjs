import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXACT_CONFIGURED_PLUGINS = [
  "alice-production-response-only",
  "@elizaos/plugin-sql",
  "@elizaos/plugin-openai",
];
const FULL_CORE_COMPOSITION = [
  "bridge:eliza",
  "capabilities:basic",
  "security:core-hooks",
  "memory:sql",
  "skills:agent-skills",
  "hooks:eliza",
  "connectors:eliza",
];
const FULL_REQUIRED_CONFIGURED_PLUGINS = [
  "eliza",
  "@elizaos/plugin-sql",
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-openai",
];
const FULL_REQUIRED_RUNTIME_PLUGINS = [
  "@elizaos/plugin-agent-skills",
  "basic-capabilities",
  "core-security-hooks",
  "eliza",
  "openai",
  "sql",
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
  const fullGated = proof?.schemaVersion === "alice.full-runtime-boundary-proof.v1";
  if (
    !proof ||
    typeof proof !== "object" ||
    proof.authorityMode !== "proposer-only" ||
    (fullGated
      ? proof.runtimeProfile !== "full-gated" ||
        proof.bridgePlugin !== "eliza" ||
        proof.actionPlanning !== true ||
        !exactArray(proof.coreComposition, FULL_CORE_COMPOSITION) ||
        !exactArray(
          proof.requiredConfiguredPluginPackages,
          FULL_REQUIRED_CONFIGURED_PLUGINS,
        ) ||
        !exactArray(
          proof.requiredRuntimePluginNames,
          FULL_REQUIRED_RUNTIME_PLUGINS,
        )
      : proof.schemaVersion !== "alice.runtime-boundary-proof.v1" ||
        proof.actionExecution !== "disabled" ||
        proof.actionPlanning !== false ||
        proof.backgroundAuthorityWorkers !== "absent" ||
        !exactArray(proof.configuredPluginPackages, EXACT_CONFIGURED_PLUGINS) ||
        !exactRuntimePluginClosure(proof.runtimePluginNames) ||
        !exactArray(proof.actionNames, []) ||
        !exactArray(proof.evaluatorNames, []) ||
        !exactArray(proof.serviceTypes, []) ||
        !exactArray(proof.taskWorkerNames, []))
  ) {
    throw new Error("Alice runtime boundary proof is not the exact reviewed closure");
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
    !/^sha256:[a-f0-9]{64}$/.test(release.capabilityBomSha256 ?? "") ||
    !/^sha256:[a-f0-9]{64}$/.test(release.deploymentManifestSha256 ?? "") ||
    !/^[a-f0-9]{40}$/.test(release.elizaCommit ?? "") ||
    !Number.isInteger(release.runtimeRevision) ||
    release.runtimeRevision < 49
  ) {
    throw new Error("Alice runtime release identity is invalid");
  }
  for (const [field, expected] of Object.entries(expectedRelease)) {
    if (expected && release[field] !== expected) {
      throw new Error(`Alice runtime release identity mismatch: ${field}`);
    }
  }
  if (fullGated) {
    return {
      ok: true,
      runtimeProfile: "full-gated",
      coreMarkerCount: FULL_CORE_COMPOSITION.length,
      releaseDigest: release.releaseDigest,
      capabilityBomSha256: release.capabilityBomSha256,
    };
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
      capabilityBomSha256: process.env.EXPECTED_CAPABILITY_BOM_SHA256,
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
