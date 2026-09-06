import { expect, test } from "bun:test";
import { parseAliceReacceptSelection, planAliceQualifiedRestoration } from "./alice_reaccept_qualified_candidate";

const roles = ["control", "statePlane", "aiGateway", "connectorPlane", "runtimeHost", "access"];
function fixture() {
  const workers = Object.fromEntries(roles.map(role => [role, {
    worker: role, serving: { versionId: `prior-${role}`, deploymentId: `deployment-${role}` },
    scriptSettings: { logpush: false }, versionResources: { bindings: [] },
  }]));
  const application = { applicationId: "same-application", applicationVersion: 39, target: { configuration: { image: "prior-image" } } };
  return {
    workers, application, anchor: { previous: { workers: structuredClone(workers), containerApplication: { ...structuredClone(application), applicationVersion: 35 } } },
    candidate: { workers: Object.fromEntries(roles.map(role => [role, { versionId: `candidate-${role}` }])) },
    target: { configuration: { image: "qualified-image" } },
  };
}

test("selects recorded versions after recovery and performs no selection for a retained candidate", () => {
  const data = fixture();
  expect(planAliceQualifiedRestoration(data)).toEqual(roles);
  for (const role of roles) data.workers[role].serving.versionId = data.candidate.workers[role].versionId;
  data.application.target = data.target;
  expect(planAliceQualifiedRestoration(data)).toEqual([]);
});

test("rejects mixed versions, changed settings and a different image before restoration", () => {
  const mixed = fixture(); mixed.workers.control.serving.versionId = "unrecorded-version";
  expect(() => planAliceQualifiedRestoration(mixed)).toThrow("WORKER_STATE_DRIFTED");
  const changed = fixture(); changed.workers.control.scriptSettings.logpush = true;
  expect(() => planAliceQualifiedRestoration(changed)).toThrow("WORKER_SETTINGS_DRIFTED");
  const otherImage = fixture(); otherImage.application.target.configuration.image = "unrecorded-image";
  expect(() => planAliceQualifiedRestoration(otherImage)).toThrow("CONTAINER_STATE_DRIFTED");
});

test("requires an exact artifact and owner pause selection", () => {
  const value = { runId: "34031795256", artifactDigest: `sha256:${"a".repeat(64)}`,
    anchorDigest: `sha256:${"b".repeat(64)}`, ownerPauseId: "pause-exact-failed-acceptance" };
  expect(parseAliceReacceptSelection(JSON.stringify(value))).toEqual(value);
  expect(() => parseAliceReacceptSelection(JSON.stringify({ ...value, ownerPauseId: "" }))).toThrow("SELECTION_INVALID");
});
