import crypto from "node:crypto";

import {
  ALICE_CLOUDFLARE_TARGET,
  canonicalAliceJson,
} from "../../workers/alice-effective-config.js";

const RESOURCE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const NAMESPACE_ID = /^[a-f0-9]{32}$/;
const ETAG = /^[A-Za-z0-9_-]{16,128}$/;
const SENTINEL_KEY = "continuity/alice-production-core-v1";
const ROLES = [
  "access",
  "control",
  "aiGateway",
  "statePlane",
  "connectorPlane",
];
const EXPECTED_DURABLE_OBJECT_BINDINGS = Object.freeze({
  access: Object.freeze([
    Object.freeze({
      className: "AliceRuntimeContainer",
      name: "ALICE_RUNTIME_CONTAINER",
    }),
  ]),
  control: Object.freeze([
    Object.freeze({ className: "AliceAuthority", name: "ALICE_AUTHORITY" }),
    Object.freeze({ className: "AliceSession", name: "ALICE_SESSIONS" }),
  ]),
  aiGateway: Object.freeze([]),
  statePlane: Object.freeze([
    Object.freeze({
      className: "AliceStateCoordination",
      name: "ALICE_COORDINATION",
    }),
  ]),
  connectorPlane: Object.freeze([
    Object.freeze({
      className: "AliceConnectorOutboundCoordination",
      name: "ALICE_CONNECTOR_OUTBOUND",
    }),
  ]),
});

export function aliceCloudflareContinuitySentinelBytes() {
  return `${canonicalAliceJson({
    accountId: ALICE_CLOUDFLARE_TARGET.accountId,
    bucket: ALICE_CLOUDFLARE_TARGET.evidenceBucket,
    key: SENTINEL_KEY,
    schemaVersion: "alice.r2-continuity-sentinel.v1",
  })}\n`;
}

const SENTINEL_BYTES = aliceCloudflareContinuitySentinelBytes();
const SENTINEL_SHA256 = `sha256:${crypto
  .createHash("sha256")
  .update(SENTINEL_BYTES)
  .digest("hex")}`;

function invalid() {
  throw new Error("ALICE_CLOUDFLARE_CONTINUITY_CONFIG_INVALID");
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function normalizedTimestamp(value) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

function sorted(values) {
  return [...values].sort((left, right) =>
    canonicalAliceJson(left).localeCompare(canonicalAliceJson(right)),
  );
}

function normalizeNamespaceIds(value) {
  if (!exactKeys(value, ROLES)) invalid();
  const result = {};
  for (const role of ROLES) {
    if (!Array.isArray(value[role])) invalid();
    result[role] = sorted(
      value[role].map((binding) => {
        if (
          !exactKeys(binding, ["className", "name", "namespaceId"]) ||
          typeof binding.className !== "string" ||
          binding.className.length === 0 ||
          typeof binding.name !== "string" ||
          !/^ALICE_[A-Z0-9_]+$/.test(binding.name) ||
          !NAMESPACE_ID.test(binding.namespaceId ?? "")
        ) {
          invalid();
        }
        return {
          className: binding.className,
          name: binding.name,
          namespaceId: binding.namespaceId,
        };
      }),
    );
  }
  const namespaceIds = new Set();
  for (const role of ROLES) {
    if (
      canonicalAliceJson(
        result[role].map(({ className, name }) => ({ className, name })),
      ) !== canonicalAliceJson(sorted(EXPECTED_DURABLE_OBJECT_BINDINGS[role]))
    ) {
      invalid();
    }
    for (const binding of result[role]) {
      if (namespaceIds.has(binding.namespaceId)) invalid();
      namespaceIds.add(binding.namespaceId);
    }
  }
  return result;
}

function normalizeQueue(queue, expectedName) {
  const createdAt = normalizedTimestamp(queue?.created_on);
  const modifiedAt = queue?.modified_on === undefined
    ? createdAt
    : normalizedTimestamp(queue.modified_on);
  const expectedProducers = expectedName === ALICE_CLOUDFLARE_TARGET.evidenceQueue
    ? [{ script: ALICE_CLOUDFLARE_TARGET.controlWorker, type: "worker" }]
    : [];
  const producers = Array.isArray(queue?.producers)
    ? sorted(queue.producers.map((producer) => {
        if (
          !exactKeys(producer, ["script", "type"]) ||
          producer.type !== "worker" ||
          typeof producer.script !== "string" ||
          producer.script.length === 0
        ) {
          invalid();
        }
        return { script: producer.script, type: producer.type };
      }))
    : null;
  if (
    !queue ||
    !RESOURCE_ID.test(queue.queue_id ?? "") ||
    queue.queue_name !== expectedName ||
    producers === null ||
    queue.producers_total_count !== producers.length ||
    canonicalAliceJson(producers) !== canonicalAliceJson(expectedProducers) ||
    typeof queue.settings?.delivery_paused !== "boolean" ||
    !Number.isSafeInteger(queue.settings?.delivery_delay) ||
    queue.settings.delivery_delay < 0 ||
    !Number.isSafeInteger(queue.settings?.message_retention_period) ||
    queue.settings.message_retention_period <= 0 ||
    createdAt === null ||
    modifiedAt === null
  ) {
    invalid();
  }
  return {
    id: queue.queue_id,
    name: queue.queue_name,
    createdAt,
    deliveryPaused: queue.settings.delivery_paused,
    producers,
    settings: {
      deliveryDelay: queue.settings.delivery_delay,
      messageRetentionPeriod: queue.settings.message_retention_period,
    },
  };
}

function normalizeAliceQueueEventSubscriptions(eventSubscriptions, queueIds) {
  if (!Array.isArray(eventSubscriptions) || !(queueIds instanceof Set)) invalid();
  const targeted = eventSubscriptions.filter((subscription) => {
    if (
      !subscription ||
      !RESOURCE_ID.test(subscription.id ?? "") ||
      !exactKeys(subscription.destination, ["queue_id", "type"]) ||
      subscription.destination.type !== "queues.queue" ||
      !RESOURCE_ID.test(subscription.destination.queue_id ?? "")
    ) {
      invalid();
    }
    return queueIds.has(subscription.destination.queue_id);
  });
  if (targeted.length !== 0) invalid();
  return [];
}

export function buildAliceCandidateCloudflareContinuityReadback(readback) {
  try {
    buildAliceCloudflareContinuityConfig(readback);
    if (
      readback.queue?.settings?.delivery_paused !== true ||
      readback.deadLetterQueue?.settings?.delivery_paused !== true
    ) {
      invalid();
    }
    const candidate = JSON.parse(JSON.stringify(readback));
    candidate.queue.settings.delivery_paused = false;
    candidate.deadLetterQueue.settings.delivery_paused = true;
    buildAliceCloudflareContinuityConfig(candidate);
    return candidate;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_CLOUDFLARE_CONTINUITY_CONFIG_INVALID"
    ) {
      throw error;
    }
    invalid();
  }
}

function normalizeQueueConsumer(consumer) {
  const createdAt = normalizedTimestamp(consumer?.created_on);
  const hasScript = Object.prototype.hasOwnProperty.call(consumer ?? {}, "script");
  const hasScriptName = Object.prototype.hasOwnProperty.call(
    consumer ?? {},
    "script_name",
  );
  const scriptName = hasScript ? consumer?.script : consumer?.script_name;
  if (
    !consumer ||
    hasScript === hasScriptName ||
    typeof scriptName !== "string" ||
    !RESOURCE_ID.test(consumer.consumer_id ?? "") ||
    consumer.queue_name !== ALICE_CLOUDFLARE_TARGET.evidenceQueue ||
    scriptName !== ALICE_CLOUDFLARE_TARGET.controlWorker ||
    consumer.type !== "worker" ||
    consumer.dead_letter_queue !== ALICE_CLOUDFLARE_TARGET.evidenceDlq ||
    createdAt === null ||
    consumer.settings?.batch_size !== 10 ||
    consumer.settings?.max_concurrency !== 1 ||
    consumer.settings?.max_retries !== 3 ||
    consumer.settings?.max_wait_time_ms !== 5_000 ||
    consumer.settings?.retry_delay !== 10
  ) {
    invalid();
  }
  return {
    id: consumer.consumer_id,
    createdAt,
    queueName: consumer.queue_name,
    scriptName,
    deadLetterQueue: consumer.dead_letter_queue,
    type: consumer.type,
    settings: {
      batchSize: 10,
      maxConcurrency: 1,
      maxRetries: 3,
      maxWaitTimeMs: 5_000,
      retryDelay: 10,
    },
  };
}

function normalizeWorkflow(workflow) {
  const createdAt = normalizedTimestamp(workflow?.created_on);
  if (
    !workflow ||
    !UUID.test(workflow.id ?? "") ||
    workflow.name !== ALICE_CLOUDFLARE_TARGET.planWorkflow ||
    workflow.script_name !== ALICE_CLOUDFLARE_TARGET.controlWorker ||
    workflow.class_name !== "AlicePlanWorkflow" ||
    createdAt === null
  ) {
    invalid();
  }
  return {
    id: workflow.id,
    name: workflow.name,
    scriptName: workflow.script_name,
    className: workflow.class_name,
    createdAt,
  };
}

function normalizeBucket(bucket) {
  const createdAt = normalizedTimestamp(bucket?.creation_date);
  const location = typeof bucket?.location === "string"
    ? bucket.location.toLowerCase()
    : null;
  if (
    !bucket ||
    bucket.name !== ALICE_CLOUDFLARE_TARGET.evidenceBucket ||
    createdAt === null ||
    !["default", "eu", "fedramp"].includes(bucket.jurisdiction) ||
    !["apac", "eeur", "enam", "weur", "wnam", "oc"].includes(location) ||
    !["Standard", "InfrequentAccess"].includes(bucket.storage_class)
  ) {
    invalid();
  }
  return {
    name: bucket.name,
    createdAt,
    jurisdiction: bucket.jurisdiction,
    location,
    storageClass: bucket.storage_class,
  };
}

function normalizeSentinel(sentinel) {
  const uploadedAt = normalizedTimestamp(sentinel?.uploaded);
  if (
    !sentinel ||
    sentinel.key !== SENTINEL_KEY ||
    !ETAG.test(sentinel.etag ?? "") ||
    !Number.isSafeInteger(sentinel.size) ||
    sentinel.size !== Buffer.byteLength(SENTINEL_BYTES) ||
    uploadedAt === null ||
    sentinel.storage_class !== "Standard" ||
    sentinel.content_type !== "application/json" ||
    sentinel.cache_control !== "no-store" ||
    sentinel.content_sha256 !== SENTINEL_SHA256
  ) {
    invalid();
  }
  return {
    key: sentinel.key,
    etag: sentinel.etag,
    size: sentinel.size,
    uploadedAt,
    storageClass: sentinel.storage_class,
    contentType: sentinel.content_type,
    cacheControl: sentinel.cache_control,
    contentSha256: sentinel.content_sha256,
  };
}

export function buildAliceCloudflareContinuityConfig(readback) {
  try {
    if (
      !exactKeys(readback, [
        "accountId",
        "bucket",
        "deadLetterQueue",
        "deadLetterQueueConsumers",
        "durableObjectNamespaceIds",
        "eventSubscriptions",
        "queue",
        "queueConsumers",
        "sentinel",
        "workflow",
      ]) ||
      readback.accountId !== ALICE_CLOUDFLARE_TARGET.accountId ||
      !Array.isArray(readback.queueConsumers) ||
      readback.queueConsumers.length !== 1 ||
      !Array.isArray(readback.deadLetterQueueConsumers) ||
      readback.deadLetterQueueConsumers.length !== 0
    ) {
      invalid();
    }
    const evidenceQueue = normalizeQueue(
      readback.queue,
      ALICE_CLOUDFLARE_TARGET.evidenceQueue,
    );
    const evidenceDeadLetterQueue = normalizeQueue(
      readback.deadLetterQueue,
      ALICE_CLOUDFLARE_TARGET.evidenceDlq,
    );
    const evidenceQueueConsumer = normalizeQueueConsumer(
      readback.queueConsumers[0],
    );
    if (
      new Set([
        evidenceQueue.id,
        evidenceDeadLetterQueue.id,
        evidenceQueueConsumer.id,
      ]).size !== 3
    ) {
      invalid();
    }
    const aliceQueueEventSubscriptions = normalizeAliceQueueEventSubscriptions(
      readback.eventSubscriptions,
      new Set([evidenceQueue.id, evidenceDeadLetterQueue.id]),
    );
    return {
      schemaVersion: "alice.cloudflare-continuity-config.v1",
      accountId: readback.accountId,
      evidenceQueue,
      evidenceDeadLetterQueue,
      evidenceQueueConsumer,
      aliceQueueEventSubscriptions,
      workflow: normalizeWorkflow(readback.workflow),
      evidenceBucket: normalizeBucket(readback.bucket),
      evidenceSentinel: normalizeSentinel(readback.sentinel),
      durableObjectNamespaceIds: normalizeNamespaceIds(
        readback.durableObjectNamespaceIds,
      ),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_CLOUDFLARE_CONTINUITY_CONFIG_INVALID"
    ) {
      throw error;
    }
    invalid();
  }
}

export function verifyAliceCloudflareContinuityConfig(config) {
  if (
    !exactKeys(config, [
      "accountId",
      "aliceQueueEventSubscriptions",
      "durableObjectNamespaceIds",
      "evidenceBucket",
      "evidenceDeadLetterQueue",
      "evidenceQueue",
      "evidenceQueueConsumer",
      "evidenceSentinel",
      "schemaVersion",
      "workflow",
    ]) ||
    config.schemaVersion !== "alice.cloudflare-continuity-config.v1"
  ) {
    invalid();
  }
  const rebuilt = buildAliceCloudflareContinuityConfig({
    accountId: config.accountId,
    queue: {
      queue_id: config.evidenceQueue?.id,
      queue_name: config.evidenceQueue?.name,
      created_on: config.evidenceQueue?.createdAt,
      producers: config.evidenceQueue?.producers,
      producers_total_count: config.evidenceQueue?.producers?.length,
      settings: {
        delivery_paused: config.evidenceQueue?.deliveryPaused,
        delivery_delay: config.evidenceQueue?.settings?.deliveryDelay,
        message_retention_period:
          config.evidenceQueue?.settings?.messageRetentionPeriod,
      },
    },
    deadLetterQueue: {
      queue_id: config.evidenceDeadLetterQueue?.id,
      queue_name: config.evidenceDeadLetterQueue?.name,
      created_on: config.evidenceDeadLetterQueue?.createdAt,
      producers: config.evidenceDeadLetterQueue?.producers,
      producers_total_count:
        config.evidenceDeadLetterQueue?.producers?.length,
      settings: {
        delivery_paused: config.evidenceDeadLetterQueue?.deliveryPaused,
        delivery_delay:
          config.evidenceDeadLetterQueue?.settings?.deliveryDelay,
        message_retention_period:
          config.evidenceDeadLetterQueue?.settings?.messageRetentionPeriod,
      },
    },
    queueConsumers: [{
      consumer_id: config.evidenceQueueConsumer?.id,
      created_on: config.evidenceQueueConsumer?.createdAt,
      queue_name: config.evidenceQueueConsumer?.queueName,
      script_name: config.evidenceQueueConsumer?.scriptName,
      dead_letter_queue: config.evidenceQueueConsumer?.deadLetterQueue,
      type: config.evidenceQueueConsumer?.type,
      settings: {
        batch_size: config.evidenceQueueConsumer?.settings?.batchSize,
        max_concurrency:
          config.evidenceQueueConsumer?.settings?.maxConcurrency,
        max_retries: config.evidenceQueueConsumer?.settings?.maxRetries,
        max_wait_time_ms:
          config.evidenceQueueConsumer?.settings?.maxWaitTimeMs,
        retry_delay: config.evidenceQueueConsumer?.settings?.retryDelay,
      },
    }],
    deadLetterQueueConsumers: [],
    eventSubscriptions: config.aliceQueueEventSubscriptions,
    workflow: {
      id: config.workflow?.id,
      name: config.workflow?.name,
      script_name: config.workflow?.scriptName,
      class_name: config.workflow?.className,
      created_on: config.workflow?.createdAt,
    },
    bucket: {
      name: config.evidenceBucket?.name,
      creation_date: config.evidenceBucket?.createdAt,
      jurisdiction: config.evidenceBucket?.jurisdiction,
      location: config.evidenceBucket?.location,
      storage_class: config.evidenceBucket?.storageClass,
    },
    sentinel: {
      key: config.evidenceSentinel?.key,
      etag: config.evidenceSentinel?.etag,
      size: config.evidenceSentinel?.size,
      uploaded: config.evidenceSentinel?.uploadedAt,
      storage_class: config.evidenceSentinel?.storageClass,
      content_type: config.evidenceSentinel?.contentType,
      cache_control: config.evidenceSentinel?.cacheControl,
      content_sha256: config.evidenceSentinel?.contentSha256,
    },
    durableObjectNamespaceIds: config.durableObjectNamespaceIds,
  });
  if (canonicalAliceJson(rebuilt) !== canonicalAliceJson(config)) invalid();
  return config;
}

export function digestAliceCloudflareContinuityConfig(config) {
  verifyAliceCloudflareContinuityConfig(config);
  return `sha256:${crypto
    .createHash("sha256")
    .update(canonicalAliceJson(config))
    .digest("hex")}`;
}

export const ALICE_CONTINUITY_SENTINEL_KEY = SENTINEL_KEY;
