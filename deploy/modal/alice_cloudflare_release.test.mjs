import assert from "node:assert/strict";
import fs from "node:fs";
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
  assert.equal("triggers" in commands, false);
});

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
  assert.ok(preparePhase >= 0);
  assert.ok(driftPreflight >= 0);
  assert.ok(firstMutation >= 0);
  assert.ok(driftPreflight < firstMutation);
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
      traces: null,
    },
    tags: [],
    tail_consumers: [],
  };
  const versionSettings = {
    bindings: [],
    cache_options: { cross_version_cache: null, enabled: false },
    compatibility_date: "2026-08-22",
    compatibility_flags: [],
    exports: {
      default: { cache: null, state: "created", type: "worker" },
    },
    limits: null,
    logpush: false,
    migrations: null,
    observability: {
      enabled: false,
      head_sampling_rate: null,
      logs: null,
      traces: null,
    },
    placement: null,
    tags: [],
    tail_consumers: [],
    usage_model: null,
  };
  const worker = (name, deploymentId, versionId, character) => ({
    worker: name,
    serving: {
      deploymentId,
      versionId,
      scriptEtag: `etag-${name}`,
      mainModuleSha256: `sha256:${character.repeat(64)}`,
    },
    scriptSettings,
    versionSettings,
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
    schemaVersion: "alice.cloudflare-rollback-anchor.v5",
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
          "a",
        ),
        control: worker(
          "alice-production-control",
          "22222222-2222-4222-8222-222222222221",
          "22222222-2222-4222-8222-222222222222",
          "b",
        ),
        aiGateway: worker(
          "alice-ai-gateway",
          "33333333-3333-4333-8333-333333333331",
          "33333333-3333-4333-8333-333333333333",
          "c",
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
