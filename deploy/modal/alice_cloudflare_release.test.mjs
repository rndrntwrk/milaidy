import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  aliceCloudflareCommandEnv,
  buildAliceEvidenceQueueUpdate,
  buildAliceProtectedCloudflareCommands,
  buildAliceCandidateContainerApplicationTarget,
  executeAliceCloudflareRollbacks,
  materializeAliceWorkerSecretFiles,
  normalizeAliceContainerApplicationRollbackState,
  parseAliceWranglerUploadVersionId,
  transitionAliceContainerApplication,
  verifyAliceCloudflareAnchorStillCurrent,
  verifyAliceCloudflarePreparedState,
  verifyAliceCloudflarePrepareEvidence,
  verifyAliceCloudflareRollbackAnchor,
  verifyAliceWorkflowRollbackContinuity,
} from "./alice_cloudflare_release.mjs";
import * as aliceCloudflareRelease from "./alice_cloudflare_release.mjs";
import {
  aliceEffectiveConfigFromWrangler,
  bindAliceWranglerDeploymentEntrypoint,
  materializeAliceWranglerConfig,
} from "./alice_cloudflare_config.mjs";
import {
  aliceWorkerBundleDigests,
  aliceWorkerMigrationSetDigest,
  assertAliceWorkerBundleArtifactMatchesDeploymentManifest,
  buildAliceWorkerBundleArtifact,
  serializeAliceWorkerBundleArtifact,
  verifyAliceWorkerBundleArtifact,
} from "./alice_worker_bundle_artifact.mjs";
import {
  buildAliceCloudflareContinuityConfig,
} from "./alice_cloudflare_continuity.mjs";
import {
  aliceTestCloudflareContinuityReadback,
  aliceTestWorkflowVersions,
} from "./test-fixtures/alice_provider_readbacks.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function aliceTestContainerApplicationState({
  imageDigit = "1",
  applicationVersion = 1,
} = {}) {
  return {
    schemaVersion: "alice.container-application-state.v1",
    accountId: "036df6c823669b8fa2f66cf4c16eeb29",
    applicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    applicationName: "alice-production-runtime",
    applicationVersion,
    namespaceId: "5".repeat(32),
    schedulingPolicy: "default",
    maxInstances: 1,
    rolloutActiveGracePeriod: 0,
    target: {
      configuration: {
        image:
          `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${imageDigit.repeat(64)}`,
        instance_type: "standard-4",
        observability: { logs: { enabled: true } },
      },
    },
  };
}

test("builds one exact-byte staged upload, promotion, and rollback sequence", () => {
  const sourceCommit = "1".repeat(40);
  const commands = buildAliceProtectedCloudflareCommands({
    wranglerBin: "/tools/wrangler",
    configDir: "/release/config",
    bundleRoot: "/release/bundles",
    sourceCommit,
    releaseRunId: "123456789-2",
    uploadedVersions: {
      access: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      runtimeHost: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      control: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      aiGateway: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      statePlane: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      connectorPlane: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    },
    rollbackVersions: {
      access: "11111111-1111-4111-8111-111111111111",
      runtimeHost: "66666666-6666-4666-8666-666666666666",
      control: "22222222-2222-4222-8222-222222222222",
      aiGateway: "33333333-3333-4333-8333-333333333333",
      statePlane: "44444444-4444-4444-8444-444444444444",
      connectorPlane: "55555555-5555-4555-8555-555555555555",
    },
  });
  assert.deepEqual(commands.uploads.map((command) => command.role), [
    "control",
    "statePlane",
    "aiGateway",
    "connectorPlane",
    "runtimeHost",
    "access",
  ]);
  for (const command of commands.uploads) {
    assert.deepEqual(command.argv.slice(0, 2), ["versions", "upload"]);
    assert.ok(command.argv.includes("--no-bundle"));
    assert.equal(command.argv.includes("--strict"), false,
      "API-managed Workers must not trigger Wrangler's unconditional CI abort");
    assert.ok(command.argv.includes(`alice-${sourceCommit}-123456789-2`));
    assert.equal(command.argv.includes("deploy"), false);
  }
  assert.deepEqual(commands.promotions.map((command) => command.role), [
    "control",
    "statePlane",
    "aiGateway",
    "connectorPlane",
    "runtimeHost",
    "access",
  ]);
  assert.deepEqual(
    commands.promotions.map((command) => [
      command.argv[command.argv.indexOf("--version-id") + 1],
      command.argv[command.argv.indexOf("--percentage") + 1],
    ]),
    [
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "100"],
      ["dddddddd-dddd-4ddd-8ddd-dddddddddddd", "100"],
      ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", "100"],
      ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "100"],
      ["ffffffff-ffff-4fff-8fff-ffffffffffff", "100"],
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "100"],
    ],
  );
  assert.equal(
    commands.promotions.some((command) =>
      command.argv.includes("--version-tag")),
    false,
  );
  assert.deepEqual(commands.rollbacks.map((command) => command.role), [
    "access",
    "runtimeHost",
    "connectorPlane",
    "aiGateway",
    "control",
    "statePlane",
  ]);
  assert.equal(
    commands.uploads.find(({ role }) => role === "runtimeHost").bundlePath,
    "/release/bundles/alice-runtime-container-host/index.js",
  );
  for (const command of commands.rollbacks) {
    assert.deepEqual(command.argv.slice(0, 2), ["versions", "deploy"]);
    assert.equal(
      command.argv[command.argv.indexOf("--percentage") + 1],
      "100",
    );
    assert.ok(command.argv.includes("--version-id"));
    assert.equal(command.argv.includes("rollback"), false);
  }
  assert.equal("triggers" in commands, false);
  const serializedCommands = JSON.stringify(commands);
  for (const destructiveD1Operation of [
    "d1 delete",
    "d1 migrations apply",
    "d1 execute",
  ]) {
    assert.equal(serializedCommands.includes(destructiveD1Operation), false);
  }
});

test("promotes and restores one exact captured Container application target", async () => {
  const previousImage =
    `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"1".repeat(64)}`;
  const candidateImage =
    `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"2".repeat(64)}`;
  const rawApplication = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    account_id: "036df6c823669b8fa2f66cf4c16eeb29",
    name: "alice-production-runtime",
    version: 1,
    scheduling_policy: "default",
    max_instances: 1,
    configuration: {
      image: previousImage,
      vcpu: 4,
      memory_mib: 12288,
      disk: { size_mb: 20000 },
      observability: { logs: { enabled: true } },
    },
    durable_objects: { namespace_id: "5".repeat(32) },
    rollout_active_grace_period: 0,
    health: { instances: { failed: 0 }, errors: [] },
  };
  const rawVersion = {
    id: "1",
    version: 1,
    percentage: 100,
    configuration: structuredClone(rawApplication.configuration),
  };
  const previous = normalizeAliceContainerApplicationRollbackState({
    application: rawApplication,
    applicationVersions: [rawVersion],
    applicationInstances: [{ id: "active-instance" }],
  });
  const candidateTarget = buildAliceCandidateContainerApplicationTarget({
    previous,
    materializedWranglerConfig: {
      account_id: rawApplication.account_id,
      containers: [{
        name: rawApplication.name,
        class_name: "AliceRuntimeContainer",
        image: candidateImage,
        instance_type: "standard-4",
        max_instances: 1,
      }],
      durable_objects: {
        bindings: [{
          name: "ALICE_RUNTIME_CONTAINER",
          class_name: "AliceRuntimeContainer",
        }],
      },
      observability: { logs: { enabled: true } },
    },
  });
  let current = previous;
  const mutations = [];
  const rolloutBodies = [];
  const operations = {
    fetchApplication: async () => current,
    createRollout: async ({ target, body }) => {
      mutations.push(`rollout:${target.configuration.image}`);
      rolloutBodies.push(body);
      const currentVersion = current.applicationVersion;
      const currentConfiguration = current.target.configuration;
      current = {
        ...current,
        applicationVersion: currentVersion + 1,
        target,
      };
      return {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        current_version: currentVersion,
        target_version: current.applicationVersion,
        current_configuration: currentConfiguration,
        target_configuration: target.configuration,
        status: "completed",
      };
    },
    fetchRollout: async ({ rollout }) => rollout,
    sleep: async () => undefined,
  };
  const promoted = await transitionAliceContainerApplication({
    expectedCurrent: previous,
    target: candidateTarget,
    operations,
  });
  assert.equal(promoted.changed, true);
  assert.equal(promoted.current.target.configuration.image, candidateImage);
  const restored = await transitionAliceContainerApplication({
    expectedCurrent: promoted.current,
    target: previous.target,
    operations,
  });
  assert.equal(restored.changed, true);
  assert.equal(restored.current.target.configuration.image, previousImage);
  assert.deepEqual(mutations, [
    `rollout:${candidateImage}`,
    `rollout:${previousImage}`,
  ]);
  assert.deepEqual(rolloutBodies[0], {
    description: "Alice protected immutable image transition",
    strategy: "rolling",
    target_configuration: candidateTarget.configuration,
    step_percentage: 100,
    kind: "full_auto",
  });

  current = { ...previous, applicationVersion: 99 };
  let mutated = false;
  await assert.rejects(
    () => transitionAliceContainerApplication({
      expectedCurrent: previous,
      target: candidateTarget,
      operations: {
        ...operations,
        createRollout: async () => {
          mutated = true;
        },
      },
    }),
    /ALICE_CONTAINER_APPLICATION_DRIFTED/,
  );
  assert.equal(mutated, false);
});

test("materializes Container runtime secrets only for the separate runtime host", () => {
  const admissionEvidence = {
    runtimeImage:
      `registry.cloudflare.com/example/alice@sha256:${"9".repeat(64)}`,
  };
  const ambient = {
    ALICE_ACCESS_PROXY_SECRET: process.env.ALICE_ACCESS_PROXY_SECRET,
    ALICE_STATE_PLANE_SERVICE_TOKEN:
      process.env.ALICE_STATE_PLANE_SERVICE_TOKEN,
  };
  process.env.ALICE_ACCESS_PROXY_SECRET = "access-proxy-secret-0123456789";
  process.env.ALICE_STATE_PLANE_SERVICE_TOKEN =
    "state-plane-service-token-0123456789";
  const configs = {
    access: { secrets: { required: ["ALICE_ACCESS_PROXY_SECRET"] } },
    runtimeHost: {
      containers: [{
        image: admissionEvidence.runtimeImage,
      }],
      secrets: {
        required: [
          "ALICE_RUNTIME_API_TOKEN",
          "ALICE_RUNTIME_IMAGE",
          "ALICE_STATE_PLANE_SERVICE_TOKEN",
        ],
      },
    },
    control: { secrets: { required: ["ALICE_EVIDENCE_QUEUE_HMAC_KEY"] } },
    aiGateway: {
      secrets: { required: ["ALICE_RUNTIME_RELEASE_TOKEN_SHA256"] },
    },
    statePlane: {
      secrets: { required: ["ALICE_STATE_PLANE_SERVICE_TOKEN"] },
    },
    connectorPlane: {
      secrets: { required: ["ALICE_STATE_PLANE_SERVICE_TOKEN"] },
    },
  };
  const secretOverrides = {
    ALICE_EVIDENCE_QUEUE_HMAC_KEY: "evidence-hmac-key-0123456789",
    ALICE_RUNTIME_RELEASE_TOKEN_SHA256: `sha256:${"1".repeat(64)}`,
    ALICE_CAPABILITY_BOM_SHA256: `sha256:${"2".repeat(64)}`,
    ALICE_DEPLOYMENT_CONTROLLER_COMMIT: "3".repeat(40),
    ALICE_ELIZA_COMMIT: "4".repeat(40),
    ALICE_POLICY_HASH: `sha256:${"5".repeat(64)}`,
    ALICE_PROGRAM_DIGEST: `sha256:${"6".repeat(64)}`,
    ALICE_RELEASE_DIGEST: `sha256:${"7".repeat(64)}`,
    ALICE_RUNTIME_API_TOKEN: "runtime-api-token-0123456789",
    ALICE_RUNTIME_BUILD_MANIFEST_SHA256: `sha256:${"8".repeat(64)}`,
    ALICE_RUNTIME_IMAGE: admissionEvidence.runtimeImage,
    ALICE_RUNTIME_RELEASE_TOKEN: "runtime-release-token-0123456789",
    ALICE_RUNTIME_REVISION: "50",
    ALICE_RUNTIME_VAULT_PASSPHRASE: "vault-passphrase-0123456789",
    ALICE_SOURCE_COMMIT: "a".repeat(40),
  };
  let result;
  try {
    assert.throws(
      () => materializeAliceWorkerSecretFiles(configs, {
        ...secretOverrides,
        ALICE_RUNTIME_IMAGE:
          `registry.cloudflare.com/example/alice@sha256:${"0".repeat(64)}`,
      }),
      /ALICE_RELEASE_SECRETS_INVALID/,
    );
    result = materializeAliceWorkerSecretFiles(configs, secretOverrides);
    const access = JSON.parse(fs.readFileSync(result.paths.access, "utf8"));
    const runtimeHost = JSON.parse(
      fs.readFileSync(result.paths.runtimeHost, "utf8"),
    );
    assert.deepEqual(access, {
      ALICE_ACCESS_PROXY_SECRET: "access-proxy-secret-0123456789",
    });
    assert.equal(runtimeHost.ALICE_RUNTIME_API_TOKEN, secretOverrides.ALICE_RUNTIME_API_TOKEN);
    assert.equal(runtimeHost.ALICE_RUNTIME_IMAGE, secretOverrides.ALICE_RUNTIME_IMAGE);
    assert.equal(
      runtimeHost.ALICE_RUNTIME_IMAGE,
      configs.runtimeHost.containers[0].image,
    );
    assert.equal(runtimeHost.ALICE_RUNTIME_IMAGE, admissionEvidence.runtimeImage);
    assert.equal(
      runtimeHost.ALICE_STATE_PLANE_SERVICE_TOKEN,
      "state-plane-service-token-0123456789",
    );
    assert.equal("ALICE_RUNTIME_IMAGE" in access, false);
  } finally {
    if (result) fs.rmSync(result.root, { recursive: true, force: true });
    for (const [name, value] of Object.entries(ambient)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("applies the exact ordered remote D1 migration suffix before Worker mutation", () => {
  assert.equal(
    typeof aliceCloudflareRelease.applyAliceStateMigrationsBeforeWorkerMutation,
    "function",
    "the release controller must own the D1 migration gate",
  );
  const calls = [];
  const listOutputs = [
    [
      "Migrations to be applied:",
      "0001_alice_state.sql",
      "0002_execution_records.sql",
      "0003_eliza_database.sql",
      "",
    ].join("\n"),
    "✅ No migrations to apply!\n",
  ];
  const result =
    aliceCloudflareRelease.applyAliceStateMigrationsBeforeWorkerMutation({
      wranglerBin: "/tools/wrangler",
      sourceRoot: "/release/source",
      configPath: "/release/config/statePlane.wrangler.json",
      commandEnv: { CLOUDFLARE_API_TOKEN: "provider-token" },
      runCommand(binary, argv, options) {
        calls.push({ binary, argv, options });
        if (argv[2] === "list") return listOutputs.shift();
        return "applied\n";
      },
    });
  const common = [
    "alice-production-state",
    "--remote",
    "--config",
    "/release/config/statePlane.wrangler.json",
  ];
  assert.deepEqual(
    calls.map(({ binary, argv }) => [binary, ...argv]),
    [
      ["/tools/wrangler", "d1", "migrations", "list", ...common],
      ["/tools/wrangler", "d1", "migrations", "apply", ...common],
      ["/tools/wrangler", "d1", "migrations", "list", ...common],
    ],
  );
  assert.deepEqual(result, {
    applied: [
      "0001_alice_state.sql",
      "0002_execution_records.sql",
      "0003_eliza_database.sql",
    ],
    remoteVerified: true,
  });
  assert.equal(
    calls.some(({ argv }) => argv.includes("versions") || argv.includes("deploy")),
    false,
  );
});

test("fails closed on malformed, failed, or persistently pending D1 migrations", () => {
  const invoke = (listOutputs, applyOutput = "applied\n") => {
    const calls = [];
    const pending = [...listOutputs];
    const runCommand = (binary, argv) => {
      calls.push([binary, ...argv]);
      if (argv[2] === "list") return pending.shift();
      if (applyOutput instanceof Error) throw applyOutput;
      return applyOutput;
    };
    const execute = () =>
      aliceCloudflareRelease.applyAliceStateMigrationsBeforeWorkerMutation({
        wranglerBin: "/tools/wrangler",
        sourceRoot: "/release/source",
        configPath: "/release/config/statePlane.wrangler.json",
        commandEnv: { CLOUDFLARE_API_TOKEN: "provider-token" },
        runCommand,
      });
    return { calls, execute };
  };

  const malformed = invoke([
    "Migrations to be applied:\n0001_alice_state.sql\n0003_eliza_database.sql\n",
  ]);
  assert.throws(malformed.execute, /ALICE_STATE_MIGRATION_READBACK_INVALID/);
  assert.equal(malformed.calls.length, 1);

  const failed = invoke([
    "Migrations to be applied:\n0003_eliza_database.sql\n",
  ], new Error("provider failed"));
  assert.throws(failed.execute, /provider failed/);
  assert.equal(failed.calls.length, 2);

  const stale = invoke([
    "Migrations to be applied:\n0003_eliza_database.sql\n",
    "Migrations to be applied:\n0003_eliza_database.sql\n",
  ]);
  assert.throws(stale.execute, /ALICE_STATE_MIGRATION_READBACK_INVALID/);
  assert.equal(stale.calls.length, 3);
  for (const { calls } of [malformed, failed, stale]) {
    assert.equal(
      calls.some(([, ...argv]) =>
        argv.includes("versions") || argv.includes("deploy")),
      false,
    );
  }
});

test("rejects the exact failed single-outfile serialization and admits only exact module bytes", () => {
  assert.equal(
    typeof aliceCloudflareRelease.verifyAliceWorkerUploadBytes,
    "function",
    "the release controller must expose the byte admission used by its real upload preflight",
  );
  assert.throws(
    () =>
      aliceCloudflareRelease.verifyAliceWorkerUploadBytes({
        signedSha256:
          "sha256:99916b96f8a9ce86da629cda13d3511b5613a545ebfaf570ce37c8296629f61b",
        signedSize: 109_604,
        uploadSha256:
          "sha256:2fb7be440fcb679dcaf68a8195cc76da462e128d57775c089b1f7eac9fdc149a",
        uploadSize: 466_244,
      }),
    /ALICE_WORKER_DRY_RUN_INVALID/,
  );
  assert.deepEqual(
    aliceCloudflareRelease.verifyAliceWorkerUploadBytes({
      signedSha256:
        "sha256:99916b96f8a9ce86da629cda13d3511b5613a545ebfaf570ce37c8296629f61b",
      signedSize: 109_604,
      uploadSha256:
        "sha256:99916b96f8a9ce86da629cda13d3511b5613a545ebfaf570ce37c8296629f61b",
      uploadSize: 109_604,
    }),
    {
      sha256:
        "sha256:99916b96f8a9ce86da629cda13d3511b5613a545ebfaf570ce37c8296629f61b",
      size: 109_604,
    },
  );
});

test("admits only the signed index.js from a Wrangler outdir", () => {
  assert.equal(
    typeof aliceCloudflareRelease.verifyAliceWorkerDryRunDirectory,
    "function",
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-worker-outdir."));
  const signedBundlePath = path.join(root, "signed-index.js");
  const outdir = path.join(root, "outdir");
  const bytes = Buffer.from("export default { fetch() { return new Response('ok') } };\n");
  const expectedSha256 = `sha256:${crypto
    .createHash("sha256")
    .update(bytes)
    .digest("hex")}`;
  try {
    fs.mkdirSync(outdir);
    fs.writeFileSync(signedBundlePath, bytes);
    fs.writeFileSync(path.join(outdir, "index.js"), bytes);
    fs.writeFileSync(path.join(outdir, "index.js.map"), "{}\n");
    assert.deepEqual(
      aliceCloudflareRelease.verifyAliceWorkerDryRunDirectory({
        signedBundlePath,
        outdir,
        expectedSha256,
      }),
      { sha256: expectedSha256, size: bytes.length },
    );

    fs.writeFileSync(path.join(outdir, "second.mjs"), "export default {};\n");
    assert.throws(
      () =>
        aliceCloudflareRelease.verifyAliceWorkerDryRunDirectory({
          signedBundlePath,
          outdir,
          expectedSha256,
        }),
      /ALICE_WORKER_DRY_RUN_INVALID/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  "replays signed Worker bytes and recovery from a relocated fresh-runner root",
  {
    skip: process.env.ALICE_WORKER_CONTRACT_REPLAY !== "1",
    timeout: 5 * 60 * 1000,
  },
  () => {
    const wranglerBin = process.env.ALICE_WRANGLER_BIN;
    const sourceCommit = process.env.ALICE_REPLAY_SOURCE_COMMIT;
    assert.equal(typeof wranglerBin, "string");
    assert.equal(path.isAbsolute(wranglerBin), true);
    assert.match(sourceCommit ?? "", /^[a-f0-9]{40}$/);

    const roles = [
      "access",
      "runtimeHost",
      "control",
      "aiGateway",
      "statePlane",
      "connectorPlane",
    ];
    const workers = {
      access: "alice-access-gateway",
      runtimeHost: "alice-runtime-container-host",
      control: "alice-production-control",
      aiGateway: "alice-ai-gateway",
      statePlane: "alice-state-plane",
      connectorPlane: "alice-connector-plane",
    };
    const runnerA = fs.mkdtempSync(
      path.join(os.tmpdir(), "alice-contract-runner-a."),
    );
    const runnerB = `${runnerA}.relocated`;
    const runWrangler = (argv, root) => {
      const home = path.join(root, "home");
      fs.mkdirSync(home, { recursive: true });
      const execution = spawnSync(wranglerBin, argv, {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          HOME: home,
          CI: "true",
          NO_COLOR: "1",
          WRANGLER_SEND_METRICS: "false",
        },
        maxBuffer: 16 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
      });
      assert.equal(
        execution.status,
        0,
        [execution.stdout, execution.stderr].filter(Boolean).join("\n"),
      );
      return execution.stdout;
    };
    const values = (role, deploymentManifestSha256, deploymentManifestB64) => {
      const common = {
        accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
        accessAudience:
          "1f65441271f72eee92c371c42306885595ae71f950d2ed5aaa1ac354788410e4",
        ownerEmailSha256: "A".repeat(43),
        deploymentManifestSha256,
        deploymentManifestB64,
      };
      if (role === "access" || role === "runtimeHost") {
        return {
          ...common,
          runtimeImage:
            `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"b".repeat(64)}`,
        };
      }
      if (role === "control") {
        return {
          ...common,
          releaseAccessAudience: "alice-release-controller-audience",
          releaseServiceTokenIdSha256: "R".repeat(43),
          modelDailyBudgetUnits: 10_000,
          runtimeRevision: 49,
          programEnvelopeB64: "program-envelope-fixture",
          programSignatureB64: "program-signature-fixture",
          programPublicJwkB64: "program-public-jwk-fixture",
        };
      }
      if (role === "statePlane") {
        return {
          ...common,
          stateDatabaseId: "11111111-2222-3333-4444-555555555555",
        };
      }
      if (role === "connectorPlane") {
        return {
          ...common,
          providerActivation: "disabled",
        };
      }
      return common;
    };
    const materialize = ({ root, artifactRoot, configDir, manifestSha256,
      manifestB64 }) => {
      fs.mkdirSync(configDir, { recursive: true });
      const effective = {};
      for (const role of roles) {
        const sourceConfigPath = role === "runtimeHost"
          ? path.join(
              repoRoot,
              "workers/alice-access-gateway/wrangler.runtime-host.jsonc",
            )
          : path.join(
              repoRoot,
              "workers",
              workers[role],
              "wrangler.jsonc",
            );
        const sourceConfig = JSON.parse(
          fs.readFileSync(sourceConfigPath, "utf8"),
        );
        const configPath = path.join(configDir, `${role}.wrangler.json`);
        const bundle = path.join(artifactRoot, workers[role], "index.js");
        const config = bindAliceWranglerDeploymentEntrypoint(
          role,
          materializeAliceWranglerConfig(
            role,
            sourceConfig,
            values(role, manifestSha256, manifestB64),
          ),
          bundle,
          { artifactRoot, configPath },
        );
        fs.writeFileSync(configPath, `${JSON.stringify(config)}\n`);
        effective[role] = aliceEffectiveConfigFromWrangler(role, config, {
          artifactRoot,
          configPath,
        });
      }
      const secretsRoot = path.join(root, "worker-secrets");
      fs.mkdirSync(secretsRoot);
      const secretPaths = {};
      for (const role of roles) {
        const config = JSON.parse(
          fs.readFileSync(path.join(configDir, `${role}.wrangler.json`), "utf8"),
        );
        const secrets = Object.fromEntries(
          config.secrets.required.map((name) => [
            name,
            `fixture-${role}-${name}-0123456789abcdef`,
          ]),
        );
        const secretPath = path.join(secretsRoot, `${role}.json`);
        fs.writeFileSync(secretPath, JSON.stringify(secrets), { mode: 0o600 });
        secretPaths[role] = secretPath;
      }
      return { effective, secretPaths };
    };
    const replayUploads = ({ root, artifactRoot, configDir, secretPaths,
      digests, suffix }) => {
      const commands = buildAliceProtectedCloudflareCommands({
        wranglerBin,
        configDir,
        bundleRoot: artifactRoot,
        sourceCommit,
        releaseRunId: "1-1",
        rollbackVersions: {},
      });
      const output = {};
      for (const command of commands.uploads) {
        const outdir = path.join(root, suffix, command.role);
        runWrangler([
          ...command.argv,
          "--secrets-file",
          secretPaths[command.role],
          "--dry-run",
          "--outdir",
          outdir,
        ], root);
        output[command.role] =
          aliceCloudflareRelease.verifyAliceWorkerDryRunDirectory({
            signedBundlePath: command.bundlePath,
            outdir,
            expectedSha256: digests[command.role],
          });
      }
      return output;
    };

    try {
      assert.match(runWrangler(["--version"], runnerA), /\b4\.122\.0\b/);
      const artifactRootA = path.join(runnerA, "alice-worker-bundles");
      for (const worker of Object.values(workers)) {
        const workerOutdir = path.join(artifactRootA, worker);
        const sourceConfigPath = worker === "alice-runtime-container-host"
          ? path.join(
              repoRoot,
              "workers/alice-access-gateway/wrangler.runtime-host.jsonc",
            )
          : path.join(repoRoot, "workers", worker, "wrangler.jsonc");
        runWrangler([
          "deploy",
          "--dry-run",
          "--outdir",
          workerOutdir,
          "--config",
          sourceConfigPath,
        ], runnerA);
        const artifactPath = path.join(workerOutdir, "index.js");
        if (worker === "alice-access-gateway") {
          const generatedPath = path.join(workerOutdir, "worker.js");
          const generatedStat = fs.lstatSync(generatedPath);
          assert.equal(generatedStat.isFile(), true);
          assert.equal(generatedStat.isSymbolicLink(), false);
          assert.equal(generatedStat.size > 0, true);
          assert.equal(fs.existsSync(artifactPath), false);
          fs.renameSync(generatedPath, artifactPath);
        }
        if (worker === "alice-runtime-container-host") {
          const generatedPath = path.join(workerOutdir, "runtime-host.js");
          const generatedStat = fs.lstatSync(generatedPath);
          assert.equal(generatedStat.isFile(), true);
          assert.equal(generatedStat.isSymbolicLink(), false);
          assert.equal(generatedStat.size > 0, true);
          assert.equal(fs.existsSync(artifactPath), false);
          fs.renameSync(generatedPath, artifactPath);
        }
        const artifactStat = fs.lstatSync(artifactPath);
        assert.equal(artifactStat.isFile(), true);
        assert.equal(artifactStat.isSymbolicLink(), false);
        assert.equal(artifactStat.size > 0, true);
      }
      const migrationsOutdir = path.join(
        artifactRootA,
        workers.statePlane,
        "migrations",
      );
      fs.mkdirSync(migrationsOutdir);
      for (const migration of [
        "0001_alice_state.sql",
        "0002_execution_records.sql",
        "0003_eliza_database.sql",
      ]) {
        fs.copyFileSync(
          path.join(
            repoRoot,
            "workers",
            workers.statePlane,
            "migrations",
            migration,
          ),
          path.join(migrationsOutdir, migration),
        );
      }
      const artifact = buildAliceWorkerBundleArtifact({
        root: artifactRootA,
        sourceCommit,
        wranglerVersion: "4.122.0",
      });
      const serializedArtifact = serializeAliceWorkerBundleArtifact(artifact);
      const artifactPathA = path.join(
        artifactRootA,
        "alice-worker-bundles.json",
      );
      fs.writeFileSync(artifactPathA, serializedArtifact);
      const verified = verifyAliceWorkerBundleArtifact(serializedArtifact, {
        root: artifactRootA,
        expectedSourceCommit: sourceCommit,
      });
      const digests = aliceWorkerBundleDigests(verified);
      assertAliceWorkerBundleArtifactMatchesDeploymentManifest({
        serializedArtifact,
        artifactRoot: artifactRootA,
        manifest: {
          source: { sourceCommit },
          cloudflare: {
            accessWorkerBundleSha256: digests.access,
            runtimeHostWorkerBundleSha256: digests.runtimeHost,
            controlWorkerBundleSha256: digests.control,
            aiGatewayWorkerBundleSha256: digests.aiGateway,
            statePlaneWorkerBundleSha256: digests.statePlane,
            connectorPlaneWorkerBundleSha256: digests.connectorPlane,
            stateMigrationSetSha256: aliceWorkerMigrationSetDigest(verified),
          },
        },
      });
      const artifactSha256 = `sha256:${crypto
        .createHash("sha256")
        .update(serializedArtifact)
        .digest("hex")}`;
      const keyPair = crypto.generateKeyPairSync("rsa", {
        modulusLength: 3072,
      });
      const signature = crypto.sign("sha256", Buffer.from(serializedArtifact), {
        key: keyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      });
      assert.equal(
        crypto.verify(
          "sha256",
          Buffer.from(serializedArtifact),
          {
            key: keyPair.publicKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 32,
          },
          signature,
        ),
        true,
      );
      const manifestB64 = Buffer.from(serializedArtifact).toString("base64url");
      const configDirA = path.join(runnerA, "alice-release", "wrangler");
      const initial = materialize({
        root: runnerA,
        artifactRoot: artifactRootA,
        configDir: configDirA,
        manifestSha256: artifactSha256,
        manifestB64,
      });
      const firstUpload = replayUploads({
        root: runnerA,
        artifactRoot: artifactRootA,
        configDir: configDirA,
        secretPaths: initial.secretPaths,
        digests,
        suffix: "upload-preflight",
      });

      fs.renameSync(runnerA, runnerB);
      const artifactRootB = path.join(runnerB, "alice-worker-bundles");
      const configDirB = path.join(runnerB, "alice-release", "wrangler");
      const relocatedArtifact = fs.readFileSync(
        path.join(artifactRootB, "alice-worker-bundles.json"),
        "utf8",
      );
      assert.equal(relocatedArtifact, serializedArtifact);
      assert.equal(
        crypto.verify(
          "sha256",
          Buffer.from(relocatedArtifact),
          {
            key: keyPair.publicKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 32,
          },
          signature,
        ),
        true,
      );
      verifyAliceWorkerBundleArtifact(relocatedArtifact, {
        root: artifactRootB,
        expectedSourceCommit: sourceCommit,
      });
      for (const role of roles) {
        const configPath = path.join(configDirB, `${role}.wrangler.json`);
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        assert.equal(path.isAbsolute(config.main), false);
        assert.deepEqual(
          aliceEffectiveConfigFromWrangler(role, config, {
            artifactRoot: artifactRootB,
            configPath,
          }),
          initial.effective[role],
        );
      }
      const relocatedSecretPaths = Object.fromEntries(
        roles.map((role) => [
          role,
          path.join(runnerB, "worker-secrets", `${role}.json`),
        ]),
      );
      const recoveredUpload = replayUploads({
        root: runnerB,
        artifactRoot: artifactRootB,
        configDir: configDirB,
        secretPaths: relocatedSecretPaths,
        digests,
        suffix: "recovery-dry-run",
      });
      assert.deepEqual(recoveredUpload, firstUpload);
      process.stdout.write(
        `ALICE_WORKER_CONTRACT_REPLAY ${JSON.stringify({
          schemaVersion: "alice.worker-release-contract-replay.v1",
          sourceCommit,
          wranglerVersion: "4.122.0",
          artifactSha256,
          bundles: recoveredUpload,
          signatureVerified: true,
          runnerRootRelocated: true,
          providerMutation: false,
        })}\n`,
      );
    } finally {
      fs.rmSync(runnerA, { recursive: true, force: true });
      fs.rmSync(runnerB, { recursive: true, force: true });
    }
  },
);

test("parses one exact uploaded version and remains retry-safe", () => {
  const first = "11111111-1111-4111-8111-111111111111";
  const second = "22222222-2222-4222-8222-222222222222";
  assert.equal(
    parseAliceWranglerUploadVersionId(`Uploaded alice-control\nWorker Version ID: ${first}\n`),
    first,
  );
  assert.equal(
    parseAliceWranglerUploadVersionId(`Uploaded alice-control\nWorker Version ID: ${second}\n`),
    second,
  );
  assert.throws(
    () => parseAliceWranglerUploadVersionId(
      `Worker Version ID: ${first}\nWorker Version ID: ${second}\n`,
    ),
    /ALICE_WORKER_UPLOAD_VERSION_INVALID/,
  );
});

test("updates the exact evidence queue with a complete fail-closed provider body", () => {
  const queue = {
    queue_id: "a".repeat(32),
    queue_name: "alice-production-evidence-v1",
    settings: {
      delivery_delay: 0,
      delivery_paused: true,
      message_retention_period: 86_400,
    },
  };
  assert.deepEqual(buildAliceEvidenceQueueUpdate(queue, false), {
    pathname:
      `/accounts/036df6c823669b8fa2f66cf4c16eeb29/queues/${queue.queue_id}`,
    body: {
      queue_name: "alice-production-evidence-v1",
      settings: {
        delivery_delay: 0,
        delivery_paused: false,
        message_retention_period: 86_400,
      },
    },
  });
  assert.throws(() =>
    buildAliceEvidenceQueueUpdate({
      ...queue,
      settings: { ...queue.settings, delivery_delay: 1 },
    }, false),
  );
});

test("gives every Wrangler child only the exact account, token, PATH, and locale", () => {
  const accountId = "036df6c823669b8fa2f66cf4c16eeb29";
  assert.deepEqual(
    aliceCloudflareCommandEnv({
      PATH: "/bin",
      LANG: "C.UTF-8",
      CLOUDFLARE_API_TOKEN: "token-with-at-least-16-bytes",
      ALICE_CONTROL_RECOVERY_TOKEN: "must-never-reach-wrangler",
      UNRELATED_AMBIENT_VALUE: "must-never-reach-wrangler",
    }),
    {
      PATH: "/bin",
      LANG: "C.UTF-8",
      CLOUDFLARE_API_TOKEN: "token-with-at-least-16-bytes",
      CLOUDFLARE_ACCOUNT_ID: accountId,
    },
  );
  assert.throws(
    () => aliceCloudflareCommandEnv({
      PATH: "/bin",
      CLOUDFLARE_API_TOKEN: "token-with-at-least-16-bytes",
      CLOUDFLARE_ACCOUNT_ID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }),
    /ALICE_CLOUDFLARE_ACCOUNT_INVALID/,
  );
  for (const hostile of [
    { CLOUDFLARE_API_BASE_URL: "https://attacker.example" },
    { HTTPS_PROXY: "https://attacker.example" },
    { ALL_PROXY: "socks5://attacker.example" },
    { NODE_USE_ENV_PROXY: "1" },
    { NODE_OPTIONS: "--require=/tmp/attacker.cjs" },
    { NODE_EXTRA_CA_CERTS: "/tmp/attacker.pem" },
    { WRANGLER_ENV: "attacker" },
  ]) {
    assert.throws(
      () =>
        aliceCloudflareCommandEnv({
          PATH: "/bin",
          CLOUDFLARE_API_TOKEN: "token-with-at-least-16-bytes",
          ...hostile,
        }),
      /ALICE_CLOUDFLARE_COMMAND_ENV_INVALID/,
    );
  }
});

test("the protected command requires attested bundles and terminal live readback", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "deploy/modal/alice_cloudflare_release.mjs"),
    "utf8",
  );
  assert.match(source, /gh[\s\S]*attestation[\s\S]*verify/);
  assert.match(source, /--source-digest/);
  assert.match(source, /build-cloud-agent\.yml/);
  assert.match(source, /fetchAliceCloudflarePostDeploymentReadback/);
  assert.match(source, /applyAliceCandidateTrafficState/);
  assert.match(source, /restoreAliceTrafficState/);
  assert.match(source, /restoreAliceCloudflareWorkerRollbackState/);
  assert.match(source, /alice\.cloudflare-rollback-evidence\.v2/);
  assert.match(source, /transitionAliceContainerApplication/);
  assert.match(source, /workerDeployments: workers\.deployments/);
  assert.match(source, /fetchAliceCloudflareContinuityState/);
  assert.match(source, /ALICE_CONTINUITY_CHANGED_DURING_PROMOTION/);
  assert.match(source, /setAliceEvidenceQueueDeliveryPaused/);
  assert.match(source, /restoreAliceCloudflareContinuityState/);
  assert.match(source, /anchor\.previous\.continuityConfig/);
  assert.match(source, /bootstrap-non-serving-paused/);
  assert.match(source, /expectedQueueDeliveryPaused: true/);
  assert.match(source, /expectedQueueDeliveryPaused: false/);
  assert.doesNotMatch(source, /commands\.triggers/);
  assert.match(source, /assertAliceWorkerBundleArtifactMatchesDeploymentManifest/);
  assert.match(source, /ALICE_PRODUCTION_RELEASE_CONFIRM/);
  assert.match(source, /ALICE_CLOUDFLARE_ROLLBACK_ANCHOR_PATH/);
  assert.match(
    source,
    /verifyProtectedRefStillExact\(\{ sourceRoot, deploymentControllerCommit \}\);[\s\S]*const promotionCommands/,
  );
  assert.doesNotMatch(source, /"--outfile"/);
  assert.match(source, /"--outdir"/);
  assert.match(source, /git\/ref\/heads\/\$\{PROTECTED_BRANCH\}/);
  assert.match(
    source,
    /anchor\.candidate\.deploymentManifestSha256 !== deploymentManifestSha256/,
  );
  assert.match(source, /verifyAliceCloudflareWorkerRollbackStateSnapshot/);
  const rollbackPhase = source.indexOf('if (phase === "rollback")');
  const attestations = source.indexOf("verifyGitHubAttestations({", rollbackPhase);
  const admission = source.indexOf("runProgramAdmissionPreflight({", rollbackPhase);
  assert.ok(rollbackPhase >= 0);
  assert.ok(attestations > rollbackPhase);
  assert.ok(admission > rollbackPhase);
  const preparePhase = source.indexOf('if (phase === "prepare")');
  const driftPreflight = source.indexOf(
    "verifyAliceCloudflareAnchorStillCurrent({",
    preparePhase,
  );
  const firstMutation = source.indexOf("rollbackRequired = true;", preparePhase);
  const bytePreflight = source.indexOf("dryRunExactBundles({", preparePhase);
  assert.ok(preparePhase >= 0);
  assert.ok(driftPreflight >= 0);
  assert.ok(firstMutation >= 0);
  assert.ok(bytePreflight >= 0);
  assert.ok(driftPreflight < firstMutation);
  assert.ok(
    bytePreflight < firstMutation,
    "exact upload bytes must be admitted before the first provider mutation",
  );
  assert.match(
    source,
    /rollbackRequired = true;[\s\S]*ALICE_WORKER_UPLOAD_FAILED/,
  );
  const firstUploadMutation = source.indexOf("rollbackRequired = true;");
  const protectedReads = [...source.matchAll(
    /verifyProtectedRefStillExact\(\{ sourceRoot, deploymentControllerCommit \}\);/g,
  )].map((match) => match.index);
  assert.ok(firstUploadMutation >= 0);
  assert.ok(
    protectedReads.some((index) => index < firstUploadMutation),
    "the controller must re-read the protected head immediately before its first upload mutation",
  );
  assert.match(
    source,
    /if \(rollbackRequired\)[\s\S]*executeRollbacks/,
  );
});

test("accepts only a complete exact manifest-bound rollback anchor", () => {
  const sourceCommit = "1".repeat(40);
  const deploymentManifestSha256 = `sha256:${"2".repeat(64)}`;
  const scriptSettings = {
    logpush: false,
    observability: {
      enabled: false,
      head_sampling_rate: null,
      logs: null,
      redact_query_string: false,
      traces: null,
    },
    tags: [],
    tail_consumers: [],
  };
  const versionResources = {
    bindings: [],
    script: { etag: "placeholder-etag" },
    script_runtime: {
      cache_options: null,
      compatibility_date: "2026-08-22",
      compatibility_flags: [],
      exports: {},
      limits: null,
      migration_tag: null,
      usage_model: "standard",
    },
  };
  const worker = (name, deploymentId, versionId) => ({
    worker: name,
    serving: { deploymentId, versionId },
    scriptSettings,
    versionResources: {
      ...versionResources,
      script: { etag: `etag-${name}` },
    },
  });
  const continuityConfig = buildAliceCloudflareContinuityConfig(
    aliceTestCloudflareContinuityReadback(),
  );
  const rawWorkflowVersions = aliceTestWorkflowVersions();
  const workflowVersions = rawWorkflowVersions.map((version) => ({
    id: version.id,
    className: version.class_name,
    createdOn: version.created_on,
    modifiedOn: version.modified_on,
    workflowId: version.workflow_id,
    hasDag: version.has_dag,
    language: version.language,
    defaultRetention: {
      errorMs: version.default_retention.error_retention,
      successMs: version.default_retention.success_retention,
    },
    limits: { steps: version.limits.steps },
  }));
  const anchor = {
    schemaVersion: "alice.cloudflare-rollback-anchor.v7",
    accountId: "036df6c823669b8fa2f66cf4c16eeb29",
    candidate: { sourceCommit, deploymentManifestSha256 },
    previous: {
      capturedAt: "2026-08-22T12:00:00.000Z",
      coherent: true,
      containerApplication: aliceTestContainerApplicationState(),
      continuityConfig,
      trafficState: {
        routes: [{
          id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          pattern: "alice.rndrntwrk.com/*",
          script: "alice-access-gateway",
        }],
        customDomains: [],
        subdomains: {
          access: { enabled: false, previewsEnabled: false },
          control: { enabled: false, previewsEnabled: false },
          aiGateway: { enabled: true, previewsEnabled: false },
          statePlane: { enabled: false, previewsEnabled: false },
          connectorPlane: { enabled: false, previewsEnabled: false },
          runtimeHost: { enabled: false, previewsEnabled: false },
        },
      },
      workflowVersions,
      workers: {
        access: worker(
          "alice-access-gateway",
          "11111111-1111-4111-8111-111111111111",
          "11111111-1111-4111-8111-111111111112",
        ),
        control: worker(
          "alice-production-control",
          "22222222-2222-4222-8222-222222222221",
          "22222222-2222-4222-8222-222222222222",
        ),
        aiGateway: worker(
          "alice-ai-gateway",
          "33333333-3333-4333-8333-333333333331",
          "33333333-3333-4333-8333-333333333333",
        ),
        statePlane: worker(
          "alice-state-plane",
          "44444444-4444-4444-8444-444444444441",
          "44444444-4444-4444-8444-444444444444",
        ),
        connectorPlane: worker(
          "alice-connector-plane",
          "55555555-5555-4555-8555-555555555551",
          "55555555-5555-4555-8555-555555555555",
        ),
        runtimeHost: worker(
          "alice-runtime-container-host",
          "66666666-6666-4666-8666-666666666661",
          "66666666-6666-4666-8666-666666666666",
        ),
      },
    },
  };
  assert.deepEqual(
    verifyAliceCloudflareRollbackAnchor(anchor, {
      sourceCommit,
      deploymentManifestSha256,
    }),
    anchor,
  );
  const configs = Object.fromEntries(Object.entries(anchor.previous.workers).map(
    ([role, snapshot]) => [role, {
      account_id: anchor.accountId,
      name: snapshot.worker,
      vars: {},
      secrets: { required: [] },
    }],
  ));
  anchor.previous.workers.control.versionResources.bindings = [
    { name: "ALICE_CONTROL_RECOVERY_TOKEN", type: "secret_text" },
  ];
  configs.control.secrets.required = ["ALICE_CONTROL_RECOVERY_TOKEN"];
  configs.control.workflows = [{
    binding: "ALICE_PLANS",
    name: continuityConfig.workflow.name,
    class_name: continuityConfig.workflow.className,
  }];
  const uploadPreflight = {
    anchor,
    configs,
    workers: anchor.previous.workers,
    containerApplication: anchor.previous.containerApplication,
    traffic: anchor.previous.trafficState,
    continuityConfig: anchor.previous.continuityConfig,
    workflowVersions: anchor.previous.workflowVersions,
  };
  assert.deepEqual(verifyAliceCloudflareAnchorStillCurrent(uploadPreflight),
    { anchorFresh: true });
  configs.control.vars.ALICE_CONTROL_RECOVERY_TOKEN = "must-stay-secret";
  assert.throws(() => verifyAliceCloudflareAnchorStillCurrent(uploadPreflight),
    /ALICE_WORKER_SECRET_BINDING_CONFLICT/);
  delete configs.control.vars.ALICE_CONTROL_RECOVERY_TOKEN;
  configs.access.workflows = configs.control.workflows;
  assert.throws(() => verifyAliceCloudflareAnchorStillCurrent(uploadPreflight),
    /ALICE_WORKER_WORKFLOW_OWNER_CONFLICT/);
  delete configs.access.workflows;
  assert.throws(() => verifyAliceCloudflareAnchorStillCurrent({
    anchor,
    configs,
    workers: anchor.previous.workers,
    containerApplication: anchor.previous.containerApplication,
    traffic: {
      ...anchor.previous.trafficState,
      routes: [],
    },
    continuityConfig: anchor.previous.continuityConfig,
    workflowVersions: anchor.previous.workflowVersions,
  }), /ALICE_CLOUDFLARE_ANCHOR_DRIFTED/);
  const uploadedVersions = {
    access: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    runtimeHost: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    control: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    aiGateway: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    statePlane: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    connectorPlane: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  };
  const prepared = verifyAliceCloudflarePreparedState({
    anchor,
    uploadedVersions,
    workers: {
      ...anchor.previous.workers,
      control: {
        ...anchor.previous.workers.control,
        serving: {
          ...anchor.previous.workers.control.serving,
          deploymentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          versionId: uploadedVersions.control,
        },
      },
    },
    containerApplication: anchor.previous.containerApplication,
    traffic: {
      ...anchor.previous.trafficState,
      routes: [
        ...anchor.previous.trafficState.routes,
        {
          id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          pattern:
            "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
          script: "alice-production-control",
        },
      ],
    },
  });
  const prepareEvidence = {
    schemaVersion: "alice.cloudflare-prepare-evidence.v1",
    observedAt: "2026-08-22T12:01:00.000Z",
    sourceCommit,
    deploymentManifestSha256,
    ...prepared,
  };
  assert.deepEqual(
    verifyAliceCloudflarePrepareEvidence(prepareEvidence, {
      sourceCommit,
      deploymentManifestSha256,
    }),
    prepareEvidence,
  );
  assert.throws(
    () => verifyAliceCloudflarePrepareEvidence({
      ...prepareEvidence,
      controlVersionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    }, { sourceCommit, deploymentManifestSha256 }),
    /ALICE_CLOUDFLARE_PREPARE_INVALID/,
  );
  assert.throws(
    () => verifyAliceCloudflareRollbackAnchor(
      {
        ...anchor,
        candidate: {
          ...anchor.candidate,
          deploymentManifestSha256: `sha256:${"3".repeat(64)}`,
        },
      },
      { sourceCommit, deploymentManifestSha256 },
    ),
    /ALICE_ROLLBACK_ANCHOR_INVALID/,
  );
  assert.throws(
    () => verifyAliceCloudflareRollbackAnchor(
      { ...anchor, extra: true },
      { sourceCommit, deploymentManifestSha256 },
    ),
    /ALICE_ROLLBACK_ANCHOR_INVALID/,
  );
  assert.throws(
    () => verifyAliceCloudflareRollbackAnchor(
      {
        ...anchor,
        previous: {
          ...anchor.previous,
          workers: { ...anchor.previous.workers, control: null },
        },
      },
      { sourceCommit, deploymentManifestSha256 },
    ),
    /ALICE_ROLLBACK_ANCHOR_INVALID/,
  );
  assert.throws(
    () => verifyAliceCloudflareRollbackAnchor(
      {
        ...anchor,
        previous: {
          ...anchor.previous,
          workflowVersions: [{ ...workflowVersions[0], className: "Other" }],
        },
      },
      { sourceCommit, deploymentManifestSha256 },
    ),
    /ALICE_ROLLBACK_ANCHOR_INVALID/,
  );
  assert.deepEqual(
    verifyAliceWorkflowRollbackContinuity({
      expected: workflowVersions,
      current: [
        ...workflowVersions,
        {
          ...workflowVersions[0],
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          createdOn: "2026-08-22T12:00:02.000Z",
          modifiedOn: "2026-08-22T12:00:02.000Z",
        },
      ],
      expectedWorkflowId: continuityConfig.workflow.id,
    }),
    {
      current: [
        ...workflowVersions,
        {
          ...workflowVersions[0],
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          createdOn: "2026-08-22T12:00:02.000Z",
          modifiedOn: "2026-08-22T12:00:02.000Z",
        },
      ],
      previousVersionsPreserved: true,
    },
  );
  assert.throws(
    () => verifyAliceWorkflowRollbackContinuity({
      expected: workflowVersions,
      current: [{ ...workflowVersions[0], modifiedOn: "2026-08-22T12:00:03.000Z" }],
      expectedWorkflowId: continuityConfig.workflow.id,
    }),
    /ALICE_CLOUDFLARE_WORKFLOW_ROLLBACK_INVALID/,
  );
});

test("a Queue-pause failure prevents every Worker and traffic rollback mutation", async () => {
  const mutations = [];
  const workflowVersion = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    className: "AlicePlanWorkflow",
    createdOn: "2026-08-22T12:00:00.000Z",
    modifiedOn: "2026-08-22T12:00:01.000Z",
    workflowId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    hasDag: true,
    language: "javascript",
    defaultRetention: null,
    limits: { steps: 16 },
  };
  await assert.rejects(
    () => executeAliceCloudflareRollbacks({
      wranglerBin: "/tools/wrangler",
      sourceRoot: "/release/source",
      commands: { rollbacks: [{ role: "access", argv: ["versions", "deploy"] }] },
      commandEnv: {},
      apiToken: "provider-token-value",
      anchor: {
        previous: {
          continuityConfig: {
            workflow: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
          },
          workflowVersions: [workflowVersion],
        },
      },
      expectedDurableObjectNamespaceIds: {},
      expectedContinuityDigest: `sha256:${"1".repeat(64)}`,
      operations: {
        fetchWorkflowVersions: async () => [workflowVersion],
        pauseEvidenceQueue: async () => {
          mutations.push("queue-pause-attempt");
          throw new Error("INJECTED_QUEUE_PAUSE_FAILURE");
        },
        runRollbackCommand: () => mutations.push("worker"),
        restoreTraffic: async () => mutations.push("traffic"),
        restoreWorkers: async () => mutations.push("worker-state"),
        restoreContinuity: async () => mutations.push("continuity"),
      },
    }),
    /INJECTED_QUEUE_PAUSE_FAILURE/,
  );
  assert.deepEqual(mutations, ["queue-pause-attempt"]);
});

test("restores an exact unpaused pre-release continuity state after candidate rollback", async () => {
  const continuityConfig = buildAliceCloudflareContinuityConfig(
    aliceTestCloudflareContinuityReadback(),
  );
  const raw = aliceTestWorkflowVersions()[0];
  const previousWorkflowVersion = {
    id: raw.id,
    className: raw.class_name,
    createdOn: raw.created_on,
    modifiedOn: raw.modified_on,
    workflowId: raw.workflow_id,
    hasDag: raw.has_dag,
    language: raw.language,
    defaultRetention: {
      errorMs: raw.default_retention.error_retention,
      successMs: raw.default_retention.success_retention,
    },
    limits: { steps: raw.limits.steps },
  };
  const candidateWorkflowVersion = {
    ...previousWorkflowVersion,
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    createdOn: "2026-08-22T12:00:02.000Z",
    modifiedOn: "2026-08-22T12:00:02.000Z",
  };
  const workflowVersions = [previousWorkflowVersion, candidateWorkflowVersion];
  const trafficState = { routes: [], customDomains: [], subdomains: {} };
  const workerState = {
    access: {},
    runtimeHost: {},
    control: {},
    aiGateway: {},
    statePlane: {},
    connectorPlane: {},
  };
  const mutations = [];
  let workflowRead = 0;
  const evidence = await executeAliceCloudflareRollbacks({
    wranglerBin: "/tools/wrangler",
    sourceRoot: "/release/source",
    commands: {
      rollbacks: [
        { role: "access", argv: ["access"] },
        { role: "runtimeHost", argv: ["runtime-host"] },
        { role: "connectorPlane", argv: ["connector"] },
        { role: "aiGateway", argv: ["ai"] },
        { role: "control", argv: ["control"] },
        { role: "statePlane", argv: ["state"] },
      ],
    },
    commandEnv: {},
    apiToken: "provider-token-value",
    anchor: {
      previous: {
        containerApplication: aliceTestContainerApplicationState(),
        continuityConfig,
        trafficState,
        workflowVersions: [previousWorkflowVersion],
        workers: workerState,
      },
    },
    expectedDurableObjectNamespaceIds: {},
    expectedContinuityDigest: `sha256:${"1".repeat(64)}`,
    operations: {
      fetchWorkflowVersions: async () => {
        workflowRead += 1;
        return workflowVersions;
      },
      pauseEvidenceQueue: async () => {
        mutations.push("queue-paused");
        return { after: { ...continuityConfig, evidenceQueue: {
          ...continuityConfig.evidenceQueue,
          deliveryPaused: true,
        } } };
      },
      runRollbackCommand: (command) => mutations.push(`worker:${command.role}`),
      restoreContainerApplication: async () => {
        mutations.push("container-restored");
        return { current: aliceTestContainerApplicationState() };
      },
      restoreTraffic: async () => {
        mutations.push("traffic-restored");
        return { after: trafficState };
      },
      restoreWorkers: async () => {
        mutations.push("workers-verified");
        return { deployments: {}, restored: workerState };
      },
      restoreContinuity: async () => {
        mutations.push("continuity-unpaused");
        return { after: continuityConfig, mutations: ["alice-production-evidence-v1"] };
      },
    },
  });
  assert.deepEqual(mutations, [
    "queue-paused",
    "worker:access",
    "worker:runtimeHost",
    "container-restored",
    "worker:connectorPlane",
    "worker:aiGateway",
    "worker:control",
    "worker:statePlane",
    "traffic-restored",
    "workers-verified",
    "continuity-unpaused",
  ]);
  assert.equal(workflowRead, 2);
  assert.deepEqual(evidence.continuityConfig, continuityConfig);
  assert.deepEqual(
    evidence.containerApplication,
    aliceTestContainerApplicationState(),
  );
  assert.equal(evidence.continuityRestoration.mode, "prior-serving-state-restored");
  assert.deepEqual(evidence.workflowVersionContinuity.current, workflowVersions);
});

for (const failurePoint of ["control-command", "worker-settings"]) {
  test(`keeps Queue delivery paused after an injected ${failurePoint} rollback failure`, async () => {
    const continuityConfig = buildAliceCloudflareContinuityConfig(
      aliceTestCloudflareContinuityReadback(),
    );
    const raw = aliceTestWorkflowVersions()[0];
    const workflowVersion = {
      id: raw.id,
      className: raw.class_name,
      createdOn: raw.created_on,
      modifiedOn: raw.modified_on,
      workflowId: raw.workflow_id,
      hasDag: raw.has_dag,
      language: raw.language,
      defaultRetention: {
        errorMs: raw.default_retention.error_retention,
        successMs: raw.default_retention.success_retention,
      },
      limits: { steps: raw.limits.steps },
    };
    const mutations = [];
    let pauseCount = 0;
    await assert.rejects(
      () => executeAliceCloudflareRollbacks({
        wranglerBin: "/tools/wrangler",
        sourceRoot: "/release/source",
        commands: {
          rollbacks: [
            { role: "access", argv: ["access"] },
            { role: "control", argv: ["control"] },
          ],
        },
        commandEnv: {},
        apiToken: "provider-token-value",
        anchor: {
          previous: {
            containerApplication: aliceTestContainerApplicationState(),
            continuityConfig,
            trafficState: {},
            workflowVersions: [workflowVersion],
            workers: {},
          },
        },
        expectedDurableObjectNamespaceIds: {},
        expectedContinuityDigest: `sha256:${"1".repeat(64)}`,
        operations: {
          fetchWorkflowVersions: async () => [workflowVersion],
          pauseEvidenceQueue: async () => {
            pauseCount += 1;
            mutations.push(`queue-paused:${pauseCount}`);
            return { verifiedPaused: true };
          },
          runRollbackCommand: (command) => {
            mutations.push(`worker:${command.role}`);
            if (failurePoint === "control-command" && command.role === "control") {
              throw new Error("INJECTED_CONTROL_ROLLBACK_FAILURE");
            }
          },
          restoreContainerApplication: async () => ({
            current: aliceTestContainerApplicationState(),
          }),
          restoreTraffic: async () => {
            mutations.push("traffic-restored");
            return { after: {} };
          },
          restoreWorkers: async () => {
            mutations.push("workers-verified");
            if (failurePoint === "worker-settings") {
              throw new Error("INJECTED_WORKER_SETTINGS_FAILURE");
            }
            return { deployments: {}, restored: {} };
          },
          restoreContinuity: async () => {
            mutations.push("continuity-unpaused");
            return { after: continuityConfig, mutations: [] };
          },
        },
      }),
      /ALICE_CLOUDFLARE_ROLLBACK_FAILED[\s\S]*failClosedQueueSafetyVerified=true/,
    );
    assert.equal(pauseCount, 2);
    assert.equal(mutations.includes("continuity-unpaused"), false);
    assert.equal(mutations.at(-1), "queue-paused:2");
  });
}
