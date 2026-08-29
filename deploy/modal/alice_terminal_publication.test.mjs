import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import { verifyAliceTerminalPublication } from "./alice_terminal_publication.mjs";

const sourceCommit = "1".repeat(40);
const runId = "123456789";
const runAttempt = 1;
const terminalPublicationPath = fileURLToPath(
  new URL("./alice_terminal_publication.mjs", import.meta.url),
);

function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalAliceJson(value)).digest("hex")}`;
}

function fixture() {
  const cloudflareLiveReadback = {
    schemaVersion: "alice.cloudflare-live-readback.v2",
    accountId: "036df6c823669b8fa2f66cf4c16eeb29",
    zoneId: "7b24984479ee4cddb6c5d8a9b7a0f2c6",
    observedAt: "2026-08-23T12:00:00.000Z",
    durationMs: 100,
    providerFingerprints: { access: `sha256:${"6".repeat(64)}` },
    provider: { access: { applicationId: "alice-app" } },
    workflowVersions: [{ id: "workflow-version" }],
    aliceTrafficBindings: {
      routes: [{ pattern: "alice.rndrntwrk.com/*", script: "alice-access-gateway" }],
      customDomains: [],
    },
    workers: {
      access: { serving: { versionId: "access-version" } },
      control: { serving: { versionId: "control-version" } },
      aiGateway: { serving: { versionId: "ai-version" } },
      statePlane: { serving: { versionId: "state-version" } },
      connectorPlane: { serving: { versionId: "connector-version" } },
      runtimeHost: { serving: { versionId: "runtime-host-version" } },
    },
    terminalSnapshotStable: true,
  };
  const cloudflareRollbackProof = {
    schemaVersion: "alice.cloudflare-rollback-evidence.v2",
  };
  const modalPromotionEvidence = {
    schemaVersion: "alice.modal-promotion-evidence.v1",
    providerReadback: {
      schemaVersion: "alice.modal-provider-readback.v2",
      environment: "main",
      appId: "ap-00000000000000000000",
      app: "alice-runtime",
      functionId: "fu-00000000000000000000",
      function: "alice_web",
      webUrl: "https://rndrntwrk--alice-runtime-alice-web.modal.run",
      providerVersion: 52,
      rollbackProviderVersion: 50,
      clientVersion: "1.5.4",
      sourceCommit,
      releaseSecretName:
        `alice-production-core-${"4".repeat(64)}-${runId}-${runAttempt}`,
      mountedSecretObjects: [
        { id: "st-00000000000000000000", name: "alice-ghcr-registry" },
        {
          id: "st-11111111111111111111",
          name: `alice-production-core-${"4".repeat(64)}-${runId}-${runAttempt}`,
        },
      ],
      mountedVolumeIds: [],
      imageObjectIds: ["im-00000000000000000000"],
      autoscaler: {
        minContainers: 0,
        maxContainers: 1,
        bufferContainers: 0,
        scaledownWindow: 300,
      },
    },
  };
  const currentCloudflareLiveReadback = structuredClone(cloudflareLiveReadback);
  currentCloudflareLiveReadback.observedAt = "2026-08-23T12:01:00.000Z";
  currentCloudflareLiveReadback.durationMs = 125;
  const currentModalProviderReadback = {
    schemaVersion: "alice.modal-current-provider-readback.v1",
    observedAt: "2026-08-23T12:01:05.000Z",
    provider: {
      appId: modalPromotionEvidence.providerReadback.appId,
      environment: "main",
      providerVersion: 52,
      providerHistory: [{
        providerVersion: 52,
        rollbackVersion: 50,
        clientVersion: "1.5.4",
        commitHash: sourceCommit,
        dirty: false,
      }],
      functionIds: {
        alice_web: modalPromotionEvidence.providerReadback.functionId,
      },
      function: {
        name: "alice_web",
        id: modalPromotionEvidence.providerReadback.functionId,
        webUrl: modalPromotionEvidence.providerReadback.webUrl,
      },
      mountedSecretObjects:
        structuredClone(modalPromotionEvidence.providerReadback.mountedSecretObjects),
      mountedVolumeIds: [],
      imageObjectIds: ["im-00000000000000000000"],
      autoscalerEnforcement: {
        status: "provider-enforced",
        functionId: modalPromotionEvidence.providerReadback.functionId,
        minContainers: 0,
        maxContainers: 1,
        bufferContainers: 0,
        scaledownWindow: 300,
      },
    },
  };
  const acceptance = {
    schemaVersion: "alice.production-acceptance.v3",
    observedAt: "2026-08-23T12:00:00.000Z",
    sourceCommit,
    deploymentManifestSha256: `sha256:${"2".repeat(64)}`,
    binding: {
      programDigest: `sha256:${"3".repeat(64)}`,
      releaseDigest: `sha256:${"4".repeat(64)}`,
      policyHash: `sha256:${"5".repeat(64)}`,
    },
    deploymentRun: { id: runId, attempt: runAttempt },
    recoveryOperatorRun: { id: runId, attempt: runAttempt, job: "accept" },
    publicationContract: {
      expectedWorkflowConclusion: "success",
      artifactConsumerMustVerifyWorkflowConclusion: true,
      publicationIsFinalSuccessOnlyStep: true,
    },
    evidence: {
      persisted: true,
      persistedObjectKeys: Array.from(
        { length: 10 },
        (_, index) => `2026-08-23/release/control.resume/evt-${index.toString().padStart(8, "0")}.json`,
      ),
    },
    finalAuthority: { pausedScopes: [] },
    authenticatedRoot: "full-milady-companion-ui",
    runtimeProfile: "full-gated",
    productSurfaces: {
      root: "full-milady",
      companion: "full-companion",
      broadcast: "alice-cam",
      companionStage: "durable",
    },
    productSurfaceDigests: {
      companionHtmlSha256: `sha256:${"a".repeat(64)}`,
      broadcastHtmlSha256: `sha256:${"b".repeat(64)}`,
    },
    provenance: {
      cloudflareLiveReadbackSha256: digest(cloudflareLiveReadback),
      cloudflareRollbackSha256: digest(cloudflareRollbackProof),
      modalPromotionSha256: digest(modalPromotionEvidence),
    },
    publicOrEconomicActionExecuted: false,
    terminal: true,
  };
  const workflowRun = {
    id: Number(runId),
    run_attempt: runAttempt,
    head_sha: sourceCommit,
    head_branch: "release/alice-production-core-2026-08-22",
    event: "workflow_dispatch",
    path: ".github/workflows/deploy-alice-cloudflare.yml",
    status: "completed",
    conclusion: "success",
    updated_at: "2026-08-23T12:00:30Z",
  };
  return {
    acceptance,
    cloudflareLiveReadback,
    cloudflareRollbackProof,
    modalPromotionEvidence,
    currentCloudflareLiveReadback,
    currentModalProviderReadback,
    workflowRun,
    expectedSourceSha: sourceCommit,
    expectedRunId: runId,
    expectedRunAttempt: runAttempt,
    nowMs: Date.parse("2026-08-23T12:01:30.000Z"),
  };
}

function containerFixture() {
  const input = fixture();
  const runtimeImage =
    `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"c".repeat(64)}`;
  const containerImageEvidence = {
    schemaVersion: "alice.cloudflare-container-image.v1",
    accountId: "036df6c823669b8fa2f66cf4c16eeb29",
    observedAt: "2026-08-23T12:00:00.000Z",
    sourceCommit,
    sourceImage:
      `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"d".repeat(64)}`,
    sourceDigest: `sha256:${"d".repeat(64)}`,
    runtimeImage,
    runtimeDigest: `sha256:${"c".repeat(64)}`,
    runtimeRevision: 49,
    runtimeBuildManifestSha256: `sha256:${"e".repeat(64)}`,
    capabilityBomSha256: `sha256:${"f".repeat(64)}`,
    tag: `alice-${sourceCommit.slice(0, 12)}-${runId}-${runAttempt}`,
    registryReadbackVerified: true,
    buildReusedWithoutRebuild: true,
  };
  delete input.modalPromotionEvidence;
  delete input.currentModalProviderReadback;
  input.containerImageEvidence = containerImageEvidence;
  input.acceptance.runtimeRevision = containerImageEvidence.runtimeRevision;
  input.acceptance.provenance = {
    cloudflareLiveReadbackSha256: digest(input.cloudflareLiveReadback),
    cloudflareRollbackSha256: digest(input.cloudflareRollbackProof),
    containerImageEvidenceSha256: digest(containerImageEvidence),
    runtimeImage,
    runtimeRevision: containerImageEvidence.runtimeRevision,
  };
  return input;
}

function writeJson(directory, name, value) {
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, `${canonicalAliceJson(value)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return filePath;
}

test("accepts only a terminal artifact from the final successful workflow conclusion", () => {
  const verified = verifyAliceTerminalPublication(fixture());
  assert.equal(verified.terminal, true);
  assert.equal(
    verified.schemaVersion,
    "alice.terminal-publication-verification.v2",
  );
  assert.equal(verified.workflowConclusion, "success");
  assert.match(verified.acceptanceSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(verified.currentModalProviderVersion, 52);
  assert.equal(
    verified.modalPromotionSha256,
    digest(fixture().modalPromotionEvidence),
  );
});

test("accepts Container terminal publication without reading Modal evidence", () => {
  const input = containerFixture();
  const verified = verifyAliceTerminalPublication(input);
  assert.equal(verified.terminal, true);
  assert.equal(verified.runtimeRevision, 49);
  assert.equal(
    verified.runtimeImage,
    input.containerImageEvidence.runtimeImage,
  );
  assert.equal(
    verified.containerImageEvidenceSha256,
    digest(input.containerImageEvidence),
  );
  assert.equal(Object.hasOwn(verified, "modalPromotionSha256"), false);
  assert.equal(
    Object.hasOwn(verified, "currentModalProviderReadbackSha256"),
    false,
  );
});

test("rejects ambiguous or absent terminal provider evidence", () => {
  const both = containerFixture();
  const modal = fixture();
  both.modalPromotionEvidence = modal.modalPromotionEvidence;
  both.currentModalProviderReadback = modal.currentModalProviderReadback;
  assert.throws(
    () => verifyAliceTerminalPublication(both),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );

  const neither = containerFixture();
  delete neither.containerImageEvidence;
  assert.throws(
    () => verifyAliceTerminalPublication(neither),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );

  const partialModal = fixture();
  delete partialModal.currentModalProviderReadback;
  assert.throws(
    () => verifyAliceTerminalPublication(partialModal),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );

  const malformedContainerAlongsideModal = fixture();
  malformedContainerAlongsideModal.containerImageEvidence = "not-an-object";
  assert.throws(
    () => verifyAliceTerminalPublication(malformedContainerAlongsideModal),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );
});

test("rejects Container digest, runtime image, source, and revision drift", () => {
  for (const mutate of [
    (input) => {
      input.acceptance.provenance.containerImageEvidenceSha256 =
        `sha256:${"9".repeat(64)}`;
    },
    (input) => {
      input.acceptance.provenance.runtimeImage =
        `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"9".repeat(64)}`;
    },
    (input) => {
      input.containerImageEvidence.sourceCommit = "9".repeat(40);
      input.containerImageEvidence.tag =
        `alice-${"9".repeat(12)}-${runId}-${runAttempt}`;
    },
    (input) => { input.acceptance.runtimeRevision = 50; },
    (input) => { input.acceptance.provenance.runtimeRevision = 50; },
    (input) => {
      input.cloudflareRollbackProof.schemaVersion =
        "alice.cloudflare-rollback-evidence.v1";
    },
    (input) => { input.workflowRun.conclusion = "failure"; },
  ]) {
    const input = containerFixture();
    mutate(input);
    assert.throws(
      () => verifyAliceTerminalPublication(input),
      /ALICE_TERMINAL_PUBLICATION_INVALID/,
    );
  }
});

test("requires a fresh post-workflow Cloudflare readback in Container mode", () => {
  const input = containerFixture();
  input.currentCloudflareLiveReadback.observedAt =
    "2026-08-23T11:50:00.000Z";
  assert.throws(
    () => verifyAliceTerminalPublication(input),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );
});

test("CLI accepts only the conditional Container evidence path", (t) => {
  const input = containerFixture();
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "alice-terminal-container-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const nowMs = Date.now();
  input.workflowRun.updated_at = new Date(nowMs - 60_000).toISOString();
  input.currentCloudflareLiveReadback.observedAt =
    new Date(nowMs - 30_000).toISOString();
  const env = {
    PATH: process.env.PATH ?? "",
    ALICE_PRODUCTION_ACCEPTANCE_PATH:
      writeJson(directory, "acceptance.json", input.acceptance),
    ALICE_CLOUDFLARE_READBACK_PATH:
      writeJson(directory, "cloudflare.json", input.cloudflareLiveReadback),
    ALICE_CLOUDFLARE_ROLLBACK_PROOF_PATH:
      writeJson(directory, "rollback.json", input.cloudflareRollbackProof),
    ALICE_CONTAINER_IMAGE_EVIDENCE_PATH:
      writeJson(directory, "container.json", input.containerImageEvidence),
    ALICE_CURRENT_CLOUDFLARE_READBACK_PATH:
      writeJson(
        directory,
        "current-cloudflare.json",
        input.currentCloudflareLiveReadback,
      ),
    ALICE_WORKFLOW_RUN_READBACK_PATH:
      writeJson(directory, "workflow.json", input.workflowRun),
    ALICE_SOURCE_COMMIT: sourceCommit,
    ALICE_DEPLOYMENT_RUN_ID: runId,
    ALICE_DEPLOYMENT_RUN_ATTEMPT: String(runAttempt),
  };
  const result = spawnSync(process.execPath, [terminalPublicationPath], {
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  const verified = JSON.parse(result.stdout);
  assert.equal(verified.runtimeRevision, 49);
  assert.equal(
    verified.containerImageEvidenceSha256,
    digest(input.containerImageEvidence),
  );

  const missingProvider = { ...env };
  delete missingProvider.ALICE_CONTAINER_IMAGE_EVIDENCE_PATH;
  const missingResult = spawnSync(
    process.execPath,
    [terminalPublicationPath],
    { encoding: "utf8", env: missingProvider },
  );
  assert.equal(missingResult.status, 1);
  assert.match(missingResult.stderr, /ALICE_TERMINAL_PUBLICATION_INVALID/);

  const ambiguousProvider = {
    ...env,
    ALICE_MODAL_PROMOTION_EVIDENCE_PATH:
      path.join(directory, "must-not-be-read-modal.json"),
    ALICE_CURRENT_MODAL_PROVIDER_READBACK_PATH:
      path.join(directory, "must-not-be-read-current-modal.json"),
  };
  const ambiguousResult = spawnSync(
    process.execPath,
    [terminalPublicationPath],
    { encoding: "utf8", env: ambiguousProvider },
  );
  assert.equal(ambiguousResult.status, 1);
  assert.match(ambiguousResult.stderr, /ALICE_TERMINAL_PUBLICATION_INVALID/);
});

test("CLI preserves the Modal terminal evidence path", (t) => {
  const input = fixture();
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "alice-terminal-modal-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const nowMs = Date.now();
  input.workflowRun.updated_at = new Date(nowMs - 60_000).toISOString();
  input.currentCloudflareLiveReadback.observedAt =
    new Date(nowMs - 30_000).toISOString();
  input.currentModalProviderReadback.observedAt =
    new Date(nowMs - 25_000).toISOString();
  const result = spawnSync(process.execPath, [terminalPublicationPath], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      ALICE_PRODUCTION_ACCEPTANCE_PATH:
        writeJson(directory, "acceptance.json", input.acceptance),
      ALICE_CLOUDFLARE_READBACK_PATH:
        writeJson(directory, "cloudflare.json", input.cloudflareLiveReadback),
      ALICE_CLOUDFLARE_ROLLBACK_PROOF_PATH:
        writeJson(directory, "rollback.json", input.cloudflareRollbackProof),
      ALICE_MODAL_PROMOTION_EVIDENCE_PATH:
        writeJson(directory, "modal.json", input.modalPromotionEvidence),
      ALICE_CURRENT_CLOUDFLARE_READBACK_PATH:
        writeJson(
          directory,
          "current-cloudflare.json",
          input.currentCloudflareLiveReadback,
        ),
      ALICE_CURRENT_MODAL_PROVIDER_READBACK_PATH:
        writeJson(
          directory,
          "current-modal.json",
          input.currentModalProviderReadback,
        ),
      ALICE_WORKFLOW_RUN_READBACK_PATH:
        writeJson(directory, "workflow.json", input.workflowRun),
      ALICE_SOURCE_COMMIT: sourceCommit,
      ALICE_DEPLOYMENT_RUN_ID: runId,
      ALICE_DEPLOYMENT_RUN_ATTEMPT: String(runAttempt),
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const verified = JSON.parse(result.stdout);
  assert.equal(verified.currentModalProviderVersion, 52);
  assert.equal(
    verified.modalPromotionSha256,
    digest(input.modalPromotionEvidence),
  );
});

test("requires the private runtime host in both stable terminal snapshots", () => {
  const input = fixture();
  delete input.currentCloudflareLiveReadback.workers.runtimeHost;
  assert.throws(
    () => verifyAliceTerminalPublication(input),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );
});

test("rejects terminal artifacts left behind by failure, cancellation, or later rollback", () => {
  for (const conclusion of ["failure", "cancelled", null]) {
    const input = fixture();
    input.workflowRun.conclusion = conclusion;
    assert.throws(
      () => verifyAliceTerminalPublication(input),
      /ALICE_TERMINAL_PUBLICATION_INVALID/,
    );
  }
  const drifted = fixture();
  drifted.currentCloudflareLiveReadback.workers.control.serving.versionId =
    "rolled-back-control-version";
  assert.throws(
    () => verifyAliceTerminalPublication(drifted),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );

  const modalRollback = fixture();
  modalRollback.currentModalProviderReadback.provider.providerVersion = 53;
  assert.throws(
    () => verifyAliceTerminalPublication(modalRollback),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );

  const stale = fixture();
  stale.currentCloudflareLiveReadback.observedAt = "2026-08-23T11:50:00.000Z";
  assert.throws(
    () => verifyAliceTerminalPublication(stale),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );

  const staleModal = fixture();
  staleModal.currentModalProviderReadback.observedAt =
    "2026-08-23T11:50:00.000Z";
  assert.throws(
    () => verifyAliceTerminalPublication(staleModal),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );

  const modalObjectDrift = fixture();
  modalObjectDrift.currentModalProviderReadback.provider
    .mountedSecretObjects[1].id = "st-22222222222222222222";
  assert.throws(
    () => verifyAliceTerminalPublication(modalObjectDrift),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );

  const modalAutoscalerDrift = fixture();
  modalAutoscalerDrift.currentModalProviderReadback.provider
    .autoscalerEnforcement.maxContainers = 2;
  assert.throws(
    () => verifyAliceTerminalPublication(modalAutoscalerDrift),
    /ALICE_TERMINAL_PUBLICATION_INVALID/,
  );
});

test("rejects source, run, attempt, provider digest, and terminal pause drift", () => {
  for (const mutate of [
    (input) => { input.acceptance.sourceCommit = "9".repeat(40); },
    (input) => { input.acceptance.deploymentRun.id = "999"; },
    (input) => { input.workflowRun.run_attempt = 2; },
    (input) => { input.acceptance.provenance.modalPromotionSha256 = `sha256:${"9".repeat(64)}`; },
    (input) => { input.acceptance.finalAuthority.pausedScopes = ["model"]; },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(
      () => verifyAliceTerminalPublication(input),
      /ALICE_TERMINAL_PUBLICATION_INVALID/,
    );
  }
});

test("rejects reduced UI evidence or a live readback missing either private Worker", () => {
  for (const mutate of [
    (input) => { input.acceptance.authenticatedRoot = "approved-nonce-csp-chat-ui"; },
    (input) => { input.acceptance.runtimeProfile = "proposer-only"; },
    (input) => { delete input.acceptance.productSurfaces.companion; },
    (input) => { input.acceptance.productSurfaceDigests.companionHtmlSha256 = "invalid"; },
    (input) => { delete input.cloudflareLiveReadback.workers.statePlane; },
    (input) => { delete input.currentCloudflareLiveReadback.workers.connectorPlane; },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(
      () => verifyAliceTerminalPublication(input),
      /ALICE_TERMINAL_PUBLICATION_INVALID/,
    );
  }
});
