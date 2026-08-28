import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(
  path.join(repoRoot, ".github/workflows/deploy-alice-cloudflare.yml"),
  "utf8",
);
const watchdog = fs.readFileSync(
  path.join(repoRoot, ".github/workflows/recover-alice-production-watchdog.yml"),
  "utf8",
);
const buildWorkflow = fs.readFileSync(
  path.join(repoRoot, ".github/workflows/build-cloud-agent.yml"),
  "utf8",
);
const preimportWorkflowPath = path.join(
  repoRoot,
  ".github/workflows/alice-cloudflare-container-bringup.yml",
);
const preimportWorkflow = fs.existsSync(preimportWorkflowPath)
  ? fs.readFileSync(preimportWorkflowPath, "utf8")
  : "";
const replaySource = fs.readFileSync(
  path.join(repoRoot, "deploy/modal/alice_cloudflare_release.test.mjs"),
  "utf8",
);
const releaseSource = fs.readFileSync(
  path.join(repoRoot, "deploy/modal/alice_cloudflare_release.mjs"),
  "utf8",
);

function namedWorkflowSteps(source) {
  const headings = [...source.matchAll(/^      - name: (.+)$/gm)];
  return headings.map((heading, index) => {
    const end = headings[index + 1]?.index ?? source.length;
    const block = source.slice(heading.index, end);
    const runStart = block.search(/^        run:/m);
    return {
      name: heading[1],
      block,
      run: runStart === -1 ? "" : block.slice(runStart),
    };
  });
}

function namedWorkflowJobs(source) {
  const jobsStart = source.indexOf("\njobs:\n");
  assert.notEqual(jobsStart, -1, "workflow has no jobs block");
  const jobs = source.slice(jobsStart + "\njobs:\n".length);
  const headings = [...jobs.matchAll(/^  ([a-zA-Z0-9_-]+):$/gm)];
  return headings.map((heading, index) => {
    const end = headings[index + 1]?.index ?? jobs.length;
    return {
      name: heading[1],
      block: jobs.slice(heading.index, end),
    };
  });
}

test("production deployment uses Container Program v2 without a Modal promotion path", () => {
  assert.match(workflow, /^      runtime_revision:/m);
  assert.doesNotMatch(workflow, /^      modal_revision:/m);
  assert.match(
    workflow,
    /ALICE_RUNTIME_REVISION: \$\{\{ inputs\.runtime_revision \}\}/,
  );
  assert.match(
    workflow,
    /ALICE_ROLLBACK_BOUNDARY: "container:alice-runtime:v\$\{\{ inputs\.runtime_revision \}\}"/,
  );
  assert.match(workflow, /ALICE_CLOUDFLARE_RUNTIME_IMAGE:/);
  assert.match(workflow, /ALICE_CAPABILITY_BOM_SHA256:/);
  for (const source of [workflow, watchdog]) {
    assert.doesNotMatch(source, /ALICE_MODAL_|MODAL_TOKEN_|alice_modal_/);
    assert.doesNotMatch(source, /Modal (?:promotion|bootstrap|recovery)/i);
  }
});

test("protected deployment consumes one exact successful build and immutable artifact", () => {
  assert.match(workflow, /environment: alice-production/);
  assert.match(
    workflow,
    /test "\$GITHUB_REF" = "\$EXPECTED_REF"[\s\S]*?test "\$GITHUB_SHA" = "\$SOURCE_SHA"/,
  );
  assert.match(
    workflow,
    /actions\/runs\/\$\{BUILD_RUN_ID\}[\s\S]*?\.head_sha[\s\S]*?\.head_branch[\s\S]*?\.conclusion[\s\S]*?build-cloud-agent\.yml/,
  );
  assert.match(
    workflow,
    /actions\/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53[\s\S]*?run-id: \$\{\{ inputs\.build_run_id \}\}[\s\S]*?name: \$\{\{ inputs\.worker_artifact_name \}\}/,
  );
  assert.match(
    workflow,
    /artifact_record_count="\$\(printf '%s' "\$artifact_record" \| awk 'NF \{ count\+\+ \} END \{ print count \+ 0 \}'\)"[\s\S]*?test "\$artifact_record_count" = "1"/,
  );
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\.source_sha \}\}/);
});

test("protected deployment consumes one exact successful preimport artifact", () => {
  for (const input of [
    "preimport_run_id",
    "preimport_run_attempt",
    "preimport_workflow_sha",
    "preimport_workflow_ref",
    "preimport_artifact_id",
    "preimport_artifact_name",
    "preimport_artifact_digest",
  ]) {
    assert.match(workflow, new RegExp(`^      ${input}:$`, "m"));
  }
  const identity = workflow.match(
    /- name: Enforce protected source and build identity[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(identity, /actions\/runs\/\$\{PREIMPORT_RUN_ID\}/);
  assert.match(identity, /\.head_sha[\s\S]*?PREIMPORT_WORKFLOW_SHA/);
  assert.match(identity, /\.head_branch[\s\S]*?PREIMPORT_WORKFLOW_REF/);
  assert.match(identity, /\.run_attempt[\s\S]*?PREIMPORT_RUN_ATTEMPT/);
  assert.match(identity, /alice-cloudflare-container-bringup\.yml/);
  assert.match(identity, /actions\/artifacts\/\$\{PREIMPORT_ARTIFACT_ID\}/);
  assert.match(identity, /\.workflow_run\.id/);
  assert.match(identity, /\.digest/);
  assert.match(identity, /\.expired/);
  assert.match(identity, /preimport_artifact_record_count/);
  assert.match(identity, /test "\$preimport_artifact_record_count" = "1"/);
  const download = workflow.match(
    /- name: Download exact preimport evidence artifact[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(download, /run-id: \$\{\{ inputs\.preimport_run_id \}\}/);
  assert.match(download, /artifact-ids: \$\{\{ inputs\.preimport_artifact_id \}\}/);
  assert.match(download, /merge-multiple: true/);
});

test("source image provenance, build manifest, and capability BOM are verified before registry admission", () => {
  assert.match(
    workflow,
    /gh attestation verify "oci:\/\/\$\{RUNTIME_IMAGE\}"[\s\S]*?--source-digest "\$SOURCE_SHA"[\s\S]*?--deny-self-hosted-runners/,
  );
  assert.match(
    workflow,
    /alice-runtime-build-manifest\.json[\s\S]*?ALICE_RUNTIME_BUILD_MANIFEST_SHA256[\s\S]*?verify_alice_runtime_build_manifest\.mjs/,
  );
  assert.match(
    workflow,
    /alice-capability-bom\.json[\s\S]*?ALICE_CAPABILITY_BOM_SHA256[\s\S]*?verify_alice_capability_bom\.mjs/,
  );
  assert.match(
    workflow,
    /--entrypoint node[\s\S]*?"\$RUNTIME_IMAGE" \\\n+\s+--import \.\/node_modules\/tsx\/dist\/loader\.mjs \\\n+\s+deploy\/modal\/verify_alice_capability_bom\.mjs/,
    "deploy admission must regenerate the BOM with the pinned TypeScript loader",
  );
  assert.match(workflow, /docker pull --platform linux\/amd64 "\$RUNTIME_IMAGE"/);
  assert.doesNotMatch(workflow, /\bdocker (?:build|buildx build)\b/);
});

test("deployment admits the exact preimported Cloudflare digest without another push", () => {
  const admission = workflow.match(
    /- name: Admit exact preimported Cloudflare registry digest[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(admission, /verifyAliceCloudflareContainerImageEvidence/);
  assert.match(admission, /ALICE_CLOUDFLARE_RUNTIME_TAG/);
  assert.match(admission, /ALICE_CLOUDFLARE_RUNTIME_IMAGE/);
  assert.match(admission, /runtimeDigest/);
  assert.doesNotMatch(
    admission,
    /CLOUDFLARE_API_TOKEN|containers (?:push|tag|images (?:list|delete))|docker tag/,
  );
  assert.doesNotMatch(workflow, /containers push/);
});

test("exact registry digest, runtime revision, and BOM propagate into the signed release", () => {
  const materialize = workflow.match(
    /- name: Materialize signed manifest and exact-byte Worker configs[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(
    materialize,
    /ALICE_CLOUDFLARE_RUNTIME_IMAGE: \$\{\{ env\.ALICE_CLOUDFLARE_RUNTIME_IMAGE \}\}/,
  );
  assert.match(
    materialize,
    /ALICE_RUNTIME_BUILD_MANIFEST_SHA256: \$\{\{ env\.ALICE_RUNTIME_BUILD_MANIFEST_SHA256 \}\}/,
  );
  assert.match(
    materialize,
    /ALICE_CAPABILITY_BOM_SHA256: \$\{\{ env\.ALICE_CAPABILITY_BOM_SHA256 \}\}/,
  );
  assert.match(materialize, /alice_deployment_manifest\.mjs/);
  assert.match(materialize, /alice_cloudflare_config\.mjs/);
  assert.doesNotMatch(materialize, /ALICE_UPSTREAM_ORIGIN/);
});

test("preimport evidence is exact-bound and fresh materialization matches before mutation", () => {
  const verify = workflow.match(
    /- name: Verify exact preimport evidence and bind immutable Cloudflare image[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(verify, /verifyAliceCloudflareContainerImageEvidence/);
  assert.match(verify, /verifyAliceDeploymentManifest/);
  assert.match(verify, /alice\.preimport-output-digests\.v1/);
  assert.match(verify, /deploymentManifestSha256/);
  assert.match(verify, /providerReadbackSha256/);
  assert.match(verify, /containerImageEvidenceSha256/);
  assert.match(verify, /sourceSha[\s\S]*?SOURCE_SHA/);
  assert.match(verify, /buildRunId[\s\S]*?BUILD_RUN_ID/);
  assert.match(verify, /watchdogRunId[\s\S]*?RECOVERY_WATCHDOG_RUN_ID/);
  assert.match(verify, /sourceImage[\s\S]*?EXPECTED_SOURCE_IMAGE/);
  assert.match(verify, /runtimeRevision[\s\S]*?EXPECTED_RUNTIME_REVISION/);

  const capture = workflow.indexOf(
    "Capture exact active Durable Object identities read-only",
  );
  const materialize = workflow.indexOf(
    "Materialize signed manifest and exact-byte Worker configs",
  );
  const firstMutation = workflow.indexOf(
    "Bootstrap unrouted fail-closed continuity identities",
  );
  assert.ok(capture >= 0 && capture < materialize);
  assert.ok(materialize > capture && materialize < firstMutation);
  const captureStep = workflow.match(
    /- name: Capture exact active Durable Object identities read-only[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(captureStep, /method: "GET"/);
  assert.doesNotMatch(captureStep, /method: "(?:POST|PUT|PATCH|DELETE)"/);
  const materializeStep = workflow.match(
    /- name: Materialize signed manifest and exact-byte Worker configs[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(materializeStep, /cmp -s "\$manifest" "\$preimport_manifest"/);
  assert.match(materializeStep, /verifyAliceDeploymentManifest/);
  assert.match(materializeStep, /delete preimportProvider\.observedAt/);
  assert.match(materializeStep, /delete freshProvider\.observedAt/);
  assert.match(materializeStep, /canonicalAliceJson\(preimportProvider\)/);
  assert.match(materializeStep, /canonicalAliceJson\(freshProvider\)/);
  assert.match(materializeStep, /freshObservedAtMs - preimportObservedAtMs > 7_200_000/);
  assert.match(materializeStep, /Math\.abs\(Date\.now\(\) - freshObservedAtMs\) > 300_000/);
  const bootstrapStep = workflow.match(
    /- name: Bootstrap unrouted fail-closed continuity identities[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(
    bootstrapStep,
    /ALICE_EXPECTED_DO_NAMESPACE_IDS_PATH: \$\{\{ runner\.temp \}\}\/alice-release\/bootstrap-durable-object-namespace-ids\.json/,
  );
  assert.match(
    bootstrapStep,
    /cmp -s[\s\S]*?"\$\{RUNNER_TEMP\}\/alice-release\/durable-object-namespace-ids\.json"[\s\S]*?bootstrap-durable-object-namespace-ids\.json/,
  );
});

test("state-plane auth is uploaded only as an access-Worker secret", () => {
  assert.match(
    workflow,
    /ALICE_STATE_PLANE_SERVICE_TOKEN: \$\{\{ secrets\.ALICE_STATE_PLANE_SERVICE_TOKEN \}\}/,
  );
  const materialize = workflow.match(
    /- name: Materialize signed manifest and exact-byte Worker configs[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  const imageAdmission = workflow.match(
    /- name: Admit exact preimported Cloudflare registry digest[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.doesNotMatch(materialize, /ALICE_STATE_PLANE_SERVICE_TOKEN/);
  assert.doesNotMatch(imageAdmission, /ALICE_STATE_PLANE_SERVICE_TOKEN/);
  assert.doesNotMatch(
    materialize,
    /DISCORD_API_TOKEN|DISCORD_APPLICATION_ID|TELEGRAM_BOT_TOKEN/,
  );
  assert.doesNotMatch(imageAdmission, /DISCORD|TELEGRAM/i);
  assert.doesNotMatch(workflow, /ALICE_STATE_PLANE_TOKEN/);
});

test("only the Cloudflare recovery watchdog must be live before the first mutation", () => {
  const readiness = workflow.match(
    /- name: Verify Cloudflare recovery readiness before first mutation[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(readiness, /provider=cloudflare/);
  assert.match(readiness, /alice-watchdog-ready-\$\{provider\}/);
  assert.match(readiness, /Prestarted independent Cloudflare recovery/);
  assert.doesNotMatch(readiness, /for provider in/);
  assert.match(watchdog, /^  recover-cloudflare:/m);
  assert.doesNotMatch(watchdog, /^  recover-modal:/m);
  assert.match(watchdog, /--capture-recovery-readiness|providerReadbackPath|ALICE_RECOVERY_PROVIDER_READBACK_PATH/);
});

test("rollback journals contain relocatable Worker bytes and artifact-relative configs", () => {
  const anchor = workflow.match(
    /- name: Persist pre-mutation Cloudflare rollback journal[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(anchor, /\$\{\{ runner\.temp \}\}\/alice-worker-bundles/);
  assert.match(anchor, /\$\{\{ runner\.temp \}\}\/alice-release/);
  for (const source of [workflow, watchdog]) {
    assert.match(source, /recovery_root="\$\{RUNNER_TEMP\}\/alice-independent-cloudflare-recovery"/);
    assert.match(
      source,
      /ALICE_WORKER_BUNDLE_ROOT="\$recovery_root\/alice-worker-bundles"/,
    );
    assert.match(
      source,
      /ALICE_WRANGLER_OUTPUT_DIR="\$recovery_root\/alice-release\/wrangler"/,
    );
    assert.doesNotMatch(
      source.match(/Consume external journal[\s\S]*?(?=\n      - name:)/)?.[0] ?? "",
      /ALICE_WORKER_BUNDLE_ROOT="\$GITHUB_WORKSPACE/,
    );
  }
});

test("deployment attests every module in the five-role Worker artifact", () => {
  const attest = workflow.match(
    /- name: Verify immutable Worker attestations before unrouted fail-closed bootstrap[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  for (const worker of [
    "alice-access-gateway",
    "alice-production-control",
    "alice-ai-gateway",
    "alice-state-plane",
    "alice-connector-plane",
  ]) {
    assert.match(
      attest,
      new RegExp(`alice-worker-bundles/${worker}/index\\.js`),
      `missing immutable attestation verification for ${worker}`,
    );
  }
  for (const migration of [
    "0001_alice_state.sql",
    "0002_execution_records.sql",
    "0003_eliza_database.sql",
  ]) {
    assert.match(
      attest,
      new RegExp(`alice-state-plane/migrations/${migration}`),
      `missing immutable attestation verification for ${migration}`,
    );
  }
});

test("the signed state migrations are remotely applied and verified before state mutation", () => {
  const preparePhase = releaseSource.indexOf('if (phase === "prepare")');
  const migrationGate = releaseSource.indexOf(
    "applyAliceStateMigrationsBeforeWorkerMutation({",
    preparePhase,
  );
  const stateUpload = releaseSource.indexOf(
    "for (const command of commands.uploads)",
    preparePhase,
  );
  assert.ok(preparePhase >= 0);
  assert.ok(migrationGate > preparePhase);
  assert.ok(stateUpload > migrationGate);
  assert.match(
    releaseSource,
    /0001_alice_state\.sql[\s\S]*0002_execution_records\.sql[\s\S]*0003_eliza_database\.sql/,
  );
});

test("state and connector configs stay private and receive only their scoped inputs", () => {
  const materialize = workflow.match(
    /- name: Materialize signed manifest and exact-byte Worker configs[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(
    materialize,
    /ALICE_STATE_DATABASE_ID: \$\{\{ vars\.ALICE_STATE_DATABASE_ID \}\}/,
  );
  assert.doesNotMatch(
    materialize,
    /ALICE_(?:DISCORD|TELEGRAM)_PRIVATE_DESTINATION_ID/,
    "disabled providers must not receive destination placeholders",
  );
  for (const config of ["statePlane", "connectorPlane"]) {
    assert.match(
      materialize,
      new RegExp(
        `jq -e '\\.workers_dev == false and \\.preview_urls == false and \\.routes == \\[\\]'[\\s\\S]*?${config}\\.wrangler\\.json`,
      ),
      `${config} must be proven private before any promotion`,
    );
  }
  assert.doesNotMatch(
    materialize,
    /DISCORD_API_TOKEN|DISCORD_APPLICATION_ID|TELEGRAM_BOT_TOKEN/,
  );
});

test("five-role mutation steps receive connector credentials only step-locally", () => {
  const prepareStep = "Prepare service-authenticated fail-closed control route";
  const secretNames = [
    "ALICE_CONNECTOR_SERVICE_TOKEN",
    "ALICE_CONTROL_CONNECTOR_SERVICE_TOKEN",
  ];
  for (const step of namedWorkflowSteps(workflow)) {
    for (const secretName of secretNames) {
      const binding = new RegExp(
        `^          ${secretName}: \\$\\{\\{ secrets\\.${secretName} \\}\\}$`,
        "m",
      );
      if (step.name === prepareStep) {
        assert.match(
          step.block,
          binding,
          `${prepareStep} is missing step-local ${secretName}`,
        );
      } else {
        assert.doesNotMatch(
          step.block,
          binding,
          `${secretName} must not escape the prepare-only upload boundary`,
        );
      }
    }
  }
  for (const source of [workflow, watchdog]) {
    assert.doesNotMatch(
      source,
      /(?:DISCORD_API_TOKEN|DISCORD_APPLICATION_ID|TELEGRAM_BOT_TOKEN): \$\{\{ secrets\./,
      "disabled providers must not receive GitHub credential bindings",
    );
    assert.doesNotMatch(
      source,
      /^    env:\n(?:^      .*\n)*^      (?:DISCORD_API_TOKEN|TELEGRAM_BOT_TOKEN|ALICE_CONNECTOR_SERVICE_TOKEN):/m,
      "connector credentials must never be job-global",
    );
  }
});

test("both independent recovery lanes require all five relocated Worker modules", () => {
  for (const source of [workflow, watchdog]) {
    const recovery = source.match(
      /- name: Consume external journal and recover Cloudflare independently[\s\S]*?(?=\n      - name:)/,
    )?.[0] ?? "";
    assert.match(
      recovery,
      /for worker in \\\n+\s+alice-access-gateway \\\n+\s+alice-production-control \\\n+\s+alice-ai-gateway \\\n+\s+alice-state-plane \\\n+\s+alice-connector-plane/,
    );
    assert.match(
      recovery,
      /test -s "\$recovery_root\/alice-worker-bundles\/\$worker\/index\.js"/,
    );
    assert.match(
      recovery,
      /test ! -L "\$recovery_root\/alice-worker-bundles\/\$worker\/index\.js"/,
    );
    assert.match(
      recovery,
      /for migration in \\\n+\s+0001_alice_state\.sql \\\n+\s+0002_execution_records\.sql \\\n+\s+0003_eliza_database\.sql/,
    );
    assert.match(
      recovery,
      /test -s "\$recovery_root\/alice-worker-bundles\/alice-state-plane\/migrations\/\$migration"/,
    );
    assert.match(
      recovery,
      /test ! -L "\$recovery_root\/alice-worker-bundles\/alice-state-plane\/migrations\/\$migration"/,
    );
  }
});

test("the independent terminal handoff requires container evidence, not provider bootstrap evidence", () => {
  const accept = workflow.match(/  accept:[\s\S]*?(?=\n  recover-cloudflare:)/)?.[0] ?? "";
  assert.match(accept, /container-image-evidence\.json/);
  assert.match(accept, /ALICE_CONTAINER_IMAGE_EVIDENCE_PATH:/);
  assert.match(accept, /alice_production_acceptance\.ts/);
  assert.doesNotMatch(accept, /promotion-evidence|bootstrap-evidence/);
  assert.match(
    accept,
    /Persist terminal production acceptance evidence as final success action[\s\S]*?if: success\(\)/,
  );
});

test("fresh-runner replay is mandatory, mutation-disabled, and exercises container configs", () => {
  assert.match(buildWorkflow, /ALICE_WORKER_CONTRACT_REPLAY: "1"/);
  assert.match(
    buildWorkflow,
    /ALICE_REPLAY_SOURCE_COMMIT: \$\{\{ steps\.source_revision\.outputs\.sha \}\}/,
  );
  assert.match(
    replaySource,
    /replays signed Worker bytes and recovery from a relocated fresh-runner root/,
  );
  assert.match(replaySource, /runnerRootRelocated: true/);
  assert.match(replaySource, /providerMutation: false/);
  assert.match(replaySource, /runtimeImage:[\s\S]*?registry\.cloudflare\.com/);
  assert.match(replaySource, /runtimeRevision: 49/);
  assert.doesNotMatch(replaySource, /upstreamOrigin: "https:\/\/rndrntwrk--alice/);
});

test("every provider mutation remains bounded by the shared recovery reserve", () => {
  const firstMutation = workflow.indexOf(
    "Bootstrap unrouted fail-closed continuity identities",
  );
  const readiness = workflow.indexOf(
    "Verify Cloudflare recovery readiness before first mutation",
  );
  assert.ok(readiness >= 0 && readiness < firstMutation);
  for (const name of [
    "Bootstrap unrouted fail-closed continuity identities",
    "Assert independently preprovisioned recovery boundary",
    "Prepare service-authenticated fail-closed control route",
    "Commit first-release PAUSE_ALL before runtime mutation",
    "Promote only attested immutable Worker bytes",
  ]) {
    const step = workflow.match(
      new RegExp(`- name: ${name}[\\s\\S]*?(?=\\n      - name:)`),
    )?.[0] ?? "";
    assert.match(step, /alice_release_deadline\.mjs mutation/);
    assert.match(step, /timeout --signal=TERM --kill-after=30s/);
  }
  assert.match(
    workflow,
    /Restore prior Cloudflare graph after any failed or cancelled mutation[\s\S]*?alice_release_deadline\.mjs cloudflare-recovery/,
  );
});

test("every direct gh boundary receives only a step-local GitHub token", () => {
  const missing = [];
  for (const source of [workflow, watchdog]) {
    for (const step of namedWorkflowSteps(source)) {
      if (/\bgh\s+[a-z][a-z-]*\b/.test(step.run) &&
          !/^          GH_TOKEN: \$\{\{ github\.token \}\}$/m.test(step.block)) {
        missing.push(step.name);
      }
    }
    assert.doesNotMatch(
      source,
      /^    env:\n(?:^      .*\n)*^      GH_TOKEN:/m,
      "GH_TOKEN must not be job-global",
    );
  }
  assert.deepEqual(missing, []);
});

test("temporary pre-import materializes one exact release without production promotion", () => {
  const expectedTemporaryBranch = "ops/alice-preimport-18372c5-20260828";
  assert.match(preimportWorkflow, /^name: Alice Cloudflare Pre-import and Materialize$/m);
  assert.match(preimportWorkflow, /^on:\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(preimportWorkflow, /^  (?:push|pull_request|schedule):/m);
  for (const input of [
    "source_sha",
    "recovery_watchdog_run_id",
    "build_run_id",
    "worker_artifact_name",
    "worker_artifact_digest",
    "runtime_image",
    "release_epoch",
    "runtime_revision",
    "policy_hash",
  ]) {
    assert.match(preimportWorkflow, new RegExp(`^      ${input}:$`, "m"));
  }
  const jobs = namedWorkflowJobs(preimportWorkflow);
  assert.deepEqual(jobs.map(({ name }) => name), ["import_runtime", "materialize"]);
  const imageImport = jobs.find(({ name }) => name === "import_runtime")?.block ?? "";
  const materialize = jobs.find(({ name }) => name === "materialize")?.block ?? "";
  assert.match(imageImport, /^    timeout-minutes: 30$/m);
  assert.match(imageImport, /^    environment: alice-cloudflare-bringup$/m);
  assert.match(materialize, /^    needs: import_runtime$/m);
  assert.match(materialize, /^    timeout-minutes: 30$/m);
  assert.match(materialize, /^    environment: alice-production$/m);
  assert.match(preimportWorkflow, /ref: \$\{\{ inputs\.source_sha \}\}/);
  assert.equal(
    [...preimportWorkflow.matchAll(/test "\$GITHUB_RUN_ATTEMPT" = "1"/g)].length,
    2,
  );
  assert.match(preimportWorkflow, /recovery_watchdog_run_id/);
  assert.match(preimportWorkflow, /build-cloud-agent\.yml/);
  assert.match(preimportWorkflow, /actions\/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53/);
  assert.match(imageImport, /gh attestation verify "oci:\/\/\$\{RUNTIME_IMAGE\}"/);
  assert.match(
    imageImport,
    /docker run --rm --platform linux\/amd64 --entrypoint node[\s\S]*?"\$RUNTIME_IMAGE" \\\n+\s+--import \.\/node_modules\/tsx\/dist\/loader\.mjs \\\n+\s+deploy\/modal\/verify_alice_capability_bom\.mjs/,
    "the pre-import verifier must use the same pinned TypeScript loader as the BOM producer",
  );
  assert.match(imageImport, /"\$WRANGLER" containers push "\$local_image"/);
  assert.match(
    imageImport,
    /runtime_image="registry\.cloudflare\.com\/\$\{CLOUDFLARE_ACCOUNT_ID\}\/alice-runtime@\$\{remote_digest\}"/,
  );
  assert.match(imageImport, /containers images list/);
  assert.doesNotMatch(imageImport, /extractAliceBootstrapNamespaceIds/);
  assert.doesNotMatch(imageImport, /alice_deployment_manifest\.mjs/);
  assert.match(materialize, /extractAliceBootstrapNamespaceIds/);
  assert.match(materialize, /alice_deployment_manifest\.mjs/);
  assert.match(materialize, /deployment-output-digests\.json/);
  assert.equal([...preimportWorkflow.matchAll(/retention-days: 1/g)].length, 2);
  assert.match(preimportWorkflow, /if-no-files-found: error/);
  assert.match(preimportWorkflow, /Owner: Alice pre-import protected-branch operator/);
  assert.match(preimportWorkflow, /Hard expiry: two hours after temporary branch-protection creation/);
  assert.match(
    preimportWorkflow,
    /alice-cloudflare-bringup\/deployment-branch-policies\/IMPORT_POLICY_ID/,
  );
  assert.match(
    preimportWorkflow,
    /alice-production\/deployment-branch-policies\/MATERIALIZE_POLICY_ID/,
  );
  assert.match(
    preimportWorkflow,
    new RegExp(`git push origin --delete ${expectedTemporaryBranch.replaceAll("/", "\\/")}`),
  );
  const temporaryBranchMentions = [
    ...preimportWorkflow.matchAll(/ops\/alice-preimport-[a-f0-9]+-20260828/g),
  ].map((match) => match[0]);
  assert.ok(temporaryBranchMentions.length > 0);
  assert.deepEqual(
    [...new Set(temporaryBranchMentions)],
    [expectedTemporaryBranch],
    "every policy, admission, and teardown reference must bind the one exact temporary branch",
  );
  assert.equal([...preimportWorkflow.matchAll(/if: always\(\)/g)].length, 2);
  assert.match(imageImport, /docker logout ghcr\.io/);
  assert.match(imageImport, /rm -rf "\$\{RUNNER_TEMP\}\/alice-preimport-import"/);
  assert.match(materialize, /rm -rf "\$\{RUNNER_TEMP\}\/alice-preimport-materialize"/);

  assert.match(
    imageImport,
    /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_CONTAINER_BRINGUP_TOKEN \}\}/,
  );
  assert.doesNotMatch(imageImport, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(imageImport, /ALICE_ACCESS_AUDIENCE|ALICE_OWNER_EMAIL_SHA256/);
  assert.match(
    materialize,
    /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/,
  );
  assert.doesNotMatch(materialize, /CLOUDFLARE_CONTAINER_BRINGUP_TOKEN/);
  assert.doesNotMatch(
    materialize,
    /containers (?:push|images (?:list|delete))/,
  );
  assert.doesNotMatch(
    materialize,
    /ALICE_MATERIALIZE_WRANGLER|wrangler@4\.122\.0/,
  );

  assert.match(imageImport, /^    outputs:$/m);
  assert.match(imageImport, /artifact_id: \$\{\{ steps\.upload_import_evidence\.outputs\.artifact-id \}\}/);
  assert.match(imageImport, /artifact_digest: \$\{\{ steps\.upload_import_evidence\.outputs\.artifact-digest \}\}/);
  assert.match(imageImport, /^      - name: Upload immutable container image evidence$/m);
  assert.match(imageImport, /^        id: upload_import_evidence$/m);
  assert.match(
    materialize,
    /IMPORT_ARTIFACT_ID: \$\{\{ needs\.import_runtime\.outputs\.artifact_id \}\}/,
  );
  assert.match(
    materialize,
    /IMPORT_ARTIFACT_DIGEST: \$\{\{ needs\.import_runtime\.outputs\.artifact_digest \}\}/,
  );
  assert.match(materialize, /actions\/artifacts\/\$\{IMPORT_ARTIFACT_ID\}/);
  assert.match(materialize, /\.workflow_run\.id/);
  assert.match(materialize, /\.expired/);
  assert.match(materialize, /import_matches/);
  assert.match(materialize, /awk 'NF \{ count\+\+ \} END \{ print count \+ 0 \}'/);
  assert.match(materialize, /artifact_digest_normalized/);
  assert.match(materialize, /artifact-ids: \$\{\{ needs\.import_runtime\.outputs\.artifact_id \}\}/);
  assert.match(materialize, /verifyAliceCloudflareContainerImageEvidence/);
  assert.match(materialize, /evidence\.sourceCommit !== process\.env\.EXPECTED_SOURCE_SHA/);
  assert.match(materialize, /evidence\.sourceImage !== process\.env\.EXPECTED_SOURCE_IMAGE/);
  assert.match(materialize, /evidence\.runtimeRevision !== Number\(process\.env\.EXPECTED_RUNTIME_REVISION\)/);
  assert.match(materialize, /ALICE_CLOUDFLARE_RUNTIME_IMAGE=/);
  assert.match(materialize, /ALICE_RUNTIME_BUILD_MANIFEST_SHA256=/);
  assert.match(materialize, /ALICE_CAPABILITY_BOM_SHA256=/);
  assert.match(materialize, /test "\$\(printf '%s' "\$watchdog_json" \| jq -r \.status\)" = "in_progress"/);
  const evidenceAdmission = materialize.indexOf(
    "- name: Verify imported image evidence and immutable Worker identities",
  );
  const providerCapture = materialize.indexOf(
    "- name: Capture exact active Durable Object identities read-only",
  );
  const manifestMaterialization = materialize.indexOf(
    "- name: Materialize fresh signed-input manifest and provider readback",
  );
  assert.ok(evidenceAdmission >= 0);
  assert.ok(providerCapture > evidenceAdmission);
  assert.ok(manifestMaterialization > providerCapture);
  assert.equal(
    [...preimportWorkflow.matchAll(/containers images list/g)].length,
    1,
  );

  assert.doesNotMatch(preimportWorkflow, /wrangler (?:deploy|delete|versions upload)/);
  assert.doesNotMatch(
    preimportWorkflow,
    /method:\s*"(?:POST|PUT|PATCH|DELETE)"/,
  );
  assert.doesNotMatch(preimportWorkflow, /\/zones\/[^\s]*\/workers\/routes/);
  assert.doesNotMatch(preimportWorkflow, /containers images delete/);
  assert.doesNotMatch(
    preimportWorkflow,
    /node deploy\/modal\/alice_cloudflare_(?:bootstrap|release|recovery)\.mjs/,
  );
  assert.doesNotMatch(preimportWorkflow, /ALICE_MODAL_|MODAL_TOKEN_|alice_modal_/);
  assert.doesNotMatch(preimportWorkflow, /ALICE_PROGRAM_(?:ENVELOPE|SIGNATURE|PUBLIC_JWK)_B64/);
  const upload = preimportWorkflow.match(
    /- name: Upload sanitized one-day materialization evidence[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.doesNotMatch(upload, /durable-object-namespace-ids|wrangler\/.*\.json/);
  assert.doesNotMatch(
    preimportWorkflow,
    /^    env:\n(?:^      .*\n)*^      (?:GH_TOKEN|CLOUDFLARE_API_TOKEN):/m,
  );
  for (const step of namedWorkflowSteps(preimportWorkflow)) {
    if (/\bgh (?:api|attestation)\b/.test(step.run)) {
      assert.match(
        step.block,
        /^          GH_TOKEN: \$\{\{ github\.token \}\}$/m,
        `pre-import step ${step.name} has gh without a step-local token`,
      );
    }
  }
});

test("temporary pre-import locks the exact workflow authority before credentials and tears it down in order", () => {
  const expectedTemporaryBranch = "ops/alice-preimport-18372c5-20260828";
  const dispatchInputs = preimportWorkflow
    .slice(
      preimportWorkflow.indexOf("    inputs:"),
      preimportWorkflow.indexOf("\npermissions:"),
    )
    .match(/^      [a-z0-9_]+:$/gm) ?? [];
  assert.equal(
    dispatchInputs.length,
    10,
    "workflow_dispatch must stay within GitHub's ten-input schema limit",
  );
  assert.match(preimportWorkflow, /^      workflow_protection_evidence:$/m);
  const jobs = namedWorkflowJobs(preimportWorkflow);
  for (const [jobName, guardName, secretName] of [
    [
      "import_runtime",
      "Enforce exact source build watchdog and artifact identity",
      "CLOUDFLARE_CONTAINER_BRINGUP_TOKEN",
    ],
    [
      "materialize",
      "Revalidate exact source build watchdog and artifact identity",
      "CLOUDFLARE_API_TOKEN",
    ],
  ]) {
    const job = jobs.find(({ name }) => name === jobName)?.block ?? "";
    const steps = namedWorkflowSteps(job);
    const guardIndex = steps.findIndex(({ name }) => name === guardName);
    const credentialIndex = steps.findIndex(({ block }) =>
      block.includes(`secrets.${secretName}`),
    );
    assert.ok(guardIndex >= 0, `${jobName} authority guard is missing`);
    assert.ok(
      credentialIndex > guardIndex,
      `${jobName} must validate immutable branch authority before credential use`,
    );
    const guard = steps[guardIndex].block;
    assert.match(
      guard,
      new RegExp(`EXPECTED_WORKFLOW_BRANCH: ${expectedTemporaryBranch}`),
    );
    assert.match(guard, /test "\$GITHUB_REF" = "\$EXPECTED_WORKFLOW_REF"/);
    assert.match(
      guard,
      /git\/ref\/heads\/\$\{EXPECTED_WORKFLOW_BRANCH\}[\s\S]*?--jq \.object\.sha[\s\S]*?test "\$GITHUB_SHA" = "\$workflow_branch_sha"/,
    );
    assert.match(
      guard,
      /GITHUB_REF_PROTECTED_CONTEXT: \$\{\{ github\.ref_protected \}\}/,
    );
    assert.match(guard, /test "\$GITHUB_REF_PROTECTED_CONTEXT" = "true"/);
    assert.match(
      guard,
      /WORKFLOW_PROTECTION_EVIDENCE: \$\{\{ inputs\.workflow_protection_evidence \}\}/,
    );
    assert.match(guard, /awk -F'\|' '\{print NF\}'\)" = "2"/);
    assert.match(
      guard,
      /WORKFLOW_PROTECTION_SHA256="\$\{WORKFLOW_PROTECTION_EVIDENCE%%\|\*\}"[\s\S]*?WORKFLOW_PROTECTION_OBSERVED_AT="\$\{WORKFLOW_PROTECTION_EVIDENCE#\*\|\}"/,
    );
    assert.match(
      guard,
      /printf '%s' "\$WORKFLOW_PROTECTION_SHA256" \|[\s\S]*?grep -Eq '\^sha256:\[a-f0-9\]\{64\}\$'/,
    );
    assert.match(
      guard,
      /protection_observed_epoch="\$\(date -u -d[\s\S]*?"\$WORKFLOW_PROTECTION_OBSERVED_AT" \+%s\)"[\s\S]*?protection_age_seconds=\$\(\( now_epoch - protection_observed_epoch \)\)[\s\S]*?test "\$protection_age_seconds" -le 7200/,
    );
    assert.doesNotMatch(
      guard,
      /branches\/[^\s"']*\/protection|protection_json|\.enforce_admins|\.lock_branch|\.allow_force_pushes|\.allow_deletions/,
    );
    assert.doesNotMatch(guard, /secrets\.|CLOUDFLARE_API_TOKEN/);
  }

  const contract = preimportWorkflow.slice(0, preimportWorkflow.indexOf("\nname:"));
  assert.match(contract, /Owner: Alice pre-import protected-branch operator/);
  assert.match(contract, /Hard expiry: two hours after temporary branch-protection creation/);
  assert.match(
    contract,
    /enforce_admins=true, lock_branch=true, allow_force_pushes=false, allow_deletions=false/,
  );
  assert.match(
    preimportWorkflow,
    /Branch-protection readback:[^\n]*WORKFLOW_PROTECTION_SHA256[^\n]*WORKFLOW_PROTECTION_OBSERVED_AT/,
  );
  const importPolicyDelete = contract.indexOf(
    "alice-cloudflare-bringup/deployment-branch-policies/IMPORT_POLICY_ID",
  );
  const materializePolicyDelete = contract.indexOf(
    "alice-production/deployment-branch-policies/MATERIALIZE_POLICY_ID",
  );
  const protectionDelete = contract.indexOf(
    "branches/ops%2Falice-preimport-18372c5-20260828/protection",
  );
  const branchDelete = contract.indexOf(
    "git push origin --delete ops/alice-preimport-18372c5-20260828",
  );
  assert.ok(importPolicyDelete >= 0 && materializePolicyDelete >= 0);
  assert.ok(protectionDelete > Math.max(importPolicyDelete, materializePolicyDelete));
  assert.ok(branchDelete > protectionDelete);
});
