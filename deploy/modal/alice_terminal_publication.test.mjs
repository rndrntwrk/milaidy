import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import { verifyAliceTerminalPublication } from "./alice_terminal_publication.mjs";

const sourceCommit = "1".repeat(40);
const runId = "123456789";
const runAttempt = 1;

function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalAliceJson(value)).digest("hex")}`;
}

function fixture() {
  const cloudflareLiveReadback = {
    schemaVersion: "alice.cloudflare-live-readback.v1",
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
    },
    terminalSnapshotStable: true,
  };
  const cloudflareRollbackProof = {
    schemaVersion: "alice.cloudflare-rollback-evidence.v1",
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
    schemaVersion: "alice.production-acceptance.v2",
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

test("accepts only a terminal artifact from the final successful workflow conclusion", () => {
  const verified = verifyAliceTerminalPublication(fixture());
  assert.equal(verified.terminal, true);
  assert.equal(
    verified.schemaVersion,
    "alice.terminal-publication-verification.v2",
  );
  assert.equal(verified.workflowConclusion, "success");
  assert.match(verified.acceptanceSha256, /^sha256:[a-f0-9]{64}$/);
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
