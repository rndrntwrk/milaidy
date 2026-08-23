import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertAliceWorkerBundleArtifactMatchesDeploymentManifest,
  buildAliceWorkerBundleArtifact,
  serializeAliceWorkerBundleArtifact,
  verifyAliceWorkerBundleArtifact,
} from "./alice_worker_bundle_artifact.mjs";

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-worker-artifact."));
  for (const worker of [
    "alice-access-gateway",
    "alice-production-control",
    "alice-ai-gateway",
  ]) {
    fs.mkdirSync(path.join(root, worker));
    fs.writeFileSync(path.join(root, worker, "index.js"), `${worker}\n`);
  }
  return root;
}

test("creates and verifies one canonical lockfile-built Worker artifact", () => {
  const root = fixtureRoot();
  try {
    const artifact = buildAliceWorkerBundleArtifact({
      root,
      sourceCommit: "1".repeat(40),
      wranglerVersion: "4.122.0",
    });
    const serialized = serializeAliceWorkerBundleArtifact(artifact);
    assert.deepEqual(
      verifyAliceWorkerBundleArtifact(serialized, {
        root,
        expectedSourceCommit: "1".repeat(40),
      }),
      artifact,
    );
    assert.equal(artifact.bundles.access.path, "alice-access-gateway/index.js");
    assert.match(artifact.bundles.access.sha256, /^sha256:[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects substituted bytes, source identity, or Wrangler identity", () => {
  const root = fixtureRoot();
  try {
    const serialized = serializeAliceWorkerBundleArtifact(
      buildAliceWorkerBundleArtifact({
        root,
        sourceCommit: "1".repeat(40),
        wranglerVersion: "4.122.0",
      }),
    );
    fs.appendFileSync(path.join(root, "alice-access-gateway/index.js"), "changed\n");
    assert.throws(
      () =>
        verifyAliceWorkerBundleArtifact(serialized, {
          root,
          expectedSourceCommit: "1".repeat(40),
        }),
      /ALICE_WORKER_BUNDLE_ARTIFACT_INVALID/,
    );
    assert.throws(
      () =>
        buildAliceWorkerBundleArtifact({
          root,
          sourceCommit: "2".repeat(40),
          wranglerVersion: "4.125.0",
        }),
      /ALICE_WORKER_BUNDLE_ARTIFACT_INVALID/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("binds artifact source and all three bundle bytes to the signed manifest", () => {
  const root = fixtureRoot();
  try {
    const artifact = buildAliceWorkerBundleArtifact({
      root,
      sourceCommit: "1".repeat(40),
      wranglerVersion: "4.122.0",
    });
    const serialized = serializeAliceWorkerBundleArtifact(artifact);
    const manifest = {
      source: { sourceCommit: "1".repeat(40) },
      cloudflare: {
        accessWorkerBundleSha256: artifact.bundles.access.sha256,
        controlWorkerBundleSha256: artifact.bundles.control.sha256,
        aiGatewayWorkerBundleSha256: artifact.bundles.aiGateway.sha256,
      },
    };
    assert.deepEqual(
      assertAliceWorkerBundleArtifactMatchesDeploymentManifest({
        serializedArtifact: serialized,
        artifactRoot: root,
        manifest,
      }),
      artifact,
    );
    assert.throws(
      () =>
        assertAliceWorkerBundleArtifactMatchesDeploymentManifest({
          serializedArtifact: serialized,
          artifactRoot: root,
          manifest: {
            ...manifest,
            cloudflare: {
              ...manifest.cloudflare,
              controlWorkerBundleSha256: `sha256:${"f".repeat(64)}`,
            },
          },
        }),
      /ALICE_WORKER_BUNDLE_MANIFEST_MISMATCH/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
