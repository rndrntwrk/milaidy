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
  executeAliceCloudflareRollbacks,
  parseAliceWranglerUploadVersionId,
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
      control: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      aiGateway: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    },
    rollbackVersions: {
      access: "11111111-1111-4111-8111-111111111111",
      control: "22222222-2222-4222-8222-222222222222",
      aiGateway: "33333333-3333-4333-8333-333333333333",
    },
  });
  assert.deepEqual(commands.uploads.map((command) => command.role), [
    "control",
    "aiGateway",
    "access",
  ]);
  for (const command of commands.uploads) {
    assert.deepEqual(command.argv.slice(0, 2), ["versions", "upload"]);
    assert.ok(command.argv.includes("--no-bundle"));
    assert.ok(command.argv.includes("--strict"));
    assert.ok(command.argv.includes(`alice-${sourceCommit}-123456789-2`));
    assert.equal(command.argv.includes("deploy"), false);
  }
  assert.deepEqual(commands.promotions.map((command) => command.role), [
    "control",
    "aiGateway",
    "access",
  ]);
  assert.deepEqual(
    commands.promotions.map((command) => [
      command.argv[command.argv.indexOf("--version-id") + 1],
      command.argv[command.argv.indexOf("--percentage") + 1],
    ]),
    [
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "100"],
      ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", "100"],
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
    "aiGateway",
    "control",
  ]);
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
  { skip: process.env.ALICE_WORKER_CONTRACT_REPLAY !== "1" },
  () => {
    const wranglerBin = process.env.ALICE_WRANGLER_BIN;
    const sourceCommit = process.env.ALICE_REPLAY_SOURCE_COMMIT;
    assert.equal(typeof wranglerBin, "string");
    assert.equal(path.isAbsolute(wranglerBin), true);
    assert.match(sourceCommit ?? "", /^[a-f0-9]{40}$/);

    const roles = ["access", "control", "aiGateway"];
    const workers = {
      access: "alice-access-gateway",
      control: "alice-production-control",
      aiGateway: "alice-ai-gateway",
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
      if (role === "access") {
        return {
          ...common,
          upstreamOrigin: "https://rndrntwrk--alice.modal.run",
        };
      }
      if (role === "control") {
        return {
          ...common,
          releaseAccessAudience: "alice-release-controller-audience",
          releaseServiceTokenIdSha256: "R".repeat(43),
          modelDailyBudgetUnits: 10_000,
          modalRevision: 49,
          programEnvelopeB64: "program-envelope-fixture",
          programSignatureB64: "program-signature-fixture",
          programPublicJwkB64: "program-public-jwk-fixture",
        };
      }
      return common;
    };
    const materialize = ({ root, artifactRoot, configDir, manifestSha256,
      manifestB64 }) => {
      fs.mkdirSync(configDir, { recursive: true });
      const effective = {};
      for (const role of roles) {
        const sourceConfig = JSON.parse(
          fs.readFileSync(
            path.join(
              repoRoot,
              "workers",
              workers[role],
              "wrangler.jsonc",
            ),
            "utf8",
          ),
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
        runWrangler([
          "deploy",
          "--dry-run",
          "--outdir",
          path.join(artifactRootA, worker),
          "--config",
          path.join(repoRoot, "workers", worker, "wrangler.jsonc"),
        ], runnerA);
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
            controlWorkerBundleSha256: digests.control,
            aiGatewayWorkerBundleSha256: digests.aiGateway,
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
  assert.match(source, /alice\.cloudflare-rollback-evidence\.v1/);
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
    /verifyProtectedRefStillExact\(\{ sourceRoot, sourceCommit \}\);[\s\S]*const promotionCommands/,
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
    /verifyProtectedRefStillExact\(\{ sourceRoot, sourceCommit \}\);/g,
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
    schemaVersion: "alice.cloudflare-rollback-anchor.v6",
    accountId: "036df6c823669b8fa2f66cf4c16eeb29",
    candidate: { sourceCommit, deploymentManifestSha256 },
    previous: {
      capturedAt: "2026-08-22T12:00:00.000Z",
      coherent: true,
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
  assert.deepEqual(verifyAliceCloudflareAnchorStillCurrent({
    anchor,
    workers: anchor.previous.workers,
    traffic: anchor.previous.trafficState,
    continuityConfig: anchor.previous.continuityConfig,
    workflowVersions: anchor.previous.workflowVersions,
  }), { anchorFresh: true });
  assert.throws(() => verifyAliceCloudflareAnchorStillCurrent({
    anchor,
    workers: anchor.previous.workers,
    traffic: {
      ...anchor.previous.trafficState,
      routes: [],
    },
    continuityConfig: anchor.previous.continuityConfig,
    workflowVersions: anchor.previous.workflowVersions,
  }), /ALICE_CLOUDFLARE_ANCHOR_DRIFTED/);
  const uploadedVersions = {
    access: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    control: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    aiGateway: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
  const workerState = { access: {}, control: {}, aiGateway: {} };
  const mutations = [];
  let workflowRead = 0;
  const evidence = await executeAliceCloudflareRollbacks({
    wranglerBin: "/tools/wrangler",
    sourceRoot: "/release/source",
    commands: {
      rollbacks: [
        { role: "access", argv: ["access"] },
        { role: "aiGateway", argv: ["ai"] },
        { role: "control", argv: ["control"] },
      ],
    },
    commandEnv: {},
    apiToken: "provider-token-value",
    anchor: {
      previous: {
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
    "worker:aiGateway",
    "worker:control",
    "traffic-restored",
    "workers-verified",
    "continuity-unpaused",
  ]);
  assert.equal(workflowRead, 2);
  assert.deepEqual(evidence.continuityConfig, continuityConfig);
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
