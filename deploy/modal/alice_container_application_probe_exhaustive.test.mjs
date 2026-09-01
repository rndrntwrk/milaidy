import assert from "node:assert/strict";
import test from "node:test";

import {
  captureAliceContainerApplicationProbe,
  diagnoseAliceContainerApplicationRollbackState,
  verifyAliceContainerApplicationProbe,
} from "./alice_container_application_probe.mjs";
import {
  normalizeAliceContainerApplicationRollbackState,
} from "./alice_cloudflare_release.mjs";

const ACCOUNT_ID = "036df6c823669b8fa2f66cf4c16eeb29";
const APPLICATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NAMESPACE_ID = "5".repeat(32);
const SOURCE = "a".repeat(40);
const IMAGE =
  `registry.cloudflare.com/${ACCOUNT_ID}/alice-runtime@sha256:${"1".repeat(64)}`;
const OTHER_IMAGE =
  `registry.cloudflare.com/${ACCOUNT_ID}/alice-runtime@sha256:${"2".repeat(64)}`;

function validSnapshot() {
  const configuration = {
    image: IMAGE,
    vcpu: 0.5,
    memory_mib: 4096,
    disk: { size_mb: 8000 },
    observability: { logs: { enabled: true } },
  };
  return {
    application: {
      id: APPLICATION_ID,
      account_id: ACCOUNT_ID,
      name: "alice-production-runtime",
      version: 1,
      scheduling_policy: "default",
      max_instances: 1,
      rollout_active_grace_period: 0,
      active_rollout_id: null,
      durable_objects: { namespace_id: NAMESPACE_ID },
      health: { instances: { failed: 0 }, errors: [] },
      configuration,
    },
    applicationVersions: [{
      id: "1",
      version: 1,
      percentage: 100,
      configuration: structuredClone(configuration),
    }],
    applicationInstances: [],
  };
}

function assertGenericReleaseFailure(snapshot) {
  assert.throws(
    () => normalizeAliceContainerApplicationRollbackState(snapshot),
    /ALICE_CONTAINER_APPLICATION_INVALID/,
  );
}

const semanticCases = [
  ["missing application", "APPLICATION_MISSING", (s) => { s.application = null; }],
  ["versions not array", "APPLICATION_VERSIONS_NOT_ARRAY", (s) => { s.applicationVersions = null; }],
  ["instances not array", "APPLICATION_INSTANCES_NOT_ARRAY", (s) => { s.applicationInstances = null; }],
  ["too many instances", "APPLICATION_INSTANCE_CARDINALITY_INVALID", (s) => {
    s.applicationInstances = [{ id: "one" }, { id: "two" }];
  }],
  ["invalid instance shape", "APPLICATION_INSTANCE_SHAPE_INVALID", (s) => {
    s.applicationInstances = [null];
  }],
  ["invalid application id", "APPLICATION_ID_INVALID", (s) => { s.application.id = "invalid"; }],
  ["wrong account", "APPLICATION_ACCOUNT_ID_MISMATCH", (s) => { s.application.account_id = "other"; }],
  ["wrong name", "APPLICATION_NAME_MISMATCH", (s) => { s.application.name = "other"; }],
  ["invalid application version", "APPLICATION_VERSION_INVALID", (s) => { s.application.version = 0; }],
  ["wrong scheduling policy", "APPLICATION_SCHEDULING_POLICY_INVALID", (s) => {
    s.application.scheduling_policy = "other";
  }],
  ["wrong max instances", "APPLICATION_MAX_INSTANCES_INVALID", (s) => { s.application.max_instances = 2; }],
  ["wrong rollout grace", "APPLICATION_ROLLOUT_GRACE_INVALID", (s) => {
    s.application.rollout_active_grace_period = 1;
  }],
  ["invalid namespace", "APPLICATION_NAMESPACE_ID_INVALID", (s) => {
    s.application.durable_objects.namespace_id = "invalid";
  }],
  ["missing health instances", "APPLICATION_HEALTH_INSTANCES_MISSING", (s) => {
    s.application.health = {};
  }],
  ["failed health", "APPLICATION_HEALTH_FAILED_INVALID", (s) => {
    s.application.health.instances.failed = 1;
  }],
  ["active rollout", "APPLICATION_ACTIVE_ROLLOUT_INVALID", (s) => {
    s.application.active_rollout_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  }],
  ["invalid version number", "APPLICATION_VERSION_NUMBER_INVALID", (s) => {
    s.applicationVersions[0].version = 0;
  }],
  ["invalid percentage", "APPLICATION_VERSION_PERCENTAGE_INVALID", (s) => {
    s.applicationVersions[0].percentage = 50;
  }],
  ["no active version", "APPLICATION_ACTIVE_VERSION_CARDINALITY_INVALID", (s) => {
    s.applicationVersions[0].percentage = 0;
  }],
  ["multiple active versions", "APPLICATION_ACTIVE_VERSION_CARDINALITY_INVALID", (s) => {
    s.applicationVersions.push({
      ...structuredClone(s.applicationVersions[0]),
      id: "2",
      version: 2,
    });
  }],
  ["active version mismatch", "APPLICATION_ACTIVE_VERSION_MISMATCH", (s) => {
    s.applicationVersions[0].version = 2;
  }],
  ["application configuration missing", "APPLICATION_CONFIGURATION_INVALID", (s) => {
    delete s.application.configuration;
  }],
  ["application image invalid", "APPLICATION_IMAGE_INVALID", (s) => {
    s.application.configuration.image = "invalid";
  }],
  ["application resources invalid", "APPLICATION_INSTANCE_RESOURCES_INVALID", (s) => {
    s.application.configuration.vcpu = 1;
  }],
  ["application logging invalid", "APPLICATION_LOGGING_INVALID", (s) => {
    s.application.configuration.observability.logs.enabled = false;
  }],
  ["active configuration missing", "ACTIVE_VERSION_CONFIGURATION_INVALID", (s) => {
    delete s.applicationVersions[0].configuration;
  }],
  ["active image invalid", "ACTIVE_VERSION_IMAGE_INVALID", (s) => {
    s.applicationVersions[0].configuration.image = "invalid";
  }],
  ["active resources invalid", "ACTIVE_VERSION_INSTANCE_RESOURCES_INVALID", (s) => {
    s.applicationVersions[0].configuration.memory_mib = 8192;
  }],
  ["active logging invalid", "ACTIVE_VERSION_LOGGING_INVALID", (s) => {
    s.applicationVersions[0].configuration.observability.logs.enabled = false;
  }],
  ["configuration mismatch", "APPLICATION_CONFIGURATION_MISMATCH", (s) => {
    s.applicationVersions[0].configuration.image = OTHER_IMAGE;
  }],
];

for (const [name, predicate, mutate] of semanticCases) {
  test(`semantic predicate: ${name}`, () => {
    const snapshot = validSnapshot();
    mutate(snapshot);
    assertGenericReleaseFailure(snapshot);
    const diagnosis = diagnoseAliceContainerApplicationRollbackState(snapshot);
    assert.equal(diagnosis.predicateId, predicate);
    assert.equal(diagnosis.mutations, 0);
    assert.match(diagnosis.expectedDigest, /^sha256:[a-f0-9]{64}$/);
    assert.match(diagnosis.observedDigest, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(diagnosis.expectedDigest, diagnosis.observedDigest);
  });
}

test("predicate order matches the production normalizer order", () => {
  const snapshot = validSnapshot();
  snapshot.application.max_instances = 2;
  snapshot.application.health.instances.failed = 1;
  assertGenericReleaseFailure(snapshot);
  assert.equal(
    diagnoseAliceContainerApplicationRollbackState(snapshot).predicateId,
    "APPLICATION_MAX_INSTANCES_INVALID",
  );
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function capture(fetchImpl) {
  const timestamps = [
    "2026-09-01T00:00:00.000Z",
    "2026-09-01T00:00:00.250Z",
  ];
  const result = await captureAliceContainerApplicationProbe({
    fetchImpl,
    apiToken: "x".repeat(32),
    sourceCommit: SOURCE,
    now: () => timestamps.shift(),
    sleep: async () => undefined,
  });
  assert.equal(result.mutations, 0);
  assert.equal(verifyAliceContainerApplicationProbe(result), result);
  return result;
}

const providerCases = [
  [
    "non-Response result",
    "PROVIDER_RESPONSE_INVALID",
    async () => ({ ok: true }),
  ],
  [
    "transport exception",
    "PROVIDER_TRANSPORT_INVALID",
    async () => { throw new Error("private transport body"); },
  ],
  [
    "invalid successful JSON",
    "PROVIDER_JSON_INVALID",
    async () => new Response("{", { status: 200 }),
  ],
  [
    "invalid envelope",
    "PROVIDER_ENVELOPE_INVALID",
    async () => jsonResponse({ success: false, result: [] }),
  ],
  [
    "application list not array",
    "PROVIDER_APPLICATION_LIST_INVALID",
    async () => jsonResponse({ success: true, result: {} }),
  ],
  [
    "application list cardinality",
    "PROVIDER_APPLICATION_CARDINALITY_INVALID",
    async () => jsonResponse({ success: true, result: [] }),
  ],
  [
    "application list name",
    "PROVIDER_APPLICATION_LIST_NAME_INVALID",
    async () => jsonResponse({
      success: true,
      result: [{ id: APPLICATION_ID, name: "wrong" }],
    }),
  ],
  [
    "application list id",
    "PROVIDER_APPLICATION_LIST_ID_INVALID",
    async () => jsonResponse({
      success: true,
      result: [{ id: "wrong", name: "alice-production-runtime" }],
    }),
  ],
];

for (const [name, predicate, fetchImpl] of providerCases) {
  test(`provider predicate: ${name}`, async () => {
    const result = await capture(fetchImpl);
    assert.equal(result.predicateId, predicate);
    assert.equal(JSON.stringify(result).includes("private transport body"), false);
  });
}

test("HTTP with invalid JSON is classified as HTTP rather than JSON", async () => {
  const result = await capture(async () => new Response("not-json", { status: 503 }));
  assert.equal(result.predicateId, "PROVIDER_HTTP_INVALID");
  assert.equal(result.providerHttpStatus, 503);
});
