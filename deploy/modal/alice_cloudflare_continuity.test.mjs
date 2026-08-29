import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAliceCandidateCloudflareContinuityReadback,
  buildAliceCloudflareContinuityConfig,
  aliceCloudflareContinuitySentinelBytes,
  digestAliceCloudflareContinuityConfig,
  verifyAliceCloudflareContinuityConfig,
} from "./alice_cloudflare_continuity.mjs";

const sentinelBytes = aliceCloudflareContinuitySentinelBytes();
const sentinelSha256 = `sha256:${(await import("node:crypto")).default
  .createHash("sha256")
  .update(sentinelBytes)
  .digest("hex")}`;

const readback = {
  accountId: "036df6c823669b8fa2f66cf4c16eeb29",
  queue: {
    queue_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    queue_name: "alice-production-evidence-v1",
    created_on: "2026-08-22T12:00:00.000Z",
    modified_on: "2026-08-22T12:00:00.000Z",
    producers: [{ script: "alice-production-control", type: "worker" }],
    producers_total_count: 1,
    settings: {
      delivery_delay: 0,
      delivery_paused: false,
      message_retention_period: 86400,
    },
  },
  deadLetterQueue: {
    queue_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    queue_name: "alice-production-evidence-dlq-v1",
    created_on: "2026-08-22T12:00:00.000Z",
    modified_on: "2026-08-22T12:00:00.000Z",
    producers: [],
    producers_total_count: 0,
    settings: {
      delivery_delay: 0,
      delivery_paused: false,
      message_retention_period: 86400,
    },
  },
  queueConsumers: [{
    consumer_id: "cccccccccccccccccccccccccccccccc",
    created_on: "2026-08-22T12:00:00.000Z",
    queue_name: "alice-production-evidence-v1",
    script_name: "alice-production-control",
    dead_letter_queue: "alice-production-evidence-dlq-v1",
    type: "worker",
    settings: {
      batch_size: 10,
      max_concurrency: 1,
      max_retries: 3,
      max_wait_time_ms: 5000,
      retry_delay: 10,
    },
  }],
  deadLetterQueueConsumers: [],
  eventSubscriptions: [],
  workflow: {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    name: "alice-production-plans",
    script_name: "alice-production-control",
    class_name: "AlicePlanWorkflow",
    created_on: "2026-08-22T12:00:00.000Z",
  },
  bucket: {
    name: "alice-production-evidence",
    creation_date: "2026-08-22T12:00:00.000Z",
    jurisdiction: "default",
    location: "enam",
    storage_class: "Standard",
  },
  sentinel: {
    key: "continuity/alice-production-core-v1",
    etag: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    size: Buffer.byteLength(sentinelBytes),
    uploaded: "2026-08-22T12:00:00.000Z",
    storage_class: "Standard",
    content_type: "application/json",
    cache_control: "no-store",
    content_sha256: sentinelSha256,
  },
  durableObjectNamespaceIds: {
    access: [
      {
        className: "AliceRuntimeContainer",
        name: "ALICE_RUNTIME_CONTAINER",
        namespaceId: "55555555555555555555555555555555",
        scriptName: "alice-runtime-container-host",
      },
    ],
    aiGateway: [],
    control: [
      {
        className: "AliceAuthority",
        name: "ALICE_AUTHORITY",
        namespaceId: "11111111111111111111111111111111",
        scriptName: null,
      },
      {
        className: "AliceSession",
        name: "ALICE_SESSIONS",
        namespaceId: "22222222222222222222222222222222",
        scriptName: null,
      },
    ],
    statePlane: [
      {
        className: "AliceStateCoordination",
        name: "ALICE_COORDINATION",
        namespaceId: "33333333333333333333333333333333",
        scriptName: null,
      },
    ],
    connectorPlane: [
      {
        className: "AliceConnectorOutboundCoordination",
        name: "ALICE_CONNECTOR_OUTBOUND",
        namespaceId: "44444444444444444444444444444444",
        scriptName: null,
      },
    ],
    runtimeHost: [
      {
        className: "AliceRuntimeContainer",
        name: "ALICE_RUNTIME_CONTAINER",
        namespaceId: "55555555555555555555555555555555",
        scriptName: null,
      },
    ],
  },
};

test("normalizes one exact provider continuity identity bundle", () => {
  const config = buildAliceCloudflareContinuityConfig(readback);
  assert.equal(config.schemaVersion, "alice.cloudflare-continuity-config.v2");
  assert.equal(config.evidenceQueue.id, readback.queue.queue_id);
  assert.equal(config.evidenceDeadLetterQueue.id, readback.deadLetterQueue.queue_id);
  assert.equal(config.evidenceQueueConsumer.id, readback.queueConsumers[0].consumer_id);
  assert.equal(config.workflow.id, readback.workflow.id);
  assert.equal(config.evidenceSentinel.contentSha256, sentinelSha256);
  assert.deepEqual(config.durableObjectNamespaceIds.statePlane, [
    {
      className: "AliceStateCoordination",
      name: "ALICE_COORDINATION",
      namespaceId: "33333333333333333333333333333333",
      scriptName: null,
    },
  ]);
  assert.deepEqual(config.durableObjectNamespaceIds.connectorPlane, [
    {
      className: "AliceConnectorOutboundCoordination",
      name: "ALICE_CONNECTOR_OUTBOUND",
      namespaceId: "44444444444444444444444444444444",
      scriptName: null,
    },
  ]);
  assert.deepEqual(config.durableObjectNamespaceIds.runtimeHost, [
    {
      className: "AliceRuntimeContainer",
      name: "ALICE_RUNTIME_CONTAINER",
      namespaceId: "55555555555555555555555555555555",
      scriptName: null,
    },
  ]);
  assert.deepEqual(verifyAliceCloudflareContinuityConfig(config), config);
  assert.match(digestAliceCloudflareContinuityConfig(config), /^sha256:[a-f0-9]{64}$/);
});

test("admits only the exact external Access reference to the runtimeHost-owned namespace", () => {
  const build = (durableObjectNamespaceIds) =>
    buildAliceCloudflareContinuityConfig({
      ...readback,
      durableObjectNamespaceIds,
    });
  assert.doesNotThrow(() => build(readback.durableObjectNamespaceIds));

  const substitutions = [
    {
      ...readback.durableObjectNamespaceIds,
      access: [{
        ...readback.durableObjectNamespaceIds.access[0],
        scriptName: null,
      }],
    },
    {
      ...readback.durableObjectNamespaceIds,
      access: [{
        ...readback.durableObjectNamespaceIds.access[0],
        scriptName: "other-runtime-host",
      }],
    },
    {
      ...readback.durableObjectNamespaceIds,
      runtimeHost: [{
        ...readback.durableObjectNamespaceIds.runtimeHost[0],
        scriptName: "alice-runtime-container-host",
      }],
    },
    {
      ...readback.durableObjectNamespaceIds,
      access: [{
        ...readback.durableObjectNamespaceIds.access[0],
        namespaceId: "6".repeat(32),
      }],
    },
    {
      ...readback.durableObjectNamespaceIds,
      statePlane: [{
        ...readback.durableObjectNamespaceIds.statePlane[0],
        namespaceId: "5".repeat(32),
      }],
    },
  ];
  for (const ids of substitutions) {
    assert.throws(
      () => build(ids),
      /ALICE_CLOUDFLARE_CONTINUITY_CONFIG_INVALID/,
    );
  }
});

test("case-folds Cloudflare's canonical uppercase ENAM bucket location", () => {
  const config = buildAliceCloudflareContinuityConfig({
    ...readback,
    bucket: { ...readback.bucket, location: "ENAM" },
  });
  assert.equal(config.evidenceBucket.location, "enam");
});

test("normalizes Cloudflare's Queue consumer script field without ambiguity", () => {
  const { script_name: scriptName, ...providerConsumer } =
    readback.queueConsumers[0];
  const config = buildAliceCloudflareContinuityConfig({
    ...readback,
    queueConsumers: [{ ...providerConsumer, script: scriptName }],
  });
  assert.equal(config.evidenceQueueConsumer.scriptName, scriptName);
  for (const consumer of [
    { ...providerConsumer, script: "other" },
    { ...providerConsumer },
    { ...providerConsumer, script: scriptName, script_name: scriptName },
  ]) {
    assert.throws(() =>
      buildAliceCloudflareContinuityConfig({
        ...readback,
        queueConsumers: [consumer],
      }),
    );
  }
});

test("fails closed on every substituted continuity boundary", () => {
  const substitutions = [
    { ...readback, accountId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    { ...readback, queue: { ...readback.queue, queue_id: readback.deadLetterQueue.queue_id } },
    { ...readback, deadLetterQueueConsumers: [{}] },
    { ...readback, queueConsumers: [{ ...readback.queueConsumers[0], script_name: "other" }] },
    {
      ...readback,
      queue: {
        ...readback.queue,
        producers: [
          ...readback.queue.producers,
          { script: "unadmitted-producer", type: "worker" },
        ],
        producers_total_count: 2,
      },
    },
    {
      ...readback,
      eventSubscriptions: [{
        id: "ffffffffffffffffffffffffffffffff",
        destination: {
          queue_id: readback.queue.queue_id,
          type: "queues.queue",
        },
      }],
    },
    { ...readback, workflow: { ...readback.workflow, id: "other" } },
    { ...readback, bucket: { ...readback.bucket, location: "other" } },
    { ...readback, bucket: { ...readback.bucket, location: " ENAM " } },
    { ...readback, bucket: { ...readback.bucket, location: 123 } },
    { ...readback, bucket: { ...readback.bucket, name: "other" } },
    { ...readback, bucket: { ...readback.bucket, storage_class: "Other" } },
    { ...readback, sentinel: { ...readback.sentinel, key: "other" } },
    { ...readback, sentinel: { ...readback.sentinel, content_sha256: `sha256:${"0".repeat(64)}` } },
    {
      ...readback,
      durableObjectNamespaceIds: {
        ...readback.durableObjectNamespaceIds,
        control: [{
          ...readback.durableObjectNamespaceIds.control[0],
          namespaceId: "3".repeat(32),
        }],
      },
    },
  ];
  for (const [index, substitution] of substitutions.entries()) {
    assert.throws(
      () => buildAliceCloudflareContinuityConfig(substitution),
      /ALICE_CLOUDFLARE_CONTINUITY_CONFIG_INVALID/,
      `substitution ${index} must fail closed`,
    );
  }
});

test("rejects extension fields and invalid timestamps while normalizing valid ISO input", () => {
  assert.throws(() =>
    buildAliceCloudflareContinuityConfig({ ...readback, unexpected: true }),
  );
  assert.equal(
    buildAliceCloudflareContinuityConfig({
      ...readback,
      queue: { ...readback.queue, created_on: "2026-08-22T12:00:00Z" },
    }).evidenceQueue.createdAt,
    "2026-08-22T12:00:00.000Z",
  );
  assert.throws(() =>
    buildAliceCloudflareContinuityConfig({
      ...readback,
      queue: { ...readback.queue, created_on: "not-a-time" },
    }),
  );
});

test("binds the candidate queue posture without provider timestamp circularity", () => {
  const paused = {
    ...readback,
    queue: {
      ...readback.queue,
      settings: { ...readback.queue.settings, delivery_paused: true },
      modified_on: "2026-08-22T10:00:00.000Z",
    },
    deadLetterQueue: {
      ...readback.deadLetterQueue,
      settings: {
        ...readback.deadLetterQueue.settings,
        delivery_paused: true,
      },
      modified_on: "2026-08-22T10:00:00.000Z",
    },
  };
  const candidate = buildAliceCandidateCloudflareContinuityReadback(paused);
  assert.equal(candidate.queue.settings.delivery_paused, false);
  assert.equal(candidate.deadLetterQueue.settings.delivery_paused, true);

  const providerAfterResume = {
    ...candidate,
    queue: {
      ...candidate.queue,
      modified_on: "2026-08-22T10:01:00.000Z",
    },
  };
  assert.deepEqual(
    buildAliceCloudflareContinuityConfig(candidate),
    buildAliceCloudflareContinuityConfig(providerAfterResume),
  );
  assert.equal(
    digestAliceCloudflareContinuityConfig(
      buildAliceCloudflareContinuityConfig(candidate),
    ),
    digestAliceCloudflareContinuityConfig(
      buildAliceCloudflareContinuityConfig(providerAfterResume),
    ),
  );
});
