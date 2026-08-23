import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAliceModalSafeBootstrapResult,
  buildAliceModalLegacyTransitionJournal,
  orchestrateAliceModalSafeBootstrap,
  verifyAliceModalSafeBootstrapHttp,
} from "./alice_modal_safe_bootstrap.mjs";

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

const legacy = {
  appId: "ap-oFaCNy2jJDFalZienNB2Ht",
  environment: "main",
  providerVersion: 48,
  providerHistory: [{
    providerVersion: 48,
    rollbackVersion: 0,
    clientVersion: "1.5.0",
    deployedBy: "rndrntwrk",
    commitHash: "be30eaaa36741347fdf468b6247de6529f25ff2b",
    dirty: false,
  }],
  functionIds: { alice_web: "fu-fm2fP3cNQPgCIqe7QoBIHn" },
  function: {
    name: "alice_web",
    id: "fu-fm2fP3cNQPgCIqe7QoBIHn",
    webUrl: "https://rndrntwrk--alice.modal.run",
    inputFormats: ["DATA_FORMAT_ASGI"],
  },
  mountedSecretObjects: [
    { id: "st-TU930BfNl1jK3wZ9ZcYtEn", name: "alice-capture-api-token" },
    { id: "st-j4YWJkXzvQKIc4OWlRQH62", name: "alice-cloudflare-ai" },
    { id: "st-em904Ts5jgkuESl7afKErN", name: "alice-runtime" },
    { id: "st-AbLeNv3yRqufY3ZuhAMq94", name: "alice-stream-control" },
    { id: "st-n7j9WvyEPfqOpaL31OgpX4", name: "alice-stream-destinations" },
    { id: "st-Z4x242VHLlCPrUtzRhTVvp", name: "alice-wallet" },
  ],
  mountedVolumeIds: [],
  imageObjectIds: ["im-uqZXCsMeoubO36BvfdQSDT"],
  autoscalerEnforcement: { status: "provider-unverifiable" },
};

const safe = {
  ...legacy,
  providerVersion: 49,
  providerHistory: [{
    providerVersion: 49,
    rollbackVersion: 0,
    clientVersion: "1.5.4",
    deployedBy: "rndrntwrk",
    commitHash: release.sourceCommit,
    dirty: false,
  }],
  functionIds: { alice_web: "fu-AAAAAAAAAAAAAAAAAAAAAA" },
  function: {
    ...legacy.function,
    id: "fu-AAAAAAAAAAAAAAAAAAAAAA",
  },
  mountedSecretObjects: [
    { id: "st-BBBBBBBBBBBBBBBBBBBBBB", name: "alice-ghcr-registry" },
  ],
  imageObjectIds: ["im-AAAAAAAAAAAAAAAAAAAAAA"],
  autoscalerEnforcement: {
    status: "provider-enforced",
    functionId: "fu-AAAAAAAAAAAAAAAAAAAAAA",
    minContainers: 0,
    maxContainers: 1,
    bufferContainers: 0,
    scaledownWindow: 300,
  },
};

const providerState = {
  tokenInfo:
    "Workspace: rndrntwrk (ac-heK8sGJBc367raQUx6R59o)\n" +
    "User: rndrntwrk (us-rJM1ZZiySURgAhBEOqvR16)\n",
  environments: [{ name: "main", web_suffix: "", active: "True" }],
  apps: [{
    app_id: safe.appId,
    description: "alice-runtime",
    state: "deployed",
    tasks: "0",
  }],
  history: [{
    version: "v49",
    client: "1.5.4",
    deployed_by: "rndrntwrk",
    commit: release.sourceCommit.slice(0, 7),
  }],
  containers: [],
  layout: safe,
};

test("captures only the exact known unsafe v48 transition boundary", () => {
  const journal = buildAliceModalLegacyTransitionJournal({
    previous: legacy,
    release,
    observedAt: "2026-08-23T12:00:00.000Z",
  });
  assert.equal(journal.previousProviderVersion, 48);
  assert.equal(journal.failureBoundary, "stop-alice-runtime");
  assert.throws(() => buildAliceModalLegacyTransitionJournal({
    previous: { ...legacy, providerVersion: 47 },
    release,
    observedAt: "2026-08-23T12:00:00.000Z",
  }), /ALICE_MODAL_LEGACY_TRANSITION_INVALID/);
});

test("deploys and externally binds the inert bootstrap before returning an anchor", async () => {
  const calls = [];
  const journal = buildAliceModalLegacyTransitionJournal({
    previous: legacy,
    release,
    observedAt: "2026-08-23T12:00:00.000Z",
  });
  const result = await orchestrateAliceModalSafeBootstrap({
    journal,
    release,
    operations: {
      captureLegacy: async () => {
        calls.push("capture-legacy");
        return legacy;
      },
      verifyProtectedRef: async () => calls.push("verify-protected-ref"),
      deploySafeBootstrap: async () => calls.push("deploy-safe-bootstrap"),
      readSafeBootstrapState: async () => {
        calls.push("read-safe-bootstrap");
        return providerState;
      },
      verifySafeBootstrapRuntime: async () => {
        calls.push("verify-safe-runtime");
        return {
          schemaVersion: "alice.modal-safe-bootstrap-runtime.v1",
          unauthenticatedStatus: 401,
          authenticatedStatus: 503,
          safeBootstrap: true,
          paused: true,
          ready: false,
          release,
        };
      },
      stopApp: async () => calls.push("stop-app"),
      verifyAppStopped: async () => calls.push("verify-stopped"),
    },
    observedAt: "2026-08-23T12:01:00.000Z",
  });
  assert.deepEqual(calls, [
    "capture-legacy",
    "verify-protected-ref",
    "deploy-safe-bootstrap",
    "read-safe-bootstrap",
    "verify-safe-runtime",
  ]);
  assert.equal(result.anchor.previous.providerVersion, 49);
  assert.equal(result.anchor.safeBootstrapEvidence.safeBootstrap, true);
});

test("stops the app instead of ever rolling back to v48 after ambiguous failure", async () => {
  const calls = [];
  const journal = buildAliceModalLegacyTransitionJournal({
    previous: legacy,
    release,
    observedAt: "2026-08-23T12:00:00.000Z",
  });
  await assert.rejects(() => orchestrateAliceModalSafeBootstrap({
    journal,
    release,
    operations: {
      captureLegacy: async () => legacy,
      verifyProtectedRef: async () => calls.push("verify-protected-ref"),
      deploySafeBootstrap: async () => {
        calls.push("deploy-safe-bootstrap");
        throw new Error("ALICE_MODAL_SAFE_BOOTSTRAP_DEPLOY_FAILED");
      },
      readSafeBootstrapState: async () => providerState,
      verifySafeBootstrapRuntime: async () => ({}),
      stopApp: async () => calls.push("stop-app"),
      verifyAppStopped: async () => calls.push("verify-stopped"),
    },
    observedAt: "2026-08-23T12:01:00.000Z",
  }), (error) => {
    assert.equal(error.modalSafeStopVerified, true);
    return true;
  });
  assert.deepEqual(calls, [
    "verify-protected-ref",
    "deploy-safe-bootstrap",
    "stop-app",
    "verify-stopped",
  ]);
});

test("requires exact proxy rejection and canonical authenticated paused body", async () => {
  const calls = [];
  const evidence = await verifyAliceModalSafeBootstrapHttp({
    release,
    modalProxyKey: `wk-${"a".repeat(24)}`,
    modalProxySecret: `ws-${"b".repeat(24)}`,
    fetchImpl: async (_url, init) => {
      calls.push(init.headers);
      if (!("modal-key" in init.headers)) {
        return new Response(
          "modal-http: missing credentials for proxy authorization",
          { status: 401, headers: { "content-type": "text/plain" } },
        );
      }
      return new Response(JSON.stringify({
        status: "paused",
        agentState: "safe-bootstrap",
        safeBootstrap: true,
        paused: true,
        ready: false,
        release,
      }), {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
  });
  assert.equal(evidence.unauthenticatedStatus, 401);
  assert.equal(evidence.authenticatedStatus, 503);
  assert.deepEqual(Object.keys(calls[0]), ["accept"]);
  assert.equal(calls[1]["modal-key"], `wk-${"a".repeat(24)}`);
});

test("rebuilds the same anchor without mutation after v49 proof preceded persistence", () => {
  const runtime = {
    schemaVersion: "alice.modal-safe-bootstrap-runtime.v1",
    unauthenticatedStatus: 401,
    authenticatedStatus: 503,
    safeBootstrap: true,
    paused: true,
    ready: false,
    release,
  };
  const rebuilt = buildAliceModalSafeBootstrapResult({
    release,
    state: providerState,
    runtime,
    observedAt: "2026-08-23T12:02:00.000Z",
  });
  assert.equal(rebuilt.anchor.previous.providerVersion, 49);
  assert.equal(rebuilt.anchor.safeBootstrapEvidence.runtime.ready, false);
  assert.equal(rebuilt.anchor.sourceCommit, release.sourceCommit);
});
