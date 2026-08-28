import assert from "node:assert/strict";
import test from "node:test";

import { verifyAliceRuntimeBoundary } from "./verify_alice_runtime_boundary.mjs";

const safeProof = {
  schemaVersion: "alice.runtime-boundary-proof.v1",
  authorityMode: "proposer-only",
  actionExecution: "disabled",
  actionPlanning: false,
  backgroundAuthorityWorkers: "absent",
  configuredPluginPackages: [
    "alice-production-response-only",
    "@elizaos/plugin-sql",
    "@elizaos/plugin-openai",
  ],
  runtimePluginNames: [
    "alice-production-response-only",
    "basic-capabilities",
    "core-security-hooks",
    "openai",
    "sql",
  ],
  actionNames: [],
  evaluatorNames: [],
  serviceTypes: [],
  taskWorkerNames: [],
  release: {
    programDigest: `sha256:${"1".repeat(64)}`,
    releaseDigest: `sha256:${"2".repeat(64)}`,
    policyHash: `sha256:${"3".repeat(64)}`,
    sourceCommit: "4".repeat(40),
    deploymentControllerCommit: "7".repeat(40),
    runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"5".repeat(64)}`,
    runtimeBuildManifestSha256: `sha256:${"8".repeat(64)}`,
    capabilityBomSha256: `sha256:${"a".repeat(64)}`,
    deploymentManifestSha256: `sha256:${"9".repeat(64)}`,
    elizaCommit: "6".repeat(40),
    modalRevision: 49,
  },
};

test("accepts only the exact post-init response-only closure", () => {
  assert.deepEqual(verifyAliceRuntimeBoundary(safeProof, {
    sourceCommit: safeProof.release.sourceCommit,
    deploymentControllerCommit: safeProof.release.deploymentControllerCommit,
    runtimeImage: safeProof.release.runtimeImage,
    runtimeBuildManifestSha256: safeProof.release.runtimeBuildManifestSha256,
    deploymentManifestSha256: safeProof.release.deploymentManifestSha256,
    elizaCommit: safeProof.release.elizaCommit,
  }), {
    ok: true,
    pluginCount: 5,
    actionCount: 0,
    evaluatorCount: 0,
    serviceTypeCount: 0,
    taskWorkerCount: 0,
    releaseDigest: safeProof.release.releaseDigest,
  });
});

test("accepts the exact full-gated proof core markers and capability digest", () => {
  const proof = {
    schemaVersion: "alice.full-runtime-boundary-proof.v1",
    authorityMode: "proposer-only",
    runtimeProfile: "full-gated",
    bridgePlugin: "eliza",
    actionPlanning: true,
    coreComposition: [
      "bridge:eliza",
      "capabilities:basic",
      "security:core-hooks",
      "memory:sql",
      "skills:agent-skills",
      "hooks:eliza",
      "connectors:eliza",
    ],
    requiredConfiguredPluginPackages: [
      "eliza",
      "@elizaos/plugin-sql",
      "@elizaos/plugin-agent-skills",
      "@elizaos/plugin-openai",
    ],
    requiredRuntimePluginNames: [
      "@elizaos/plugin-agent-skills",
      "basic-capabilities",
      "core-security-hooks",
      "eliza",
      "openai",
      "sql",
    ],
    release: safeProof.release,
  };
  assert.deepEqual(
    verifyAliceRuntimeBoundary(proof, {
      capabilityBomSha256: safeProof.release.capabilityBomSha256,
    }),
    {
      ok: true,
      runtimeProfile: "full-gated",
      coreMarkerCount: 7,
      releaseDigest: safeProof.release.releaseDigest,
      capabilityBomSha256: safeProof.release.capabilityBomSha256,
    },
  );
  assert.throws(() =>
    verifyAliceRuntimeBoundary({
      ...proof,
      coreComposition: [...proof.coreComposition, "unreviewed:core"],
    }),
  );
});

test("rejects every unexpected plugin, action, worker, service, or release identity", () => {
  for (const candidate of [
    { ...safeProof, runtimePluginNames: [...safeProof.runtimePluginNames, "innocent-looking"] },
    {
      ...safeProof,
      runtimePluginNames: [
        "alice-production-response-only",
        "basic-capabilities",
        "basic-capabilities",
        "openai",
        "sql",
      ],
    },
    { ...safeProof, actionNames: ["REPLY"] },
    { ...safeProof, evaluatorNames: ["BACKGROUND_EVALUATOR"] },
    { ...safeProof, serviceTypes: ["AUTONOMY"] },
    { ...safeProof, taskWorkerNames: ["quiet-worker"] },
    { ...safeProof, release: { ...safeProof.release, runtimeImage: "latest" } },
    { ...safeProof, release: { ...safeProof.release, deploymentManifestSha256: "unbound" } },
  ]) {
    assert.throws(() => verifyAliceRuntimeBoundary(candidate));
  }
  assert.throws(() =>
    verifyAliceRuntimeBoundary(safeProof, { sourceCommit: "7".repeat(40) }),
  );
  assert.throws(() =>
    verifyAliceRuntimeBoundary(safeProof, {
      deploymentManifestSha256: `sha256:${"0".repeat(64)}`,
    }),
  );
});
