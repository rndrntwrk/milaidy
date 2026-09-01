import assert from "node:assert/strict";
import test from "node:test";

import {
  AliceContainerApplicationProbeError,
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
const IMAGE =
  `registry.cloudflare.com/${ACCOUNT_ID}/alice-runtime@sha256:${"1".repeat(64)}`;
const SOURCE = "a".repeat(40);

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
    applicationVersions: [
      {
        id: "1",
        version: 1,
        percentage: 100,
        configuration: structuredClone(configuration),
      },
    ],
    applicationInstances: [],
  };
}

function response(result, { status = 200, success = true, errors = [] } = {}) {
  return new Response(JSON.stringify({ success, result, errors }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providerFixture(snapshot, mutate = () => undefined) {
  let capture = 0;
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: init.body });
    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    if (pathname.endsWith("/applications")) {
      assert.equal(parsed.searchParams.get("name"), "alice-production-runtime");
      return response([{ id: APPLICATION_ID, name: "alice-production-runtime" }]);
    }
    if (pathname.endsWith(`/applications/${APPLICATION_ID}`)) {
      capture += 1;
      const value = structuredClone(snapshot.application);
      mutate({ capture, endpoint: "application", value });
      return response(value);
    }
    if (pathname.endsWith(`/applications/${APPLICATION_ID}/versions`)) {
      const value = structuredClone(snapshot.applicationVersions);
      mutate({ capture, endpoint: "versions", value });
      return response(value);
    }
    if (pathname.endsWith(`/applications/${APPLICATION_ID}/instances`)) {
      const value = { instances: structuredClone(snapshot.applicationInstances) };
      mutate({ capture, endpoint: "instances", value });
      return response(value);
    }
    throw new Error(`unexpected URL ${url}`);
  };
  return { calls, fetchImpl };
}

function genericReleaseFailure(snapshot) {
  assert.throws(
    () => normalizeAliceContainerApplicationRollbackState(snapshot),
    /ALICE_CONTAINER_APPLICATION_INVALID/,
  );
}

test("valid snapshot is accepted identically by probe and release normalizer", () => {
  const snapshot = validSnapshot();
  const expected = normalizeAliceContainerApplicationRollbackState(snapshot);
  const diagnosis = diagnoseAliceContainerApplicationRollbackState(snapshot);
  assert.equal(diagnosis.predicateId, "OK");
  assert.equal(diagnosis.expectedDigest, diagnosis.observedDigest);
  assert.equal(diagnosis.applicationId, expected.applicationId);
});

for (const [name, expectedPredicate, mutate] of [
  [
    "failed health",
    "APPLICATION_HEALTH_FAILED_INVALID",
    (snapshot) => { snapshot.application.health.instances.failed = 1; },
  ],
  [
    "application max instances",
    "APPLICATION_MAX_INSTANCES_INVALID",
    (snapshot) => { snapshot.application.max_instances = 2; },
  ],
  [
    "active version cardinality",
    "APPLICATION_ACTIVE_VERSION_CARDINALITY_INVALID",
    (snapshot) => { snapshot.applicationVersions[0].percentage = 0; },
  ],
  [
    "active version mismatch",
    "APPLICATION_ACTIVE_VERSION_MISMATCH",
    (snapshot) => { snapshot.applicationVersions[0].version = 2; },
  ],
  [
    "application logging",
    "APPLICATION_LOGGING_INVALID",
    (snapshot) => {
      snapshot.application.configuration.observability.logs.enabled = false;
    },
  ],
  [
    "active version logging",
    "ACTIVE_VERSION_LOGGING_INVALID",
    (snapshot) => {
      snapshot.applicationVersions[0].configuration.observability.logs.enabled = false;
    },
  ],
  [
    "configuration drift",
    "APPLICATION_CONFIGURATION_MISMATCH",
    (snapshot) => {
      snapshot.applicationVersions[0].configuration.image =
        `registry.cloudflare.com/${ACCOUNT_ID}/alice-runtime@sha256:${"2".repeat(64)}`;
    },
  ],
]) {
  test(`probe exposes exact predicate for ${name}`, () => {
    const snapshot = validSnapshot();
    mutate(snapshot);
    genericReleaseFailure(snapshot);
    const diagnosis = diagnoseAliceContainerApplicationRollbackState(snapshot);
    assert.equal(diagnosis.predicateId, expectedPredicate);
    assert.match(diagnosis.expectedDigest, /^sha256:[a-f0-9]{64}$/);
    assert.match(diagnosis.observedDigest, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(diagnosis.expectedDigest, diagnosis.observedDigest);
    assert.equal(diagnosis.mutations, 0);
  });
}

test("capture performs two complete GET-only reads and returns an exact verified report", async () => {
  const fixture = providerFixture(validSnapshot());
  const timestamps = [
    "2026-09-01T00:00:00.000Z",
    "2026-09-01T00:00:00.250Z",
  ];
  const probe = await captureAliceContainerApplicationProbe({
    fetchImpl: fixture.fetchImpl,
    apiToken: "x".repeat(32),
    sourceCommit: SOURCE,
    now: () => timestamps.shift(),
    sleep: async () => undefined,
  });
  assert.equal(probe.predicateId, "OK");
  assert.equal(probe.captureCount, 2);
  assert.equal(probe.mutations, 0);
  assert.equal(fixture.calls.length, 8);
  assert.equal(fixture.calls.every((call) => call.method === "GET"), true);
  assert.equal(verifyAliceContainerApplicationProbe(probe), probe);
  assert.equal(JSON.stringify(probe).includes(IMAGE), false);
  assert.equal(JSON.stringify(probe).includes(NAMESPACE_ID), false);
});

test("capture reports semantic drift between the two provider reads", async () => {
  const fixture = providerFixture(validSnapshot(), ({ capture, endpoint, value }) => {
    if (capture === 2 && endpoint === "application") value.version = 2;
    if (capture === 2 && endpoint === "versions") value[0].version = 2;
  });
  const timestamps = [
    "2026-09-01T00:00:00.000Z",
    "2026-09-01T00:00:00.250Z",
  ];
  const probe = await captureAliceContainerApplicationProbe({
    fetchImpl: fixture.fetchImpl,
    apiToken: "x".repeat(32),
    sourceCommit: SOURCE,
    now: () => timestamps.shift(),
    sleep: async () => undefined,
  });
  assert.equal(probe.predicateId, "CAPTURE_DRIFT");
  assert.equal(probe.mutations, 0);
  assert.equal(verifyAliceContainerApplicationProbe(probe), probe);
});

test("provider HTTP failure is reduced to an allowlisted sanitized predicate", async () => {
  const timestamps = [
    "2026-09-01T00:00:00.000Z",
    "2026-09-01T00:00:00.250Z",
  ];
  const probe = await captureAliceContainerApplicationProbe({
    fetchImpl: async () => response(null, {
      status: 403,
      success: false,
      errors: [{ code: 10000, message: "do not persist this body" }],
    }),
    apiToken: "x".repeat(32),
    sourceCommit: SOURCE,
    now: () => timestamps.shift(),
    sleep: async () => undefined,
  });
  assert.equal(probe.predicateId, "PROVIDER_HTTP_INVALID");
  assert.equal(probe.providerHttpStatus, 403);
  assert.equal(probe.providerCode, 10000);
  assert.equal(JSON.stringify(probe).includes("do not persist this body"), false);
});

test("provider transport failure remains inside the allowlisted probe contract", async () => {
  const timestamps = [
    "2026-09-01T00:00:00.000Z",
    "2026-09-01T00:00:00.250Z",
  ];
  const probe = await captureAliceContainerApplicationProbe({
    fetchImpl: async () => {
      throw new Error("private transport detail");
    },
    apiToken: "x".repeat(32),
    sourceCommit: SOURCE,
    now: () => timestamps.shift(),
    sleep: async () => undefined,
  });
  assert.equal(probe.predicateId, "PROVIDER_TRANSPORT_INVALID");
  assert.equal(probe.providerHttpStatus, 0);
  assert.equal(probe.providerCode, null);
  assert.equal(JSON.stringify(probe).includes("private transport detail"), false);
});

test("probe verifier rejects report mutation", async () => {
  const fixture = providerFixture(validSnapshot());
  const timestamps = [
    "2026-09-01T00:00:00.000Z",
    "2026-09-01T00:00:00.250Z",
  ];
  const probe = await captureAliceContainerApplicationProbe({
    fetchImpl: fixture.fetchImpl,
    apiToken: "x".repeat(32),
    sourceCommit: SOURCE,
    now: () => timestamps.shift(),
    sleep: async () => undefined,
  });
  const changed = structuredClone(probe);
  changed.field = "different";
  assert.throws(
    () => verifyAliceContainerApplicationProbe(changed),
    (error) => {
      assert.ok(error instanceof AliceContainerApplicationProbeError);
      assert.equal(error.predicateId, "PROBE_DIGEST_MISMATCH");
      return true;
    },
  );
});
