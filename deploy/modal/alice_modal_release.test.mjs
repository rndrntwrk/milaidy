import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  aliceModalCommandEnv,
  buildAliceModalRollbackCommands,
  buildAliceModalReleaseCommands,
  buildAliceModalReleaseSecret,
  deriveAliceRuntimeReleaseCredential,
  digestAliceModalProviderGraph,
  verifyAliceModalProviderTransition,
  verifyAliceModalProviderReadback,
  verifyAliceModalRollbackAnchorLayout,
  verifyAliceModalProviderRestoration,
  verifyAliceModalProviderTerminalCoherence,
  verifyAliceModalRuntimeHttp,
  verifyAliceModalSafeBootstrapReadback,
} from "./alice_modal_release.mjs";

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

test("derives a distinct runtime bearer for each exact release digest", () => {
  const rootSecret = "release-token-root-with-at-least-32-bytes";
  const previous = deriveAliceRuntimeReleaseCredential({
    rootSecret,
    releaseDigest: `sha256:${"a".repeat(64)}`,
  });
  const candidate = deriveAliceRuntimeReleaseCredential({
    rootSecret,
    releaseDigest: `sha256:${"b".repeat(64)}`,
  });
  assert.notEqual(previous.token, candidate.token);
  assert.match(candidate.token, /^art1_[A-Za-z0-9_-]{43}$/);
  assert.match(candidate.saltedSha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(candidate.evidenceQueueHmacKey, /^aeq1_[A-Za-z0-9_-]{43}$/);
  assert.equal(previous.evidenceQueueHmacKey, candidate.evidenceQueueHmacKey);
  assert.deepEqual(
    deriveAliceRuntimeReleaseCredential({
      rootSecret,
      releaseDigest: `sha256:${"b".repeat(64)}`,
    }),
    candidate,
  );
  const retainedPreviousDigest = `sha256:${crypto
    .createHash("sha256")
    .update(`sha256:${"b".repeat(64)}:${previous.token}`)
    .digest("hex")}`;
  assert.notEqual(retainedPreviousDigest, candidate.saltedSha256);
});

test("builds one create-only digest-named Modal secret with the exact allowlist", () => {
  const built = buildAliceModalReleaseSecret({
    release,
    releaseRunId: "12345-1",
    scoped: {
      MILADY_API_TOKEN: "milady-api-token-with-at-least-32-bytes",
      OPENAI_API_KEY: "runtime-model-token-with-at-least-32-bytes",
      MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET:
        "cloudflare-proxy-secret-with-at-least-32-bytes",
      ELIZA_VAULT_PASSPHRASE: "vault-passphrase-with-at-least-32-bytes",
    },
  });
  assert.equal(built.name, `alice-production-core-${"2".repeat(64)}-12345-1`);
  assert.deepEqual(Object.keys(built.values).sort(), [
    "ALICE_DEPLOYMENT_CONTROLLER_COMMIT",
    "ALICE_DEPLOYMENT_MANIFEST_SHA256",
    "ALICE_ELIZA_COMMIT",
    "ALICE_MODAL_REVISION",
    "ALICE_POLICY_HASH",
    "ALICE_PROGRAM_DIGEST",
    "ALICE_RELEASE_DIGEST",
    "ALICE_RUNTIME_BUILD_MANIFEST_SHA256",
    "ALICE_RUNTIME_IMAGE",
    "ALICE_SOURCE_COMMIT",
    "ELIZA_VAULT_PASSPHRASE",
    "MILADY_API_TOKEN",
    "MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET",
    "OPENAI_API_KEY",
  ].sort());
  assert.equal(built.values.ALICE_MODAL_REVISION, "49");
  assert.throws(
    () => buildAliceModalReleaseSecret({
      release,
      releaseRunId: "12345-1",
      scoped: {
        MILADY_API_TOKEN: "milady-api-token-with-at-least-32-bytes",
        OPENAI_API_KEY: "runtime-model-token-with-at-least-32-bytes",
        MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET:
          "milady-api-token-with-at-least-32-bytes",
        ELIZA_VAULT_PASSPHRASE: "vault-passphrase-with-at-least-32-bytes",
      },
    }),
    /ALICE_MODAL_SECRET_INVALID/,
  );
});

test("gives Modal children only the exact token, tool, locale, and release inputs", () => {
  const modalTokenSecret = `as-${"s".repeat(22)}`;
  const env = aliceModalCommandEnv({
    PATH: "/tools",
    LANG: "C.UTF-8",
    MODAL_TOKEN_ID: "ak-test-token-id",
    MODAL_TOKEN_SECRET: modalTokenSecret,
    ALICE_MODAL_RELEASE_SECRET_NAME: `alice-production-core-${"2".repeat(64)}-12345-1`,
    ALICE_MODAL_REVISION: "49",
    ALICE_RUNTIME_IMAGE: release.runtimeImage,
    UNRELATED_SECRET: "must-not-pass",
  });
  assert.deepEqual(env, {
    PATH: "/tools",
    LANG: "C.UTF-8",
    MODAL_TOKEN_ID: "ak-test-token-id",
    MODAL_TOKEN_SECRET: modalTokenSecret,
    MODAL_ENVIRONMENT: "main",
    ALICE_MODAL_RELEASE_SECRET_NAME: `alice-production-core-${"2".repeat(64)}-12345-1`,
    ALICE_MODAL_REVISION: "49",
    ALICE_RUNTIME_IMAGE: release.runtimeImage,
  });
});

test("accepts only the exact provider-issued Modal API token secret shape", () => {
  const ambient = {
    MODAL_TOKEN_ID: "ak-test-token-id",
    MODAL_TOKEN_SECRET: `as-${"s".repeat(22)}`,
    ALICE_MODAL_RELEASE_SECRET_NAME:
      `alice-production-core-${"2".repeat(64)}-12345-1`,
    ALICE_MODAL_REVISION: "49",
    ALICE_RUNTIME_IMAGE: release.runtimeImage,
  };
  assert.doesNotThrow(() => aliceModalCommandEnv(ambient));

  for (const invalidSecret of [
    `as-${"s".repeat(21)}`,
    `as-${"s".repeat(23)}`,
    `ws-${"s".repeat(22)}`,
    `as-${"s".repeat(21)}!`,
    `as-${"s".repeat(21)}\n`,
    `as-${"s".repeat(21)}\r`,
    "as-test-token-secret-with-at-least-32-bytes",
  ]) {
    assert.throws(
      () => aliceModalCommandEnv({
        ...ambient,
        MODAL_TOKEN_SECRET: invalidSecret,
      }),
      /ALICE_MODAL_COMMAND_ENV_INVALID/,
    );
  }
});

test("keeps signed Alice revision separate from Modal provider deployment versions", () => {
  const commands = buildAliceModalReleaseCommands({
    modalBin: "/tools/modal",
    pythonBin: "/tools/python",
    sourceRoot: "/release/source",
    secretName: `alice-production-core-${"2".repeat(64)}-12345-1`,
    secretJsonPath: "/release/tmp/secret.json",
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256: release.deploymentManifestSha256,
    modalRevision: 49,
  });
  assert.deepEqual(commands.createSecret.slice(0, 4), [
    "secret", "create", `alice-production-core-${"2".repeat(64)}-12345-1`, "--env",
  ]);
  assert.equal(commands.createSecret.includes("--force"), false);
  assert.deepEqual(commands.providerSecretInventory.slice(-1), [
    "--secret-inventory",
  ]);
  assert.deepEqual(commands.providerCaptureStoppedReentry.slice(-1), [
    "--capture-stopped-reentry",
  ]);
  assert.deepEqual(commands.deploy.slice(0, 5), [
    "deploy", "--env", "main", "--name", "alice-runtime",
  ]);
  assert.equal("rollback" in commands, false);
  assert.equal("forward" in commands, false);
  assert.deepEqual(commands.providerEnforceCurrent.slice(-1), ["--enforce-current"]);
  const transition = buildAliceModalRollbackCommands({
    previousProviderVersion: 49,
    candidateProviderVersion: 73,
  });
  assert.deepEqual(transition.rollback, [
    "app", "rollback", "alice-runtime", "v49", "--env", "main",
    "--strategy", "recreate",
  ]);
  assert.deepEqual(transition.forward, [
    "app", "rollback", "alice-runtime", "v73", "--env", "main",
    "--strategy", "recreate",
  ]);
});

function providerValue({
  providerVersion = 73,
  rollbackVersion = 0,
  sourceCommit = release.sourceCommit,
  releaseSecret = `alice-production-core-${"2".repeat(64)}-12345-1`,
  safeBootstrap = false,
  functionId = "fu-fm2fP3cNQPgCIqe7QoBIHn",
  imageId = "im-uqZXCsMeoubO36BvfdQSDT",
} = {}) {
  return {
    tokenInfo: "Token: ak-redacted\nWorkspace: rndrntwrk (ac-heK8sGJBc367raQUx6R59o)\nUser: rndrntwrk (us-rJM1ZZiySURgAhBEOqvR16)\n",
    environments: [{ name: "main", web_suffix: "", active: "True" }],
    apps: [{
      app_id: "ap-oFaCNy2jJDFalZienNB2Ht",
      description: "alice-runtime",
      state: "deployed",
      tasks: "0",
      created_at: "2026-07-21 20:25:33-05:00",
      stopped_at: null,
    }],
    history: [{
      version: `v${providerVersion}`,
      time_deployed: "2026-08-22 23:00:00-05:00",
      client: "1.5.4",
      deployed_by: "rndrntwrk",
      commit: sourceCommit.slice(0, 7),
    }],
    containers: [],
    layout: {
      appId: "ap-oFaCNy2jJDFalZienNB2Ht",
      environment: "main",
      providerVersion,
      providerHistory: [{
        providerVersion,
        rollbackVersion,
        clientVersion: "1.5.4",
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
      mountedSecretObjects: safeBootstrap
        ? []
        : [
            { id: "st-em904Ts5jgkuESl7afKErN", name: "alice-ghcr-registry" },
            { id: "st-TU930BfNl1jK3wZ9ZcYtEn", name: releaseSecret },
          ],
      mountedVolumeIds: [],
      imageObjectIds: [imageId],
      autoscalerEnforcement: {
        status: "provider-enforced",
        functionId,
        minContainers: 0,
        maxContainers: 1,
        bufferContainers: 0,
        scaledownWindow: 300,
      },
    },
  };
}

test("accepts only the exact clean Alice app graph as a rollback anchor", () => {
  const exact = providerValue({ providerVersion: 49, safeBootstrap: true }).layout;
  assert.equal(verifyAliceModalRollbackAnchorLayout(exact), exact);
  assert.match(digestAliceModalProviderGraph(exact), /^sha256:[a-f0-9]{64}$/);

  assert.throws(
    () => verifyAliceModalRollbackAnchorLayout({
      ...exact,
      appId: "ap-ZZZZZZZZZZZZZZZZZZZZZZ",
    }),
    /ALICE_MODAL_PROVIDER_READBACK_INVALID/,
  );
  assert.throws(
    () => verifyAliceModalRollbackAnchorLayout({
      ...exact,
      providerHistory: [{ ...exact.providerHistory[0], dirty: true }],
    }),
    /ALICE_MODAL_ROLLBACK_ANCHOR_INVALID/,
  );
});

test("admits only the release-bound, registry-only safe bootstrap", () => {
  const value = providerValue({ providerVersion: 49, safeBootstrap: true });
  const readback = verifyAliceModalSafeBootstrapReadback(value, {
    release,
    expectedProviderVersion: 49,
  });
  assert.equal(readback.safeBootstrap, true);
  assert.equal(readback.providerVersion, 49);
  assert.deepEqual(readback.mountedSecretObjects, []);
  assert.throws(
    () => verifyAliceModalSafeBootstrapReadback(providerValue(), {
      release,
      expectedProviderVersion: 73,
    }),
    /ALICE_MODAL_SAFE_BOOTSTRAP_INVALID/,
  );
});

test("verifies exact provider version/object IDs and provider-confirmed autoscaler state", () => {
  const readback = verifyAliceModalProviderReadback(providerValue(), {
    release,
    secretName: `alice-production-core-${"2".repeat(64)}-12345-1`,
    expectedProviderVersion: 73,
  });
  assert.equal(readback.workspaceId, "ac-heK8sGJBc367raQUx6R59o");
  assert.equal(readback.aliceModalRevision, 49);
  assert.equal(readback.providerVersion, 73);
  assert.equal(readback.rollbackProviderVersion, 0);
  assert.deepEqual(readback.autoscaler, {
    minContainers: 0,
    maxContainers: 1,
    bufferContainers: 0,
    scaledownWindow: 300,
  });
  assert.deepEqual(readback.mountedSecretObjects, [
    { id: "st-em904Ts5jgkuESl7afKErN", name: "alice-ghcr-registry" },
    {
      id: "st-TU930BfNl1jK3wZ9ZcYtEn",
      name: `alice-production-core-${"2".repeat(64)}-12345-1`,
    },
  ]);
  assert.equal("proxyAuthBehaviorRequired" in readback, false);
  assert.equal("zeroIdle" in readback, false);
});

test("verifies a forward-restored provider version against its exact rollback source", () => {
  const forwarded = providerValue({
    providerVersion: 75,
    rollbackVersion: 73,
  });
  const readback = verifyAliceModalProviderReadback(forwarded, {
    release,
    secretName: `alice-production-core-${"2".repeat(64)}-12345-1`,
    expectedProviderVersion: 75,
    expectedRollbackVersion: 73,
  });
  assert.equal(readback.providerVersion, 75);
  assert.equal(readback.rollbackProviderVersion, 73);
  assert.throws(
    () => verifyAliceModalProviderReadback(forwarded, {
      release,
      secretName: `alice-production-core-${"2".repeat(64)}-12345-1`,
      expectedProviderVersion: 75,
    }),
    /ALICE_MODAL_PROVIDER_READBACK_INVALID/,
  );
});

test("requires the exact Modal version and graph before and after terminal HTTP proof", () => {
  const value = providerValue();
  const coherent = verifyAliceModalProviderTerminalCoherence({
    before: value,
    after: value,
    release,
    secretName: `alice-production-core-${"2".repeat(64)}-12345-1`,
    expectedProviderVersion: 73,
  });
  assert.equal(coherent.providerVersion, 73);
  assert.throws(
    () => verifyAliceModalProviderTerminalCoherence({
      before: value,
      after: {
        ...value,
        layout: { ...value.layout, providerVersion: 74 },
      },
      release,
      secretName: `alice-production-core-${"2".repeat(64)}-12345-1`,
      expectedProviderVersion: 73,
    }),
    /ALICE_MODAL_PROVIDER_COHERENCE_INVALID|ALICE_MODAL_PROVIDER_READBACK_INVALID/,
  );
});

test("proves rollback only through a provider-enforced safe bootstrap graph", () => {
  const previous = providerValue({
    providerVersion: 49,
    sourceCommit: release.sourceCommit,
    safeBootstrap: true,
    functionId: "fu-AAAAAAAAAAAAAAAAAAAAAA",
    imageId: "im-AAAAAAAAAAAAAAAAAAAAAA",
  }).layout;
  const candidate = providerValue({ providerVersion: 73 }).layout;
  const rolledBack = {
    ...previous,
    autoscalerEnforcement: {
      ...candidate.autoscalerEnforcement,
      functionId: previous.function.id,
    },
    providerVersion: 74,
    providerHistory: [{
      providerVersion: 74,
      rollbackVersion: 49,
      clientVersion: "1.5.4",
      deployedBy: "rndrntwrk",
      commitHash: release.sourceCommit,
      dirty: false,
    }],
  };
  const forwarded = {
    ...candidate,
    providerVersion: 75,
    providerHistory: [{
      providerVersion: 75,
      rollbackVersion: 73,
      clientVersion: "1.5.4",
      deployedBy: "rndrntwrk",
      commitHash: release.sourceCommit,
      dirty: false,
    }],
  };
  const result = verifyAliceModalProviderTransition({
    previous,
    candidate,
    rolledBack,
    forwarded,
  });
  assert.equal(result.rollbackProviderVersion, 74);
  assert.equal(result.forwardProviderVersion, 75);
  assert.equal(result.candidateProviderVersion, 73);
  assert.equal(
    verifyAliceModalProviderRestoration({ expected: previous, restored: rolledBack })
      .restorationProviderVersion,
    74,
  );
  assert.throws(
    () => verifyAliceModalProviderTransition({
      previous: {
        ...previous,
        autoscalerEnforcement: { status: "provider-unverifiable" },
      },
      candidate,
      rolledBack,
      forwarded,
    }),
    /ALICE_MODAL_ROLLBACK_(?:ANCHOR|PROOF)_INVALID|ALICE_MODAL_PROVIDER_READBACK_INVALID/,
  );
});

test("rejects candidate substitution onto a different Modal app identity", () => {
  const previous = providerValue({
    providerVersion: 49,
    sourceCommit: release.sourceCommit,
    safeBootstrap: true,
    functionId: "fu-AAAAAAAAAAAAAAAAAAAAAA",
    imageId: "im-AAAAAAAAAAAAAAAAAAAAAA",
  }).layout;
  const candidate = providerValue({ providerVersion: 73 }).layout;
  candidate.appId = "ap-BBBBBBBBBBBBBBBBBBBBBB";
  const rolledBack = {
    ...previous,
    autoscalerEnforcement: {
      ...candidate.autoscalerEnforcement,
      functionId: previous.function.id,
    },
    providerVersion: 74,
    providerHistory: [{
      providerVersion: 74,
      rollbackVersion: 49,
      clientVersion: "1.5.4",
      deployedBy: "rndrntwrk",
      commitHash: release.sourceCommit,
      dirty: false,
    }],
  };
  const forwarded = {
    ...candidate,
    providerVersion: 75,
    providerHistory: [{
      providerVersion: 75,
      rollbackVersion: 73,
      clientVersion: "1.5.4",
      deployedBy: "rndrntwrk",
      commitHash: release.sourceCommit,
      dirty: false,
    }],
  };
  assert.throws(
    () => verifyAliceModalProviderTransition({
      previous,
      candidate,
      rolledBack,
      forwarded,
    }),
    /ALICE_MODAL_(?:PROVIDER_READBACK|ROLLBACK_PROOF)_INVALID/,
  );
});

test("keeps capture-current strictly read-only and enforcement explicit", () => {
  const source = fs.readFileSync(
    new URL("./alice_modal_provider_readback.py", import.meta.url),
    "utf8",
  );
  const guard = source.indexOf("if enforce_autoscaler:");
  const mutation = source.indexOf("FunctionUpdateSchedulingParams(");
  assert.ok(guard > 0);
  assert.ok(mutation > guard);
  assert.match(
    source.slice(0, guard),
    /autoscaler_enforcement = \{"status": "provider-unverifiable"\}/,
  );
  assert.match(
    source,
    /read_only_capture = capture_mode in \{[\s\S]*?"--capture-current"[\s\S]*?"--capture-recovery-readiness"[\s\S]*?"--capture-stopped-reentry"[\s\S]*?\}/,
  );
  assert.match(source, /"enforce_autoscaler": not read_only_capture/);
  assert.match(
    source,
    /"allow_stopped_recovery": capture_mode[\s\S]*?in \{"--capture-recovery-readiness", "--capture-stopped-reentry"\}/,
  );
  assert.match(
    source,
    /capture_mode == "--capture-stopped-reentry"[\s\S]*?options\["require_stopped_recovery"\] = True/,
  );
});

test("distinguishes Modal proxy rejection from runtime API authentication", async () => {
  const responses = [
    new Response("modal-http: missing credentials for proxy authorization\n", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }),
    new Response("ok", { status: 200 }),
    Response.json({
      ok: true,
      ready: true,
      agentState: "running",
      uptime: 42,
    }),
    Response.json({
      schemaVersion: "alice.runtime-boundary-proof.v1",
      authorityMode: "proposer-only",
      actionExecution: "disabled",
      actionPlanning: false,
      backgroundAuthorityWorkers: "absent",
      actionNames: [],
      evaluatorNames: [],
      serviceTypes: [],
      taskWorkerNames: [],
      release,
    }),
  ];
  const result = await verifyAliceModalRuntimeHttp({
    fetchImpl: async () => responses.shift(),
    release,
    modalProxyKey: "wk-modal-proxy-key-1234567890",
    modalProxySecret: "ws-modal-proxy-secret-1234567890",
    apiToken: "runtime-api-token-with-at-least-32-bytes",
  });
  assert.equal(result.modalProxyAuthVerified, true);
  assert.equal(
    result.unauthenticatedRejection,
    "modal-http: missing credentials for proxy authorization",
  );
});
