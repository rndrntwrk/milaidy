import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import { verifyAliceReleaseSource } from "../../scripts/verify-alice-release-source.mjs";
import {
  buildAliceCandidateContainerApplicationTarget,
  fetchAliceContainerApplicationRollbackState,
  verifyReleaseArtifacts,
} from "./alice_cloudflare_release.mjs";
import {
  fetchAliceCloudflareContinuityState,
  fetchAliceCodingContainerState,
  fetchAliceCodingWorkflowPrestate,
  resolveAliceCandidateCodingWorkflowVersion,
} from "./alice_cloudflare_live_readback.mjs";
import { captureAliceCloudflareWorkerRollbackState, normalizeAliceCloudflareVersionResources } from "./alice_cloudflare_worker_rollback.mjs";
import { fetchAliceCloudflareTrafficState } from "./alice_cloudflare_traffic.mjs";
import { validateAliceOwnerAuthorization } from "./alice_release_controller.mjs";

const roles = ["control", "statePlane", "aiGateway", "connectorPlane", "runtimeHost", "access"];
const codingRole = "codingSandbox";
const v4Manifest = "alice.deployment-manifest.v4";
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

// Bind the coding Workflow created by the original promotion to its qualified readback.
export function deriveAliceRetainedV4Owner({ anchor, candidate, rollbackProof, sourceCommit,
  deploymentManifestSha256, rollbackAnchorSha256 }: any) {
  if (anchor.schemaVersion !== "alice.cloudflare-rollback-anchor.v8" ||
      anchor.previous?.codingWorkflow?.absent !== true ||
      rollbackProof.schemaVersion !== "alice.cloudflare-rollback-evidence.v2" ||
      rollbackProof.codingWorkflow?.absent !== true ||
      candidate.schemaVersion !== "alice.cloudflare-live-readback.v2" ||
      candidate.terminalSnapshotStable !== true ||
      !/^sha256:[a-f0-9]{64}$/.test(rollbackAnchorSha256)) fail("CODING_OWNER_INVALID");
  let version;
  try {
    version = resolveAliceCandidateCodingWorkflowVersion({
      previous: rollbackProof.codingWorkflow,
      current: { workflow: candidate.codingWorkflow, versions: candidate.codingWorkflowVersions },
    });
  } catch { fail("CODING_OWNER_INVALID"); }
  if (version.id !== candidate.codingCandidateWorkflowVersionId) fail("CODING_OWNER_INVALID");
  return {
    schemaVersion: "alice.coding-workflow-owner.v1", sourceCommit,
    deploymentManifestSha256, rollbackAnchorSha256,
    ownedIdentity: { workflowId: candidate.codingWorkflow.id, candidateVersionId: version.id },
  };
}

export function verifyAliceRetainedV4Candidate({ workers, application, continuity, traffic,
  codingWorkflow, codingContainer, anchor, candidate, target, candidateResources, owner }: any) {
  if (!equal(traffic, anchor.previous.trafficState) ||
      !equal(continuity, candidate.provider.continuityConfig) ||
      !equal(codingWorkflow, { workflow: candidate.codingWorkflow, versions: candidate.codingWorkflowVersions }) ||
      !equal(codingContainer, candidate.codingContainer) ||
      codingWorkflow.workflow?.id !== owner.ownedIdentity.workflowId ||
      codingWorkflow.versions?.length !== 1 ||
      codingWorkflow.versions[0]?.id !== owner.ownedIdentity.candidateVersionId) fail("RETAINED_STATE_INVALID");
  const withoutVersion = ({ applicationVersion: _, ...state }: any) => state;
  if (!equal(withoutVersion(application),
    withoutVersion({ ...anchor.previous.containerApplication, target }))) fail("RETAINED_STATE_INVALID");
  for (const role of [...roles, codingRole]) {
    if (workers[role]?.worker !== candidate.workers[role]?.worker ||
        workers[role]?.serving?.versionId !== candidate.workers[role]?.versionId ||
        !equal(workers[role]?.versionResources, candidateResources[role]) ||
        (anchor.previous.workers[role]?.absent !== true &&
          !equal(workers[role]?.scriptSettings,
            anchor.previous.workers[role]?.scriptSettings))) fail("RETAINED_STATE_INVALID");
  }
}

export function verifyAliceRecordedPause({ state, evidence, pauseId }: any) {
  const active = evidence.active;
  const authority = state.authority;
  if (state.ok !== true || !active || !authority ||
      !equal(authority.binding, active.binding) ||
      authority.deploymentManifestSha256 !== active.deploymentManifestSha256 ||
      authority.activeReleaseEpoch !== active.releaseEpoch ||
      authority.rollbackBoundary !== active.rollbackBoundary ||
      !equal(authority.pausedScopes, ["all"]) ||
      evidence.result?.pause?.pauseId !== pauseId ||
      !equal(authority.activePauses?.all, evidence.result.pause)) fail("OWNER_STATE_INVALID");
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
  if (release.manifest.schemaVersion !== v4Manifest) fail("MANIFEST_UNSUPPORTED");
  for (const file of ["rollback-anchor.json", "program-admission.json", "alice-deployment-manifest.json"]) {
    if (!equal(read(path.join(root, "alice-release", file)), read(path.join(releaseRoot, file)))) fail("JOURNAL_BINDING_INVALID");
  }
  if (digest(fs.readFileSync(path.join(root, "alice-release/rollback-anchor.json"))) !==
      digest(fs.readFileSync(path.join(releaseRoot, "rollback-anchor.json")))) fail("JOURNAL_BINDING_INVALID");
  if (admission.schemaVersion !== "alice.program-admission.v2" ||
      admission.deploymentManifestSha256 !== release.deploymentManifestSha256 ||
      anchor.candidate?.sourceCommit !== release.manifest.source.sourceCommit ||
      anchor.candidate?.deploymentManifestSha256 !== release.deploymentManifestSha256 ||
      candidate.terminalSnapshotStable !== true) fail("QUALIFIED_BINDING_INVALID");
  for (const role of [...roles, codingRole]) {
    if (candidate.workers[role]?.deploymentManifestSha256 !== release.deploymentManifestSha256 ||
        candidate.workers[role]?.trafficPercentage !== 100 ||
        candidate.workers[role]?.worker !== release.configs[role].name ||
        !/^[a-f0-9-]{36}$/.test(candidate.workers[role]?.versionId ?? "")) fail("QUALIFIED_WORKER_INVALID");
  }
  const owner = deriveAliceRetainedV4Owner({
    anchor, candidate, rollbackProof: read(path.join(releaseRoot, "cloudflare-rollback-proof.json")),
    sourceCommit: release.manifest.source.sourceCommit,
    deploymentManifestSha256: release.deploymentManifestSha256,
    rollbackAnchorSha256: digest(fs.readFileSync(path.join(releaseRoot, "rollback-anchor.json"))),
  });
  for (const folder of [root, releaseRoot]) {
    const ownerPath = path.join(folder, folder === root ? "alice-release/coding-workflow-owned-identity.json" : "coding-workflow-owned-identity.json");
    if (fs.existsSync(ownerPath) && !equal(read(ownerPath), owner)) fail("CODING_OWNER_INVALID");
  }
  return { root, releaseRoot, anchor, candidate, admission, release, owner };
}

async function prepare(selection: any, temp: string) {
  const run = ghJson(`actions/runs/${selection.runId}`);
  const jobs = ghJson(`actions/runs/${selection.runId}/jobs?filter=all&per_page=100`).jobs;
  if (run.path !== ".github/workflows/deploy-alice-cloudflare.yml" || run.event !== "workflow_dispatch" ||
      run.head_branch !== branch || run.run_attempt !== 1 || run.status !== "completed" ||
      !["failure", "cancelled"].includes(run.conclusion) ||
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
  for (const file of [path.join(qualified.root, "alice-release/coding-workflow-owned-identity.json"),
    path.join(qualified.releaseRoot, "coding-workflow-owned-identity.json")]) {
    if (!fs.existsSync(file)) write(file, qualified.owner);
  }
  write(path.join(qualified.releaseRoot, "reaccept-selection.json"), selection);
  console.log("ALICE_REACCEPT_IMMUTABLE_ARTIFACTS_VERIFIED");
}

async function restore(selection: any, temp: string, verifyOnly = false) {
  const { root, releaseRoot, anchor, candidate, admission, release, owner: codingOwner } = await loadQualified(temp);
  if (!equal(selection, read(path.join(releaseRoot, "reaccept-selection.json")))) fail("SELECTION_DRIFTED");
  if (!fs.existsSync(path.join(root, "alice-release/coding-workflow-owned-identity.json"))) {
    fail("CODING_OWNER_INVALID");
  }
  if (ghJson(`git/ref/heads/${branch}`).object.sha !== process.env.CONTROLLER_SHA) fail("CONTROLLER_DRIFTED");
  const apiToken = process.env.CLOUDFLARE_API_TOKEN!;
  const vars = release.configs.control.vars;
  const namespaces = read(path.join(releaseRoot, "durable-object-namespace-ids.json"));
  const pauseEvidence = read(path.join(releaseRoot, "deployment-pause-evidence.json"));
  await validateAliceOwnerAuthorization(process.env.ALICE_OWNER_AUTHORIZATION, {
    issuer: vars.ALICE_ACCESS_ISSUER, audience: vars.ALICE_ACCESS_AUDIENCE, ownerEmailSha256: vars.ALICE_OWNER_EMAIL_SHA256,
  });
  const checkPause = async () => {
    const response = await fetch("https://alice.rndrntwrk.com/control/api/v1/state", { redirect: "manual",
      signal: AbortSignal.timeout(30_000), headers: { cookie: `CF_Authorization=${process.env.ALICE_OWNER_AUTHORIZATION}`,
        origin: "https://alice.rndrntwrk.com", "sec-fetch-site": "same-origin", accept: "application/json", "cache-control": "no-store" } });
    if (!response.ok) fail("OWNER_STATE_INVALID");
    verifyAliceRecordedPause({ state: await response.json(), evidence: pauseEvidence, pauseId: selection.ownerPauseId });
  };
  await checkPause();
  const [workers, application, continuity, traffic] = await Promise.all([
    captureAliceCloudflareWorkerRollbackState({ apiToken, includeCodingSandbox: true }), fetchAliceContainerApplicationRollbackState({ apiToken }),
    fetchAliceCloudflareContinuityState({ apiToken, expectedDurableObjectNamespaceIds: namespaces }),
    fetchAliceCloudflareTrafficState({ apiToken }),
  ]);
  if (!equal(traffic, anchor.previous.trafficState)) fail("TRAFFIC_DRIFTED");
  if (!equal(candidate.provider.continuityConfig, continuity.sanitized)) fail("CONTINUITY_DRIFTED");
  const target = buildAliceCandidateContainerApplicationTarget({ previous: anchor.previous.containerApplication, materializedWranglerConfig: release.configs.runtimeHost });
  if (target.configuration.image !== admission.runtimeImage) fail("IMAGE_BINDING_INVALID");
  const api = async (pathname: string) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, { redirect: "error", signal: AbortSignal.timeout(30_000),
      method: "GET", headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" } });
    const value = await response.json();
    if (!response.ok || value.success !== true) fail("PROVIDER_REQUEST_FAILED");
    return value.result;
  };
  // Account access, AI Gateway and Vectorize controls are unchanged by version selection.
  // Their original qualification stays in live-readback.json; this retry verifies the
  // Worker, Container, traffic and queue state with the same scope as independent recovery.
  const candidateResources: Record<string, any> = {};
  for (const role of [...roles, codingRole]) {
    const worker = candidate.workers[role];
    const version = await api(`/accounts/${account}/workers/scripts/${worker.worker}/versions/${worker.versionId}`);
    if (version.id !== worker.versionId || !version.resources?.bindings?.some((b: any) =>
      b.name === "ALICE_DEPLOYMENT_MANIFEST_SHA256" && b.text === release.deploymentManifestSha256)) fail("VERSION_BINDING_INVALID");
    if (version.resources?.script?.etag !== worker.scriptEtag) fail("VERSION_BINDING_INVALID");
    candidateResources[role] = normalizeAliceCloudflareVersionResources(version.resources);
  }
  const [codingWorkflow, codingContainer] = await Promise.all([
    fetchAliceCodingWorkflowPrestate({ apiToken }),
    fetchAliceCodingContainerState({ apiToken, config: release.configs[codingRole], namespaceIds: [{
      className: "AliceCodingSandbox", name: "ALICE_CODING_SANDBOX",
      namespaceId: candidate.codingContainer?.namespaceId, scriptName: null,
    }] }),
  ]);
  verifyAliceRetainedV4Candidate({ workers, application, continuity: continuity.sanitized,
    traffic, codingWorkflow, codingContainer, anchor, candidate, target, candidateResources, owner: codingOwner });
  await checkPause();
  if (verifyOnly) {
    console.log("ALICE_REACCEPT_READ_ONLY_PREFLIGHT_VERIFIED");
    return;
  }
  write(path.join(releaseRoot, "reaccept-live-readback.json"), {
    schemaVersion: "alice.reaccept-component-readback.v1", observedAt: new Date().toISOString(),
    originalRunId: selection.runId, deploymentManifestSha256: release.deploymentManifestSha256,
    originalFullReadbackSha256: digest(fs.readFileSync(path.join(releaseRoot, "live-readback.json"))),
    workers, containerApplication: application, traffic, continuityConfig: continuity.sanitized,
    codingWorkflow, codingContainer, codingWorkflowOwnedIdentity: codingOwner.ownedIdentity,
  });
  console.log(JSON.stringify({ code: "ALICE_REACCEPT_EXISTING_VERSIONS_VERIFIED", originalRunId: selection.runId,
    selectedExistingWorkers: 0, runtimeImage: admission.runtimeImage }));
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
