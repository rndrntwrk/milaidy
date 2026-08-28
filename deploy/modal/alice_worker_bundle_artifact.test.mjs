import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertAliceWorkerBundleArtifactMatchesDeploymentManifest,
  aliceWorkerMigrationSetDigest,
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
    "alice-state-plane",
    "alice-connector-plane",
  ]) {
    fs.mkdirSync(path.join(root, worker));
    fs.writeFileSync(path.join(root, worker, "index.js"), `${worker}\n`);
  }
  const migrationsRoot = path.join(root, "alice-state-plane", "migrations");
  fs.mkdirSync(migrationsRoot);
  for (const migration of [
    "0001_alice_state.sql",
    "0002_execution_records.sql",
    "0003_eliza_database.sql",
  ]) {
    fs.writeFileSync(
      path.join(migrationsRoot, migration),
      `-- ${migration}\nSELECT 1;\n`,
    );
  }
  return root;
}

test("creates and verifies one canonical five-Worker artifact with ordered state migrations", () => {
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
    assert.deepEqual(Object.keys(artifact.bundles), [
      "access",
      "control",
      "aiGateway",
      "statePlane",
      "connectorPlane",
    ]);
    assert.equal(artifact.bundles.access.path, "alice-access-gateway/index.js");
    assert.match(artifact.bundles.access.sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(
      artifact.bundles.statePlane.path,
      "alice-state-plane/index.js",
    );
    assert.equal(
      artifact.bundles.connectorPlane.path,
      "alice-connector-plane/index.js",
    );
    assert.deepEqual(
      artifact.migrations.map(({ path: migrationPath }) => migrationPath),
      [
        "alice-state-plane/migrations/0001_alice_state.sql",
        "alice-state-plane/migrations/0002_execution_records.sql",
        "alice-state-plane/migrations/0003_eliza_database.sql",
      ],
    );
    for (const migration of artifact.migrations) {
      assert.match(migration.sha256, /^sha256:[a-f0-9]{64}$/);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects substituted bundle or migration bytes, source identity, or Wrangler identity", () => {
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
    const freshSerialized = serializeAliceWorkerBundleArtifact(
      buildAliceWorkerBundleArtifact({
        root,
        sourceCommit: "1".repeat(40),
        wranglerVersion: "4.122.0",
      }),
    );
    fs.appendFileSync(
      path.join(
        root,
        "alice-state-plane",
        "migrations",
        "0002_execution_records.sql",
      ),
      "-- changed\n",
    );
    assert.throws(
      () =>
        verifyAliceWorkerBundleArtifact(freshSerialized, {
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

test("rejects missing, extra, substituted, or reordered release members", () => {
  const root = fixtureRoot();
  try {
    const artifact = buildAliceWorkerBundleArtifact({
      root,
      sourceCommit: "1".repeat(40),
      wranglerVersion: "4.122.0",
    });
    const extraMigration = path.join(
      root,
      "alice-state-plane",
      "migrations",
      "0004_unsigned.sql",
    );
    fs.writeFileSync(extraMigration, "SELECT 4;\n");
    assert.throws(
      () => buildAliceWorkerBundleArtifact({
        root,
        sourceCommit: "1".repeat(40),
        wranglerVersion: "4.122.0",
      }),
      /ALICE_WORKER_BUNDLE_ARTIFACT_INVALID/,
    );
    fs.rmSync(extraMigration);
    for (const changed of [
      {
        ...artifact,
        bundles: Object.fromEntries(
          Object.entries(artifact.bundles).filter(([role]) => role !== "statePlane"),
        ),
      },
      {
        ...artifact,
        bundles: { ...artifact.bundles, extra: artifact.bundles.access },
      },
      {
        ...artifact,
        bundles: {
          ...artifact.bundles,
          connectorPlane: artifact.bundles.statePlane,
        },
      },
      { ...artifact, migrations: [...artifact.migrations].reverse() },
      { ...artifact, migrations: artifact.migrations.slice(0, 2) },
    ]) {
      assert.throws(
        () => serializeAliceWorkerBundleArtifact(changed),
        /ALICE_WORKER_BUNDLE_ARTIFACT_INVALID/,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("binds artifact source, five bundle bytes, and migration set to the signed manifest", () => {
  const root = fixtureRoot();
  try {
    const artifact = buildAliceWorkerBundleArtifact({
      root,
      sourceCommit: "1".repeat(40),
      wranglerVersion: "4.122.0",
    });
    const serialized = serializeAliceWorkerBundleArtifact(artifact);
    const verifiedArtifact = verifyAliceWorkerBundleArtifact(serialized, {
      root,
      expectedSourceCommit: "1".repeat(40),
    });
    const manifest = {
      source: { sourceCommit: "1".repeat(40) },
      cloudflare: {
        accessWorkerBundleSha256: artifact.bundles.access.sha256,
        controlWorkerBundleSha256: artifact.bundles.control.sha256,
        aiGatewayWorkerBundleSha256: artifact.bundles.aiGateway.sha256,
        statePlaneWorkerBundleSha256: artifact.bundles.statePlane.sha256,
        connectorPlaneWorkerBundleSha256:
          artifact.bundles.connectorPlane.sha256,
        stateMigrationSetSha256:
          aliceWorkerMigrationSetDigest(verifiedArtifact),
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
