import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ALICE_CLOUDFLARE_TARGET,
  canonicalAliceJson,
} from "../../workers/alice-effective-config.js";
import {
  aliceEffectiveConfigFromWrangler,
} from "./alice_cloudflare_config.mjs";
import {
  buildAliceAccessPolicyProviderConfig,
  buildAliceAiGatewayProviderConfig,
  buildAliceVectorizeProviderConfig,
} from "./alice_cloudflare_provider_config.mjs";
import {
  ALICE_CONTINUITY_SENTINEL_KEY,
  aliceCloudflareContinuitySentinelBytes,
  buildAliceCloudflareContinuityConfig,
} from "./alice_cloudflare_continuity.mjs";
import {
  readAliceWorkerMainModule,
  verifyAliceProviderControlFingerprints,
  verifyAliceWorkerProviderReadback,
} from "./alice_cloudflare_provider_readback.mjs";

const API_BASE = "https://api.cloudflare.com/client/v4";
const ZONE_ID = "7b24984479ee4cddb6c5d8a9b7a0f2c6";
const ROLES = [
  "access",
  "control",
  "aiGateway",
  "statePlane",
  "connectorPlane",
  "runtimeHost",
];
const RUNTIME_HOST_WORKER =
  ALICE_CLOUDFLARE_TARGET.runtimeHostWorker ?? "alice-runtime-container-host";
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function readbackInvalid() {
  throw new Error("ALICE_CLOUDFLARE_LIVE_READBACK_INVALID");
}

function validInputs({ apiToken, accountId, zoneId, baseUrl, fetchImpl }) {
  try {
    const url = new URL(baseUrl);
    return (
      typeof apiToken === "string" &&
      apiToken.length >= 8 &&
      !/[\r\n]/.test(apiToken) &&
      accountId === ALICE_CLOUDFLARE_TARGET.accountId &&
      zoneId === ZONE_ID &&
      url.protocol === "https:" &&
      typeof fetchImpl === "function"
    );
  } catch {
    return false;
  }
}

async function apiGetJson({ fetchImpl, apiToken, baseUrl }, pathname, search = {}) {
  const url = new URL(`${baseUrl}${pathname}`);
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiToken}`,
      accept: "application/json",
      "cache-control": "no-cache",
    },
  });
  if (!(response instanceof Response) || !response.ok) readbackInvalid();
  let body;
  try {
    body = await response.json();
  } catch {
    readbackInvalid();
  }
  if (body?.success !== true) readbackInvalid();
  return body;
}

function result(body) {
  if (!("result" in (body ?? {}))) readbackInvalid();
  return body.result;
}

async function apiGetAllResults(client, pathname, search = {}) {
  const values = [];
  let expectedTotalPages;
  let expectedTotalCount;
  for (let page = 1; page <= 100; page += 1) {
    const body = await apiGetJson(client, pathname, {
      ...search,
      page,
      per_page: 100,
    });
    const pageValues = result(body);
    if (!Array.isArray(pageValues)) readbackInvalid();
    values.push(...pageValues);

    if (body.result_info === undefined) {
      if (pageValues.length >= 100) readbackInvalid();
      return values;
    }
    const info = body.result_info;
    const totalPages =
      info?.total_pages === undefined &&
        Number.isSafeInteger(info?.total_count) &&
        Number.isSafeInteger(info?.per_page) &&
        info.per_page > 0
        ? Math.ceil(info.total_count / info.per_page)
        : info?.total_pages;
    const empty =
      page === 1 &&
      pageValues.length === 0 &&
      (info?.page === 0 || info?.page === page) &&
      totalPages === 0 &&
      info?.total_count === 0 &&
      info?.count === 0 &&
      info?.per_page === 100;
    if (
      !info ||
      typeof info !== "object" ||
      !Number.isSafeInteger(info.page) ||
      !Number.isSafeInteger(totalPages) ||
      !Number.isSafeInteger(info.per_page) ||
      !Number.isSafeInteger(info.count) ||
      !Number.isSafeInteger(info.total_count) ||
      (!empty && info.page !== page) ||
      totalPages < 0 ||
      totalPages > 100 ||
      info.per_page !== 100 ||
      info.count !== pageValues.length ||
      info.total_count < 0 ||
      info.total_count > 10_000 ||
      totalPages !== Math.ceil(info.total_count / info.per_page) ||
      (expectedTotalPages !== undefined &&
        totalPages !== expectedTotalPages) ||
      (expectedTotalCount !== undefined &&
        info.total_count !== expectedTotalCount)
    ) {
      readbackInvalid();
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
      readbackInvalid();
    }
    expectedTotalPages = totalPages;
    expectedTotalCount = info.total_count;
    if (page === expectedTotalPages) return values;
    if (page > expectedTotalPages) readbackInvalid();
  }
  readbackInvalid();
}

function exactOne(values, predicate) {
  if (!Array.isArray(values)) readbackInvalid();
  const matches = values.filter(predicate);
  if (matches.length !== 1) readbackInvalid();
  return matches[0];
}

function routeCanMatchHostname(pattern, hostname) {
  if (typeof pattern !== "string" || typeof hostname !== "string") {
    readbackInvalid();
  }
  const withoutProtocol = pattern.replace(/^https?:\/\//i, "");
  const hostPattern = withoutProtocol.split("/", 1)[0].toLowerCase();
  if (hostPattern.length === 0 || /[^a-z0-9.*_-]/.test(hostPattern)) {
    readbackInvalid();
  }
  const expression = hostPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${expression}$`, "i").test(hostname);
}

function normalizedRoutes(routes) {
  if (!Array.isArray(routes)) readbackInvalid();
  return routes
    .map((route) => ({ pattern: route?.pattern, script: route?.script }))
    .sort((left, right) =>
      canonicalAliceJson(left).localeCompare(canonicalAliceJson(right)),
    );
}

function canonicalEqual(left, right) {
  return canonicalAliceJson(left) === canonicalAliceJson(right);
}

function expectedWorkerName(role) {
  const target = {
    access: ALICE_CLOUDFLARE_TARGET.accessWorker,
    control: ALICE_CLOUDFLARE_TARGET.controlWorker,
    aiGateway: ALICE_CLOUDFLARE_TARGET.aiGatewayWorker,
    statePlane: ALICE_CLOUDFLARE_TARGET.statePlaneWorker,
    connectorPlane: ALICE_CLOUDFLARE_TARGET.connectorPlaneWorker,
    runtimeHost: RUNTIME_HOST_WORKER,
  }[role];
  if (typeof target !== "string" || target.length === 0) readbackInvalid();
  return target;
}

export async function fetchAliceRuntimeHostContainerState({
  fetchImpl = globalThis.fetch,
  apiToken,
  accountId = ALICE_CLOUDFLARE_TARGET.accountId,
  baseUrl = API_BASE,
}) {
  if (!validInputs({
    apiToken,
    accountId,
    zoneId: ZONE_ID,
    baseUrl,
    fetchImpl,
  })) {
    readbackInvalid();
  }
  try {
    const client = { fetchImpl, apiToken, baseUrl };
    const applications = result(await apiGetJson(
      client,
      `/accounts/${accountId}/containers/applications`,
      { name: "alice-production-runtime" },
    ));
    const application = exactOne(
      applications,
      (candidate) => candidate?.name === "alice-production-runtime",
    );
    const detailed = result(await apiGetJson(
      client,
      `/accounts/${accountId}/containers/applications/${application.id}`,
    ));
    if (!canonicalEqual(application, detailed)) readbackInvalid();
    const instancePage = result(await apiGetJson(
      client,
      `/accounts/${accountId}/containers/dash/applications/${application.id}/instances`,
      { per_page: 100 },
    ));
    const instances = instancePage?.instances;
    const durableObjects = instancePage?.durable_objects ?? [];
    if (
      !Array.isArray(instances) ||
      !Array.isArray(durableObjects) ||
      instances.length !== 0 ||
      durableObjects.length !== 0
    ) {
      readbackInvalid();
    }
    return { application: detailed, applicationInstances: instances };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_CLOUDFLARE_LIVE_READBACK_INVALID"
    ) {
      throw error;
    }
    readbackInvalid();
  }
}

async function readExactResponseBytes(response, expectedText) {
  const expected = Buffer.from(expectedText, "utf8");
  const reader = response.body?.getReader();
  if (!reader) readbackInvalid();
  const actual = Buffer.alloc(expected.length);
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!(value instanceof Uint8Array) || offset + value.byteLength > actual.length) {
      await reader.cancel().catch(() => undefined);
      readbackInvalid();
    }
    Buffer.from(value).copy(actual, offset);
    offset += value.byteLength;
  }
  if (offset !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    readbackInvalid();
  }
  return `sha256:${crypto.createHash("sha256").update(actual).digest("hex")}`;
}

function redactIdentityProviders(identityProviders) {
  if (!Array.isArray(identityProviders)) readbackInvalid();
  return identityProviders.map((identityProvider) => {
    if (identityProvider?.type !== "google-apps") return identityProvider;
    if (
      !identityProvider.config ||
      typeof identityProvider.config !== "object" ||
      !("client_secret" in identityProvider.config)
    ) {
      readbackInvalid();
    }
    return {
      ...identityProvider,
      config: {
        ...identityProvider.config,
        client_secret: "[REDACTED]",
      },
    };
  });
}

export async function fetchAliceCloudflareProviderState({
  fetchImpl = globalThis.fetch,
  apiToken,
  ownerEmailSha256,
  accessAudience,
  releaseAccessAudience,
  releaseServiceTokenIdSha256,
  accountId = ALICE_CLOUDFLARE_TARGET.accountId,
  zoneId = ZONE_ID,
  baseUrl = API_BASE,
  now = Date.now,
}) {
  if (!validInputs({ apiToken, accountId, zoneId, baseUrl, fetchImpl })) {
    readbackInvalid();
  }
  try {
    const client = { fetchImpl, apiToken, baseUrl };
    const observedAtMs = now();
    if (!Number.isSafeInteger(observedAtMs) || observedAtMs <= 0) {
      readbackInvalid();
    }
    const zoneApplications = await apiGetAllResults(
      client,
      `/zones/${zoneId}/access/apps`,
    );
    const accountApplications = await apiGetAllResults(
      client,
      `/accounts/${accountId}/access/apps`,
    );
    const listedApplication = exactOne(
      zoneApplications,
      (application) => application?.domain === ALICE_CLOUDFLARE_TARGET.accessDomain,
    );
    const application = result(
      await apiGetJson(
        client,
        `/zones/${zoneId}/access/apps/${listedApplication.id}`,
      ),
    );
    if (
      application?.id !== listedApplication.id ||
      application?.domain !== ALICE_CLOUDFLARE_TARGET.accessDomain
    ) {
      readbackInvalid();
    }
    const policies = await apiGetAllResults(
      client,
      `/zones/${zoneId}/access/apps/${application.id}/policies`,
    );
    const listedDeploymentApplication = exactOne(
      zoneApplications,
      (candidate) =>
        candidate?.domain ===
        `${ALICE_CLOUDFLARE_TARGET.releaseControlDomain}/control/internal/v1/deployment/*`,
    );
    const deploymentApplication = result(
      await apiGetJson(
        client,
        `/zones/${zoneId}/access/apps/${listedDeploymentApplication.id}`,
      ),
    );
    if (
      deploymentApplication?.id !== listedDeploymentApplication.id ||
      deploymentApplication?.domain !==
        `${ALICE_CLOUDFLARE_TARGET.releaseControlDomain}/control/internal/v1/deployment/*`
    ) {
      readbackInvalid();
    }
    const deploymentPolicies = await apiGetAllResults(
      client,
      `/zones/${zoneId}/access/apps/${deploymentApplication.id}/policies`,
    );
    const identityProviders = redactIdentityProviders(
      await apiGetAllResults(
        client,
        `/accounts/${accountId}/access/identity_providers`,
      ),
    );
    const postureRules = await apiGetAllResults(
      client,
      `/accounts/${accountId}/devices/posture`,
    );
    const serviceTokens = (
      await apiGetAllResults(
        client,
        `/accounts/${accountId}/access/service_tokens`,
      )
    ).map((token) => ({
      ...token,
      enabled:
        token?.enabled !== false &&
        Number.isFinite(Date.parse(token?.expires_at ?? "")) &&
        Date.parse(token.expires_at) > observedAtMs,
    }));
    const gateway = result(
      await apiGetJson(
        client,
        `/accounts/${accountId}/ai-gateway/gateways/${ALICE_CLOUDFLARE_TARGET.aiGateway}`,
      ),
    );
    const dynamicRoutes = await apiGetJson(
      client,
      `/accounts/${accountId}/ai-gateway/gateways/${ALICE_CLOUDFLARE_TARGET.aiGateway}/routes`,
      { page: 1, per_page: 100 },
    );
    const vectorizeProviderReadback = result(
      await apiGetJson(
        client,
        `/accounts/${accountId}/vectorize/v2/indexes/${ALICE_CLOUDFLARE_TARGET.memoryIndex}`,
      ),
    );
    const accessPolicyReadback = {
      application,
      deploymentApplication,
      accountApplications,
      zoneApplications,
      policies,
      deploymentPolicies,
      serviceTokens,
      identityProviders,
      postureRules,
      ownerEmailSha256,
      accessAudience,
      releaseAccessAudience,
      releaseServiceTokenIdSha256,
      observedAt: new Date(observedAtMs).toISOString(),
    };
    const aiGatewayProviderReadback = {
      ...gateway,
      dynamic_routes: dynamicRoutes,
    };
    const accessPolicyConfig =
      await buildAliceAccessPolicyProviderConfig(accessPolicyReadback);
    const aiGatewayProviderConfig =
      buildAliceAiGatewayProviderConfig(aiGatewayProviderReadback);
    const vectorizeProviderConfig =
      buildAliceVectorizeProviderConfig(vectorizeProviderReadback);
    return {
      accessPolicyReadback,
      aiGatewayProviderReadback,
      vectorizeProviderReadback,
      sanitized: {
        accessPolicyConfig,
        aiGatewayProviderConfig,
        vectorizeProviderConfig,
      },
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_CLOUDFLARE_LIVE_READBACK_INVALID"
    ) {
      throw error;
    }
    readbackInvalid();
  }
}

export async function fetchAliceCloudflareContinuityState({
  fetchImpl = globalThis.fetch,
  apiToken,
  expectedDurableObjectNamespaceIds,
  accountId = ALICE_CLOUDFLARE_TARGET.accountId,
  zoneId = ZONE_ID,
  baseUrl = API_BASE,
}) {
  if (
    !validInputs({ apiToken, accountId, zoneId, baseUrl, fetchImpl }) ||
    !expectedDurableObjectNamespaceIds
  ) {
    readbackInvalid();
  }
  try {
    const client = { fetchImpl, apiToken, baseUrl };
    const queues = await apiGetAllResults(
      client,
      `/accounts/${accountId}/queues`,
    );
    const queue = exactOne(
      queues,
      (candidate) =>
        candidate?.queue_name === ALICE_CLOUDFLARE_TARGET.evidenceQueue,
    );
    const deadLetterQueue = exactOne(
      queues,
      (candidate) =>
        candidate?.queue_name === ALICE_CLOUDFLARE_TARGET.evidenceDlq,
    );
    const queueConsumers = await apiGetAllResults(
      client,
      `/accounts/${accountId}/queues/${queue.queue_id}/consumers`,
    );
    const deadLetterQueueConsumers = await apiGetAllResults(
      client,
      `/accounts/${accountId}/queues/${deadLetterQueue.queue_id}/consumers`,
    );
    const eventSubscriptions = await apiGetAllResults(
      client,
      `/accounts/${accountId}/event_subscriptions/subscriptions`,
    );
    const workflow = result(
      await apiGetJson(
        client,
        `/accounts/${accountId}/workflows/${ALICE_CLOUDFLARE_TARGET.planWorkflow}`,
      ),
    );
    const bucket = result(
      await apiGetJson(
        client,
        `/accounts/${accountId}/r2/buckets/${ALICE_CLOUDFLARE_TARGET.evidenceBucket}`,
      ),
    );
    const sentinelObjectsBody = await apiGetJson(
      client,
      `/accounts/${accountId}/r2/buckets/${ALICE_CLOUDFLARE_TARGET.evidenceBucket}/objects`,
      { prefix: ALICE_CONTINUITY_SENTINEL_KEY, per_page: 2 },
    );
    const sentinelObjects = result(sentinelObjectsBody);
    if (
      !Array.isArray(sentinelObjects) ||
      sentinelObjects.length !== 1 ||
      sentinelObjectsBody.result_info?.is_truncated === true
    ) {
      readbackInvalid();
    }
    const sentinelObject = sentinelObjects[0];
    const sentinelResponse = await apiGetResponse(
      client,
      `/accounts/${accountId}/r2/buckets/${ALICE_CLOUDFLARE_TARGET.evidenceBucket}/objects/${ALICE_CONTINUITY_SENTINEL_KEY}`,
    );
    const sentinelContentSha256 = await readExactResponseBytes(
      sentinelResponse,
      aliceCloudflareContinuitySentinelBytes(),
    );
    const readback = {
      accountId,
      queue,
      deadLetterQueue,
      queueConsumers,
      deadLetterQueueConsumers,
      eventSubscriptions,
      workflow,
      bucket,
      sentinel: {
        key: sentinelObject?.key,
        etag: sentinelObject?.etag,
        size: sentinelObject?.size,
        uploaded: sentinelObject?.last_modified,
        storage_class: sentinelObject?.storage_class,
        content_type: sentinelObject?.http_metadata?.contentType,
        cache_control: sentinelObject?.http_metadata?.cacheControl,
        content_sha256: sentinelContentSha256,
      },
      durableObjectNamespaceIds: expectedDurableObjectNamespaceIds,
    };
    return {
      readback,
      sanitized: buildAliceCloudflareContinuityConfig(readback),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_CLOUDFLARE_LIVE_READBACK_INVALID"
    ) {
      throw error;
    }
    readbackInvalid();
  }
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function workflowVersionIdentity(value, expectedWorkflowId) {
  const retention = value?.default_retention;
  const normalizedRetention = retention === undefined
    ? null
    : {
        errorMs: retention?.error_retention ?? null,
        successMs: retention?.success_retention ?? null,
      };
  const validRetention =
    normalizedRetention === null ||
    [normalizedRetention.errorMs, normalizedRetention.successMs].every(
      (duration) =>
        duration === null ||
        (Number.isSafeInteger(duration) && duration >= 0),
    );
  if (
    !UUID.test(value?.id ?? "") ||
    value?.class_name !== "AlicePlanWorkflow" ||
    !canonicalIsoTimestamp(value?.created_on) ||
    !canonicalIsoTimestamp(value?.modified_on) ||
    Date.parse(value.modified_on) < Date.parse(value.created_on) ||
    value?.workflow_id !== expectedWorkflowId ||
    !UUID.test(value?.workflow_id ?? "") ||
    typeof value?.has_dag !== "boolean" ||
    value?.language !== "javascript" ||
    value?.limits?.steps !== 16 ||
    !validRetention
  ) {
    readbackInvalid();
  }
  return {
    id: value.id,
    className: value.class_name,
    createdOn: value.created_on,
    modifiedOn: value.modified_on,
    workflowId: value.workflow_id,
    hasDag: value.has_dag,
    language: value.language,
    defaultRetention: normalizedRetention,
    limits: { steps: value.limits.steps },
  };
}

export function verifyAliceCloudflareWorkflowVersionSnapshot(
  snapshot,
  expectedWorkflowId,
) {
  if (
    !Array.isArray(snapshot) ||
    snapshot.length < 1 ||
    snapshot.length > 20 ||
    !UUID.test(expectedWorkflowId ?? "")
  ) {
    readbackInvalid();
  }
  const verified = snapshot.map((identity) => {
    const normalized = workflowVersionIdentity({
      id: identity?.id,
      class_name: identity?.className,
      created_on: identity?.createdOn,
      modified_on: identity?.modifiedOn,
      workflow_id: identity?.workflowId,
      has_dag: identity?.hasDag,
      language: identity?.language,
      default_retention: identity?.defaultRetention === null
        ? undefined
        : {
            error_retention: identity?.defaultRetention?.errorMs,
            success_retention: identity?.defaultRetention?.successMs,
          },
      limits: { steps: identity?.limits?.steps },
    }, expectedWorkflowId);
    if (!canonicalEqual(normalized, identity)) readbackInvalid();
    return normalized;
  });
  const sorted = [...verified].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  if (
    new Set(verified.map((identity) => identity.id)).size !== verified.length ||
    !canonicalEqual(verified, sorted)
  ) {
    readbackInvalid();
  }
  return verified;
}

export async function fetchAliceCloudflareWorkflowVersionState({
  fetchImpl = globalThis.fetch,
  apiToken,
  expectedWorkflowId,
  accountId = ALICE_CLOUDFLARE_TARGET.accountId,
  zoneId = ZONE_ID,
  baseUrl = API_BASE,
}) {
  if (
    !validInputs({ apiToken, accountId, zoneId, baseUrl, fetchImpl }) ||
    !UUID.test(expectedWorkflowId ?? "")
  ) {
    readbackInvalid();
  }
  try {
    const client = { fetchImpl, apiToken, baseUrl };
    const root =
      `/accounts/${accountId}/workflows/${ALICE_CLOUDFLARE_TARGET.planWorkflow}/versions`;
    const listed = await apiGetAllResults(client, root);
    if (listed.length < 1 || listed.length > 20) readbackInvalid();
    const identities = [];
    for (const listedVersion of listed) {
      const listedIdentity = workflowVersionIdentity(
        listedVersion,
        expectedWorkflowId,
      );
      const detailed = result(
        await apiGetJson(client, `${root}/${listedIdentity.id}`),
      );
      const detailIdentity = workflowVersionIdentity(
        detailed,
        expectedWorkflowId,
      );
      if (!canonicalEqual(listedIdentity, detailIdentity)) readbackInvalid();
      identities.push(detailIdentity);
    }
    if (new Set(identities.map((identity) => identity.id)).size !== identities.length) {
      readbackInvalid();
    }
    return verifyAliceCloudflareWorkflowVersionSnapshot(
      identities.sort((left, right) => left.id.localeCompare(right.id)),
      expectedWorkflowId,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_CLOUDFLARE_LIVE_READBACK_INVALID"
    ) {
      throw error;
    }
    readbackInvalid();
  }
}

async function apiGetResponse({ fetchImpl, apiToken, baseUrl }, pathname) {
  const url = new URL(`${baseUrl}${pathname}`);
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiToken}`,
      accept: "*/*",
      "cache-control": "no-cache",
    },
  });
  if (!(response instanceof Response) || !response.ok) readbackInvalid();
  return response;
}

function latestDeployment(body) {
  const deployments = result(body)?.deployments;
  if (!Array.isArray(deployments) || deployments.length < 1) readbackInvalid();
  return deployments[0];
}

export async function fetchAliceCloudflarePostDeploymentReadback({
  fetchImpl = globalThis.fetch,
  apiToken,
  ownerEmailSha256,
  accessAudience,
  releaseAccessAudience,
  releaseServiceTokenIdSha256,
  serializedManifest,
  materializedWranglerConfigs,
  expectedEffectiveConfigs,
  expectedDurableObjectNamespaceIds,
  accountId = ALICE_CLOUDFLARE_TARGET.accountId,
  zoneId = ZONE_ID,
  baseUrl = API_BASE,
  verifyProvider = verifyAliceProviderControlFingerprints,
  verifyWorker = verifyAliceWorkerProviderReadback,
  now = Date.now,
}) {
  if (
    !validInputs({ apiToken, accountId, zoneId, baseUrl, fetchImpl }) ||
    !materializedWranglerConfigs ||
    !expectedEffectiveConfigs ||
    !expectedDurableObjectNamespaceIds ||
    canonicalAliceJson(Object.keys(expectedDurableObjectNamespaceIds).sort()) !==
      canonicalAliceJson([...ROLES].sort())
  ) {
    readbackInvalid();
  }
  const startedAt = now();
  try {
    const providerState = await fetchAliceCloudflareProviderState({
      fetchImpl,
      apiToken,
      ownerEmailSha256,
      accessAudience,
      releaseAccessAudience,
      releaseServiceTokenIdSha256,
      accountId,
      zoneId,
      baseUrl,
      now,
    });
    const continuityState = await fetchAliceCloudflareContinuityState({
      fetchImpl,
      apiToken,
      expectedDurableObjectNamespaceIds,
      accountId,
      zoneId,
      baseUrl,
    });
    const workflowVersions =
      await fetchAliceCloudflareWorkflowVersionState({
        fetchImpl,
        apiToken,
        expectedWorkflowId: continuityState.readback.workflow.id,
        accountId,
        zoneId,
        baseUrl,
      });
    const providerFingerprints = await verifyProvider({
      serializedManifest,
      accessPolicyReadback: providerState.accessPolicyReadback,
      aiGatewayProviderReadback: providerState.aiGatewayProviderReadback,
      vectorizeProviderReadback: providerState.vectorizeProviderReadback,
      cloudflareContinuityReadback: continuityState.readback,
    });
    const client = { fetchImpl, apiToken, baseUrl };
    const routes = await apiGetAllResults(
      client,
      `/zones/${zoneId}/workers/routes`,
    );
    const customDomains = await apiGetAllResults(
      client,
      `/accounts/${accountId}/workers/domains`,
      { zone_id: zoneId },
    );
    const aliceHostnames = [
      ALICE_CLOUDFLARE_TARGET.accessDomain,
      ALICE_CLOUDFLARE_TARGET.releaseControlDomain,
    ];
    const aliceRoutes = routes.filter((route) =>
      aliceHostnames.some((hostname) =>
        routeCanMatchHostname(route?.pattern, hostname)
      )
    );
    const expectedAliceRoutes = Object.values(materializedWranglerConfigs)
      .flatMap((config) =>
        (config?.routes ?? []).map((route) => ({
          pattern: route.pattern,
          script: config.name,
        })),
      );
    const aliceCustomDomains = customDomains.filter((domain) =>
      aliceHostnames.includes(domain?.hostname?.toLowerCase())
    );
    if (
      canonicalAliceJson(normalizedRoutes(aliceRoutes)) !==
        canonicalAliceJson(normalizedRoutes(expectedAliceRoutes)) ||
      aliceCustomDomains.length !== 0
    ) {
      readbackInvalid();
    }
    const queue = continuityState.readback.queue;
    const consumers = continuityState.readback.queueConsumers;
    if (
      consumers.length !== 1 ||
      consumers[0]?.script_name !== ALICE_CLOUDFLARE_TARGET.controlWorker
    ) {
      readbackInvalid();
    }
    const workflow = continuityState.readback.workflow;
    const runtimeHostContainerState = await fetchAliceRuntimeHostContainerState({
      fetchImpl,
      apiToken,
      accountId,
      baseUrl,
    });
    const workers = {};
    const workerTerminalAnchors = {};
    for (const role of ROLES) {
      const config = materializedWranglerConfigs[role];
      const expectedEffectiveConfig = expectedEffectiveConfigs[role];
      if (!config || config.name !== expectedWorkerName(role)) {
        readbackInvalid();
      }
      const workerRoot = `/accounts/${accountId}/workers/scripts/${config.name}`;
      const deployment = latestDeployment(
        await apiGetJson(client, `${workerRoot}/deployments`),
      );
      if (
        !Array.isArray(deployment.versions) ||
        deployment.versions.length !== 1 ||
        typeof deployment.versions[0]?.version_id !== "string"
      ) {
        readbackInvalid();
      }
      const version = result(
        await apiGetJson(
          client,
          `${workerRoot}/versions/${deployment.versions[0].version_id}`,
        ),
      );
      const contentResponse = await apiGetResponse(
        client,
        `${workerRoot}/content/v2`,
      );
      const contentEtag = contentResponse.headers.get("etag")?.replace(/^W\//, "").replaceAll('"', "");
      if (
        typeof version?.resources?.script?.etag !== "string" ||
        version.resources.script.etag.length < 8 ||
        contentEtag !== version.resources.script.etag
      ) {
        readbackInvalid();
      }
      const deployedMainModule = await readAliceWorkerMainModule(
        contentResponse,
      );
      const scriptSettings = result(
        await apiGetJson(client, `${workerRoot}/script-settings`),
      );
      const scriptAndVersionSettings = result(
        await apiGetJson(client, `${workerRoot}/settings`),
      );
      const subdomain = result(
        await apiGetJson(client, `${workerRoot}/subdomain`),
      );
      const deploymentAfterContent = latestDeployment(
        await apiGetJson(client, `${workerRoot}/deployments`),
      );
      const queueConsumer = role === "control" ? consumers[0] : null;
      workers[role] = await verifyWorker({
        role,
        deployment,
        deploymentAfterContent,
        version,
        routes: routes.filter((route) => route?.script === config.name),
        scriptSettings,
        scriptAndVersionSettings,
        subdomain,
        queueConsumer,
        workflow: role === "control" ? workflow : null,
        ...(role === "runtimeHost" ? {
          containerApplication: runtimeHostContainerState.application,
          containerApplicationInstances:
            runtimeHostContainerState.applicationInstances,
        } : {}),
        materializedWranglerConfig: config,
        expectedEffectiveConfig,
        serializedManifest,
        deployedMainModule,
        deploymentMainPath: config.main,
        expectedDurableObjectNamespaceIds:
          expectedDurableObjectNamespaceIds[role],
      });
      workerTerminalAnchors[role] = {
        deployment: deploymentAfterContent,
        scriptSettings,
        scriptAndVersionSettings,
        subdomain,
      };
    }

    const terminalProviderState = await fetchAliceCloudflareProviderState({
      fetchImpl,
      apiToken,
      ownerEmailSha256,
      accessAudience,
      releaseAccessAudience,
      releaseServiceTokenIdSha256,
      accountId,
      zoneId,
      baseUrl,
      now,
    });
    const terminalContinuityState = await fetchAliceCloudflareContinuityState({
      fetchImpl,
      apiToken,
      expectedDurableObjectNamespaceIds,
      accountId,
      zoneId,
      baseUrl,
    });
    const terminalWorkflowVersions =
      await fetchAliceCloudflareWorkflowVersionState({
        fetchImpl,
        apiToken,
        expectedWorkflowId: terminalContinuityState.readback.workflow.id,
        accountId,
        zoneId,
        baseUrl,
      });
    const terminalProviderFingerprints = await verifyProvider({
      serializedManifest,
      accessPolicyReadback: terminalProviderState.accessPolicyReadback,
      aiGatewayProviderReadback:
        terminalProviderState.aiGatewayProviderReadback,
      vectorizeProviderReadback:
        terminalProviderState.vectorizeProviderReadback,
      cloudflareContinuityReadback: terminalContinuityState.readback,
    });
    const terminalRoutes = await apiGetAllResults(
      client,
      `/zones/${zoneId}/workers/routes`,
    );
    const terminalCustomDomains = await apiGetAllResults(
      client,
      `/accounts/${accountId}/workers/domains`,
      { zone_id: zoneId },
    );
    const terminalAliceRoutes = terminalRoutes.filter((route) =>
      aliceHostnames.some((hostname) =>
        routeCanMatchHostname(route?.pattern, hostname),
      ),
    );
    const terminalAliceCustomDomains = terminalCustomDomains.filter((domain) =>
      aliceHostnames.includes(domain?.hostname?.toLowerCase()),
    );
    const terminalQueue = terminalContinuityState.readback.queue;
    const terminalConsumers = terminalContinuityState.readback.queueConsumers;
    const terminalWorkflow = terminalContinuityState.readback.workflow;
    const terminalRuntimeHostContainerState =
      await fetchAliceRuntimeHostContainerState({
        fetchImpl,
        apiToken,
        accountId,
        baseUrl,
      });
    if (
      !canonicalEqual(providerState.sanitized, terminalProviderState.sanitized) ||
      !canonicalEqual(providerFingerprints, terminalProviderFingerprints) ||
      !canonicalEqual(
        continuityState.sanitized,
        terminalContinuityState.sanitized,
      ) ||
      !canonicalEqual(
        normalizedRoutes(aliceRoutes),
        normalizedRoutes(terminalAliceRoutes),
      ) ||
      !canonicalEqual(aliceCustomDomains, terminalAliceCustomDomains) ||
      !canonicalEqual(queue, terminalQueue) ||
      !canonicalEqual(consumers, terminalConsumers) ||
      !canonicalEqual(workflow, terminalWorkflow)
      || !canonicalEqual(workflowVersions, terminalWorkflowVersions) ||
      !canonicalEqual(
        runtimeHostContainerState,
        terminalRuntimeHostContainerState,
      )
    ) {
      readbackInvalid();
    }
    for (const role of ROLES) {
      const config = materializedWranglerConfigs[role];
      const workerRoot = `/accounts/${accountId}/workers/scripts/${config.name}`;
      const terminalDeployment = latestDeployment(
        await apiGetJson(client, `${workerRoot}/deployments`),
      );
      const terminalScriptSettings = result(
        await apiGetJson(client, `${workerRoot}/script-settings`),
      );
      const terminalScriptAndVersionSettings = result(
        await apiGetJson(client, `${workerRoot}/settings`),
      );
      const terminalSubdomain = result(
        await apiGetJson(client, `${workerRoot}/subdomain`),
      );
      const anchor = workerTerminalAnchors[role];
      if (
        !canonicalEqual(anchor.deployment, terminalDeployment) ||
        !canonicalEqual(anchor.scriptSettings, terminalScriptSettings) ||
        !canonicalEqual(
          anchor.scriptAndVersionSettings,
          terminalScriptAndVersionSettings,
        ) ||
        !canonicalEqual(anchor.subdomain, terminalSubdomain)
      ) {
        readbackInvalid();
      }
    }
    const completedAt = now();
    const durationMs = completedAt - startedAt;
    if (
      !Number.isSafeInteger(startedAt) ||
      !Number.isSafeInteger(completedAt) ||
      durationMs < 0 ||
      durationMs >= 60_000
    ) {
      readbackInvalid();
    }
    return {
      schemaVersion: "alice.cloudflare-live-readback.v2",
      accountId,
      zoneId,
      observedAt: new Date(completedAt).toISOString(),
      durationMs,
      providerFingerprints,
      provider: {
        ...providerState.sanitized,
        continuityConfig: continuityState.sanitized,
      },
      terminalSnapshotStable: true,
      workflowVersions,
      aliceTrafficBindings: {
        routes: normalizedRoutes(aliceRoutes),
        customDomains: [],
      },
      workers,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_CLOUDFLARE_LIVE_READBACK_INVALID"
    ) {
      throw error;
    }
    readbackInvalid();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const manifestPath = process.env.ALICE_DEPLOYMENT_MANIFEST_PATH;
    const configDir = process.env.ALICE_WRANGLER_OUTPUT_DIR;
    const outputPath = process.env.ALICE_CLOUDFLARE_READBACK_PATH;
    const namespaceIdsPath =
      process.env.ALICE_EXPECTED_DO_NAMESPACE_IDS_PATH;
    if (
      !manifestPath ||
      !path.isAbsolute(manifestPath) ||
      !configDir ||
      !path.isAbsolute(configDir) ||
      !outputPath ||
      !path.isAbsolute(outputPath) ||
      !namespaceIdsPath ||
      !path.isAbsolute(namespaceIdsPath)
    ) {
      readbackInvalid();
    }
    const materializedWranglerConfigs = Object.fromEntries(
      ROLES.map((role) => [
        role,
        JSON.parse(
          fs.readFileSync(path.join(configDir, `${role}.wrangler.json`), "utf8"),
        ),
      ]),
    );
    const expectedEffectiveConfigs = Object.fromEntries(
      ROLES.map((role) => [
        role,
        aliceEffectiveConfigFromWrangler(
          role,
          materializedWranglerConfigs[role],
          { deploymentMainPath: materializedWranglerConfigs[role].main },
        ),
      ]),
    );
    const common = materializedWranglerConfigs.access.vars;
    const control = materializedWranglerConfigs.control.vars;
    const evidence = await fetchAliceCloudflarePostDeploymentReadback({
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      ownerEmailSha256: common?.ALICE_OWNER_EMAIL_SHA256,
      accessAudience: common?.ALICE_ACCESS_AUDIENCE,
      releaseAccessAudience: control?.ALICE_RELEASE_ACCESS_AUDIENCE,
      releaseServiceTokenIdSha256:
        control?.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
      serializedManifest: fs.readFileSync(manifestPath, "utf8"),
      materializedWranglerConfigs,
      expectedEffectiveConfigs,
      expectedDurableObjectNamespaceIds: JSON.parse(
        fs.readFileSync(namespaceIdsPath, "utf8"),
      ),
    });
    fs.writeFileSync(outputPath, `${canonicalAliceJson(evidence)}\n`, {
      encoding: "utf8",
      mode: 0o444,
      flag: "wx",
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, outputPath, observedAt: evidence.observedAt })}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
