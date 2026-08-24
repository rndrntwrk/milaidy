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
const watchdogPath = path.join(
  repoRoot,
  ".github/workflows/recover-alice-production-watchdog.yml",
);
const watchdog = fs.existsSync(watchdogPath)
  ? fs.readFileSync(watchdogPath, "utf8")
  : "";
const deadlineSource = fs.readFileSync(
  path.join(repoRoot, "deploy/modal/alice_release_deadline.mjs"),
  "utf8",
);

test("protected Alice deployment consumes only the exact successful build artifact", () => {
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
  assert.match(workflow, /ARTIFACT_DIGEST[\s\S]*?artifact_record/);
  assert.match(
    workflow,
    /artifact_record_count="\$\(printf '%s' "\$artifact_record" \| awk 'NF \{ count\+\+ \} END \{ print count \+ 0 \}'\)"[\s\S]*?test "\$artifact_record_count" = "1"/,
  );
  assert.doesNotMatch(
    workflow,
    /printf '%s' "\$artifact_record" \| wc -l/,
  );
});

test("every secret-bearing job executes only the workflow ref after validating the protected source", () => {
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\.source_sha \}\}/);
  const deployCheckout = workflow.indexOf("Checkout exact protected release");
  const deployValidation = workflow.indexOf("Enforce protected source and build identity");
  const firstRepositoryExecution = workflow.indexOf(
    "node deploy/modal/alice_release_deadline.mjs initialize",
  );
  assert.ok(deployCheckout >= 0 && deployCheckout < deployValidation);
  assert.ok(deployValidation < firstRepositoryExecution);
  assert.match(
    workflow,
    /Checkout exact protected release[\s\S]*?ref: \$\{\{ github\.sha \}\}[\s\S]*?Enforce protected source and build identity[\s\S]*?test "\$GITHUB_SHA" = "\$SOURCE_SHA"[\s\S]*?git\/ref\/heads\/release\/alice-production-core-2026-08-22/,
  );
  assert.match(
    workflow,
    /accept:[\s\S]*?ref: \$\{\{ github\.sha \}\}[\s\S]*?Validate independent recovery-operator source[\s\S]*?test "\$GITHUB_SHA" = "\$SOURCE_SHA"/,
  );
  const recoveryJobs = workflow.slice(workflow.indexOf("  recover-modal:"));
  assert.match(
    recoveryJobs,
    /recover-modal:[\s\S]*?ref: \$\{\{ github\.sha \}\}[\s\S]*?Validate trusted recovery source before setup or secrets[\s\S]*?test "\$GITHUB_SHA" = "\$SOURCE_SHA"/,
  );
  assert.match(
    recoveryJobs,
    /recover-cloudflare:[\s\S]*?ref: \$\{\{ github\.sha \}\}[\s\S]*?Validate trusted recovery source before setup or secrets[\s\S]*?test "\$GITHUB_SHA" = "\$SOURCE_SHA"/,
  );
  for (const block of recoveryJobs.matchAll(/run: \|\n([\s\S]*?)(?=\n\s+- name:|$)/g)) {
    assert.doesNotMatch(block[1], /\$\{\{ inputs\.source_sha \}\}/);
  }
  const recoveryValidations = [
    ...recoveryJobs.matchAll(
      /- name: Validate trusted recovery source before setup or secrets\n([\s\S]*?)(?=\n\s+- name:)/g,
    ),
  ];
  assert.equal(recoveryValidations.length, 2);
  for (const [, validation] of recoveryValidations) {
    assert.match(validation, /test "\$GITHUB_SHA" = "\$SOURCE_SHA"/);
    assert.doesNotMatch(validation, /git\/ref\/heads\/release\/alice-production-core/);
  }
});

test("every frozen recovery or deployment install hydrates the exact reviewed Eliza PR head first", () => {
  const expectedElizaSha = "a21d401bf7429bc8c794698b20832512b5315187";
  const reviewedRef = String.raw`refs\/pull\/5\/head`;
  const exactHydration = new RegExp(
    String.raw`Hydrate exact reviewed Eliza PR head[\s\S]*?` +
      String.raw`EXPECTED_ELIZA_SHA: ${expectedElizaSha}[\s\S]*?` +
      String.raw`https:\/\/github\.com\/rndrntwrk\/eliza\.git[\s\S]*?` +
      reviewedRef +
      String.raw`[\s\S]*?git ls-tree HEAD eliza[\s\S]*?` +
      String.raw`git clone --no-checkout --filter=blob:none[\s\S]*?` +
      String.raw`git -C eliza fetch --depth=1 origin[\s\S]*?\$reviewed_eliza_ref:refs\/remotes\/origin\/alice-reviewed-pr-5[\s\S]*?` +
      String.raw`test "\$reviewed_eliza_sha" = "\$EXPECTED_ELIZA_SHA"[\s\S]*?` +
      String.raw`test "\$eliza_sha" = "\$reviewed_eliza_sha"[\s\S]*?` +
      String.raw`git -C eliza checkout --detach "\$eliza_sha"[\s\S]*?` +
      String.raw`git -C eliza rev-parse HEAD[\s\S]*?` +
      String.raw`Install exact (?:release|recovery) dependencies[\s\S]*?` +
      String.raw`bash scripts\/alice-frozen-install-retry\.sh`,
  );

  const deployJob = workflow.match(/  deploy:[\s\S]*?(?=\n  accept:)/)?.[0] ?? "";
  const recoveryJob =
    workflow.match(/  recover-cloudflare:[\s\S]*$/)?.[0] ?? "";
  const watchdogRecoveryJob =
    watchdog.match(/  recover-cloudflare:[\s\S]*$/)?.[0] ?? "";

  assert.match(deployJob, exactHydration);
  assert.match(recoveryJob, exactHydration);
  assert.match(watchdogRecoveryJob, exactHydration);
});

test("protected Alice deployment verifies image and Worker provenance before promotion", () => {
  assert.match(
    workflow,
    /gh attestation verify "oci:\/\/\$\{RUNTIME_IMAGE\}"[\s\S]*?--source-digest "\$SOURCE_SHA"[\s\S]*?--deny-self-hosted-runners/,
  );
  assert.match(workflow, /verify_alice_runtime_build_manifest\.mjs/);
  assert.match(workflow, /alice_deployment_manifest\.mjs/);
  assert.match(
    workflow,
    /ALICE_ROLLBACK_BOUNDARY: "modal:alice-runtime:v\$\{\{ inputs\.modal_revision \}\}"/,
  );
  assert.match(workflow, /alice_cloudflare_config\.mjs/);
  assert.match(workflow, /alice_cloudflare_release\.mjs/);
  assert.match(workflow, /ALICE_PRODUCTION_RELEASE_CONFIRM/);
  for (const secret of [
    "ALICE_RELEASE_ACCESS_AUDIENCE",
    "ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256",
    "ALICE_MODAL_PROXY_KEY",
    "ALICE_MODAL_PROXY_SECRET",
    "MILADY_API_TOKEN",
    "ELIZA_VAULT_PASSPHRASE",
    "ALICE_DEPLOYMENT_PAUSE_TOKEN",
    "ALICE_RUNTIME_RELEASE_TOKEN_ROOT",
  ]) {
    assert.match(workflow, new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`));
  }
  assert.match(
    workflow,
    /MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET: \$\{\{ secrets\.ALICE_ACCESS_PROXY_SECRET \}\}/,
  );
  assert.doesNotMatch(workflow, /secrets\.ALICE_RUNTIME_RELEASE_TOKEN(?:_SHA256)?\b/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY:/);
  const deployJob = workflow.match(
    /  deploy:[\s\S]*?(?=\n  accept:)/,
  )?.[0] ?? "";
  assert.doesNotMatch(deployJob, /ALICE_CONTROL_RECOVERY_TOKEN/);
  assert.match(
    deployJob,
    /Assert independently preprovisioned recovery boundary[\s\S]*?alice_cloudflare_recovery_preprovision\.mjs/,
  );
  const acceptJob = workflow.match(
    /  accept:[\s\S]*?(?=\n  recover-modal:)/,
  )?.[0] ?? "";
  assert.match(acceptJob, /environment: alice-production-cloudflare-recovery/);
  assert.match(
    acceptJob,
    /Prove terminal authenticated Alice production acceptance[\s\S]*?ALICE_OWNER_AUTHORIZATION: \$\{\{ secrets\.ALICE_OWNER_AUTHORIZATION \}\}[\s\S]*?ALICE_CONTROL_RECOVERY_TOKEN: \$\{\{ secrets\.ALICE_CONTROL_RECOVERY_TOKEN \}\}[\s\S]*?ALICE_RECOVERY_OPERATOR_JOB: accept[\s\S]*?alice_production_acceptance\.ts/,
  );
  assert.equal(
    workflow.match(/ALICE_CONTROL_RECOVERY_TOKEN: \$\{\{ secrets\.ALICE_CONTROL_RECOVERY_TOKEN \}\}/g)?.length,
    1,
  );
});

test("protected Alice deployment bootstraps unrouted fail-closed continuity and signs its exact identities", () => {
  assert.match(
    workflow,
    /Revalidate protected head before first provider mutation[\s\S]*?git\/ref\/heads\/release\/alice-production-core-2026-08-22[\s\S]*?test "\$protected_sha" = "\$SOURCE_SHA"[\s\S]*?Bootstrap unrouted fail-closed continuity identities/,
  );
  assert.match(
    workflow,
    /Verify immutable Worker attestations before unrouted fail-closed bootstrap[\s\S]*?alice_cloudflare_bootstrap\.mjs/,
  );
  assert.match(
    workflow,
    /ALICE_EXPECTED_DO_NAMESPACE_IDS_PATH: \$\{\{ runner\.temp \}\}\/alice-release\/durable-object-namespace-ids\.json/g,
  );
  assert.match(workflow, /continuity-readback\.json/);
  assert.match(workflow, /durable-object-namespace-ids\.json/);
});

test("protected Alice deployment preserves rollback evidence and tears down temp state", () => {
  assert.match(workflow, /rollback-anchor\.json/);
  assert.match(workflow, /live-readback\.json/);
  assert.match(workflow, /modal-emergency-rollback-evidence\.json/);
  assert.match(
    workflow,
    /Restore prior Modal graph if downstream promotion fails[\s\S]*?if: failure\(\) \|\| cancelled\(\)[\s\S]*?ALICE_MODAL_MUTATION_JOURNAL_PATH[\s\S]*?alice_modal_emergency_rollback\.mjs/,
  );
  assert.match(
    workflow,
    /Persist qualified candidate evidence before terminal acceptance[\s\S]*?actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02[\s\S]*?deployment-pause-evidence\.json[\s\S]*?modal-mutation-journal\.json[\s\S]*?overwrite: false/,
  );
  const acceptJob = workflow.match(
    /  accept:[\s\S]*?(?=\n  recover-modal:)/,
  )?.[0] ?? "";
  assert.match(
    acceptJob,
    /needs: deploy[\s\S]*?environment: alice-production-cloudflare-recovery[\s\S]*?Prove terminal authenticated Alice production acceptance[\s\S]*?ALICE_PRODUCTION_ACCEPTANCE_PATH: \$\{\{ runner\.temp \}\}\/alice-release\/alice-production-acceptance\.json[\s\S]*?alice_production_acceptance\.ts[\s\S]*?Remove recovery-operator ephemeral material before publication[\s\S]*?if: always\(\)[\s\S]*?Persist terminal production acceptance evidence as final success action[\s\S]*?if: success\(\)[\s\S]*?alice-production-acceptance\.json[\s\S]*?overwrite: false/,
  );
  assert.match(
    workflow,
    /Restore prior Cloudflare graph after any failed or cancelled mutation[\s\S]*?if: failure\(\) \|\| cancelled\(\)[\s\S]*?ALICE_CLOUDFLARE_RELEASE_PHASE: rollback/,
  );
  const candidateEvidence = workflow.indexOf(
    "Persist qualified candidate evidence before terminal acceptance",
  );
  const modalRecovery = workflow.indexOf(
    "Restore prior Modal graph if downstream promotion fails",
  );
  const cloudflareRecovery = workflow.indexOf(
    "Restore prior Cloudflare graph after any failed or cancelled mutation",
  );
  const recoveryEvidence = workflow.indexOf("Preserve terminal recovery evidence");
  assert.ok(candidateEvidence < modalRecovery);
  assert.ok(modalRecovery < cloudflareRecovery);
  assert.ok(cloudflareRecovery < recoveryEvidence);
  const acceptStepNames = [
    ...acceptJob.matchAll(/^      - name: (.+)$/gm),
  ].map((match) => match[1]);
  assert.equal(
    acceptStepNames.at(-1),
    "Persist terminal production acceptance evidence as final success action",
  );
  assert.match(
    workflow,
    /timeout --signal=TERM --kill-after=30s "\$\{phase_seconds\}s"/,
  );
  assert.match(
    workflow,
    /Remove ephemeral release material[\s\S]*?if: always\(\)[\s\S]*?rm -rf -- "\$\{RUNNER_TEMP\}\/alice-worker-bundles" "\$\{RUNNER_TEMP\}\/alice-release" "\$\{RUNNER_TEMP\}\/alice-bootstrap"/,
  );
});

test("protected Modal tooling is byte-hash locked and revalidates the protected ref at mutation time", () => {
  assert.match(
    workflow,
    /pip install[\s\S]*?--require-hashes[\s\S]*?--only-binary=:all:[\s\S]*?requirements-modal-1\.5\.4\.lock/,
  );
  assert.match(
    workflow,
    /Promote exact Modal runtime[\s\S]*?GH_TOKEN: \$\{\{ github\.token \}\}[\s\S]*?alice_modal_promote\.mjs/,
  );
});

test("first release journals rollback and commits PAUSE_ALL before Modal or owner ingress mutation", () => {
  assert.match(workflow, /timeout-minutes: (?:9[0-9]|[1-9][0-9]{2,})/);
  const capture = workflow.indexOf("Capture immutable Cloudflare rollback journal");
  const persist = workflow.indexOf("Persist pre-mutation Cloudflare rollback journal");
  const prepare = workflow.indexOf("Prepare service-authenticated fail-closed control route");
  const pause = workflow.indexOf("Commit first-release PAUSE_ALL before runtime mutation");
  const pauseJournal = workflow.indexOf("Persist pre-runtime PAUSE_ALL journal");
  const legacyCapture = workflow.indexOf(
    "Capture exact legacy Modal stop boundary or safe re-entry",
  );
  const legacyPersist = workflow.indexOf(
    "Persist exact Modal legacy transition before bootstrap mutation",
  );
  const safeBootstrap = workflow.indexOf(
    "Establish inert proxy-authenticated Modal rollback anchor",
  );
  const safePersist = workflow.indexOf(
    "Persist verified inert Modal rollback anchor",
  );
  const modalCapture = workflow.indexOf("Capture immutable Modal rollback journal");
  const modalJournal = workflow.indexOf("Persist pre-mutation Modal rollback journal");
  const modal = workflow.indexOf("Promote exact Modal runtime with rollback and forward proof");
  const cloudflare = workflow.indexOf("Promote only attested immutable Worker bytes");
  assert.ok([capture, persist, prepare, pause, pauseJournal, legacyCapture,
    legacyPersist, safeBootstrap, safePersist, modalCapture, modalJournal,
    modal, cloudflare]
    .every((index) => index >= 0));
  assert.ok(capture < persist && persist < prepare && prepare < pause);
  assert.ok(pause < pauseJournal && pauseJournal < legacyCapture);
  assert.ok(legacyCapture < legacyPersist && legacyPersist < safeBootstrap);
  assert.ok(safeBootstrap < safePersist && safePersist < modalCapture);
  assert.ok(modalCapture < modalJournal && modalJournal < modal && modal < cloudflare);
  assert.match(workflow, /ALICE_CLOUDFLARE_RELEASE_PHASE: capture/);
  assert.match(workflow, /ALICE_CLOUDFLARE_RELEASE_PHASE: prepare/);
  assert.match(workflow, /ALICE_CLOUDFLARE_RELEASE_PHASE: promote/);
  assert.match(workflow, /alice_release_pause\.mjs/);
  assert.match(workflow, /ALICE_RELEASE_ACCESS_CLIENT_ID: \$\{\{ secrets\.ALICE_RELEASE_ACCESS_CLIENT_ID \}\}/);
  assert.match(workflow, /ALICE_MODAL_PROMOTION_PHASE: capture/);
  assert.match(workflow, /ALICE_MODAL_PROMOTION_PHASE: promote/);
  const modalCaptureStep = workflow.match(
    /- name: Capture immutable Modal rollback journal[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(modalCaptureStep, /ALICE_MODAL_REVISION: \$\{\{ inputs\.modal_revision \}\}/);
  assert.match(modalCaptureStep, /ALICE_RUNTIME_IMAGE: \$\{\{ inputs\.runtime_image \}\}/);
});

test("unsafe Modal v48 can only transition through an externally journaled stop boundary", () => {
  const legacyPersist = workflow.match(
    /- name: Persist exact Modal legacy transition before bootstrap mutation[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(legacyPersist, /modal-legacy-transition\.json/);
  assert.match(legacyPersist, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  const stop = workflow.match(
    /- name: Stop unsafe Modal transition when no safe anchor was persisted[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(stop, /if: failure\(\) \|\| cancelled\(\)/);
  assert.match(stop, /ALICE_MODAL_SAFE_BOOTSTRAP_PHASE: stop-if-unanchored/);
  assert.match(stop, /alice_modal_safe_bootstrap_cli\.mjs/);
  assert.doesNotMatch(stop, /app rollback|alice_modal_emergency_rollback/);
  assert.match(
    workflow,
    /ALICE_MODAL_RELEASE_SECRET_NAME=alice-production-core-\$\{release_digest#sha256:\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/,
  );
});

test("runner loss invokes provider-isolated recovery from external journals", () => {
  const modalRecovery = workflow.match(
    /  recover-modal:[\s\S]*?(?=\n  recover-cloudflare:)/,
  )?.[0] ?? "";
  assert.match(modalRecovery, /needs: \[deploy, accept\]/);
  assert.match(modalRecovery, /needs\.deploy\.result != 'success'/);
  assert.match(modalRecovery, /needs\.accept\.result != 'success'/);
  assert.match(modalRecovery, /environment: alice-production-modal-recovery/);
  assert.match(modalRecovery, /alice-modal-legacy-transition-/);
  assert.match(modalRecovery, /alice_modal_safe_bootstrap_cli\.mjs/);
  assert.match(modalRecovery, /alice_modal_emergency_rollback\.mjs/);
  assert.match(
    workflow,
    /recover-cloudflare:[\s\S]*?needs: \[deploy, accept\][\s\S]*?needs\.deploy\.result != 'success'[\s\S]*?needs\.accept\.result != 'success'[\s\S]*?environment: alice-production-cloudflare-recovery[\s\S]*?alice-cloudflare-anchor-[\s\S]*?ALICE_CLOUDFLARE_RELEASE_PHASE=rollback[\s\S]*?alice_cloudflare_release\.mjs/,
  );
  const cloudflareAnchor = workflow.match(
    /- name: Persist pre-mutation Cloudflare rollback journal[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(cloudflareAnchor, /alice-worker-bundles/);
  assert.match(cloudflareAnchor, /alice-release/);
  assert.doesNotMatch(cloudflareAnchor, /include-hidden-files: true/);
});

test("a protected push prestarts cancellation-safe provider recovery before dispatch", () => {
  assert.ok(watchdog.length > 0, "independent recovery watchdog is missing");
  assert.match(
    watchdog,
    /push:[\s\S]*?branches:[\s\S]*?- release\/alice-production-core-2026-08-22/,
  );
  assert.doesNotMatch(watchdog, /needs:\s*deploy/);
  assert.match(watchdog, /timeout-minutes: 240/);
  assert.match(
    watchdog,
    /ref: \$\{\{ github\.sha \}\}[\s\S]*?Validate exact protected push source[\s\S]*?test "\$GITHUB_SHA" = "\$SOURCE_SHA"/,
  );
  assert.doesNotMatch(
    watchdog.match(/Validate exact protected push source[\s\S]*?(?=\n\s+- name:)/)?.[0] ?? "",
    /git\/ref\/heads\/release\/alice-production-core/,
  );
  assert.match(
    watchdog,
    /Select one exact parent deployment[\s\S]*?Alice production deploy watchdog-\$\{GITHUB_RUN_ID\}[\s\S]*?sort_by\(\.id\)[\s\S]*?parent_run_id/,
  );
  assert.match(
    watchdog,
    /Verify Modal recovery credential and provider readback[\s\S]*?--capture-current[\s\S]*?alice_recovery_credential_binding\.mjs[\s\S]*?Publish exact Modal recovery readiness/,
  );
  assert.match(
    watchdog,
    /Verify Cloudflare recovery credential and provider readback[\s\S]*?user\/tokens\/verify[\s\S]*?workers\/scripts[\s\S]*?alice_recovery_credential_binding\.mjs[\s\S]*?Publish exact Cloudflare recovery readiness/,
  );
  assert.match(watchdog, /environment: alice-production-modal-recovery/);
  assert.match(watchdog, /environment: alice-production-cloudflare-recovery/);
  assert.doesNotMatch(watchdog, /environment: alice-production-recovery/);
  assert.match(watchdog, /alice_modal_emergency_rollback\.mjs/);
  assert.match(watchdog, /ALICE_CLOUDFLARE_RELEASE_PHASE=rollback/);
});

test("deployment proves both provider watchdog jobs selected it immediately before mutation", () => {
  assert.match(workflow, /recovery_watchdog_run_id:/);
  assert.match(workflow, /actions: read/);
  assert.doesNotMatch(workflow, /actions: write/);
  const validation = workflow.match(
    /- name: Enforce protected source and build identity[\s\S]*?(?=\n\s+- name:)/,
  )?.[0] ?? "";
  assert.match(validation, /RECOVERY_WATCHDOG_RUN_ID/);
  assert.match(validation, /recover-alice-production-watchdog\.yml/);
  assert.match(validation, /\.status/);
  assert.match(validation, /in_progress/);
  const readiness = workflow.match(
    /- name: Verify two-way provider recovery readiness before first mutation[\s\S]*?(?=\n\s+- name:)/,
  )?.[0] ?? "";
  assert.match(readiness, /for provider in modal cloudflare/);
  assert.match(
    readiness,
    /alice-watchdog-ready-\$\{provider\}-\$\{SOURCE_SHA\}-\$\{RECOVERY_WATCHDOG_RUN_ID\}-1-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/,
  );
  assert.match(readiness, /GITHUB_RUN_ID/);
  assert.match(readiness, /watchdogRunAttempt/);
  assert.match(readiness, /parentRunAttempt/);
  assert.match(readiness, /credentialIdSha256/);
  assert.match(readiness, /credentialPolicySha256/);
  assert.match(readiness, /Prestarted independent Modal recovery/);
  assert.match(readiness, /Prestarted independent Cloudflare recovery/);
  assert.match(readiness, /in_progress/);
  const readinessIndex = workflow.indexOf(
    "Verify two-way provider recovery readiness before first mutation",
  );
  const firstMutation = workflow.indexOf(
    "Bootstrap unrouted fail-closed continuity identities",
  );
  assert.ok(readinessIndex >= 0 && readinessIndex < firstMutation);
  assert.doesNotMatch(
    watchdog.match(
      /- name: Consume external journal and recover Cloudflare independently[\s\S]*?(?=\n\s+- name:)/,
    )?.[0] ?? "",
    /ALICE_(?:DEPLOYMENT_PAUSE_TOKEN|ACCESS_GATEWAY_SERVICE_TOKEN|AI_GATEWAY_SERVICE_TOKEN|ACCESS_PROXY_SECRET|MODAL_PROXY_KEY|MODAL_PROXY_SECRET|ACCESS_CONTROL_SERVICE_TOKEN|RUNTIME_RELEASE_TOKEN_ROOT|AI_CONTROL_SERVICE_TOKEN)|MILADY_API_TOKEN|ELIZA_VAULT_PASSPHRASE/,
  );
  for (const source of [workflow, watchdog]) {
    assert.match(source, /test "\$GITHUB_RUN_ATTEMPT" = "1"/);
  }
  assert.match(watchdog, /\.run_attempt == 1/);
  assert.match(watchdog, /test .*\.run_attempt.* = "1"/);
});

test("all provider mutations share a hard cutoff that preserves thirty minutes for recovery", () => {
  const establish = workflow.indexOf(
    "Establish global mutation cutoff and recovery reserve",
  );
  const firstMutation = workflow.indexOf(
    "Bootstrap unrouted fail-closed continuity identities",
  );
  assert.ok(establish >= 0 && establish < firstMutation);
  assert.match(
    workflow,
    /alice_release_deadline\.mjs initialize >> "\$GITHUB_ENV"/,
  );
  assert.match(
    deadlineSource,
    /ALICE_RELEASE_MUTATION_CUTOFF_EPOCH/,
  );
  assert.match(
    deadlineSource,
    /ALICE_RELEASE_RECOVERY_DEADLINE_EPOCH/,
  );
  for (const step of [
    "Bootstrap unrouted fail-closed continuity identities",
    "Assert independently preprovisioned recovery boundary",
    "Prepare service-authenticated fail-closed control route",
    "Commit first-release PAUSE_ALL before runtime mutation",
    "Promote exact Modal runtime with rollback and forward proof",
    "Promote only attested immutable Worker bytes",
  ]) {
    const body = workflow.match(
      new RegExp(`- name: ${step}[\\s\\S]*?(?=\\n      - name:)`),
    )?.[0] ?? "";
    assert.match(body, /alice_release_deadline\.mjs mutation/);
    assert.match(body, /timeout --signal=TERM --kill-after=30s "\$\{phase_seconds\}s"/);
  }
  for (const [step, phase] of [
    ["Restore prior Modal graph if downstream promotion fails", "modal-recovery"],
    ["Restore prior Cloudflare graph after any failed or cancelled mutation", "cloudflare-recovery"],
  ]) {
    const body = workflow.match(
      new RegExp(`- name: ${step}[\\s\\S]*?(?=\\n      - name:)`),
    )?.[0] ?? "";
    assert.match(body, new RegExp(`alice_release_deadline\\.mjs ${phase}`));
    assert.match(body, /timeout --signal=TERM --kill-after=30s "\$\{phase_seconds\}s"/);
  }
});
