import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import { verifyAliceReleaseSource } from "../../scripts/verify-alice-release-source.mjs";
import {
  buildAliceCandidateContainerApplicationTarget,
  fetchAliceContainerApplicationRollbackState,
  restoreAliceContainerApplication,
  restoreAliceCloudflareContinuityState,
  verifyReleaseArtifacts,
} from "./alice_cloudflare_release.mjs";
import {
  fetchAliceCloudflareContinuityState,
} from "./alice_cloudflare_live_readback.mjs";
import { captureAliceCloudflareWorkerRollbackState, normalizeAliceCloudflareVersionResources } from "./alice_cloudflare_worker_rollback.mjs";
import { fetchAliceCloudflareTrafficState } from "./alice_cloudflare_traffic.mjs";
import { validateAliceOwnerAuthorization } from "./alice_release_controller.mjs";
import { assertAliceAcceptanceRecoveryPause } from "./alice_production_acceptance";

const roles = ["control", "statePlane", "aiGateway", "connectorPlane", "runtimeHost", "access"];
const account = "036df6c823669b8fa2f66cf4c16eeb29";
const repository = "rndrntwrk/milaidy";
const branch = "release/alice-production-core-2026-08-22";
const digest = (bytes: any) => `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
const equal = (a: any, b: any) => canonicalAliceJson(a) === canonicalAliceJson(b);
const fail = (code: string) => { throw new Error(`ALICE_REACCEPT_${code}`); };
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p: string, v: any) => fs.writeFileSync(p, `${canonicalAliceJson(v)}\n`, { flag: "wx", mode: 0o444 });
const gh = (p: string) => execFileSync("gh", ["api", `repos/${repository}/${p}`], {
  stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024,
});
const ghJson = (p: string) => JSON.parse(gh(p).toString());

export function parseAliceReacceptSelection(serialized: string) {
  const value = JSON.parse(serialized);
  if (!equal(Object.keys(value).sort(), ["anchorDigest", "artifactDigest", "ownerPauseId", "runId"]) ||
      !/^[1-9][0-9]*$/.test(value.runId ?? "") ||
      !/^pause-[A-Za-z0-9-]{8,128}$/.test(value.ownerPauseId ?? "") ||
      ![value.anchorDigest, value.artifactDigest].every(v => /^sha256:[a-f0-9]{64}$/.test(v ?? ""))) fail("SELECTION_INVALID");
  return value;
}

// Only a coherent recorded rollback target or the complete retained candidate is eligible.
export function planAliceQualifiedRestoration({ workers, application, anchor, candidate, target }: any) {
  const prior = roles.every(role => workers[role]?.serving?.versionId === anchor.previous.workers[role]?.serving?.versionId);
  const retained = roles.every(role => workers[role]?.serving?.versionId === candidate.workers[role]?.versionId);
  if (!prior && !retained) fail("WORKER_STATE_DRIFTED");
  const withoutVersion = ({ applicationVersion: _, ...state }: any) => state;
  const expectedApplication = { ...anchor.previous.containerApplication, ...(retained ? { target } : {}) };
  if (!equal(withoutVersion(application), withoutVersion(expectedApplication))) fail("CONTAINER_STATE_DRIFTED");
  for (const role of roles) {
    const current = workers[role], previous = anchor.previous.workers[role];
    if (!equal(current.scriptSettings, previous.scriptSettings) ||
        (prior && !equal(current.versionResources, previous.versionResources))) fail("WORKER_SETTINGS_DRIFTED");
  }
  return retained ? [] : [...roles];
}

function downloadArtifact(record: any, expectedDigest: string, destination: string) {
  if (record.expired || record.digest !== expectedDigest) fail("ARTIFACT_IDENTITY_INVALID");
  const zip = gh(`actions/artifacts/${record.id}/zip`);
  if (digest(zip) !== expectedDigest) fail("ARTIFACT_BYTES_INVALID");
  fs.mkdirSync(destination);
  const zipPath = `${destination}.zip`;
  fs.writeFileSync(zipPath, zip, { flag: "wx", mode: 0o600 });
  const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" }).trim().split("\n");
  if (entries.some(p => p.startsWith("/") || p.split("/").includes("..") || p.includes("\\"))) fail("ARTIFACT_PATH_INVALID");
  execFileSync("unzip", ["-q", zipPath, "-d", destination]);
  fs.rmSync(zipPath);
}

export async function loadQualified(temp: string) {
  const root = path.join(temp, "alice-reaccept-journal");
  const releaseRoot = path.join(temp, "alice-release");
  const anchor = read(path.join(releaseRoot, "rollback-anchor.json"));
  const candidate = read(path.join(releaseRoot, "live-readback.json"));
  const admission = read(path.join(releaseRoot, "program-admission.json"));
  const release = await verifyReleaseArtifacts({
    sourceRoot: process.cwd(), manifestPath: path.join(releaseRoot, "alice-deployment-manifest.json"),
    artifactPath: path.join(root, "alice-worker-bundles/alice-worker-bundles.json"),
    artifactRoot: path.join(root, "alice-worker-bundles"), configDir: path.join(root, "alice-release/wrangler"),
  });
  for (const file of ["rollback-anchor.json", "program-admission.json", "alice-deployment-manifest.json"]) {
    if (!equal(read(path.join(root, "alice-release", file)), read(path.join(releaseRoot, file)))) fail("JOURNAL_BINDING_INVALID");
  }
  if (admission.schemaVersion !== "alice.program-admission.v2" ||
      admission.deploymentManifestSha256 !== release.deploymentManifestSha256 ||
      anchor.candidate?.sourceCommit !== release.manifest.source.sourceCommit ||
      anchor.candidate?.deploymentManifestSha256 !== release.deploymentManifestSha256 ||
      candidate.terminalSnapshotStable !== true) fail("QUALIFIED_BINDING_INVALID");
  for (const role of roles) {
    if (candidate.workers[role]?.deploymentManifestSha256 !== release.deploymentManifestSha256 ||
        candidate.workers[role]?.trafficPercentage !== 100 ||
        candidate.workers[role]?.worker !== release.configs[role].name ||
        !/^[a-f0-9-]{36}$/.test(candidate.workers[role]?.versionId ?? "")) fail("QUALIFIED_WORKER_INVALID");
  }
  return { root, releaseRoot, anchor, candidate, admission, release };
}

async function prepare(selection: any, temp: string) {
  const run = ghJson(`actions/runs/${selection.runId}`);
  const jobs = ghJson(`actions/runs/${selection.runId}/jobs?filter=all&per_page=100`).jobs;
  if (run.path !== ".github/workflows/deploy-alice-cloudflare.yml" || run.event !== "workflow_dispatch" ||
      run.head_branch !== branch || run.run_attempt !== 1 || run.status !== "completed" ||
      run.conclusion !== "failure" ||
      jobs.filter((j: any) => j.name === "Promote attested Alice Worker bytes" && j.run_attempt === 1 && j.conclusion === "success").length !== 1) fail("ORIGINAL_RUN_INVALID");
  const artifacts = ghJson(`actions/runs/${selection.runId}/artifacts?per_page=100`).artifacts;
  for (const [prefix, sha, folder] of [
    ["alice-qualified-candidate", selection.artifactDigest, "alice-release"],
    ["alice-cloudflare-anchor", selection.anchorDigest, "alice-reaccept-journal"],
  ]) {
    const name = `${prefix}-${process.env.SOURCE_SHA}-${selection.runId}-1`;
    const matches = artifacts.filter((a: any) => a.name === name && !a.expired && a.workflow_run.id === Number(selection.runId));
    if (matches.length !== 1) fail("ARTIFACT_IDENTITY_INVALID");
    downloadArtifact(matches[0], sha, path.join(temp, folder));
  }
  const qualified = await loadQualified(temp);
  if (qualified.release.manifest.source.deploymentControllerCommit !== run.head_sha) fail("ORIGINAL_CONTROLLER_INVALID");
  write(path.join(qualified.releaseRoot, "reaccept-selection.json"), selection);
  fs.appendFileSync(process.env.GITHUB_ENV!, `ALICE_DEPLOYMENT_RUN_ID=${selection.runId}\nALICE_RECOVERY_PAUSE_ID=${selection.ownerPauseId}\n`);
  console.log("ALICE_REACCEPT_IMMUTABLE_ARTIFACTS_VERIFIED");
}

async function waitForWatchdog(temp: string) {
  const watchdog = process.env.RECOVERY_WATCHDOG_RUN_ID!;
  if (!/^[1-9][0-9]*$/.test(watchdog ?? "")) fail("WATCHDOG_INVALID");
  const name = `alice-watchdog-ready-cloudflare-${process.env.SOURCE_SHA}-${watchdog}-1-${process.env.GITHUB_RUN_ID}-1`;
  for (let attempt = 0; attempt < 120; attempt++) {
    const run = ghJson(`actions/runs/${watchdog}`);
    if (run.head_sha !== process.env.CONTROLLER_SHA || run.status !== "in_progress" || run.conclusion !== null ||
        run.path !== ".github/workflows/recover-alice-production-watchdog.yml" || run.run_attempt !== 1 ||
        run.display_title !== `Alice production recovery ${process.env.SOURCE_SHA}`) fail("WATCHDOG_INVALID");
    const matches = ghJson(`actions/runs/${watchdog}/artifacts?per_page=100`).artifacts.filter((a: any) => a.name === name && !a.expired);
    if (matches.length > 1) fail("WATCHDOG_INVALID");
    if (matches.length === 1) {
      const dir = path.join(temp, "alice-reaccept-readiness");
      downloadArtifact(matches[0], matches[0].digest, dir);
      const value = read(path.join(dir, "readiness.json"));
      if (value.schemaVersion !== 1 || value.sourceSha !== process.env.SOURCE_SHA ||
          String(value.watchdogRunId) !== watchdog || value.watchdogRunAttempt !== 1 ||
          String(value.parentRunId) !== process.env.GITHUB_RUN_ID || value.parentRunAttempt !== 1 ||
          value.provider !== "cloudflare" || value.providerReadback !== "verified" ||
          ![value.credentialIdSha256, value.credentialPolicySha256].every(v => /^sha256:[a-f0-9]{64}$/.test(v ?? ""))) fail("WATCHDOG_INVALID");
      const jobs = ghJson(`actions/runs/${watchdog}/jobs?filter=all&per_page=100`).jobs;
      if (jobs.filter((j: any) => j.name === "Prestarted independent Cloudflare recovery" && j.run_attempt === 1 && j.status === "in_progress" && j.conclusion === null).length !== 1) fail("WATCHDOG_INVALID");
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }
  fail("WATCHDOG_TIMEOUT");
}

async function restore(selection: any, temp: string, verifyOnly = false) {
  const { releaseRoot, anchor, candidate, admission, release } = await loadQualified(temp);
  if (!equal(selection, read(path.join(releaseRoot, "reaccept-selection.json")))) fail("SELECTION_DRIFTED");
  if (!verifyOnly) await waitForWatchdog(temp);
  if (ghJson(`git/ref/heads/${branch}`).object.sha !== process.env.CONTROLLER_SHA) fail("CONTROLLER_DRIFTED");
  const apiToken = process.env.CLOUDFLARE_API_TOKEN!;
  const vars = release.configs.control.vars;
  const namespaces = read(path.join(releaseRoot, "durable-object-namespace-ids.json"));
  const expected = read(path.join(releaseRoot, "deployment-pause-evidence.json")).candidateExpected;
  const owner = await validateAliceOwnerAuthorization(process.env.ALICE_OWNER_AUTHORIZATION, {
    issuer: vars.ALICE_ACCESS_ISSUER, audience: vars.ALICE_ACCESS_AUDIENCE, ownerEmailSha256: vars.ALICE_OWNER_EMAIL_SHA256,
  });
  const checkPause = async () => {
    const response = await fetch("https://alice.rndrntwrk.com/control/api/v1/state", { redirect: "manual",
      signal: AbortSignal.timeout(30_000), headers: { cookie: `CF_Authorization=${process.env.ALICE_OWNER_AUTHORIZATION}`,
        origin: "https://alice.rndrntwrk.com", "sec-fetch-site": "same-origin", accept: "application/json", "cache-control": "no-store" } });
    if (!response.ok) fail("OWNER_STATE_INVALID");
    assertAliceAcceptanceRecoveryPause({ state: await response.json(), expected, pauseId: selection.ownerPauseId, ownerActor: owner.actor });
  };
  await checkPause();
  const [workers, application, continuity, traffic] = await Promise.all([
    captureAliceCloudflareWorkerRollbackState({ apiToken }), fetchAliceContainerApplicationRollbackState({ apiToken }),
    fetchAliceCloudflareContinuityState({ apiToken, expectedDurableObjectNamespaceIds: namespaces }),
    fetchAliceCloudflareTrafficState({ apiToken }),
  ]);
  if (!equal(traffic, anchor.previous.trafficState)) fail("TRAFFIC_DRIFTED");
  if (![anchor.previous.continuityConfig, candidate.provider.continuityConfig].some(c => equal(c, continuity.sanitized))) fail("CONTINUITY_DRIFTED");
  const target = buildAliceCandidateContainerApplicationTarget({ previous: anchor.previous.containerApplication, materializedWranglerConfig: release.configs.runtimeHost });
  if (target.configuration.image !== admission.runtimeImage) fail("IMAGE_BINDING_INVALID");
  const restoreRoles = planAliceQualifiedRestoration({ workers, application, anchor, candidate, target });
  const api = async (pathname: string, body?: any) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, { redirect: "error", signal: AbortSignal.timeout(30_000),
      method: body ? "POST" : "GET", headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok || value.success !== true) fail("PROVIDER_REQUEST_FAILED");
    return value.result;
  };
  // Account access, AI Gateway and Vectorize controls are unchanged by version selection.
  // Their original qualification stays in live-readback.json; this retry verifies the
  // Worker, Container, traffic and queue state with the same scope as independent recovery.
  const candidateResources: Record<string, any> = {};
  for (const role of roles) {
    const worker = candidate.workers[role];
    const version = await api(`/accounts/${account}/workers/scripts/${worker.worker}/versions/${worker.versionId}`);
    if (version.id !== worker.versionId || !version.resources?.bindings?.some((b: any) =>
      b.name === "ALICE_DEPLOYMENT_MANIFEST_SHA256" && b.text === release.deploymentManifestSha256)) fail("VERSION_BINDING_INVALID");
    candidateResources[role] = normalizeAliceCloudflareVersionResources(version.resources);
  }
  await checkPause();
  if (verifyOnly) {
    console.log("ALICE_REACCEPT_READ_ONLY_PREFLIGHT_VERIFIED");
    return;
  }
  for (const role of restoreRoles) {
    if (role === "access") await restoreAliceContainerApplication({ apiToken, expected: { ...anchor.previous.containerApplication, target } });
    const worker = candidate.workers[role];
    await api(`/accounts/${account}/workers/scripts/${worker.worker}/deployments`, {
      strategy: "percentage", versions: [{ version_id: worker.versionId, percentage: 100 }],
      annotations: { "workers/message": `Reaccept qualified Alice candidate from run ${selection.runId}` },
    });
  }
  await restoreAliceCloudflareContinuityState({ apiToken, expectedDurableObjectNamespaceIds: namespaces, expectedConfig: candidate.provider.continuityConfig });
  const [restoredWorkers, restoredApplication, restoredTraffic, restoredContinuity] = await Promise.all([
    captureAliceCloudflareWorkerRollbackState({ apiToken }), fetchAliceContainerApplicationRollbackState({ apiToken }),
    fetchAliceCloudflareTrafficState({ apiToken }),
    fetchAliceCloudflareContinuityState({ apiToken, expectedDurableObjectNamespaceIds: namespaces }),
  ]);
  for (const role of roles) {
    const observed = restoredWorkers[role];
    if (observed.serving.versionId !== candidate.workers[role].versionId ||
        !equal(observed.versionResources, candidateResources[role]) ||
        !equal(observed.scriptSettings, workers[role].scriptSettings)) fail("RESTORED_VERSION_INVALID");
  }
  if (planAliceQualifiedRestoration({ workers: restoredWorkers, application: restoredApplication, anchor, candidate, target }).length !== 0 ||
      !equal(restoredTraffic, traffic) || !equal(restoredContinuity.sanitized, candidate.provider.continuityConfig)) fail("RESTORED_STATE_INVALID");
  await checkPause();
  write(path.join(releaseRoot, "reaccept-live-readback.json"), {
    schemaVersion: "alice.reaccept-component-readback.v1", observedAt: new Date().toISOString(),
    originalRunId: selection.runId, deploymentManifestSha256: release.deploymentManifestSha256,
    originalFullReadbackSha256: digest(fs.readFileSync(path.join(releaseRoot, "live-readback.json"))),
    workers: restoredWorkers, containerApplication: restoredApplication,
    traffic: restoredTraffic, continuityConfig: restoredContinuity.sanitized,
  });
  console.log(JSON.stringify({ code: "ALICE_REACCEPT_EXISTING_VERSIONS_VERIFIED", originalRunId: selection.runId,
    selectedExistingWorkers: restoreRoles.length, runtimeImage: admission.runtimeImage }));
}

if (import.meta.main) {
  try {
    if (process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== `refs/heads/${branch}` ||
        process.env.GITHUB_RUN_ATTEMPT !== "1" || process.env.GITHUB_JOB !== "accept" ||
        !path.isAbsolute(process.env.RUNNER_TEMP ?? "")) fail("EXECUTION_CONTEXT_INVALID");
    process.env.ALICE_SOURCE_COMMIT = process.env.SOURCE_SHA;
    verifyAliceReleaseSource({ sourceRoot: process.cwd(), sourceCommit: process.env.SOURCE_SHA, deploymentControllerCommit: process.env.CONTROLLER_SHA });
    const selection = parseAliceReacceptSelection(process.env.ALICE_REACCEPT_CANDIDATE!);
    if (process.argv[2] === "prepare") await prepare(selection, process.env.RUNNER_TEMP!);
    else if (process.argv[2] === "preflight") await restore(selection, process.env.RUNNER_TEMP!, true);
    else if (process.argv[2] === "restore") await restore(selection, process.env.RUNNER_TEMP!);
    else fail("PHASE_INVALID");
  } catch (error: any) {
    console.error(/^(ALICE_[A-Z_]+)$/.test(error?.message ?? "") ? error.message : "ALICE_REACCEPT_FAILED");
    process.exitCode = 1;
  }
}
