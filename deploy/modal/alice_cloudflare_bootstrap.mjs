import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ALICE_CLOUDFLARE_TARGET,
  canonicalAliceJson,
} from "../../workers/alice-effective-config.js";
import {
  ALICE_CONTINUITY_SENTINEL_KEY,
  aliceCloudflareContinuitySentinelBytes,
} from "./alice_cloudflare_continuity.mjs";
import {
  fetchAliceCloudflareContinuityState,
  fetchAliceRuntimeHostContainerState,
} from "./alice_cloudflare_live_readback.mjs";
import {
  verifyAliceContainerApplicationReadback,
} from "./alice_cloudflare_provider_readback.mjs";
import {
  aliceCloudflareCommandEnv,
  parseAliceWranglerUploadVersionId as parseAliceProtectedWranglerUploadVersionId,
} from "./alice_cloudflare_release.mjs";
import {
  verifyAliceWorkerBundleArtifact,
} from "./alice_worker_bundle_artifact.mjs";

const API_BASE = "https://api.cloudflare.com/client/v4";
const ZONE_ID = "7b24984479ee4cddb6c5d8a9b7a0f2c6";
const API_OPERATION = /^[A-Z][A-Z0-9_]{2,63}$/;
const CLOUDFLARE_TOKEN_ID = /^[a-f0-9]{32}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const NAMESPACE_ID = /^[a-f0-9]{32}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const RELEASE_RUN_ID = /^[1-9][0-9]*-[1-9][0-9]*$/;
const BOOTSTRAP_VERSION_TAG =
  /^alice-continuity-bootstrap-[a-f0-9]{40}-[1-9][0-9]*-[1-9][0-9]*$/;
const RECOVERY_VERSION_TAG = /^alice-recovery-boundary-[a-f0-9]{40}$/;
const RESOURCE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const VERSION_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const RUNTIME_IMAGE = new RegExp(
  `^registry\\.cloudflare\\.com/${ALICE_CLOUDFLARE_TARGET.accountId}/` +
    "alice-runtime@sha256:[a-f0-9]{64}$",
);
const RUNTIME_IMAGE_PLACEHOLDER =
  `registry.cloudflare.com/${ALICE_CLOUDFLARE_TARGET.accountId}/` +
  "alice-runtime:REPLACED_BY_PRODUCTION_DEPLOY";
const CONTROL_DIRECTORY = "alice-production-control";
const PROTECTED_BRANCH = "release/alice-production-core-2026-08-22";
const REPOSITORY = "rndrntwrk/milaidy";
const BOOTSTRAP_RESOURCE_KEYS = [
  "accessWorker",
  "runtimeHostWorker",
  "statePlaneWorker",
  "connectorPlaneWorker",
  "controlWorker",
  "evidenceBucket",
  "evidenceDeadLetterQueue",
  "evidenceQueue",
  "evidenceQueueConsumer",
  "evidenceSentinel",
];
const ROLES = [
  "access",
  "runtimeHost",
  "control",
  "aiGateway",
  "statePlane",
  "connectorPlane",
];
const BOOTSTRAP_IDENTITY_ROLES = [
  "control",
  "statePlane",
  "connectorPlane",
  "runtimeHost",
  "access",
];
const ROLE_WORKERS = Object.freeze({
  access: ALICE_CLOUDFLARE_TARGET.accessWorker,
  runtimeHost: ALICE_CLOUDFLARE_TARGET.runtimeHostWorker,
  control: ALICE_CLOUDFLARE_TARGET.controlWorker,
  aiGateway: ALICE_CLOUDFLARE_TARGET.aiGatewayWorker,
  statePlane: ALICE_CLOUDFLARE_TARGET.statePlaneWorker,
  connectorPlane: ALICE_CLOUDFLARE_TARGET.connectorPlaneWorker,
});
const EXPECTED_DURABLE_OBJECT_BINDINGS = Object.freeze({
  access: Object.freeze([
    Object.freeze({
      className: "AliceRuntimeContainer",
      name: "ALICE_RUNTIME_CONTAINER",
      scriptName: ALICE_CLOUDFLARE_TARGET.runtimeHostWorker,
    }),
  ]),
  runtimeHost: Object.freeze([
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
const TRANSIENT_ROUTE_READ_ATTEMPTS = 3;
const TRANSIENT_ROUTE_READ_DELAY_MS = 100;

function invalid(message = "ALICE_CLOUDFLARE_BOOTSTRAP_INVALID") {
  throw new Error(message);
}

function defaultTransientRouteReadSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function absolute(value) {
  return typeof value === "string" && path.isAbsolute(value);
}

export function verifyAliceBootstrapState(state) {
  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state) ||
    canonicalAliceJson(Object.keys(state).sort()) !==
      canonicalAliceJson([
        "activeVersionId",
        "createdByRun",
        "mode",
        "preexisting",
        "schemaVersion",
      ].sort()) ||
    state.schemaVersion !== "alice.cloudflare-bootstrap-state.v2" ||
    !["bootstrap", "release"].includes(state.mode) ||
    !VERSION_ID.test(state.activeVersionId ?? "")
  ) {
    invalid();
  }
  for (const [name, value] of Object.entries({
    createdByRun: state.createdByRun,
    preexisting: state.preexisting,
  })) {
    const expectedKeys = name === "createdByRun"
      ? BOOTSTRAP_RESOURCE_KEYS
      : BOOTSTRAP_RESOURCE_KEYS.filter((key) => key !== "controlWorker");
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      canonicalAliceJson(Object.keys(value).sort()) !==
        canonicalAliceJson([...expectedKeys].sort()) ||
      Object.values(value).some((flag) => typeof flag !== "boolean")
    ) {
      invalid();
    }
  }
  return state;
}

function run(binary, argv, { cwd, env, errorCode }) {
  const execution = spawnSync(binary, argv, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (execution.error || execution.status !== 0) {
    invalid(errorCode);
  }
  return execution.stdout;
}

async function apiEnvelope(
  {
    fetchImpl,
    apiToken,
    method,
    operation,
    pathname,
    body,
    headers = {},
    allowNotFound = false,
    requireResult = true,
    retryTransientRoute503 = false,
    transientRouteReadSleep = defaultTransientRouteReadSleep,
  },
) {
  if (!API_OPERATION.test(operation ?? "")) invalid();
  if (
    retryTransientRoute503 &&
    (method !== "GET" || typeof transientRouteReadSleep !== "function")
  ) {
    invalid();
  }
  const attempts = retryTransientRoute503 ? TRANSIENT_ROUTE_READ_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(`${API_BASE}${pathname}`, {
        method,
        headers: {
          authorization: `Bearer ${apiToken}`,
          accept: "application/json",
          "cache-control": "no-cache",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        ...(body === undefined
          ? {}
          : { body: typeof body === "string" ? body : JSON.stringify(body) }),
      });
    } catch {
      providerApiInvalid(operation, null, null);
    }
    if (!(response instanceof Response)) {
      providerApiInvalid(operation, null, null);
    }
    if (response.status === 404 && method === "GET" && allowNotFound) return null;
    let value;
    try {
      value = await response.json();
    } catch {
      if (
        retryTransientRoute503 &&
        response.status === 503 &&
        attempt < attempts
      ) {
        await transientRouteReadSleep(TRANSIENT_ROUTE_READ_DELAY_MS);
        continue;
      }
      providerApiInvalid(operation, response.status, null);
    }
    if (!response.ok) {
      if (
        retryTransientRoute503 &&
        response.status === 503 &&
        providerErrorCode(value) === undefined &&
        attempt < attempts
      ) {
        await transientRouteReadSleep(TRANSIENT_ROUTE_READ_DELAY_MS);
        continue;
      }
      providerApiInvalid(operation, response.status, value);
    }
    if (
      value?.success !== true ||
      (requireResult && !("result" in value))
    ) {
      providerApiInvalid(operation, response.status, value);
    }
    return value;
  }
  invalid();
}

function providerErrorCode(value) {
  return Array.isArray(value?.errors)
    ? value.errors
      .map((entry) => entry?.code)
      .find((entry) => Number.isSafeInteger(entry) && entry >= 0)
    : undefined;
}

function providerApiInvalid(operation, status, value) {
  if (!API_OPERATION.test(operation ?? "")) invalid();
  const code = providerErrorCode(value);
  const httpStatus = Number.isSafeInteger(status) && status >= 100 && status <= 599
    ? status
    : "NONE";
  invalid(
    `ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:${operation}:HTTP_${httpStatus}:CF_${code ?? "NONE"}`,
  );
}

async function api(options) {
  const envelope = await apiEnvelope({
    ...options,
    allowNotFound: options.allowNotFound ?? options.method === "GET",
  });
  return envelope === null ? null : envelope.result;
}

export async function verifyAliceBootstrapDeployToken({ fetchImpl, apiToken }) {
  const result = await api({
    fetchImpl,
    apiToken,
    method: "GET",
    operation: "VERIFY_DEPLOY_TOKEN",
    pathname:
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/tokens/verify`,
    allowNotFound: false,
  });
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    Object.keys(result).some((key) =>
      !["expires_on", "id", "not_before", "status"].includes(key)
    ) ||
    !CLOUDFLARE_TOKEN_ID.test(result.id ?? "") ||
    result.status !== "active" ||
    [result.not_before, result.expires_on].some((value) =>
      value !== undefined && value !== null &&
      (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    )
  ) {
    invalid("ALICE_CLOUDFLARE_BOOTSTRAP_DEPLOY_TOKEN_INVALID");
  }
  return `sha256:${crypto.createHash("sha256").update(result.id).digest("hex")}`;
}

async function apiSuccessBody({ fetchImpl, apiToken, operation, pathname }) {
  return apiEnvelope({
    fetchImpl,
    apiToken,
    method: "GET",
    operation,
    pathname,
    requireResult: false,
  });
}

async function apiGetAllResults({
  fetchImpl,
  apiToken,
  operation,
  pathname,
  retryTransientRoute503 = false,
  transientRouteReadSleep = defaultTransientRouteReadSleep,
}) {
  const values = [];
  let expectedTotalPages;
  let expectedTotalCount;
  for (let page = 1; page <= 100; page += 1) {
    const separator = pathname.includes("?") ? "&" : "?";
    const envelope = await apiEnvelope({
      fetchImpl,
      apiToken,
      method: "GET",
      operation,
      pathname: `${pathname}${separator}page=${page}&per_page=100`,
      retryTransientRoute503,
      transientRouteReadSleep,
    });
    if (envelope === null || !Array.isArray(envelope.result)) {
      providerApiInvalid(operation, 200, envelope);
    }
    values.push(...envelope.result);
    if (envelope.result_info === undefined) {
      if (envelope.result.length >= 100) invalid();
      return values;
    }
    const info = envelope.result_info;
    const totalPages =
      info?.total_pages === undefined &&
        Number.isSafeInteger(info?.total_count) &&
        Number.isSafeInteger(info?.per_page) &&
        info.per_page > 0
        ? Math.ceil(info.total_count / info.per_page)
        : info?.total_pages;
    const empty =
      page === 1 &&
      envelope.result.length === 0 &&
      (info?.page === 0 || info?.page === page) &&
      totalPages === 0 &&
      info?.total_count === 0 &&
      info?.count === 0 &&
      info?.per_page === 100;
    if (
      !info ||
      !Number.isSafeInteger(info.page) ||
      !Number.isSafeInteger(totalPages) ||
      !Number.isSafeInteger(info.per_page) ||
      !Number.isSafeInteger(info.count) ||
      !Number.isSafeInteger(info.total_count) ||
      (!empty && info.page !== page) ||
      totalPages < 0 ||
      totalPages > 100 ||
      info.per_page !== 100 ||
      info.count !== envelope.result.length ||
      info.total_count < 0 ||
      info.total_count > 10_000 ||
      totalPages !== Math.ceil(info.total_count / info.per_page) ||
      (expectedTotalPages !== undefined &&
        totalPages !== expectedTotalPages) ||
      (expectedTotalCount !== undefined &&
        info.total_count !== expectedTotalCount)
    ) {
      invalid();
    }
    if (empty) return values;
    const expectedPageCount = page < totalPages
      ? info.per_page
      : info.total_count - (page - 1) * info.per_page;
    if (
      totalPages === 0 ||
      info.count !== expectedPageCount ||
      expectedPageCount <= 0
    ) {
      invalid();
    }
    expectedTotalPages = totalPages;
    expectedTotalCount = info.total_count;
    if (page === expectedTotalPages) return values;
    if (page > expectedTotalPages) invalid();
  }
  invalid();
}

async function ensureExactSentinelBody({ fetchImpl, apiToken, objectsPath }) {
  const expected = Buffer.from(aliceCloudflareContinuitySentinelBytes(), "utf8");
  const response = await fetchImpl(
    `${API_BASE}${objectsPath}/${ALICE_CONTINUITY_SENTINEL_KEY}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiToken}`,
        accept: "application/json",
        "cache-control": "no-cache",
      },
    },
  );
  if (!(response instanceof Response) || !response.ok || !response.body) invalid();
  const reader = response.body.getReader();
  const actual = Buffer.alloc(expected.length);
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!(value instanceof Uint8Array) || offset + value.byteLength > actual.length) {
      await reader.cancel().catch(() => undefined);
      invalid();
    }
    Buffer.from(value).copy(actual, offset);
    offset += value.byteLength;
  }
  if (offset !== expected.length || !actual.equals(expected)) invalid();
}

async function putSentinelIfAbsent({ fetchImpl, apiToken, objectsPath }) {
  const response = await fetchImpl(
    `${API_BASE}${objectsPath}/${ALICE_CONTINUITY_SENTINEL_KEY}`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${apiToken}`,
        accept: "application/json",
        "cache-control": "no-store",
        "content-type": "application/json",
        "cf-r2-storage-class": "Standard",
        "if-none-match": "*",
      },
      body: aliceCloudflareContinuitySentinelBytes(),
    },
  );
  if (!(response instanceof Response) || (!response.ok && response.status !== 412)) {
    invalid();
  }
  return response.status;
}

export function verifyAliceBootstrapBucket(bucket) {
  if (
    bucket?.name !== ALICE_CLOUDFLARE_TARGET.evidenceBucket ||
    bucket?.jurisdiction !== "default" ||
    typeof bucket?.location !== "string" ||
    bucket.location.toLowerCase() !== "enam" ||
    bucket?.storage_class !== "Standard"
  ) {
    invalid();
  }
  return bucket;
}

export async function ensureAliceBootstrapQueue({ fetchImpl, apiToken, name }) {
  let queues = await apiGetAllResults({
    fetchImpl,
    apiToken,
    operation: "LIST_QUEUES",
    pathname: `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/queues`,
  });
  let matches = queues.filter((queue) => queue?.queue_name === name);
  if (matches.length > 1) invalid();
  let created = false;
  if (matches.length === 0) {
    await api({
      fetchImpl,
      apiToken,
      method: "POST",
      operation: "CREATE_QUEUE",
      pathname: `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/queues`,
      body: {
        queue_name: name,
        settings: {
          delivery_delay: 0,
          delivery_paused: true,
          message_retention_period: 86_400,
        },
      },
    });
    created = true;
    queues = await apiGetAllResults({
      fetchImpl,
      apiToken,
      operation: "LIST_QUEUES",
      pathname: `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/queues`,
    });
    matches = queues.filter((queue) => queue?.queue_name === name);
  }
  if (
    matches.length !== 1 ||
    !RESOURCE_ID.test(matches[0]?.queue_id ?? "") ||
    matches[0]?.settings?.delivery_paused !== true ||
    matches[0]?.settings?.delivery_delay !== 0 ||
    matches[0]?.settings?.message_retention_period !== 86_400
  ) {
    invalid();
  }
  return { created, queue: matches[0] };
}

async function ensureBucketAndSentinel({ fetchImpl, apiToken }) {
  const bucketPath =
    `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/r2/buckets/${ALICE_CLOUDFLARE_TARGET.evidenceBucket}`;
  let bucket = await api({
    fetchImpl,
    apiToken,
    method: "GET",
    operation: "GET_EVIDENCE_BUCKET",
    pathname: bucketPath,
  });
  let bucketCreated = false;
  let sentinelCreated = false;
  if (bucket === null) {
    await api({
      fetchImpl,
      apiToken,
      method: "POST",
      operation: "CREATE_EVIDENCE_BUCKET",
      pathname: `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/r2/buckets`,
      headers: { "cf-r2-jurisdiction": "default" },
      body: {
        name: ALICE_CLOUDFLARE_TARGET.evidenceBucket,
        locationHint: "enam",
        storageClass: "Standard",
      },
    });
    bucketCreated = true;
    bucket = await api({
      fetchImpl,
      apiToken,
      method: "GET",
      operation: "GET_EVIDENCE_BUCKET",
      pathname: bucketPath,
    });
  }
  verifyAliceBootstrapBucket(bucket);
  const objectsPath = `${bucketPath}/objects`;
  const sentinelObjects = await api({
    fetchImpl,
    apiToken,
    method: "GET",
    operation: "LIST_EVIDENCE_SENTINELS",
    pathname: `${objectsPath}?prefix=${ALICE_CONTINUITY_SENTINEL_KEY}&per_page=2`,
  });
  if (!Array.isArray(sentinelObjects) || sentinelObjects.length > 1) invalid();
  if (sentinelObjects.length === 0) {
    const status = await putSentinelIfAbsent({
      fetchImpl,
      apiToken,
      objectsPath,
    });
    if (status === 412) invalid("ALICE_CLOUDFLARE_BOOTSTRAP_CONCURRENT_MUTATION");
    sentinelCreated = true;
  }
  await ensureExactSentinelBody({ fetchImpl, apiToken, objectsPath });
  return { bucketCreated, sentinelCreated };
}

export async function fetchAliceBootstrapResourceSnapshot({
  fetchImpl,
  apiToken,
  deployCredentialIdSha256,
  transientRouteReadSleep = defaultTransientRouteReadSleep,
}) {
  if (
    !DIGEST.test(deployCredentialIdSha256 ?? "") ||
    typeof transientRouteReadSleep !== "function"
  ) {
    invalid();
  }
  const inventorySha256 = (value) => `sha256:${crypto
    .createHash("sha256")
    .update(canonicalAliceJson(value))
    .digest("hex")}`;
  const inventoryIdentity = (value, summary = {}) => ({
    present: value !== null,
    providerSha256: inventorySha256(value),
    summary,
  });
  const routeCanMatchHostname = (pattern, hostname) => {
    if (typeof pattern !== "string") invalid();
    const hostPattern = pattern
      .replace(/^https?:\/\//i, "")
      .split("/", 1)[0]
      .toLowerCase();
    if (hostPattern.length === 0 || /[^a-z0-9.*_-]/.test(hostPattern)) {
      invalid();
    }
    const expression = hostPattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", ".*");
    return new RegExp(`^${expression}$`, "i").test(hostname);
  };
  const queues = await apiGetAllResults({
    fetchImpl,
    apiToken,
    operation: "LIST_QUEUES",
    pathname: `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/queues`,
  });
  const namedQueues = {};
  const consumers = {};
  for (const [key, name] of [
    ["evidence", ALICE_CLOUDFLARE_TARGET.evidenceQueue],
    ["deadLetter", ALICE_CLOUDFLARE_TARGET.evidenceDlq],
  ]) {
    const matches = queues.filter((queue) => queue?.queue_name === name);
    if (matches.length > 1) invalid();
    namedQueues[key] = matches[0] ?? null;
    consumers[key] = matches.length === 0
      ? []
      : await apiGetAllResults({
          fetchImpl,
          apiToken,
          operation: "LIST_QUEUE_CONSUMERS",
          pathname:
            `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/queues/${matches[0].queue_id}/consumers`,
        });
  }
  const targetedQueueIds = new Set(
    Object.values(namedQueues)
      .filter((queue) => queue !== null)
      .map((queue) => queue.queue_id),
  );
  const allEventSubscriptions = await apiGetAllResults({
    fetchImpl,
    apiToken,
    operation: "LIST_QUEUE_EVENT_SUBSCRIPTIONS",
    pathname:
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/event_subscriptions/subscriptions`,
  });
  const eventSubscriptions = allEventSubscriptions.filter((subscription) =>
    targetedQueueIds.has(subscription?.destination?.queue_id)
  );

  const zoneApplications = await apiGetAllResults({
    fetchImpl,
    apiToken,
    operation: "LIST_ZONE_ACCESS_APPS",
    pathname: `/zones/${ZONE_ID}/access/apps`,
  });
  const accountApplications = await apiGetAllResults({
    fetchImpl,
    apiToken,
    operation: "LIST_ACCOUNT_ACCESS_APPS",
    pathname:
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/access/apps`,
  });
  const aliceDomains = new Set([
    ALICE_CLOUDFLARE_TARGET.accessDomain,
    ALICE_CLOUDFLARE_TARGET.releaseControlDomain,
  ]);
  const aliceApplication = (application) => {
    const domain = application?.domain?.split("/", 1)[0]?.toLowerCase();
    return aliceDomains.has(domain);
  };
  const aliceZoneApplications = zoneApplications.filter(aliceApplication);
  const aliceAccountApplications = accountApplications.filter(aliceApplication);
  const accessPolicies = {};
  for (const application of aliceZoneApplications) {
    if (typeof application?.id !== "string" || application.id.length < 16) {
      invalid();
    }
    const policies = await apiGetAllResults({
      fetchImpl,
      apiToken,
      operation: "LIST_ZONE_ACCESS_POLICIES",
      pathname: `/zones/${ZONE_ID}/access/apps/${application.id}/policies`,
    });
    accessPolicies[application.id] = inventoryIdentity(policies, {
      count: policies.length,
      ids: policies.map((policy) => policy?.id).sort(),
    });
  }
  const identityProviders = await apiGetAllResults({
    fetchImpl,
    apiToken,
    operation: "LIST_ACCESS_IDENTITY_PROVIDERS",
    pathname:
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/access/identity_providers`,
  });
  const postureRules = await apiGetAllResults({
    fetchImpl,
    apiToken,
    operation: "LIST_DEVICE_POSTURE_RULES",
    pathname:
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/devices/posture`,
  });

  const gatewayPath =
    `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/ai-gateway/gateways/${ALICE_CLOUDFLARE_TARGET.aiGateway}`;
  const aiGateway = await api({
    fetchImpl,
    apiToken,
    method: "GET",
    operation: "GET_AI_GATEWAY",
    pathname: gatewayPath,
  });
  const aiGatewayRoutes = aiGateway === null
    ? null
    : await apiSuccessBody({
        fetchImpl,
        apiToken,
        operation: "LIST_AI_GATEWAY_ROUTES",
        pathname: `${gatewayPath}/routes?page=1&per_page=100`,
      });

  const routes = await apiGetAllResults({
    fetchImpl,
    apiToken,
    operation: "LIST_WORKER_ROUTES",
    pathname: `/zones/${ZONE_ID}/workers/routes`,
    retryTransientRoute503: true,
    transientRouteReadSleep,
  });
  const customDomains = await apiGetAllResults({
    fetchImpl,
    apiToken,
    operation: "LIST_WORKER_DOMAINS",
    pathname:
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/workers/domains?zone_id=${ZONE_ID}`,
  });
  const aliceRoutes = routes.filter((route) =>
    [...aliceDomains].some((hostname) =>
      routeCanMatchHostname(route?.pattern, hostname)
    )
  );
  const aliceCustomDomains = customDomains.filter((domain) =>
    aliceDomains.has(domain?.hostname?.toLowerCase())
  );

  const workers = {};
  for (const workerName of ROLES.map((role) => ROLE_WORKERS[role])) {
    const workerPath =
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/workers/scripts/${workerName}`;
    const state = {
      deployments: await api({
        fetchImpl,
        apiToken,
        method: "GET",
        operation: "GET_WORKER_DEPLOYMENTS",
        pathname: `${workerPath}/deployments`,
      }),
      scriptSettings: await api({
        fetchImpl,
        apiToken,
        method: "GET",
        operation: "GET_WORKER_SCRIPT_SETTINGS",
        pathname: `${workerPath}/script-settings`,
      }),
      settings: await api({
        fetchImpl,
        apiToken,
        method: "GET",
        operation: "GET_WORKER_SETTINGS",
        pathname: `${workerPath}/settings`,
      }),
      subdomain: await api({
        fetchImpl,
        apiToken,
        method: "GET",
        operation: "GET_WORKER_SUBDOMAIN",
        pathname: `${workerPath}/subdomain`,
      }),
    };
    const present = Object.values(state).filter((value) => value !== null).length;
    if (![0, Object.keys(state).length].includes(present)) invalid();
    workers[workerName] = inventoryIdentity(
      present === 0 ? null : state,
      present === 0
        ? {}
        : {
            deploymentIds:
              state.deployments?.deployments?.map((deployment) => deployment.id)
                ?? [],
          },
    );
  }

  const workflow = await api({
    fetchImpl,
    apiToken,
    method: "GET",
    operation: "GET_PLAN_WORKFLOW",
    pathname:
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/workflows/${ALICE_CLOUDFLARE_TARGET.planWorkflow}`,
  });
  const bucketPath =
    `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/r2/buckets/${ALICE_CLOUDFLARE_TARGET.evidenceBucket}`;
  const bucket = await api({
    fetchImpl,
    apiToken,
    method: "GET",
    operation: "GET_EVIDENCE_BUCKET",
    pathname: bucketPath,
  });
  const sentinelObjects = bucket === null
    ? []
    : await api({
        fetchImpl,
        apiToken,
        method: "GET",
        operation: "LIST_EVIDENCE_SENTINELS",
        pathname:
          `${bucketPath}/objects?prefix=${ALICE_CONTINUITY_SENTINEL_KEY}&per_page=2`,
      });
  if (!Array.isArray(sentinelObjects) || sentinelObjects.length > 1) invalid();
  if (sentinelObjects.length === 1) {
    await ensureExactSentinelBody({ fetchImpl, apiToken, objectsPath: bucketPath + "/objects" });
  }
  return {
    schemaVersion: "alice.cloudflare-bootstrap-preflight.v3",
    accountId: ALICE_CLOUDFLARE_TARGET.accountId,
    deployCredentialIdSha256,
    access: {
      accountApplications: inventoryIdentity(aliceAccountApplications, {
        count: aliceAccountApplications.length,
        ids: aliceAccountApplications.map((application) => application?.id).sort(),
      }),
      identityProviders: inventoryIdentity(identityProviders, {
        count: identityProviders.length,
        ids: identityProviders.map((provider) => provider?.id).sort(),
      }),
      policies: accessPolicies,
      postureRules: inventoryIdentity(postureRules, {
        count: postureRules.length,
        ids: postureRules.map((rule) => rule?.id).sort(),
      }),
      zoneApplications: inventoryIdentity(aliceZoneApplications, {
        count: aliceZoneApplications.length,
        ids: aliceZoneApplications.map((application) => application?.id).sort(),
      }),
    },
    aiGateway: inventoryIdentity(
      aiGateway === null ? null : { gateway: aiGateway, routes: aiGatewayRoutes },
      { id: aiGateway?.id ?? null },
    ),
    queues: namedQueues,
    consumers,
    eventSubscriptions,
    bucket,
    sentinelObjects,
    sentinelBodyVerified: sentinelObjects.length === 1,
    traffic: { routes: aliceRoutes, customDomains: aliceCustomDomains },
    workers,
    workflow,
  };
}

function verifyProtectedRefStillExact({ sourceRoot, sourceCommit }) {
  const protectedRefSha = run(
    "gh",
    [
      "api",
      `repos/${REPOSITORY}/git/ref/heads/${PROTECTED_BRANCH}`,
      "--jq",
      ".object.sha",
    ],
    {
      cwd: sourceRoot,
      errorCode: "ALICE_PROTECTED_REF_READBACK_INVALID",
    },
  ).trim();
  if (protectedRefSha !== sourceCommit) {
    invalid("ALICE_PROTECTED_REF_READBACK_INVALID");
  }
}

export function buildAliceBootstrapControlConfig({
  sourceConfig,
  deploymentMainPath,
}) {
  if (
    !sourceConfig ||
    sourceConfig.account_id !== ALICE_CLOUDFLARE_TARGET.accountId ||
    sourceConfig.name !== ALICE_CLOUDFLARE_TARGET.controlWorker ||
    !absolute(deploymentMainPath)
  ) {
    invalid();
  }
  const config = JSON.parse(JSON.stringify(sourceConfig));
  config.main = deploymentMainPath;
  config.routes = [];
  config.workers_dev = false;
  config.preview_urls = false;
  config.queues = {
    ...config.queues,
    consumers: [],
  };
  config.secrets = { required: [] };
  Object.assign(config.vars, {
    ALICE_PROGRAM_ENVELOPE_B64: "e30",
    ALICE_PROGRAM_SIGNATURE_B64: "invalid",
    ALICE_PROGRAM_PUBLIC_JWK_B64: "e30",
    ALICE_DEPLOYMENT_MANIFEST_SHA256: `sha256:${"0".repeat(64)}`,
    ALICE_DEPLOYMENT_MANIFEST_B64: "e30",
  });
  return config;
}

export function buildAliceBootstrapPrivateWorkerConfig({
  role,
  sourceConfig,
  deploymentMainPath,
  runtimeImage,
}) {
  if (
    !["access", "runtimeHost", "statePlane", "connectorPlane"].includes(role) ||
    !sourceConfig ||
    sourceConfig.account_id !== ALICE_CLOUDFLARE_TARGET.accountId ||
    sourceConfig.name !== ROLE_WORKERS[role] ||
    !absolute(deploymentMainPath)
  ) {
    invalid();
  }
  const expectedBindings = EXPECTED_DURABLE_OBJECT_BINDINGS[role];
  const observedBindings = sourceConfig.durable_objects?.bindings;
  if (
    !Array.isArray(observedBindings) ||
    canonicalAliceJson(
      observedBindings
        .map((binding) => ({
          className: binding?.class_name,
          name: binding?.name,
          ...(binding?.script_name === undefined
            ? {}
            : { scriptName: binding.script_name }),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    ) !== canonicalAliceJson(expectedBindings)
  ) {
    invalid();
  }
  const config = JSON.parse(JSON.stringify(sourceConfig));
  config.main = deploymentMainPath;
  config.routes = [];
  config.workers_dev = false;
  config.preview_urls = false;
  config.secrets = { required: [] };
  for (const key of [
    "ai",
    "assets",
    "d1_databases",
    "queues",
    "r2_buckets",
    "services",
    "vectorize",
  ]) {
    delete config[key];
  }
  if (role === "runtimeHost") {
    const container = config.containers?.[0];
    if (
      !RUNTIME_IMAGE.test(runtimeImage ?? "") ||
      !Array.isArray(config.containers) ||
      config.containers.length !== 1 ||
      container?.name !== "alice-production-runtime" ||
      container?.class_name !== "AliceRuntimeContainer" ||
      container?.image !== RUNTIME_IMAGE_PLACEHOLDER ||
      container?.instance_type !== "standard-1" ||
      container?.max_instances !== 1
    ) {
      invalid();
    }
    container.image = runtimeImage;
  } else {
    if (runtimeImage !== undefined) invalid();
    delete config.containers;
  }
  return config;
}

export function buildAliceBootstrapCreationCommand({
  controlMain,
  configPath,
  sourceCommit,
  releaseRunId,
}) {
  if (
    !absolute(controlMain) ||
    !absolute(configPath) ||
    !COMMIT.test(sourceCommit ?? "") ||
    !RELEASE_RUN_ID.test(releaseRunId ?? "")
  ) {
    invalid();
  }
  return [
    "deploy",
    controlMain,
    "--config",
    configPath,
    "--no-bundle",
    "--strict",
    "--tag",
    `alice-continuity-bootstrap-${sourceCommit}-${releaseRunId}`,
    "--message",
    `Alice unrouted fail-closed continuity bootstrap ${sourceCommit}`,
  ];
}

export function buildAliceBootstrapInactiveUploadCommand({
  workerMain,
  configPath,
  sourceCommit,
  releaseRunId,
}) {
  if (
    !absolute(workerMain) ||
    !absolute(configPath) ||
    !COMMIT.test(sourceCommit ?? "") ||
    !RELEASE_RUN_ID.test(releaseRunId ?? "")
  ) {
    invalid();
  }
  return [
    "versions",
    "upload",
    workerMain,
    "--config",
    configPath,
    "--no-bundle",
    "--strict",
    "--tag",
    `alice-continuity-bootstrap-${sourceCommit}-${releaseRunId}`,
    "--message",
    `Alice inactive fail-closed continuity bootstrap ${sourceCommit}`,
  ];
}

export function parseAliceBootstrapUploadVersionId(output) {
  try {
    return parseAliceProtectedWranglerUploadVersionId(output);
  } catch {
    invalid("ALICE_CLOUDFLARE_BOOTSTRAP_UPLOAD_VERSION_INVALID");
  }
}

export function parseAliceWranglerDeployVersionId(output) {
  if (typeof output !== "string") {
    invalid("ALICE_CLOUDFLARE_BOOTSTRAP_DEPLOY_VERSION_INVALID");
  }
  const matches = output
    .split(/\r?\n/)
    .map((line) => line.match(/^Current Version ID:\s*([a-f0-9-]+)\s*$/))
    .filter(Boolean);
  if (matches.length !== 1 || !VERSION_ID.test(matches[0][1] ?? "")) {
    invalid("ALICE_CLOUDFLARE_BOOTSTRAP_DEPLOY_VERSION_INVALID");
  }
  return matches[0][1];
}

export function buildAliceBootstrapPromotionCommand({ versionId, configPath }) {
  if (!VERSION_ID.test(versionId ?? "") || !absolute(configPath)) invalid();
  return [
    "versions",
    "deploy",
    "--config",
    configPath,
    "--version-id",
    versionId,
    "--percentage",
    "100",
    "--message",
    "Alice fail-closed continuity bootstrap",
    "--yes",
  ];
}

function aliceBootstrapVersionBindings(role, version) {
  if (!ROLES.includes(role)) invalid();
  if (role === "aiGateway" && version === null) return [];
  const bindings = version?.resources?.bindings;
  if (
    !Array.isArray(bindings) ||
    bindings.some((binding) =>
      !binding ||
      typeof binding !== "object" ||
      Array.isArray(binding) ||
      typeof binding.type !== "string" ||
      typeof binding.name !== "string"
    )
  ) {
    invalid();
  }
  const expectedNames = new Set(
    EXPECTED_DURABLE_OBJECT_BINDINGS[role].map((binding) => binding.name),
  );
  if (
    bindings.some((binding) =>
      binding?.type !== "durable_object_namespace" &&
      expectedNames.has(binding?.name)
    )
  ) {
    invalid();
  }
  return bindings;
}

function extractAliceBootstrapRoleNamespaceIds(role, version) {
  const bindings = aliceBootstrapVersionBindings(role, version);
  const namespaces = bindings
    .filter((binding) => binding?.type === "durable_object_namespace")
    .map((binding) => ({
      className: binding.class_name,
      name: binding.name,
      namespaceId: binding.namespace_id,
      scriptName: binding.script_name === undefined ? null : binding.script_name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const identity = namespaces.map(({ className, name, scriptName }) => ({
    className,
    name,
    scriptName,
  }));
  const expectedIdentity = EXPECTED_DURABLE_OBJECT_BINDINGS[role].map(
    ({ className, name, scriptName = null }) => ({
      className,
      name,
      scriptName,
    }),
  );
  if (
    canonicalAliceJson(identity) !==
      canonicalAliceJson(expectedIdentity) ||
    namespaces.some(
      (binding) => !NAMESPACE_ID.test(binding.namespaceId ?? ""),
    ) ||
    new Set(namespaces.map((binding) => binding.namespaceId)).size !==
      namespaces.length
  ) {
    invalid();
  }
  return namespaces;
}

function verifyAliceBootstrapNamespaceRelationships(
  namespaceIdsByRole,
  { requireRuntimeReference },
) {
  const seen = new Map();
  for (const role of ROLES) {
    for (const binding of namespaceIdsByRole[role] ?? []) {
      const prior = seen.get(binding.namespaceId);
      if (prior !== undefined) {
        const pair = new Set([prior.role, role]);
        if (
          pair.size !== 2 ||
          !pair.has("access") ||
          !pair.has("runtimeHost") ||
          prior.name !== "ALICE_RUNTIME_CONTAINER" ||
          binding.name !== "ALICE_RUNTIME_CONTAINER"
        ) {
          invalid();
        }
      } else {
        seen.set(binding.namespaceId, { role, name: binding.name });
      }
    }
  }
  const accessRuntime = namespaceIdsByRole.access?.[0];
  const hostRuntime = namespaceIdsByRole.runtimeHost?.[0];
  if (
    (accessRuntime && !hostRuntime) ||
    (requireRuntimeReference && (!accessRuntime || !hostRuntime)) ||
    (accessRuntime && hostRuntime &&
      accessRuntime.namespaceId !== hostRuntime.namespaceId)
  ) {
    invalid();
  }
}

export function planAliceBootstrapIdentityActions({
  activeVersionIds,
  activeVersions,
}) {
  const exactIdentityRoles = (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    canonicalAliceJson(Object.keys(value).sort()) ===
      canonicalAliceJson([...BOOTSTRAP_IDENTITY_ROLES].sort());
  if (
    !exactIdentityRoles(activeVersionIds) ||
    !exactIdentityRoles(activeVersions)
  ) {
    invalid();
  }
  const actions = {};
  const namespaceIdsByRole = Object.fromEntries(
    ROLES.map((role) => [role, []]),
  );
  for (const role of BOOTSTRAP_IDENTITY_ROLES) {
    const activeVersionId = activeVersionIds[role];
    const activeVersion = activeVersions[role];
    if (activeVersionId === null) {
      if (activeVersion !== null) invalid();
      actions[role] = { upload: "first-deploy", promote: true };
      continue;
    }
    if (
      !VERSION_ID.test(activeVersionId ?? "") ||
      activeVersion?.id !== activeVersionId
    ) {
      invalid();
    }
    const bindings = aliceBootstrapVersionBindings(role, activeVersion);
    const durableObjectBindings = bindings.filter(
      (binding) => binding?.type === "durable_object_namespace",
    );
    if (role === "access" && durableObjectBindings.length === 0) {
      actions[role] = { upload: "inactive", promote: false };
      continue;
    }
    const namespaces = extractAliceBootstrapRoleNamespaceIds(role, activeVersion);
    namespaceIdsByRole[role] = namespaces;
    actions[role] = { upload: "none", promote: false };
  }
  verifyAliceBootstrapNamespaceRelationships(namespaceIdsByRole, {
    requireRuntimeReference: false,
  });
  return actions;
}

export function verifyAliceBootstrapInactiveAccessBoundary({
  previousActiveVersionId,
  currentActiveVersionId,
  trafficBefore,
  trafficAfter,
}) {
  const exactTraffic = (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    canonicalAliceJson(Object.keys(value).sort()) ===
      canonicalAliceJson(["customDomains", "routes"]) &&
    Array.isArray(value.customDomains) &&
    Array.isArray(value.routes);
  if (
    !VERSION_ID.test(previousActiveVersionId ?? "") ||
    currentActiveVersionId !== previousActiveVersionId ||
    !exactTraffic(trafficBefore) ||
    !exactTraffic(trafficAfter) ||
    canonicalAliceJson(trafficAfter) !== canonicalAliceJson(trafficBefore)
  ) {
    invalid("ALICE_CLOUDFLARE_BOOTSTRAP_INACTIVE_ACCESS_BOUNDARY_INVALID");
  }
}

export function extractAliceBootstrapNamespaceIds(versions) {
  if (
    !versions ||
    typeof versions !== "object" ||
    Array.isArray(versions) ||
    canonicalAliceJson(Object.keys(versions).sort()) !==
      canonicalAliceJson([...ROLES].sort())
  ) {
    invalid();
  }
  const result = {};
  for (const role of ROLES) {
    result[role] = extractAliceBootstrapRoleNamespaceIds(role, versions[role]);
  }
  verifyAliceBootstrapNamespaceRelationships(result, {
    requireRuntimeReference: true,
  });
  return result;
}

export function extractAliceBootstrapSelectedNamespaceIds({
  versionIds,
  versions,
}) {
  if (
    !versionIds ||
    typeof versionIds !== "object" ||
    Array.isArray(versionIds) ||
    canonicalAliceJson(Object.keys(versionIds).sort()) !==
      canonicalAliceJson([...BOOTSTRAP_IDENTITY_ROLES].sort())
  ) {
    invalid();
  }
  for (const role of BOOTSTRAP_IDENTITY_ROLES) {
    if (
      !VERSION_ID.test(versionIds[role] ?? "") ||
      versions?.[role]?.id !== versionIds[role]
    ) {
      invalid();
    }
  }
  return extractAliceBootstrapNamespaceIds(versions);
}

export async function executeAliceBootstrapIdentityActions({
  identityActions,
  versionIds: initialVersionIds,
  bootstrapIdentityConfigs,
  wranglerBin,
  sourceRoot,
  sourceCommit,
  releaseRunId,
  commandEnv,
  runCommand = run,
  fetchVersion,
  fetchActiveVersionId,
  verifyRuntimeHostBoundary,
  fetchTraffic,
  trafficBefore,
}) {
  const exactIdentityRoles = (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    canonicalAliceJson(Object.keys(value).sort()) ===
      canonicalAliceJson([...BOOTSTRAP_IDENTITY_ROLES].sort());
  if (
    !exactIdentityRoles(identityActions) ||
    !exactIdentityRoles(initialVersionIds) ||
    !exactIdentityRoles(bootstrapIdentityConfigs) ||
    !absolute(wranglerBin) ||
    !absolute(sourceRoot) ||
    !COMMIT.test(sourceCommit ?? "") ||
    !RELEASE_RUN_ID.test(releaseRunId ?? "") ||
    !commandEnv ||
    typeof commandEnv !== "object" ||
    Array.isArray(commandEnv) ||
    typeof runCommand !== "function" ||
    typeof fetchVersion !== "function" ||
    typeof fetchActiveVersionId !== "function" ||
    typeof verifyRuntimeHostBoundary !== "function" ||
    typeof fetchTraffic !== "function"
  ) {
    invalid();
  }
  for (const role of BOOTSTRAP_IDENTITY_ROLES) {
    const action = identityActions[role];
    const validAction =
      action &&
      typeof action === "object" &&
      !Array.isArray(action) &&
      canonicalAliceJson(Object.keys(action).sort()) ===
        canonicalAliceJson(["promote", "upload"]) &&
      (
        (action.upload === "none" && action.promote === false) ||
        (action.upload === "first-deploy" && action.promote === true) ||
        (
          role === "access" &&
          action.upload === "inactive" &&
          action.promote === false
        )
      );
    const initialVersionId = initialVersionIds[role];
    const validInitialVersion = action?.upload === "first-deploy" &&
        role !== "control"
      ? initialVersionId === null
      : VERSION_ID.test(initialVersionId ?? "");
    const identity = bootstrapIdentityConfigs[role];
    if (
      !validAction ||
      !validInitialVersion ||
      !identity ||
      typeof identity !== "object" ||
      Array.isArray(identity) ||
      canonicalAliceJson(Object.keys(identity).sort()) !==
        canonicalAliceJson(["configPath", "deploymentMainPath"]) ||
      !absolute(identity.configPath) ||
      !absolute(identity.deploymentMainPath)
    ) {
      invalid();
    }
  }

  const previousAccessVersionId = initialVersionIds.access;
  const versionIds = { ...initialVersionIds };
  const createdRoles = [];
  const uploadRole = (role) => {
    const action = identityActions[role];
    if (action.upload === "none") return;
    const identity = bootstrapIdentityConfigs[role];
    const inactive = action.upload === "inactive";
    const output = runCommand(
      wranglerBin,
      inactive
        ? buildAliceBootstrapInactiveUploadCommand({
            workerMain: identity.deploymentMainPath,
            configPath: identity.configPath,
            sourceCommit,
            releaseRunId,
          })
        : buildAliceBootstrapCreationCommand({
            controlMain: identity.deploymentMainPath,
            configPath: identity.configPath,
            sourceCommit,
            releaseRunId,
          }),
      {
        cwd: sourceRoot,
        env: commandEnv,
        errorCode: `ALICE_CLOUDFLARE_${role.toUpperCase()}_BOOTSTRAP_UPLOAD_FAILED`,
      },
    );
    versionIds[role] = inactive
      ? parseAliceBootstrapUploadVersionId(output)
      : parseAliceWranglerDeployVersionId(output);
    if (action.upload === "first-deploy") createdRoles.push(role);
  };
  for (const role of ["statePlane", "connectorPlane", "runtimeHost"]) {
    uploadRole(role);
  }

  const selectedRuntimeHostVersion = await fetchVersion({
    role: "runtimeHost",
    versionId: versionIds.runtimeHost,
  });
  const selectedRuntimeHostNamespaceIds =
    extractAliceBootstrapRoleNamespaceIds(
      "runtimeHost",
      selectedRuntimeHostVersion,
    );
  if (await fetchActiveVersionId("runtimeHost") !== versionIds.runtimeHost) {
    invalid();
  }
  const runtimeHostBoundary = await verifyRuntimeHostBoundary({
    versionId: versionIds.runtimeHost,
    version: selectedRuntimeHostVersion,
    namespaceIds: selectedRuntimeHostNamespaceIds,
  });
  if (
    !runtimeHostBoundary ||
    typeof runtimeHostBoundary !== "object" ||
    Array.isArray(runtimeHostBoundary)
  ) {
    invalid();
  }
  uploadRole("access");

  const versions = { aiGateway: null };
  for (const role of BOOTSTRAP_IDENTITY_ROLES) {
    versions[role] = await fetchVersion({
      role,
      versionId: versionIds[role],
    });
  }
  const namespaceIds = extractAliceBootstrapSelectedNamespaceIds({
    versionIds,
    versions,
  });

  for (const role of BOOTSTRAP_IDENTITY_ROLES) {
    if (!identityActions[role].promote) continue;
    runCommand(
      wranglerBin,
      buildAliceBootstrapPromotionCommand({
        versionId: versionIds[role],
        configPath: bootstrapIdentityConfigs[role].configPath,
      }),
      {
        cwd: sourceRoot,
        env: commandEnv,
        errorCode: `ALICE_CLOUDFLARE_${role.toUpperCase()}_BOOTSTRAP_PROMOTION_FAILED`,
      },
    );
    const deployedVersionId = await fetchActiveVersionId(role);
    if (deployedVersionId !== versionIds[role]) invalid();
  }

  if (identityActions.access.upload === "inactive") {
    verifyAliceBootstrapInactiveAccessBoundary({
      previousActiveVersionId: previousAccessVersionId,
      currentActiveVersionId: await fetchActiveVersionId("access"),
      trafficBefore,
      trafficAfter: await fetchTraffic(),
    });
  }
  return {
    createdRoles,
    namespaceIds,
    runtimeHostBoundary,
    versionIds,
    versions,
  };
}

async function ensureConsumer({ fetchImpl, apiToken, queue }) {
  const pathName =
    `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/queues/${queue.queue_id}/consumers`;
  let consumers = await apiGetAllResults({
    fetchImpl,
    apiToken,
    operation: "LIST_QUEUE_CONSUMERS",
    pathname: pathName,
  });
  let created = false;
  if (consumers.length === 0) {
    await api({
      fetchImpl,
      apiToken,
      method: "POST",
      operation: "CREATE_QUEUE_CONSUMER",
      pathname: pathName,
      body: {
        type: "worker",
        script_name: ALICE_CLOUDFLARE_TARGET.controlWorker,
        dead_letter_queue: ALICE_CLOUDFLARE_TARGET.evidenceDlq,
        settings: {
          batch_size: 10,
          max_concurrency: 1,
          max_retries: 3,
          max_wait_time_ms: 5_000,
          retry_delay: 10,
        },
      },
    });
    created = true;
    consumers = await apiGetAllResults({
      fetchImpl,
      apiToken,
      operation: "LIST_QUEUE_CONSUMERS",
      pathname: pathName,
    });
  }
  if (consumers.length !== 1) invalid();
  const consumer = consumers[0];
  verifyAliceBootstrapQueueConsumer(consumer);
  return { consumer, created };
}

export function verifyAliceBootstrapQueueConsumer(consumer) {
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
    !RESOURCE_ID.test(consumer?.consumer_id ?? "") ||
    consumer?.queue_name !== ALICE_CLOUDFLARE_TARGET.evidenceQueue ||
    scriptName !== ALICE_CLOUDFLARE_TARGET.controlWorker ||
    consumer?.type !== "worker" ||
    consumer?.dead_letter_queue !== ALICE_CLOUDFLARE_TARGET.evidenceDlq ||
    consumer?.settings?.batch_size !== 10 ||
    consumer?.settings?.max_concurrency !== 1 ||
    consumer?.settings?.max_retries !== 3 ||
    consumer?.settings?.max_wait_time_ms !== 5_000 ||
    consumer?.settings?.retry_delay !== 10
  ) {
    invalid();
  }
  return consumer;
}

async function fetchAliceActiveWorkerVersionId({ fetchImpl, apiToken, role }) {
  if (!BOOTSTRAP_IDENTITY_ROLES.includes(role)) invalid();
  const deployments = await api({
    fetchImpl,
    apiToken,
    method: "GET",
    operation: `GET_${role.replace(/([A-Z])/g, "_$1").toUpperCase()}_DEPLOYMENTS`,
    pathname:
      `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/workers/scripts/${ROLE_WORKERS[role]}/deployments`,
  });
  if (deployments === null) return null;
  if (!Array.isArray(deployments?.deployments)) invalid();
  if (deployments.deployments.length === 0) return null;
  const active = deployments.deployments[0];
  if (
    !Array.isArray(active?.versions) ||
    active.versions.length !== 1 ||
    active.versions[0]?.percentage !== 100 ||
    !VERSION_ID.test(active.versions[0]?.version_id ?? "")
  ) {
    invalid();
  }
  return active.versions[0].version_id;
}

export async function fetchAliceActiveControlVersionId(options) {
  return fetchAliceActiveWorkerVersionId({ ...options, role: "control" });
}

export function verifyAliceBootstrapReentryBoundary({
  activeVersionId,
  expectedVersionId,
  version,
}) {
  const versionTag = version?.annotations?.["workers/tag"];
  if (
    !VERSION_ID.test(activeVersionId ?? "") ||
    activeVersionId !== expectedVersionId ||
    version?.id !== expectedVersionId ||
    typeof versionTag !== "string" ||
    (!BOOTSTRAP_VERSION_TAG.test(versionTag) &&
      !RECOVERY_VERSION_TAG.test(versionTag))
  ) {
    invalid();
  }
  return {
    versionId: expectedVersionId,
    namespaceIds: {
      access: [],
      runtimeHost: [],
      control: extractAliceBootstrapRoleNamespaceIds("control", version),
      aiGateway: [],
      statePlane: [],
      connectorPlane: [],
    },
  };
}

function writeReadonly(filePath, value) {
  if (!absolute(filePath) || !fs.existsSync(path.dirname(filePath))) invalid();
  fs.writeFileSync(filePath, `${canonicalAliceJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

async function main() {
  const sourceRoot = process.env.ALICE_SOURCE_ROOT;
  const artifactRoot = process.env.ALICE_WORKER_BUNDLE_ROOT;
  const artifactPath = process.env.ALICE_WORKER_BUNDLE_ARTIFACT_PATH;
  const wranglerBin = process.env.ALICE_WRANGLER_BIN;
  const outputDir = process.env.ALICE_BOOTSTRAP_OUTPUT_DIR;
  const namespaceIdsPath = process.env.ALICE_EXPECTED_DO_NAMESPACE_IDS_PATH;
  const continuityReadbackPath =
    process.env.ALICE_CLOUDFLARE_CONTINUITY_READBACK_PATH;
  const bootstrapPreflightPath =
    process.env.ALICE_BOOTSTRAP_PREFLIGHT_PATH;
  const bootstrapStatePath = process.env.ALICE_BOOTSTRAP_STATE_PATH;
  const sourceCommit = process.env.ALICE_SOURCE_COMMIT;
  const releaseRunId = process.env.ALICE_RELEASE_RUN_ID;
  const runtimeImage = process.env.ALICE_CLOUDFLARE_RUNTIME_IMAGE;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (
    ![sourceRoot, artifactRoot, artifactPath, wranglerBin, outputDir,
      namespaceIdsPath, continuityReadbackPath, bootstrapStatePath].every(absolute) ||
    !absolute(bootstrapPreflightPath) ||
    !COMMIT.test(sourceCommit ?? "") ||
    !RELEASE_RUN_ID.test(releaseRunId ?? "") ||
    !RUNTIME_IMAGE.test(runtimeImage ?? "") ||
    typeof apiToken !== "string" ||
    apiToken.length < 16 ||
    fs.existsSync(outputDir)
  ) {
    invalid();
  }
  verifyAliceWorkerBundleArtifact(fs.readFileSync(artifactPath, "utf8"), {
    root: artifactRoot,
    expectedSourceCommit: sourceCommit,
  });
  fs.mkdirSync(outputDir, { recursive: false, mode: 0o700 });
  const controlConfigPath = path.join(outputDir, "control.bootstrap.wrangler.json");
  const controlMain = path.join(
    artifactRoot,
    CONTROL_DIRECTORY,
    "index.js",
  );
  const sourceConfig = JSON.parse(
    fs.readFileSync(
      path.join(sourceRoot, "workers", CONTROL_DIRECTORY, "wrangler.jsonc"),
      "utf8",
    ),
  );
  const bootstrapConfig = buildAliceBootstrapControlConfig({
    sourceConfig,
    deploymentMainPath: controlMain,
  });
  fs.writeFileSync(controlConfigPath, `${JSON.stringify(bootstrapConfig)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
  const bootstrapIdentityConfigs = {
    control: {
      configPath: controlConfigPath,
      deploymentMainPath: controlMain,
    },
  };
  let runtimeHostBootstrapConfig;
  const sourceWorkerDirectories = {
    access: "alice-access-gateway",
    runtimeHost: "alice-access-gateway",
    statePlane: ROLE_WORKERS.statePlane,
    connectorPlane: ROLE_WORKERS.connectorPlane,
  };
  const sourceConfigNames = {
    access: "wrangler.jsonc",
    runtimeHost: "wrangler.runtime-host.jsonc",
    statePlane: "wrangler.jsonc",
    connectorPlane: "wrangler.jsonc",
  };
  for (const role of ["statePlane", "connectorPlane", "runtimeHost", "access"]) {
    const workerName = ROLE_WORKERS[role];
    const deploymentMainPath = path.join(artifactRoot, workerName, "index.js");
    const configPathForRole = path.join(
      outputDir,
      `${role}.bootstrap.wrangler.json`,
    );
    const roleSourceConfig = JSON.parse(
      fs.readFileSync(
        path.join(
          sourceRoot,
          "workers",
          sourceWorkerDirectories[role],
          sourceConfigNames[role],
        ),
        "utf8",
      ),
    );
    const roleBootstrapConfig = buildAliceBootstrapPrivateWorkerConfig({
      role,
      sourceConfig: roleSourceConfig,
      deploymentMainPath,
      ...(role === "runtimeHost" ? { runtimeImage } : {}),
    });
    if (role === "runtimeHost") {
      runtimeHostBootstrapConfig = roleBootstrapConfig;
    }
    fs.writeFileSync(
      configPathForRole,
      `${JSON.stringify(roleBootstrapConfig)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o444 },
    );
    bootstrapIdentityConfigs[role] = {
      configPath: configPathForRole,
      deploymentMainPath,
    };
  }
  const deployCredentialIdSha256 = await verifyAliceBootstrapDeployToken({
    fetchImpl: globalThis.fetch,
    apiToken,
  });
  const preflightFirst = await fetchAliceBootstrapResourceSnapshot({
    fetchImpl: globalThis.fetch,
    apiToken,
    deployCredentialIdSha256,
  });
  const preflightSecond = await fetchAliceBootstrapResourceSnapshot({
    fetchImpl: globalThis.fetch,
    apiToken,
    deployCredentialIdSha256,
  });
  if (canonicalAliceJson(preflightFirst) !== canonicalAliceJson(preflightSecond)) {
    invalid("ALICE_CLOUDFLARE_BOOTSTRAP_PREFLIGHT_DRIFT");
  }
  writeReadonly(bootstrapPreflightPath, preflightSecond);
  const priorVersionIds = {};
  for (const role of BOOTSTRAP_IDENTITY_ROLES) {
    priorVersionIds[role] = await fetchAliceActiveWorkerVersionId({
      fetchImpl: globalThis.fetch,
      apiToken,
      role,
    });
  }
  const activeVersions = {};
  for (const role of BOOTSTRAP_IDENTITY_ROLES) {
    activeVersions[role] = priorVersionIds[role] === null
      ? null
      : await api({
          fetchImpl: globalThis.fetch,
          apiToken,
          method: "GET",
          operation:
            `GET_ACTIVE_${role.replace(/([A-Z])/g, "_$1").toUpperCase()}_VERSION`,
          pathname:
            `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/workers/scripts/${ROLE_WORKERS[role]}/versions/${priorVersionIds[role]}`,
        });
  }
  const identityActions = planAliceBootstrapIdentityActions({
    activeVersionIds: priorVersionIds,
    activeVersions,
  });
  const priorVersionId = priorVersionIds.control;
  verifyProtectedRefStillExact({ sourceRoot, sourceCommit });
  let versionIds = { ...priorVersionIds };
  let versionId = versionIds.control;
  let mode = "release";
  let queue;
  const createdByRun = {
    accessWorker: false,
    runtimeHostWorker: false,
    statePlaneWorker: false,
    connectorPlaneWorker: false,
    controlWorker: false,
    evidenceQueue: false,
    evidenceDeadLetterQueue: false,
    evidenceBucket: false,
    evidenceSentinel: false,
    evidenceQueueConsumer: false,
  };
  if (identityActions.control.upload === "first-deploy") {
    mode = "bootstrap";
    const evidenceQueue = await ensureAliceBootstrapQueue({
      fetchImpl: globalThis.fetch,
      apiToken,
      name: ALICE_CLOUDFLARE_TARGET.evidenceQueue,
    });
    queue = evidenceQueue.queue;
    createdByRun.evidenceQueue = evidenceQueue.created;
    const deadLetterQueue = await ensureAliceBootstrapQueue({
      fetchImpl: globalThis.fetch,
      apiToken,
      name: ALICE_CLOUDFLARE_TARGET.evidenceDlq,
    });
    createdByRun.evidenceDeadLetterQueue = deadLetterQueue.created;
    const evidenceStore = await ensureBucketAndSentinel({
      fetchImpl: globalThis.fetch,
      apiToken,
    });
    createdByRun.evidenceBucket = evidenceStore.bucketCreated;
    createdByRun.evidenceSentinel = evidenceStore.sentinelCreated;
    const output = run(
      wranglerBin,
      buildAliceBootstrapCreationCommand({
        controlMain,
        configPath: controlConfigPath,
        sourceCommit,
        releaseRunId,
      }),
      {
        cwd: sourceRoot,
        env: aliceCloudflareCommandEnv(),
        errorCode: "ALICE_CLOUDFLARE_BOOTSTRAP_UPLOAD_FAILED",
      },
    );
    versionId = parseAliceWranglerDeployVersionId(output);
    versionIds.control = versionId;
    createdByRun.controlWorker = true;
  }
  const identityExecution = await executeAliceBootstrapIdentityActions({
    identityActions,
    versionIds,
    bootstrapIdentityConfigs,
    wranglerBin,
    sourceRoot,
    sourceCommit,
    releaseRunId,
    commandEnv: aliceCloudflareCommandEnv(),
    fetchVersion: async ({ role, versionId: selectedVersionId }) =>
      api({
        fetchImpl: globalThis.fetch,
        apiToken,
        method: "GET",
        operation:
          `GET_${role.replace(/([A-Z])/g, "_$1").toUpperCase()}_VERSION`,
        pathname:
          `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/workers/scripts/${ROLE_WORKERS[role]}/versions/${selectedVersionId}`,
      }),
    fetchActiveVersionId: async (role) =>
      fetchAliceActiveWorkerVersionId({
        fetchImpl: globalThis.fetch,
        apiToken,
        role,
      }),
    verifyRuntimeHostBoundary: async ({ namespaceIds: runtimeHostNamespaces }) => {
      const containerState = await fetchAliceRuntimeHostContainerState({
        fetchImpl: globalThis.fetch,
        apiToken,
      });
      return verifyAliceContainerApplicationReadback({
        application: containerState.application,
        applicationInstances: containerState.applicationInstances,
        materializedWranglerConfig: runtimeHostBootstrapConfig,
        expectedNamespaceId: runtimeHostNamespaces[0]?.namespaceId,
      });
    },
    fetchTraffic: async () =>
      (await fetchAliceBootstrapResourceSnapshot({
        fetchImpl: globalThis.fetch,
        apiToken,
        deployCredentialIdSha256,
      })).traffic,
    trafficBefore: preflightSecond.traffic,
  });
  versionIds = identityExecution.versionIds;
  versionId = versionIds.control;
  for (const role of identityExecution.createdRoles) {
    createdByRun[`${role}Worker`] = true;
  }
  const { namespaceIds, runtimeHostBoundary, versions } = identityExecution;
  const version = versions.control;
  const versionTag = version?.annotations?.["workers/tag"];
  if (priorVersionId !== null) {
    mode =
      typeof versionTag === "string" &&
      (versionTag.startsWith("alice-continuity-bootstrap-") ||
        versionTag.startsWith("alice-recovery-boundary-"))
        ? "bootstrap"
        : "release";
  }
  if (mode === "bootstrap") {
    if (queue === undefined) {
      const evidenceQueue = await ensureAliceBootstrapQueue({
        fetchImpl: globalThis.fetch,
        apiToken,
        name: ALICE_CLOUDFLARE_TARGET.evidenceQueue,
      });
      queue = evidenceQueue.queue;
      createdByRun.evidenceQueue = evidenceQueue.created;
      const deadLetterQueue = await ensureAliceBootstrapQueue({
        fetchImpl: globalThis.fetch,
        apiToken,
        name: ALICE_CLOUDFLARE_TARGET.evidenceDlq,
      });
      createdByRun.evidenceDeadLetterQueue = deadLetterQueue.created;
      const evidenceStore = await ensureBucketAndSentinel({
        fetchImpl: globalThis.fetch,
        apiToken,
      });
      createdByRun.evidenceBucket = evidenceStore.bucketCreated;
      createdByRun.evidenceSentinel = evidenceStore.sentinelCreated;
    }
    verifyAliceBootstrapReentryBoundary({
      activeVersionId: await fetchAliceActiveControlVersionId({
        fetchImpl: globalThis.fetch,
        apiToken,
      }),
      expectedVersionId: versionId,
      version,
    });
    const consumer = await ensureConsumer({
      fetchImpl: globalThis.fetch,
      apiToken,
      queue,
    });
    createdByRun.evidenceQueueConsumer = consumer.created;
  }
  const continuityState = await fetchAliceCloudflareContinuityState({
    apiToken,
    expectedDurableObjectNamespaceIds: namespaceIds,
  });
  writeReadonly(namespaceIdsPath, namespaceIds);
  writeReadonly(continuityReadbackPath, continuityState.readback);
  writeReadonly(bootstrapStatePath, verifyAliceBootstrapState({
    schemaVersion: "alice.cloudflare-bootstrap-state.v2",
    mode,
    activeVersionId: versionId,
    preexisting: {
      accessWorker:
        preflightSecond.workers[ROLE_WORKERS.access]?.present === true,
      runtimeHostWorker:
        preflightSecond.workers[ROLE_WORKERS.runtimeHost]?.present === true,
      statePlaneWorker:
        preflightSecond.workers[ROLE_WORKERS.statePlane]?.present === true,
      connectorPlaneWorker:
        preflightSecond.workers[ROLE_WORKERS.connectorPlane]?.present === true,
      evidenceQueue: preflightSecond.queues.evidence !== null,
      evidenceDeadLetterQueue: preflightSecond.queues.deadLetter !== null,
      evidenceBucket: preflightSecond.bucket !== null,
      evidenceSentinel: preflightSecond.sentinelObjects.length === 1,
      evidenceQueueConsumer: preflightSecond.consumers.evidence.length > 0,
    },
    createdByRun,
  }));
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      controlConfigPath,
      namespaceIdsPath,
      continuityReadbackPath,
      bootstrapVersionId: versionId,
      runtimeHostVersionId: versionIds.runtimeHost,
      runtimeHostNamespaceId: namespaceIds.runtimeHost[0]?.namespaceId,
      runtimeHostContainerApplication: runtimeHostBoundary,
      bootstrapStatePath,
      mode,
      publicHttpTrafficChanged: false,
      queueConsumerAttached: true,
      queueDeliveryPaused: true,
    })}\n`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
