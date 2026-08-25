import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertReplayAdmission,
  buildProviderSnapshot,
  canonicalOwnerHash,
  compareProviderSnapshots,
} from "./alice-provider-replay-evidence.mjs";
import * as replayEvidence from "./alice-provider-replay-evidence.mjs";

const SOURCE_SHA = "52093d513e4ebe936c57cf021143b196d94e4874";
const BUILD_RUN_ID = "32789475047";
const ARTIFACT_NAME =
  `alice-worker-bundles-${SOURCE_SHA}-${BUILD_RUN_ID}-1`;
const ARTIFACT_DIGEST =
  "sha256:905cccf15329aac96dc97eb1740b34535052e38738e93029a5a088d220834220";
const RUNTIME_IMAGE =
  "ghcr.io/rndrntwrk/milaidy-agent@sha256:5346dd3c496deef230b0d6eada73043c575386b38c918f1034763676796fc299";
const RUNTIME_MANIFEST =
  "sha256:5850320fc429f4c6660808b285e82dc2973c8e2d2d41336acbfb241bacfe0ca2";

function cloudflareCredential(groupName = "Workers Scripts Read") {
  return {
    permissionGroups: {
      errors: [],
      messages: [],
      success: true,
      result: [
        {
          id: "a".repeat(32),
          name: groupName,
          scopes: ["com.cloudflare.api.account"],
        },
      ],
    },
    token: {
      errors: [],
      messages: [],
      success: true,
      result: {
        id: "b".repeat(32),
        status: "active",
        not_before: "2026-08-24T00:00:00Z",
        expires_on: "2026-08-30T23:59:59Z",
        policies: [
          {
            id: "c".repeat(32),
            effect: "allow",
            permission_groups: [{ id: "a".repeat(32) }],
            resources: {
              "com.cloudflare.api.account.036df6c823669b8fa2f66cf4c16eeb29":
                "*",
            },
          },
        ],
      },
    },
    verify: {
      errors: [],
      messages: [],
      success: true,
      result: { id: "b".repeat(32), status: "active" },
    },
  };
}

function snapshotInput(overrides = {}) {
  const materializer = {
    schemaVersion: "alice.cloudflare-provider-readback.v1",
    accountId: "036df6c823669b8fa2f66cf4c16eeb29",
    zoneId: "7b24984479ee4cddb6c5d8a9b7a0f2c6",
    observedAt: "2026-08-25T04:00:00.000Z",
    provider: {
      accessPolicyConfig: { ownerRule: "exact-email" },
      aiGatewayProviderConfig: { gateway: "alice-production" },
      continuityBootstrapConfig: { queueConsumers: 1 },
      continuityCandidateConfig: { queueConsumers: 1 },
    },
  };
  const modal = {
    appId: "ap-oFaCNy2jJDFalZienNB2Ht",
    appName: "alice-runtime",
    environment: "main",
    providerVersion: 48,
    providerHistory: [{ providerVersion: 48 }],
    functionIds: ["fu-test"],
    function: { webUrl: "https://rndrntwrk--alice.modal.run" },
    mountedSecretObjects: [{ id: "st-test", name: "alice-runtime" }],
    mountedVolumeIds: [],
    imageObjectIds: ["im-test"],
    autoscalerEnforcement: { status: "provider-unverifiable" },
  };
  return {
    cloudflareMaterializerBytes: Buffer.from(
      `${JSON.stringify(materializer)}\n`,
    ),
    cloudflareCredentialBytes: Buffer.from(
      `${JSON.stringify(cloudflareCredential())}\n`,
    ),
    modalBytes: Buffer.from(`${JSON.stringify(modal)}\n`),
    ...overrides,
  };
}

test("derives only the frozen canonical Alice owner hash", () => {
  const hash = canonicalOwnerHash("alice-owner@rndrntwrk.com");
  assert.match(hash, /^[A-Za-z0-9_-]{43}$/u);
  assert.throws(
    () => canonicalOwnerHash("gl4sspr1sm@gmail.com"),
    /ALICE_REPLAY_OWNER_INVALID/u,
  );
});

test("normalizes sanitized provider state and records every raw byte boundary", () => {
  const snapshot = buildProviderSnapshot(snapshotInput());
  assert.equal(snapshot.schemaVersion, "alice.provider-replay-snapshot.v1");
  assert.equal(snapshot.cloudflare.accountId, "036df6c823669b8fa2f66cf4c16eeb29");
  assert.equal(snapshot.cloudflare.observedAt, undefined);
  assert.match(snapshot.cloudflare.credential.tokenIdSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(snapshot.cloudflare.credential.permissionGroups, [
    {
      name: "Workers Scripts Read",
      scopes: ["com.cloudflare.api.account"],
    },
  ]);
  assert.equal(snapshot.rawEvidence.cloudflarePermissionCatalog.bytes > 0, true);
  assert.match(
    snapshot.rawEvidence.cloudflarePermissionCatalog.sha256,
    /^sha256:[a-f0-9]{64}$/u,
  );
  assert.equal(snapshot.rawEvidence.modal.bytes > 0, true);
});

test("rejects any Cloudflare replay credential with a write capability", () => {
  const credential = cloudflareCredential("Workers Scripts Write");
  assert.throws(
    () =>
      buildProviderSnapshot(
        snapshotInput({
          cloudflareCredentialBytes: Buffer.from(
            `${JSON.stringify(credential)}\n`,
          ),
        }),
      ),
    /ALICE_REPLAY_PROVIDER_PERMISSION_INVALID/u,
  );
});

test("before and after comparison is exact after deterministic normalization", () => {
  const before = buildProviderSnapshot(snapshotInput());
  const after = buildProviderSnapshot(snapshotInput());
  const result = compareProviderSnapshots(before, after);
  assert.equal(result.identical, true);
  assert.match(result.stateSha256, /^sha256:[a-f0-9]{64}$/u);

  const changed = structuredClone(after);
  changed.modal.providerVersion = 49;
  assert.throws(
    () => compareProviderSnapshots(before, changed),
    /ALICE_REPLAY_PROVIDER_STATE_CHANGED/u,
  );
});

test("Cloudflare core and Modal recovery snapshots remain separately comparable", () => {
  assert.equal(typeof replayEvidence.buildCloudflareReplaySnapshot, "function");
  assert.equal(typeof replayEvidence.buildModalReplaySnapshot, "function");
  assert.equal(typeof replayEvidence.compareCloudflareReplaySnapshots, "function");
  assert.equal(typeof replayEvidence.compareModalReplaySnapshots, "function");

  const input = snapshotInput();
  const cloudflare = replayEvidence.buildCloudflareReplaySnapshot({
    cloudflareMaterializerBytes: input.cloudflareMaterializerBytes,
    cloudflareCredentialBytes: input.cloudflareCredentialBytes,
  });
  assert.equal(cloudflare.schemaVersion, "alice.cloudflare-replay-snapshot.v1");
  assert.equal(Object.hasOwn(cloudflare, "modal"), false);
  assert.equal(
    replayEvidence.compareCloudflareReplaySnapshots(cloudflare, cloudflare)
      .identical,
    true,
  );

  const modalBefore = replayEvidence.buildModalReplaySnapshot(input.modalBytes);
  const modalAfterInput = JSON.parse(input.modalBytes.toString("utf8"));
  modalAfterInput.observedAt = "2026-08-25T05:00:00.000Z";
  const modalAfter = replayEvidence.buildModalReplaySnapshot(
    Buffer.from(`${JSON.stringify(modalAfterInput)}\n`),
  );
  assert.equal(modalBefore.schemaVersion, "alice.modal-replay-snapshot.v1");
  assert.equal(Object.hasOwn(modalBefore, "cloudflare"), false);
  assert.equal(
    replayEvidence.compareModalReplaySnapshots(modalBefore, modalAfter).identical,
    true,
  );

  modalAfter.modal.providerVersion = 49;
  assert.throws(
    () => replayEvidence.compareModalReplaySnapshots(modalBefore, modalAfter),
    /ALICE_REPLAY_MODAL_STATE_CHANGED/u,
  );
});

test("admission binds exact release, build, artifact, manifest, and canonical owner", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-replay-admit-"));
  try {
    const manifestPath = path.join(root, "manifest.json");
    const admissionPath = path.join(root, "admission.json");
    const artifactPath = path.join(root, "alice-worker-bundles.json");
    const ownerHash = canonicalOwnerHash("alice-owner@rndrntwrk.com");
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify({
        schemaVersion: "alice.deployment-manifest.v1",
        release: {
          releaseEpoch: 49,
          modalRevision: 49,
          policyHash: `sha256:${"d".repeat(64)}`,
          rollbackBoundary: "modal:alice-runtime:v49",
        },
        source: {
          sourceCommit: SOURCE_SHA,
          deploymentControllerCommit: SOURCE_SHA,
          runtimeImage: RUNTIME_IMAGE,
          runtimeBuildManifestSha256: RUNTIME_MANIFEST,
        },
      })}\n`,
    );
    fs.writeFileSync(
      admissionPath,
      `${JSON.stringify({
        sourceCommit: SOURCE_SHA,
        releaseEpoch: 49,
        modalRevision: 49,
        policyHash: `sha256:${"d".repeat(64)}`,
        runtimeImage: RUNTIME_IMAGE,
        runtimeBuildManifestSha256: RUNTIME_MANIFEST,
      })}\n`,
    );
    fs.writeFileSync(
      artifactPath,
      `${JSON.stringify({
        schemaVersion: "alice.worker-bundle-artifact.v1",
        sourceCommit: SOURCE_SHA,
      })}\n`,
    );

    const result = assertReplayAdmission({
      sourceSha: SOURCE_SHA,
      buildRunId: BUILD_RUN_ID,
      workerArtifactName: ARTIFACT_NAME,
      workerArtifactDigest: ARTIFACT_DIGEST,
      runtimeImage: RUNTIME_IMAGE,
      runtimeBuildManifestSha256: RUNTIME_MANIFEST,
      releaseEpoch: "49",
      modalRevision: "49",
      policyHash: `sha256:${"d".repeat(64)}`,
      ownerHash,
      manifestPath,
      programAdmissionPath: admissionPath,
      workerArtifactPath: artifactPath,
    });
    assert.equal(result.ok, true);
    assert.equal(result.sourceSha, SOURCE_SHA);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
