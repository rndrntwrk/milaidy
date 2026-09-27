import { expect, test } from "bun:test";
import { deriveAliceRetainedV4Owner, parseAliceReacceptSelection,
  verifyAliceRecordedPause, verifyAliceRetainedV4Candidate } from "./alice_reaccept_qualified_candidate";

const roles = ["control", "statePlane", "aiGateway", "connectorPlane", "runtimeHost", "access"];

test("accepts only the original recorded machine pause before owner admission", () => {
  const pause = { pauseId: "pause-recorded-release", pausedBy: "deployment-controller:pause-only",
    binding: { releaseDigest: "prior" }, deploymentManifestSha256: "prior-manifest",
    rollbackBoundary: "container:alice-runtime:v61", pausedAt: 1790328619062, resumedAt: null };
  const evidence = { active: { binding: pause.binding, deploymentManifestSha256: pause.deploymentManifestSha256,
    rollbackBoundary: pause.rollbackBoundary, releaseEpoch: 15 }, result: { pause } };
  const state = { ok: true, authority: { binding: pause.binding,
    deploymentManifestSha256: pause.deploymentManifestSha256, rollbackBoundary: pause.rollbackBoundary,
    activeReleaseEpoch: 15, pausedScopes: ["all"], activePauses: { all: pause } } };
  expect(() => verifyAliceRecordedPause({ state, evidence, pauseId: pause.pauseId })).not.toThrow();
  state.authority.activeReleaseEpoch = 16;
  expect(() => verifyAliceRecordedPause({ state, evidence, pauseId: pause.pauseId })).toThrow("OWNER_STATE_INVALID");
});

test("accepts the exact owner pause left by failed candidate acceptance", () => {
  const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
  const admission = {
    schemaVersion: "alice.program-admission.v2", releaseEpoch: 16, runtimeRevision: 62,
    rollbackBoundary: "container:alice-runtime:v62", programDigest: digest("a"),
    releaseDigest: digest("b"), policyHash: digest("c"),
    deploymentManifestSha256: digest("d"), runtimeBuildManifestSha256: digest("e"),
    capabilityBomSha256: digest("f"), sourceCommit: "a".repeat(40),
    deploymentControllerCommit: "b".repeat(40), elizaCommit: "c".repeat(40),
    runtimeImage: `registry.cloudflare.com/example@${digest("a")}`,
  };
  const binding = { programDigest: admission.programDigest,
    releaseDigest: admission.releaseDigest, policyHash: admission.policyHash };
  const ownerActor = `owner:${digest("a")}`;
  const pause = { pauseId: "pause-failed-acceptance", pausedBy: ownerActor,
    binding, deploymentManifestSha256: admission.deploymentManifestSha256,
    rollbackBoundary: admission.rollbackBoundary, pausedAt: 1790527824566, resumedAt: null };
  const state = { ok: true, authority: { binding,
    deploymentManifestSha256: admission.deploymentManifestSha256,
    activeReleaseEpoch: 16, rollbackBoundary: admission.rollbackBoundary,
    pausedScopes: ["all"], activePauses: { all: pause } } };
  const evidence = { active: { releaseEpoch: 15 },
    result: { pause: { pauseId: "pause-recorded-release" } } };
  const input = { state, evidence, pauseId: pause.pauseId, admission, ownerActor };
  expect(() => verifyAliceRecordedPause(input)).not.toThrow();
  expect(() => verifyAliceRecordedPause({ ...input, ownerActor: "other-owner" })).toThrow("OWNER_STATE_INVALID");
});

test("requires an exact artifact and owner pause selection", () => {
  const value = { runId: "34031795256", artifactDigest: `sha256:${"a".repeat(64)}`,
    anchorDigest: `sha256:${"b".repeat(64)}`, ownerPauseId: "pause-exact-failed-acceptance" };
  expect(parseAliceReacceptSelection(JSON.stringify(value))).toEqual(value);
  expect(() => parseAliceReacceptSelection(JSON.stringify({ ...value, ownerPauseId: "" }))).toThrow("SELECTION_INVALID");
});

function retainedV4Fixture() {
  const workflow = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "alice-production-coding",
    scriptName: "alice-production-control", className: "AliceCodingWorkflow",
    createdOn: "2026-09-27T12:00:00.000Z", modifiedOn: "2026-09-27T12:00:01.000Z",
    scriptDeleted: false,
  };
  const version = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", className: "AliceCodingWorkflow",
    workflowId: workflow.id, createdOn: workflow.createdOn, modifiedOn: workflow.modifiedOn,
    hasDag: true, language: "javascript", defaultRetention: null, limits: { steps: 8 },
  };
  const ownerInput = {
    anchor: { schemaVersion: "alice.cloudflare-rollback-anchor.v8", previous: {
      workers: { codingSandbox: { worker: "alice-coding-sandbox",
        serving: { versionId: "24f4-prior-coding-version" }, scriptSettings: { logpush: false } } },
      codingContainerApplicationAbsent: false, codingWorkflow: { absent: true },
    } },
    rollbackProof: { schemaVersion: "alice.cloudflare-rollback-evidence.v2", codingWorkflow: { absent: true } },
    candidate: { schemaVersion: "alice.cloudflare-live-readback.v2", terminalSnapshotStable: true,
      codingWorkflow: workflow, codingWorkflowVersions: [version], codingCandidateWorkflowVersionId: version.id },
    sourceCommit: "c".repeat(40), deploymentManifestSha256: `sha256:${"d".repeat(64)}`,
    rollbackAnchorSha256: `sha256:${"e".repeat(64)}`,
  };
  return ownerInput;
}

test("binds a newly created Workflow when the coding Worker and container already existed", () => {
  const input = retainedV4Fixture();
  const owner = deriveAliceRetainedV4Owner(input);
  expect(owner.ownedIdentity).toEqual({ workflowId: input.candidate.codingWorkflow.id,
    candidateVersionId: input.candidate.codingCandidateWorkflowVersionId });
  expect(owner.rollbackAnchorSha256).toBe(input.rollbackAnchorSha256);
  expect(() => deriveAliceRetainedV4Owner({ ...input, candidate: {
    ...input.candidate, codingCandidateWorkflowVersionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  } })).toThrow("CODING_OWNER_INVALID");
  expect(() => deriveAliceRetainedV4Owner({ ...input, anchor: { ...input.anchor,
    previous: { ...input.anchor.previous, codingWorkflow: { absent: false } },
  } })).toThrow("CODING_OWNER_INVALID");
});

test("v4 accepts only the complete retained provider graph", () => {
  const input = retainedV4Fixture();
  const owner = deriveAliceRetainedV4Owner(input);
  const allRoles = [...roles, "codingSandbox"];
  const workers = Object.fromEntries(allRoles.map(role => [role, {
    worker: role, serving: { versionId: `candidate-${role}` },
    scriptSettings: { logpush: false }, versionResources: { bindings: [role] },
  }]));
  const target = { configuration: { image: "qualified-image" } };
  const application = { applicationId: "runtime", applicationVersion: 2, target };
  const state = {
    workers, application, continuity: { queue: "qualified" }, traffic: { route: "alice" },
    codingWorkflow: { workflow: input.candidate.codingWorkflow,
      versions: input.candidate.codingWorkflowVersions },
    codingContainer: { id: "coding-container", namespaceId: "f".repeat(32), image: "coding-image" },
    anchor: { previous: { trafficState: { route: "alice" },
      containerApplication: { ...application, applicationVersion: 1, target: { configuration: { image: "prior-image" } } },
      workers: Object.fromEntries(allRoles.map(role => [role, { scriptSettings: { logpush: false } }])),
    } },
    candidate: { workers: Object.fromEntries(allRoles.map(role => [role, {
      worker: role, versionId: `candidate-${role}` }])),
      provider: { continuityConfig: { queue: "qualified" } },
      codingWorkflow: input.candidate.codingWorkflow,
      codingWorkflowVersions: input.candidate.codingWorkflowVersions,
      codingContainer: { id: "coding-container", namespaceId: "f".repeat(32), image: "coding-image" },
    },
    target, candidateResources: Object.fromEntries(allRoles.map(role => [role, { bindings: [role] }])), owner,
  };
  expect(() => verifyAliceRetainedV4Candidate(state)).not.toThrow();
  workers.codingSandbox.serving.versionId = "other-version";
  expect(() => verifyAliceRetainedV4Candidate(state)).toThrow("RETAINED_STATE_INVALID");
  workers.codingSandbox.serving.versionId = "candidate-codingSandbox";
  workers.codingSandbox.scriptSettings.logpush = true;
  expect(() => verifyAliceRetainedV4Candidate(state)).toThrow("RETAINED_STATE_INVALID");
  workers.codingSandbox.scriptSettings.logpush = false;
  state.codingWorkflow.versions = [];
  expect(() => verifyAliceRetainedV4Candidate(state)).toThrow("RETAINED_STATE_INVALID");
});
