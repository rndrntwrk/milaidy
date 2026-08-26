import assert from "node:assert/strict";
import test from "node:test";

import {
  orchestrateAliceModalEmergencyRollback,
  orchestrateAliceModalPromotion,
} from "./alice_modal_promote.mjs";
import { digestAliceModalProviderGraph } from "./alice_modal_release.mjs";
import { buildAliceModalSafeBootstrapResult } from "./alice_modal_safe_bootstrap.mjs";

const release = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
  sourceCommit: "4".repeat(40),
  deploymentControllerCommit: "5".repeat(40),
  runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"6".repeat(64)}`,
  runtimeBuildManifestSha256: `sha256:${"7".repeat(64)}`,
  deploymentManifestSha256: `sha256:${"8".repeat(64)}`,
  elizaCommit: "9".repeat(40),
  modalRevision: 49,
};
const secretName = `alice-production-core-${"2".repeat(64)}-12345-1`;
const createdSecret = {
  id: "st-CCCCCCCCCCCCCCCCCCCCCC",
  name: secretName,
};

function layout({
  providerVersion,
  rollbackVersion,
  sourceCommit,
  functionId,
  imageId,
  mountedSecretObjects,
  autoscalerStatus,
}) {
  return {
    appId: "ap-oFaCNy2jJDFalZienNB2Ht",
    environment: "main",
    providerVersion,
    providerHistory: [{
      providerVersion,
      rollbackVersion,
      clientVersion: providerVersion === 48 ? "1.5.0" : "1.5.4",
      deployedBy: "rndrntwrk",
      commitHash: sourceCommit,
      dirty: false,
    }],
    functionIds: { alice_web: functionId },
    function: {
      name: "alice_web",
      id: functionId,
      webUrl: "https://rndrntwrk--alice.modal.run",
      inputFormats: ["DATA_FORMAT_ASGI"],
    },
    mountedSecretObjects,
    mountedVolumeIds: [],
    imageObjectIds: [imageId],
    autoscalerEnforcement: autoscalerStatus === "provider-enforced"
      ? {
          status: autoscalerStatus,
          functionId,
          minContainers: 0,
          maxContainers: 1,
          bufferContainers: 0,
          scaledownWindow: 300,
        }
      : { status: autoscalerStatus },
  };
}

const previous = layout({
  providerVersion: 49,
  rollbackVersion: 0,
  sourceCommit: release.sourceCommit,
  functionId: "fu-AAAAAAAAAAAAAAAAAAAAAA",
  imageId: "im-AAAAAAAAAAAAAAAAAAAAAA",
  mountedSecretObjects: [],
  autoscalerStatus: "provider-enforced",
});
const candidate = layout({
  providerVersion: 50,
  rollbackVersion: 0,
  sourceCommit: release.sourceCommit,
  functionId: "fu-BBBBBBBBBBBBBBBBBBBBBB",
  imageId: "im-BBBBBBBBBBBBBBBBBBBBBB",
  mountedSecretObjects: [
    { id: "st-BBBBBBBBBBBBBBBBBBBBBB", name: "alice-ghcr-registry" },
    { id: "st-CCCCCCCCCCCCCCCCCCCCCC", name: secretName },
  ],
  autoscalerStatus: "provider-enforced",
});
const rolledBack = {
  ...previous,
  providerVersion: 51,
  providerHistory: [{
    providerVersion: 51,
    rollbackVersion: 49,
    clientVersion: "1.5.4",
    deployedBy: "rndrntwrk",
    commitHash: release.sourceCommit,
    dirty: false,
  }],
  autoscalerEnforcement: {
    ...candidate.autoscalerEnforcement,
    functionId: previous.function.id,
  },
};
const forwarded = {
  ...candidate,
  providerVersion: 52,
  providerHistory: [{
    providerVersion: 52,
    rollbackVersion: 50,
    clientVersion: "1.5.4",
    deployedBy: "rndrntwrk",
    commitHash: release.sourceCommit,
    dirty: false,
  }],
};

function providerState(value) {
  const head = value.providerHistory[0];
  return {
    tokenInfo:
      "Workspace: rndrntwrk (ac-heK8sGJBc367raQUx6R59o)\n" +
      "User: rndrntwrk (us-rJM1ZZiySURgAhBEOqvR16)\n",
    environments: [{ name: "main", web_suffix: "", active: "True" }],
    apps: [{
      app_id: value.appId,
      description: "alice-runtime",
      state: "deployed",
      tasks: "0",
    }],
    history: [{
      version: `v${value.providerVersion}`,
      client: "1.5.4",
      deployed_by: "rndrntwrk",
      commit: release.sourceCommit.slice(0, 7),
    }],
    containers: [],
    layout: value,
  };
}

function safeAnchor() {
  return buildAliceModalSafeBootstrapResult({
    release,
    state: providerState(previous),
    runtime: {
      schemaVersion: "alice.modal-safe-bootstrap-runtime.v1",
      unauthenticatedStatus: 401,
      authenticatedStatus: 503,
      safeBootstrap: true,
      paused: true,
      ready: false,
      release,
    },
    observedAt: "2026-08-23T11:59:00.000Z",
  }).anchor;
}

function operations({
  deployFailureAfterMutation = false,
  failRuntime = false,
  malformedPrevious = false,
  createSecretFailure = false,
} = {}) {
  const calls = [];
  let reads = 0;
  let captures = 0;
  return {
    calls,
    value: {
      captureCurrentLayout: async () => {
        calls.push("capture-current");
        captures += 1;
        if (captures === 1 && malformedPrevious) {
          return { ...previous, appId: "ap-ZZZZZZZZZZZZZZZZZZZZZZ" };
        }
        return captures === 1 ? previous : candidate;
      },
      persistRollbackAnchor: async () => calls.push("persist-anchor"),
      persistMutationJournal: async () => calls.push("persist-journal"),
      verifyProtectedRef: async () => calls.push("verify-protected-ref"),
      createReleaseSecret: async () => {
        calls.push("create-secret");
        if (createSecretFailure) {
          throw new Error("ALICE_MODAL_SECRET_CREATE_FAILED");
        }
        return createdSecret;
      },
      cleanupReleaseSecret: async (value) =>
        calls.push(`cleanup-secret:${value?.id}`),
      deployCandidate: async () => {
        calls.push("deploy");
        if (deployFailureAfterMutation) {
          throw new Error("ALICE_MODAL_DEPLOY_FAILED");
        }
      },
      readReleaseState: async () => {
        calls.push("read-release");
        return providerState(reads++ === 0 ? candidate : forwarded);
      },
      verifyRuntime: async () => {
        calls.push("verify-runtime");
        if (failRuntime) throw new Error("ALICE_MODAL_READINESS_INVALID");
        return { ok: true, release };
      },
      rollbackTo: async (providerVersion) => {
        calls.push(`rollback:${providerVersion}`);
      },
      captureEnforcedCurrentLayout: async () => {
        calls.push("capture-enforced-current");
        return rolledBack;
      },
    },
  };
}

test("runs exact Modal candidate, rollback, forward, and terminal coherence", async () => {
  const op = operations();
  const result = await orchestrateAliceModalPromotion({
    release,
    secretName,
    operations: op.value,
    observedAt: "2026-08-23T12:00:00.000Z",
  });
  assert.deepEqual(op.calls, [
    "capture-current",
    "persist-anchor",
    "verify-protected-ref",
    "persist-journal",
    "create-secret",
    "verify-protected-ref",
    "deploy",
    "read-release",
    "verify-runtime",
    "verify-protected-ref",
    "rollback:49",
    "capture-enforced-current",
    "verify-protected-ref",
    "rollback:50",
    "read-release",
    "verify-runtime",
    "read-release",
  ]);
  assert.equal(result.providerReadback.providerVersion, 52);
  assert.equal(result.rollbackForwardProof.candidateProviderVersion, 50);
  assert.equal(result.rollbackForwardProof.rollbackProviderVersion, 51);
});

test("restores the prior Modal graph and stays there after candidate failure", async () => {
  const op = operations({ failRuntime: true });
  await assert.rejects(
    () => orchestrateAliceModalPromotion({
      release,
      secretName,
      operations: op.value,
      observedAt: "2026-08-23T12:00:00.000Z",
    }),
    (error) => {
      assert.equal(error.modalRollbackVerified, true);
      return true;
    },
  );
  assert.deepEqual(op.calls, [
    "capture-current",
    "persist-anchor",
    "verify-protected-ref",
    "persist-journal",
    "create-secret",
    "verify-protected-ref",
    "deploy",
    "read-release",
    "verify-runtime",
    "capture-current",
    "rollback:49",
    "capture-enforced-current",
    "cleanup-secret:st-CCCCCCCCCCCCCCCCCCCCCC",
  ]);
});

test("does not delete an ambiguously-created release secret without its object id", async () => {
  const op = operations({ createSecretFailure: true });
  await assert.rejects(
    () => orchestrateAliceModalPromotion({
      release,
      secretName,
      operations: op.value,
      observedAt: "2026-08-23T12:00:00.000Z",
    }),
    /ALICE_MODAL_SECRET_CREATE_FAILED/,
  );
  assert.deepEqual(op.calls, [
    "capture-current",
    "persist-anchor",
    "verify-protected-ref",
    "persist-journal",
    "create-secret",
  ]);
});

test("validates the full prior graph before any provider mutation", async () => {
  const op = operations({ malformedPrevious: true });
  await assert.rejects(
    () => orchestrateAliceModalPromotion({
      release,
      secretName,
      operations: op.value,
      observedAt: "2026-08-23T12:00:00.000Z",
    }),
    /ALICE_MODAL_PROVIDER_READBACK_INVALID/,
  );
  assert.deepEqual(op.calls, ["capture-current"]);
});

test("recaptures and restores after an ambiguous nonzero deploy exit", async () => {
  const op = operations({ deployFailureAfterMutation: true });
  await assert.rejects(
    () => orchestrateAliceModalPromotion({
      release,
      secretName,
      operations: op.value,
      observedAt: "2026-08-23T12:00:00.000Z",
    }),
    (error) => {
      assert.equal(error.modalRollbackVerified, true);
      return true;
    },
  );
  assert.deepEqual(op.calls, [
    "capture-current",
    "persist-anchor",
    "verify-protected-ref",
    "persist-journal",
    "create-secret",
    "verify-protected-ref",
    "deploy",
    "capture-current",
    "rollback:49",
    "capture-enforced-current",
    "cleanup-secret:st-CCCCCCCCCCCCCCCCCCCCCC",
  ]);
});

test("restores the exact prior Modal graph after a downstream provider failure", async () => {
  const promotion = operations();
  const evidence = await orchestrateAliceModalPromotion({
    release,
    secretName,
    operations: promotion.value,
    observedAt: "2026-08-23T12:00:00.000Z",
  });
  const calls = [];
  const result = await orchestrateAliceModalEmergencyRollback({
    anchor: safeAnchor(),
    evidence,
    journal: {
      schemaVersion: "alice.modal-mutation-journal.v1",
      observedAt: "2026-08-23T12:00:00.000Z",
      phase: "predeploy",
      release,
      secretName,
      appId: previous.appId,
      previousProviderVersion: previous.providerVersion,
      previousGraphSha256: digestAliceModalProviderGraph(previous),
      releaseSecretAbsent: true,
    },
    observedAt: "2026-08-23T12:05:00.000Z",
    operations: {
      findReleaseSecretByName: async (name) => {
        calls.push(`find-secret:${name}`);
        return createdSecret;
      },
      captureCurrentLayout: async () => {
        calls.push("capture-current");
        return forwarded;
      },
      rollbackTo: async (providerVersion) => {
        calls.push(`rollback:${providerVersion}`);
      },
      captureEnforcedCurrentLayout: async () => {
        calls.push("capture-enforced-current");
        return { ...rolledBack, providerVersion: 53, providerHistory: [{
          ...rolledBack.providerHistory[0],
          providerVersion: 53,
        }] };
      },
      cleanupReleaseSecret: async (value) =>
        calls.push(`cleanup-secret:${value?.id}`),
    },
  });
  assert.deepEqual(calls, [
    `find-secret:${secretName}`,
    "capture-current",
    "rollback:49",
    "capture-enforced-current",
    "cleanup-secret:st-CCCCCCCCCCCCCCCCCCCCCC",
  ]);
  assert.equal(
    result.releaseSecretCleanup,
    "deleted-exact-provider-object",
  );
  assert.equal(result.restoration.restorationProviderVersion, 53);
  assert.equal(result.failedCandidateProviderVersion, 52);
});

test("restores from the predeploy journal when promotion success evidence was never written", async () => {
  const calls = [];
  const journal = {
    schemaVersion: "alice.modal-mutation-journal.v1",
    observedAt: "2026-08-23T12:00:00.000Z",
    phase: "predeploy",
    release,
    secretName,
    appId: previous.appId,
    previousProviderVersion: previous.providerVersion,
    previousGraphSha256: `sha256:${"a".repeat(64)}`,
    releaseSecretAbsent: true,
  };
  const result = await orchestrateAliceModalEmergencyRollback({
    anchor: safeAnchor(),
    journal: {
      ...journal,
      previousGraphSha256: (await import("./alice_modal_release.mjs"))
        .digestAliceModalProviderGraph(previous),
    },
    evidence: null,
    observedAt: "2026-08-23T12:05:00.000Z",
    operations: {
      findReleaseSecretByName: async (name) => {
        calls.push(`find-secret:${name}`);
        return createdSecret;
      },
      captureCurrentLayout: async () => {
        calls.push("capture-current");
        return candidate;
      },
      rollbackTo: async (providerVersion) => {
        calls.push(`rollback:${providerVersion}`);
      },
      captureEnforcedCurrentLayout: async () => {
        calls.push("capture-enforced-current");
        return rolledBack;
      },
      cleanupReleaseSecret: async (value) =>
        calls.push(`cleanup-secret:${value?.id}`),
    },
  });
  assert.deepEqual(calls, [
    `find-secret:${secretName}`,
    "capture-current",
    "rollback:49",
    "capture-enforced-current",
    "cleanup-secret:st-CCCCCCCCCCCCCCCCCCCCCC",
  ]);
  assert.equal(result.release.sourceCommit, release.sourceCommit);
  assert.equal(result.recoveryMode, "predeploy-journal");
  assert.equal(
    result.releaseSecretCleanup,
    "deleted-exact-provider-object",
  );
});

test("deletes the exact orphaned run secret after another recovery restored the graph", async () => {
  const calls = [];
  const result = await orchestrateAliceModalEmergencyRollback({
    anchor: safeAnchor(),
    evidence: null,
    journal: {
      schemaVersion: "alice.modal-mutation-journal.v1",
      observedAt: "2026-08-23T12:00:00.000Z",
      phase: "predeploy",
      release,
      secretName,
      appId: previous.appId,
      previousProviderVersion: previous.providerVersion,
      previousGraphSha256: digestAliceModalProviderGraph(previous),
      releaseSecretAbsent: true,
    },
    observedAt: "2026-08-23T12:10:00.000Z",
    operations: {
      findReleaseSecretByName: async (name) => {
        calls.push(`find-secret:${name}`);
        return createdSecret;
      },
      captureCurrentLayout: async () => {
        calls.push("capture-current");
        return previous;
      },
      rollbackTo: async () => calls.push("unexpected-rollback"),
      captureEnforcedCurrentLayout: async () => {
        calls.push("unexpected-enforced-capture");
        return previous;
      },
      cleanupReleaseSecret: async (value) =>
        calls.push(`cleanup-secret:${value?.id}`),
    },
  });
  assert.deepEqual(calls, [
    `find-secret:${secretName}`,
    "capture-current",
    "cleanup-secret:st-CCCCCCCCCCCCCCCCCCCCCC",
  ]);
  assert.equal(result.releaseSecretCleanup, "deleted-exact-provider-object");
  assert.equal(result.restoration.schemaVersion, "alice.modal-no-mutation-proof.v1");
});
