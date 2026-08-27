import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as safeBootstrapModule from "./alice_modal_safe_bootstrap.mjs";

import {
  buildAliceModalStoppedReentryJournal,
  buildAliceModalSafeBootstrapResult,
  buildAliceModalLegacyTransitionJournal,
  captureAliceModalStopBoundary,
  orchestrateAliceModalSafeBootstrap,
  verifyAliceModalSafeBootstrapHttp,
} from "./alice_modal_safe_bootstrap.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

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
  mountedSecretObjects: [],
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

const stoppedSafe = {
  ...safe,
  functionIds: { alice_web: "fu-fm2fP3cNQPgCIqe7QoBIHn" },
  function: {
    ...safe.function,
    id: "fu-fm2fP3cNQPgCIqe7QoBIHn",
  },
  imageObjectIds: ["im-XuoDTAvQeu5HBjYMOdbGoc"],
  autoscalerEnforcement: { status: "provider-unverifiable" },
  providerHistory: [{
    ...safe.providerHistory[0],
    commitHash: "be7a8a13765eb13bae1d21706c0f85866ce51069",
  }],
};

const nextSafe = {
  ...safe,
  providerVersion: 50,
  providerHistory: [{
    ...safe.providerHistory[0],
    providerVersion: 50,
  }],
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

const nextProviderState = {
  ...providerState,
  history: [{
    ...providerState.history[0],
    version: "v50",
  }],
  layout: nextSafe,
};

const recreatedStoppedSafe = {
  ...stoppedSafe,
  appId: "ap-poY7q5xDReRQWDqAAWz6PT",
  providerVersion: 1,
  providerHistory: [{
    ...stoppedSafe.providerHistory[0],
    providerVersion: 1,
    commitHash: release.sourceCommit,
  }],
};

const recreatedSafe = {
  ...safe,
  appId: "ap-BBBBBBBBBBBBBBBBBBBBBB",
  providerVersion: 1,
  providerHistory: [{
    ...safe.providerHistory[0],
    providerVersion: 1,
  }],
};

const recreatedProviderState = {
  ...providerState,
  apps: [{
    ...providerState.apps[0],
    app_id: recreatedSafe.appId,
  }],
  history: [{
    ...providerState.history[0],
    version: "v1",
  }],
  layout: recreatedSafe,
};

const stoppedAppReadback = {
  apps: [{
    app_id: "ap-oFaCNy2jJDFalZienNB2Ht",
    description: "alice-runtime",
    state: "stopped",
    tasks: "0",
  }],
  containers: [],
};

const activeAppReadback = {
  apps: [{
    app_id: "ap-oFaCNy2jJDFalZienNB2Ht",
    description: "alice-runtime",
    state: "deployed",
    tasks: "0",
  }],
  containers: [],
};

test("stop-if-unanchored performs no stop when Alice is already stopped", async () => {
  assert.equal(
    typeof safeBootstrapModule.stopAliceModalIfUnanchored,
    "function",
  );
  let stopCalls = 0;
  const result = await safeBootstrapModule.stopAliceModalIfUnanchored({
    readState: async () => stoppedAppReadback,
    stopApp: async () => { stopCalls += 1; },
    wait: async () => {},
  });
  assert.deepEqual(result, {
    stopped: true,
    stopAttempted: false,
    stopCommandSucceeded: null,
  });
  assert.equal(stopCalls, 0);
});

test("stop-if-unanchored recognizes a recreated stopped Alice identity", async () => {
  let stopCalls = 0;
  const result = await safeBootstrapModule.stopAliceModalIfUnanchored({
    readState: async () => ({
      apps: [{
        ...stoppedAppReadback.apps[0],
        app_id: "ap-poY7q5xDReRQWDqAAWz6PT",
      }],
      containers: [],
    }),
    stopApp: async () => { stopCalls += 1; },
    wait: async () => {},
  });
  assert.deepEqual(result, {
    stopped: true,
    stopAttempted: false,
    stopCommandSucceeded: null,
  });
  assert.equal(stopCalls, 0);
});

test("stop-if-unanchored stops an active Alice app exactly once", async () => {
  assert.equal(
    typeof safeBootstrapModule.stopAliceModalIfUnanchored,
    "function",
  );
  let reads = 0;
  let stopCalls = 0;
  const result = await safeBootstrapModule.stopAliceModalIfUnanchored({
    readState: async () => {
      reads += 1;
      return reads === 1 ? activeAppReadback : stoppedAppReadback;
    },
    stopApp: async () => { stopCalls += 1; },
    wait: async () => {},
  });
  assert.deepEqual(result, {
    stopped: true,
    stopAttempted: true,
    stopCommandSucceeded: true,
  });
  assert.equal(stopCalls, 1);
});

test("stop-if-unanchored binds Alice before stopping a running bootstrap", async () => {
  let reads = 0;
  let stopCalls = 0;
  const stoppedAppIds = [];
  const unrelated = {
    app_id: "ap-CCCCCCCCCCCCCCCCCCCCCC",
    description: "unrelated-app",
    state: "deployed",
    tasks: "0",
  };
  const result = await safeBootstrapModule.stopAliceModalIfUnanchored({
    readState: async () => {
      reads += 1;
      return reads === 1
        ? {
            apps: [
              unrelated,
              { ...activeAppReadback.apps[0], tasks: "1" },
            ],
            containers: [{
              container_id: `ta-${"R".repeat(22)}`,
              app_id: activeAppReadback.apps[0].app_id,
              app_name: "alice-runtime",
              start_time: "2026-08-26 20:00:00-05:00",
            }],
          }
        : {
            apps: [unrelated, stoppedAppReadback.apps[0]],
            containers: [],
          };
    },
    stopApp: async (appId) => {
      stopCalls += 1;
      stoppedAppIds.push(appId);
    },
    wait: async () => {},
  });
  assert.deepEqual(result, {
    stopped: true,
    stopAttempted: true,
    stopCommandSucceeded: true,
  });
  assert.equal(stopCalls, 1);
  assert.deepEqual(stoppedAppIds, [activeAppReadback.apps[0].app_id]);
});

test("stop-if-unanchored ignores containers bound to an unrelated app", async () => {
  let stopCalls = 0;
  const unrelatedAppId = "ap-CCCCCCCCCCCCCCCCCCCCCC";
  const result = await safeBootstrapModule.stopAliceModalIfUnanchored({
    readState: async () => ({
      apps: [
        stoppedAppReadback.apps[0],
        {
          app_id: unrelatedAppId,
          description: "unrelated-app",
          state: "deployed",
          tasks: "1",
        },
      ],
      containers: [{
        container_id: `ta-${"U".repeat(22)}`,
        app_id: unrelatedAppId,
        app_name: "unrelated-app",
        start_time: "2026-08-26 20:00:00-05:00",
      }],
    }),
    stopApp: async () => { stopCalls += 1; },
    wait: async () => {},
  });
  assert.deepEqual(result, {
    stopped: true,
    stopAttempted: false,
    stopCommandSucceeded: null,
  });
  assert.equal(stopCalls, 0);
});

test("stop-if-unanchored rejects an unattributed container before mutation", async () => {
  let stopCalls = 0;
  await assert.rejects(
    safeBootstrapModule.stopAliceModalIfUnanchored({
      readState: async () => ({
        ...stoppedAppReadback,
        containers: [{
          container_id: `ta-${"M".repeat(22)}`,
          app_name: "unrelated-app",
          start_time: "2026-08-26 20:00:00-05:00",
        }],
      }),
      stopApp: async () => { stopCalls += 1; },
      wait: async () => {},
    }),
    /ALICE_MODAL_SAFE_STOP_INVALID/,
  );
  assert.equal(stopCalls, 0);
});

test("stop-if-unanchored accepts a nonzero stop race only after stopped readback", async () => {
  assert.equal(
    typeof safeBootstrapModule.stopAliceModalIfUnanchored,
    "function",
  );
  let reads = 0;
  let stopCalls = 0;
  const result = await safeBootstrapModule.stopAliceModalIfUnanchored({
    readState: async () => {
      reads += 1;
      return reads === 1 ? activeAppReadback : stoppedAppReadback;
    },
    stopApp: async () => {
      stopCalls += 1;
      throw new Error("provider command exited nonzero");
    },
    wait: async () => {},
  });
  assert.deepEqual(result, {
    stopped: true,
    stopAttempted: true,
    stopCommandSucceeded: false,
  });
  assert.equal(stopCalls, 1);
});

test("stop-if-unanchored fails closed when active state remains unverifiable", async () => {
  assert.equal(
    typeof safeBootstrapModule.stopAliceModalIfUnanchored,
    "function",
  );
  let stopCalls = 0;
  await assert.rejects(
    safeBootstrapModule.stopAliceModalIfUnanchored({
      readState: async () => activeAppReadback,
      stopApp: async () => { stopCalls += 1; },
      wait: async () => {},
    }),
    /ALICE_MODAL_SAFE_STOP_INVALID/,
  );
  assert.equal(stopCalls, 1);
});

test("stop-if-unanchored rejects an identity swap after the stop command", async () => {
  let reads = 0;
  let stopCalls = 0;
  await assert.rejects(
    safeBootstrapModule.stopAliceModalIfUnanchored({
      readState: async () => {
        reads += 1;
        return reads === 1
          ? activeAppReadback
          : {
              apps: [{
                ...stoppedAppReadback.apps[0],
                app_id: "ap-BBBBBBBBBBBBBBBBBBBBBB",
              }],
              containers: [],
            };
      },
      stopApp: async () => { stopCalls += 1; },
      wait: async () => {},
    }),
    /ALICE_MODAL_SAFE_STOP_INVALID/,
  );
  assert.equal(stopCalls, 1);
});

test("stop-if-unanchored rejects ambiguous Alice app rows before mutation", async () => {
  let stopCalls = 0;
  await assert.rejects(
    safeBootstrapModule.stopAliceModalIfUnanchored({
      readState: async () => ({
        apps: [
          activeAppReadback.apps[0],
          {
            ...activeAppReadback.apps[0],
            app_id: "ap-BBBBBBBBBBBBBBBBBBBBBB",
          },
        ],
        containers: [],
      }),
      stopApp: async () => { stopCalls += 1; },
      wait: async () => {},
    }),
    /ALICE_MODAL_SAFE_STOP_INVALID/,
  );
  assert.equal(stopCalls, 0);
});

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

test("captures the exact stopped safe-bootstrap graph for bounded re-entry", async () => {
  const calls = [];
  const result = await captureAliceModalStopBoundary({
    release,
    observedAt: "2026-08-26T22:20:00.000Z",
    captureCurrent: async () => {
      calls.push("capture-current");
      throw new Error("ALICE_MODAL_PROVIDER_READBACK_INVALID");
    },
    captureStopped: async () => {
      calls.push("capture-stopped");
      return stoppedSafe;
    },
  });
  assert.deepEqual(calls, ["capture-current", "capture-stopped"]);
  assert.equal(result.action, "transition");
  assert.equal(result.journal.schemaVersion, "alice.modal-stopped-reentry.v1");
  assert.equal(result.journal.failureBoundary, "restart-stopped-safe-bootstrap");
  assert.equal(result.journal.previousProviderVersion, 49);
  assert.deepEqual(result.journal.previous, stoppedSafe);
});

test("keeps an active safe bootstrap on the existing runtime re-entry path", async () => {
  let stoppedCaptures = 0;
  const result = await captureAliceModalStopBoundary({
    release,
    observedAt: "2026-08-26T22:20:00.000Z",
    captureCurrent: async () => safe,
    captureStopped: async () => {
      stoppedCaptures += 1;
      return stoppedSafe;
    },
  });
  assert.deepEqual(result, { action: "active-safe-reentry" });
  assert.equal(stoppedCaptures, 0);
});

test("stopped re-entry rejects drift from the inert safe-bootstrap graph", () => {
  const invalidPrevious = [
    { ...stoppedSafe, appId: "not-a-modal-app-id" },
    { ...stoppedSafe, providerVersion: 48 },
    {
      ...stoppedSafe,
      providerHistory: [{ ...stoppedSafe.providerHistory[0], rollbackVersion: 48 }],
    },
    {
      ...stoppedSafe,
      mountedSecretObjects: [
        ...stoppedSafe.mountedSecretObjects,
        { id: "st-CCCCCCCCCCCCCCCCCCCCCC", name: "alice-runtime" },
      ],
    },
  ];
  for (const previous of invalidPrevious) {
    assert.throws(
      () => buildAliceModalStoppedReentryJournal({
        previous,
        release,
        observedAt: "2026-08-26T22:20:00.000Z",
      }),
      /ALICE_MODAL_STOPPED_REENTRY_INVALID/,
    );
  }
});

test("rejects a stopped re-entry that reuses the retired identity/version epoch", async () => {
  const calls = [];
  const journal = buildAliceModalStoppedReentryJournal({
    previous: stoppedSafe,
    release,
    observedAt: "2026-08-26T22:20:00.000Z",
  });
  await assert.rejects(
    orchestrateAliceModalSafeBootstrap({
      journal,
      release,
      operations: {
        captureLegacy: async () => {
          throw new Error("legacy capture must not run");
        },
        captureStopped: async () => {
          calls.push("capture-stopped");
          return stoppedSafe;
        },
        verifyProtectedRef: async () => calls.push("verify-protected-ref"),
        deploySafeBootstrap: async () => calls.push("deploy-safe-bootstrap"),
        readSafeBootstrapState: async () => {
          calls.push("read-safe-bootstrap");
          return nextProviderState;
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
        stopIfUnanchored: async () => calls.push("stop-if-unanchored"),
      },
      observedAt: "2026-08-26T22:21:00.000Z",
    }),
    (error) => {
      assert.equal(
        error.modalSafeBootstrapFailure?.code,
        "ALICE_MODAL_SAFE_BOOTSTRAP_INVALID",
      );
      return true;
    },
  );
  assert.deepEqual(calls, [
    "capture-stopped",
    "verify-protected-ref",
    "deploy-safe-bootstrap",
    "read-safe-bootstrap",
    "verify-safe-runtime",
    "stop-if-unanchored",
  ]);
});

test("re-enters a stopped recreated app through one fresh v1 identity", async () => {
  const journal = buildAliceModalStoppedReentryJournal({
    previous: recreatedStoppedSafe,
    release,
    observedAt: "2026-08-26T23:35:00.000Z",
  });
  const result = await orchestrateAliceModalSafeBootstrap({
    journal,
    release,
    operations: {
      captureStopped: async () => recreatedStoppedSafe,
      verifyProtectedRef: async () => {},
      deploySafeBootstrap: async () => {},
      readSafeBootstrapState: async () => recreatedProviderState,
      verifySafeBootstrapRuntime: async () => ({
        schemaVersion: "alice.modal-safe-bootstrap-runtime.v1",
        unauthenticatedStatus: 401,
        authenticatedStatus: 503,
        safeBootstrap: true,
        paused: true,
        ready: false,
        release,
      }),
      stopIfUnanchored: async () => {},
    },
    observedAt: "2026-08-26T23:36:00.000Z",
  });
  assert.equal(journal.appId, recreatedStoppedSafe.appId);
  assert.equal(result.anchor.appId, recreatedSafe.appId);
  assert.notEqual(result.anchor.appId, journal.appId);
  assert.equal(result.anchor.previous.providerVersion, 1);
});

test("recovery explicitly no-ops before Modal and stops only a verified unanchored transition", () => {
  assert.equal(typeof safeBootstrapModule.resolveAliceModalSafeRecovery, "function");
  const observedAt = "2026-08-23T12:03:00.000Z";
  assert.deepEqual(
    safeBootstrapModule.resolveAliceModalSafeRecovery({
      release,
      transition: null,
      anchor: null,
      mutationJournalPresent: false,
      observedAt,
    }),
    {
      schemaVersion: "alice.modal-recovery-decision.v1",
      observedAt,
      sourceCommit: release.sourceCommit,
      deploymentManifestSha256: release.deploymentManifestSha256,
      action: "pre-modal-noop",
      transitionPresent: false,
      anchorPresent: false,
      mutationJournalPresent: false,
    },
  );
  const transition = buildAliceModalLegacyTransitionJournal({
    previous: legacy,
    release,
    observedAt,
  });
  assert.equal(
    safeBootstrapModule.resolveAliceModalSafeRecovery({
      release,
      transition,
      anchor: null,
      mutationJournalPresent: false,
      observedAt,
    }).action,
    "stop-if-unanchored",
  );
  const stoppedTransition = buildAliceModalStoppedReentryJournal({
    previous: stoppedSafe,
    release,
    observedAt,
  });
  assert.equal(
    safeBootstrapModule.resolveAliceModalSafeRecovery({
      release,
      transition: stoppedTransition,
      anchor: null,
      mutationJournalPresent: false,
      observedAt,
    }).action,
    "stop-if-unanchored",
  );
});

test("recovery validates anchors and fails closed on malformed or partial artifacts", () => {
  assert.equal(typeof safeBootstrapModule.resolveAliceModalSafeRecovery, "function");
  const observedAt = "2026-08-23T12:04:00.000Z";
  const runtime = {
    schemaVersion: "alice.modal-safe-bootstrap-runtime.v1",
    unauthenticatedStatus: 401,
    authenticatedStatus: 503,
    safeBootstrap: true,
    paused: true,
    ready: false,
    release,
  };
  const anchor = buildAliceModalSafeBootstrapResult({
    release,
    state: providerState,
    runtime,
    observedAt,
  }).anchor;
  assert.equal(
    safeBootstrapModule.resolveAliceModalSafeRecovery({
      release,
      transition: null,
      anchor,
      mutationJournalPresent: false,
      observedAt,
    }).action,
    "safe-anchor",
  );
  assert.throws(
    () => safeBootstrapModule.resolveAliceModalSafeRecovery({
      release,
      transition: { schemaVersion: "alice.modal-legacy-transition.v1" },
      anchor: null,
      mutationJournalPresent: false,
      observedAt,
    }),
    /ALICE_MODAL_LEGACY_TRANSITION_INVALID/,
  );
  assert.throws(
    () => safeBootstrapModule.resolveAliceModalSafeRecovery({
      release,
      transition: null,
      anchor: null,
      mutationJournalPresent: true,
      observedAt,
    }),
    /ALICE_MODAL_RECOVERY_STATE_INVALID/,
  );
  assert.throws(
    () => safeBootstrapModule.resolveAliceModalSafeRecovery({
      release,
      transition: null,
      anchor: { schemaVersion: "alice.modal-rollback-anchor.v2" },
      mutationJournalPresent: false,
      observedAt,
    }),
    /ALICE_MODAL_ROLLBACK_ANCHOR_INVALID/,
  );
});

test("the recovery CLI resolves artifacts before constructing any Modal command environment", () => {
  const source = fs.readFileSync(
    path.join(currentDirectory, "alice_modal_safe_bootstrap_cli.mjs"),
    "utf8",
  );
  const resolve = source.indexOf(
    "recoveryDecision = resolveAliceModalSafeRecovery({",
  );
  const noOp = source.indexOf(
    'if (recoveryDecision.action === "pre-modal-noop")',
  );
  const commandEnvironment = source.indexOf(
    "const commandEnv = aliceModalCommandEnv(process.env);",
  );
  const stop = source.indexOf('if (phase === "recover") {', commandEnvironment);
  assert.ok(resolve >= 0 && noOp >= 0 && commandEnvironment >= 0 && stop >= 0);
  assert.ok(resolve < noOp && noOp < commandEnvironment && commandEnvironment < stop);
});

test("the recovery CLI stops only the app ID selected by the readback", () => {
  const source = fs.readFileSync(
    path.join(currentDirectory, "alice_modal_safe_bootstrap_cli.mjs"),
    "utf8",
  );
  assert.match(source, /const stopApp = async \(appId\) =>/);
  assert.match(source, /buildAliceModalStopCommand\(appId\)/);
});

test("capture safe re-entry persists its first sanitized failure after cleanup", () => {
  const source = fs.readFileSync(
    path.join(currentDirectory, "alice_modal_safe_bootstrap_cli.mjs"),
    "utf8",
  );
  const captureStart = source.indexOf('if (phase === "capture") {');
  const recoverStart = source.indexOf('if (phase === "recover") {', captureStart);
  const capture = source.slice(captureStart, recoverStart);
  assert.ok(captureStart >= 0 && recoverStart > captureStart);
  assert.match(capture, /let safeFailureStage = "provider-readback"/);
  assert.match(capture, /safeFailureStage = "runtime-http"/);
  assert.match(capture, /buildAliceModalSafeBootstrapFailure\(\{/);
  assert.match(capture, /writeReadonly\(failurePath, safeFailure\)/);
  assert.match(capture, /failure\.modalSafeBootstrapFailure = safeFailure/);
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
      stopIfUnanchored: async () => calls.push("stop-if-unanchored"),
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
      stopIfUnanchored: async () => calls.push("stop-if-unanchored"),
    },
    observedAt: "2026-08-23T12:01:00.000Z",
  }), (error) => {
    assert.equal(error.modalSafeStopVerified, true);
    return true;
  });
  assert.deepEqual(calls, [
    "verify-protected-ref",
    "deploy-safe-bootstrap",
    "stop-if-unanchored",
  ]);
});

test("bootstrap cleanup delegates to the idempotent stop-if-unanchored boundary", async () => {
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
      verifyProtectedRef: async () => {},
      deploySafeBootstrap: async () => {
        throw new Error("ALICE_MODAL_SAFE_BOOTSTRAP_DEPLOY_FAILED");
      },
      readSafeBootstrapState: async () => providerState,
      verifySafeBootstrapRuntime: async () => ({}),
      stopIfUnanchored: async () => calls.push("stop-if-unanchored"),
    },
    observedAt: "2026-08-23T12:01:00.000Z",
  }));
  assert.deepEqual(calls, ["stop-if-unanchored"]);
});

test("preserves the first sanitized bootstrap failure across cleanup", async () => {
  assert.equal(
    typeof safeBootstrapModule.verifyAliceModalSafeBootstrapFailure,
    "function",
  );
  const journal = buildAliceModalLegacyTransitionJournal({
    previous: legacy,
    release,
    observedAt: "2026-08-23T12:00:00.000Z",
  });
  const cases = [
    {
      stage: "protected-ref",
      code: "ALICE_MODAL_PROTECTED_REF_INVALID",
      fail: "verifyProtectedRef",
    },
    {
      stage: "deploy-bootstrap",
      code: "ALICE_MODAL_SAFE_BOOTSTRAP_DEPLOY_FAILED",
      fail: "deploySafeBootstrap",
    },
    {
      stage: "provider-readback",
      code: "ALICE_MODAL_LAYOUT_INVALID",
      fail: "readSafeBootstrapState",
    },
    {
      stage: "runtime-http",
      code: "ALICE_MODAL_SAFE_BOOTSTRAP_RUNTIME_INVALID",
      fail: "verifySafeBootstrapRuntime",
    },
  ];
  for (const failureCase of cases) {
    const operations = {
      captureLegacy: async () => legacy,
      verifyProtectedRef: async () => {},
      deploySafeBootstrap: async () => {},
      readSafeBootstrapState: async () => providerState,
      verifySafeBootstrapRuntime: async () => ({
        schemaVersion: "alice.modal-safe-bootstrap-runtime.v1",
        unauthenticatedStatus: 401,
        authenticatedStatus: 503,
        safeBootstrap: true,
        paused: true,
        ready: false,
        release,
      }),
      stopIfUnanchored: async () => {},
    };
    operations[failureCase.fail] = async () => {
      throw new Error(failureCase.code);
    };
    await assert.rejects(
      orchestrateAliceModalSafeBootstrap({
        journal,
        release,
        operations,
        observedAt: "2026-08-23T12:05:00.000Z",
      }),
      (error) => {
        assert.deepEqual(error.modalSafeBootstrapFailure, {
          schemaVersion: "alice.modal-safe-bootstrap-failure.v1",
          observedAt: "2026-08-23T12:05:00.000Z",
          sourceCommit: release.sourceCommit,
          deploymentManifestSha256: release.deploymentManifestSha256,
          stage: failureCase.stage,
          code: failureCase.code,
          safeStopVerified: true,
        });
        assert.deepEqual(
          safeBootstrapModule.verifyAliceModalSafeBootstrapFailure(
            error.modalSafeBootstrapFailure,
            { release },
          ),
          error.modalSafeBootstrapFailure,
        );
        return true;
      },
    );
  }
});

test("cleanup failure cannot replace the first sanitized bootstrap failure", async () => {
  const journal = buildAliceModalLegacyTransitionJournal({
    previous: legacy,
    release,
    observedAt: "2026-08-23T12:00:00.000Z",
  });
  await assert.rejects(
    orchestrateAliceModalSafeBootstrap({
      journal,
      release,
      operations: {
        captureLegacy: async () => legacy,
        verifyProtectedRef: async () => {},
        deploySafeBootstrap: async () => {},
        readSafeBootstrapState: async () => {
          throw new Error("ALICE_MODAL_LAYOUT_INVALID");
        },
        verifySafeBootstrapRuntime: async () => ({}),
        stopIfUnanchored: async () => {
          throw new Error("ALICE_MODAL_SAFE_STOP_INVALID");
        },
      },
      observedAt: "2026-08-23T12:05:00.000Z",
    }),
    (error) => {
      assert.deepEqual(error.modalSafeBootstrapFailure, {
        schemaVersion: "alice.modal-safe-bootstrap-failure.v1",
        observedAt: "2026-08-23T12:05:00.000Z",
        sourceCommit: release.sourceCommit,
        deploymentManifestSha256: release.deploymentManifestSha256,
        stage: "provider-readback",
        code: "ALICE_MODAL_LAYOUT_INVALID",
        safeStopVerified: false,
      });
      assert.equal(error.message, "ALICE_MODAL_SAFE_BOOTSTRAP_AND_STOP_FAILED");
      return true;
    },
  );
});

test("rejects non-allowlisted or secret-bearing bootstrap failure evidence", () => {
  assert.equal(
    typeof safeBootstrapModule.verifyAliceModalSafeBootstrapFailure,
    "function",
  );
  const valid = {
    schemaVersion: "alice.modal-safe-bootstrap-failure.v1",
    observedAt: "2026-08-23T12:05:00.000Z",
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256: release.deploymentManifestSha256,
    stage: "runtime-http",
    code: "ALICE_MODAL_SAFE_BOOTSTRAP_RUNTIME_INVALID",
    safeStopVerified: false,
  };
  assert.throws(
    () => safeBootstrapModule.verifyAliceModalSafeBootstrapFailure(
      { ...valid, stderr: "secret provider response" },
      { release },
    ),
    /ALICE_MODAL_SAFE_BOOTSTRAP_FAILURE_INVALID/,
  );
  assert.throws(
    () => safeBootstrapModule.verifyAliceModalSafeBootstrapFailure(
      { ...valid, code: "ALICE_UNREVIEWED_ERROR" },
      { release },
    ),
    /ALICE_MODAL_SAFE_BOOTSTRAP_FAILURE_INVALID/,
  );
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
