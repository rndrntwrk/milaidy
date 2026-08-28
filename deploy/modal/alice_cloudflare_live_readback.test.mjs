import assert from "node:assert/strict";
import test from "node:test";

import {
  aliceCloudflareContinuitySentinelBytes,
} from "./alice_cloudflare_continuity.mjs";
import {
  fetchAliceCloudflareContinuityState,
  fetchAliceCloudflarePostDeploymentReadback,
  fetchAliceCloudflareProviderState,
  fetchAliceCloudflareWorkflowVersionState,
  verifyAliceCloudflareWorkflowVersionSnapshot,
} from "./alice_cloudflare_live_readback.mjs";
import {
  aliceTestCloudflareContinuityReadback,
  aliceTestProviderReadbacks,
  aliceTestWorkflowVersions,
} from "./test-fixtures/alice_provider_readbacks.mjs";

const accountId = "036df6c823669b8fa2f66cf4c16eeb29";
const zoneId = "7b24984479ee4cddb6c5d8a9b7a0f2c6";
const baseUrl = "https://api.cloudflare.test/client/v4";
const accessAudience = "alice-access-audience";
const fixtures = aliceTestProviderReadbacks({ accessAudience });
const continuityFixture = aliceTestCloudflareContinuityReadback();
const workflowVersionFixture = aliceTestWorkflowVersions();

function json(value) {
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}

function providerApi(calls) {
  const app = fixtures.accessPolicyReadback.application;
  const deploymentApp = fixtures.accessPolicyReadback.deploymentApplication;
  return async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.href, options });
    const pathname = parsed.pathname.replace("/client/v4", "");
    if (pathname === `/zones/${zoneId}/access/apps`) {
      return json({ success: true, result: [app, deploymentApp] });
    }
    if (pathname === `/accounts/${accountId}/access/apps`) {
      return json({ success: true, result: [app, deploymentApp] });
    }
    if (pathname === `/zones/${zoneId}/access/apps/${app.id}`) {
      return json({ success: true, result: app });
    }
    if (pathname === `/zones/${zoneId}/access/apps/${app.id}/policies`) {
      return json({ success: true, result: fixtures.accessPolicyReadback.policies });
    }
    if (pathname === `/zones/${zoneId}/access/apps/${deploymentApp.id}`) {
      return json({ success: true, result: deploymentApp });
    }
    if (pathname === `/zones/${zoneId}/access/apps/${deploymentApp.id}/policies`) {
      return json({
        success: true,
        result: fixtures.accessPolicyReadback.deploymentPolicies,
      });
    }
    if (pathname === `/accounts/${accountId}/access/identity_providers`) {
      return json({
        success: true,
        result: fixtures.accessPolicyReadback.identityProviders.map((idp) => ({
          ...idp,
          config: idp.type === "google-apps"
            ? { ...idp.config, client_secret: "provider-masked-value" }
            : idp.config,
        })),
      });
    }
    if (pathname === `/accounts/${accountId}/devices/posture`) {
      return json({ success: true, result: fixtures.accessPolicyReadback.postureRules });
    }
    if (pathname === `/accounts/${accountId}/access/service_tokens`) {
      return json({
        success: true,
        result: fixtures.accessPolicyReadback.serviceTokens,
      });
    }
    if (pathname === `/accounts/${accountId}/ai-gateway/gateways/alice-production`) {
      const { dynamic_routes: _routes, ...gateway } =
        fixtures.aiGatewayProviderReadback;
      return json({ success: true, result: gateway });
    }
    if (pathname === `/accounts/${accountId}/ai-gateway/gateways/alice-production/routes`) {
      return json(fixtures.aiGatewayProviderReadback.dynamic_routes);
    }
    throw new Error(`unexpected ${parsed.href}`);
  };
}

function continuityApi(calls) {
  return async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.href, options });
    const pathname = parsed.pathname.replace("/client/v4", "");
    if (pathname === `/accounts/${accountId}/queues`) {
      return json({
        success: true,
        result: [continuityFixture.queue, continuityFixture.deadLetterQueue],
      });
    }
    if (
      pathname ===
      `/accounts/${accountId}/queues/${continuityFixture.queue.queue_id}/consumers`
    ) {
      return json({ success: true, result: continuityFixture.queueConsumers });
    }
    if (
      pathname ===
      `/accounts/${accountId}/queues/${continuityFixture.deadLetterQueue.queue_id}/consumers`
    ) {
      return json({
        success: true,
        result: continuityFixture.deadLetterQueueConsumers,
      });
    }
    if (pathname === `/accounts/${accountId}/event_subscriptions/subscriptions`) {
      return json({ success: true, result: continuityFixture.eventSubscriptions });
    }
    if (pathname === `/accounts/${accountId}/workflows/alice-production-plans`) {
      return json({ success: true, result: continuityFixture.workflow });
    }
    if (pathname === `/accounts/${accountId}/r2/buckets/alice-production-evidence`) {
      return json({ success: true, result: continuityFixture.bucket });
    }
    if (
      pathname ===
      `/accounts/${accountId}/r2/buckets/alice-production-evidence/objects`
    ) {
      assert.equal(
        parsed.searchParams.get("prefix"),
        "continuity/alice-production-core-v1",
      );
      assert.equal(parsed.searchParams.get("per_page"), "2");
      return json({
        success: true,
        result: [{
          key: continuityFixture.sentinel.key,
          etag: continuityFixture.sentinel.etag,
          size: continuityFixture.sentinel.size,
          last_modified: continuityFixture.sentinel.uploaded,
          storage_class: continuityFixture.sentinel.storage_class,
          http_metadata: {
            contentType: continuityFixture.sentinel.content_type,
            cacheControl: continuityFixture.sentinel.cache_control,
          },
        }],
        result_info: { is_truncated: false, per_page: 2 },
      });
    }
    if (
      pathname ===
      `/accounts/${accountId}/r2/buckets/alice-production-evidence/objects/continuity/alice-production-core-v1`
    ) {
      return new Response(aliceCloudflareContinuitySentinelBytes(), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected ${parsed.href}`);
  };
}

test("fetches and sanitizes the exact live Access, OTP, posture, AI, and route state", async () => {
  const calls = [];
  const state = await fetchAliceCloudflareProviderState({
    fetchImpl: providerApi(calls),
    apiToken: "read-only-token",
    ownerEmailSha256: fixtures.accessPolicyReadback.ownerEmailSha256,
    accessAudience,
    releaseAccessAudience:
      fixtures.accessPolicyReadback.releaseAccessAudience,
    releaseServiceTokenIdSha256:
      fixtures.accessPolicyReadback.releaseServiceTokenIdSha256,
    accountId,
    zoneId,
    baseUrl,
    now: () => Date.parse(fixtures.accessPolicyReadback.observedAt),
  });
  assert.equal(state.accessPolicyReadback.application.domain, "alice.rndrntwrk.com");
  assert.equal(
    state.accessPolicyReadback.identityProviders[1].config.client_secret,
    "[REDACTED]",
  );
  assert.equal(
    state.sanitized.accessPolicyConfig.identityProvider.name,
    "One-time PIN",
  );
  assert.deepEqual(state.sanitized.aiGatewayProviderConfig.dynamicRoutes, {
    activeRouteCount: 0,
  });
  assert.equal(
    JSON.stringify(state.sanitized).includes("alice-owner@rndrntwrk.com"),
    false,
  );
  assert.equal(JSON.stringify(state.sanitized).includes("provider-masked-value"), false);
  assert.equal(calls.length, 11);
  for (const call of calls) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.headers.authorization, "Bearer read-only-token");
    assert.equal(call.options.headers["cache-control"], "no-cache");
  }
});

test("fetches the exact queue, DLQ, consumer, Workflow, R2, sentinel, and DO continuity bundle", async () => {
  const calls = [];
  const state = await fetchAliceCloudflareContinuityState({
    fetchImpl: continuityApi(calls),
    apiToken: "read-only-token",
    expectedDurableObjectNamespaceIds:
      continuityFixture.durableObjectNamespaceIds,
    accountId,
    zoneId,
    baseUrl,
  });
  assert.deepEqual(state.readback, continuityFixture);
  assert.equal(
    state.sanitized.evidenceQueue.id,
    continuityFixture.queue.queue_id,
  );
  assert.equal(
    state.sanitized.evidenceSentinel.etag,
    continuityFixture.sentinel.etag,
  );
  assert.equal(calls.length, 8);
  for (const call of calls) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.headers.authorization, "Bearer read-only-token");
  }
});

test("accepts Cloudflare's uppercase ENAM readback and emits canonical continuity", async () => {
  const calls = [];
  const baseFetch = continuityApi(calls);
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (
      parsed.pathname.replace("/client/v4", "") ===
      `/accounts/${accountId}/r2/buckets/alice-production-evidence`
    ) {
      calls.push({ url: parsed.href, options });
      return json({
        success: true,
        result: { ...continuityFixture.bucket, location: "ENAM" },
      });
    }
    return baseFetch(url, options);
  };
  const state = await fetchAliceCloudflareContinuityState({
    fetchImpl,
    apiToken: "read-only-token",
    expectedDurableObjectNamespaceIds:
      continuityFixture.durableObjectNamespaceIds,
    accountId,
    zoneId,
    baseUrl,
  });
  assert.equal(state.readback.bucket.location, "ENAM");
  assert.equal(state.sanitized.evidenceBucket.location, "enam");
});

test("accepts Cloudflare's Queue consumer GET script field", async () => {
  const calls = [];
  const baseFetch = continuityApi(calls);
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (
      parsed.pathname.replace("/client/v4", "") ===
      `/accounts/${accountId}/queues/${continuityFixture.queue.queue_id}/consumers`
    ) {
      calls.push({ url: parsed.href, options });
      const { script_name: script, ...consumer } =
        continuityFixture.queueConsumers[0];
      return json({ success: true, result: [{ ...consumer, script }] });
    }
    return baseFetch(url, options);
  };
  const state = await fetchAliceCloudflareContinuityState({
    fetchImpl,
    apiToken: "read-only-token",
    expectedDurableObjectNamespaceIds:
      continuityFixture.durableObjectNamespaceIds,
    accountId,
    zoneId,
    baseUrl,
  });
  assert.equal(
    state.sanitized.evidenceQueueConsumer.scriptName,
    "alice-production-control",
  );
});

test("accepts Cloudflare's exact zero-subscription pagination response", async () => {
  const calls = [];
  const baseFetch = continuityApi(calls);
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (
      parsed.pathname.replace("/client/v4", "") ===
      `/accounts/${accountId}/event_subscriptions/subscriptions`
    ) {
      calls.push({ url: parsed.href, options });
      return json({
        success: true,
        result: [],
        result_info: {
          page: 0,
          per_page: 100,
          count: 0,
          total_count: 0,
          total_pages: 0,
        },
      });
    }
    return baseFetch(url, options);
  };
  const state = await fetchAliceCloudflareContinuityState({
    fetchImpl,
    apiToken: "read-only-token",
    expectedDurableObjectNamespaceIds:
      continuityFixture.durableObjectNamespaceIds,
    accountId,
    zoneId,
    baseUrl,
  });
  assert.deepEqual(state.readback.eventSubscriptions, []);
});

test("accepts Cloudflare's observed page-one empty pagination response", async () => {
  const calls = [];
  const baseFetch = continuityApi(calls);
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (
      parsed.pathname.replace("/client/v4", "") ===
      `/accounts/${accountId}/event_subscriptions/subscriptions`
    ) {
      calls.push({ url: parsed.href, options });
      return json({
        success: true,
        result: [],
        result_info: {
          page: 1,
          per_page: 100,
          count: 0,
          total_count: 0,
          total_pages: 0,
        },
      });
    }
    return baseFetch(url, options);
  };
  const state = await fetchAliceCloudflareContinuityState({
    fetchImpl,
    apiToken: "read-only-token",
    expectedDurableObjectNamespaceIds:
      continuityFixture.durableObjectNamespaceIds,
    accountId,
    zoneId,
    baseUrl,
  });
  assert.deepEqual(state.readback.eventSubscriptions, []);
});

test("rejects inconsistent pagination totals before claiming an exhaustive read", async () => {
  const calls = [];
  const baseFetch = continuityApi(calls);
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (
      parsed.pathname.replace("/client/v4", "") ===
      `/accounts/${accountId}/event_subscriptions/subscriptions`
    ) {
      calls.push({ url: parsed.href, options });
      return json({
        success: true,
        result: [],
        result_info: {
          page: 1,
          per_page: 100,
          count: 0,
          total_count: 200,
          total_pages: 1,
        },
      });
    }
    return baseFetch(url, options);
  };
  await assert.rejects(
    () => fetchAliceCloudflareContinuityState({
      fetchImpl,
      apiToken: "read-only-token",
      expectedDurableObjectNamespaceIds:
        continuityFixture.durableObjectNamespaceIds,
      accountId,
      zoneId,
      baseUrl,
    }),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
});

test("rejects an Alice-targeted event subscription discovered on a later page", async () => {
  const calls = [];
  const baseFetch = continuityApi(calls);
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace("/client/v4", "");
    if (pathname === `/accounts/${accountId}/event_subscriptions/subscriptions`) {
      calls.push({ url: parsed.href, options });
      const page = Number(parsed.searchParams.get("page"));
      if (page === 1) {
        const unrelated = Array.from({ length: 100 }, (_, index) => ({
          id: `${index + 1}`.padStart(32, "0"),
          destination: {
            queue_id: `${index + 101}`.padStart(32, "0"),
            type: "queues.queue",
          },
        }));
        return json({
          success: true,
          result: unrelated,
          result_info: {
            page: 1,
            per_page: 100,
            count: 100,
            total_count: 101,
            total_pages: 2,
          },
        });
      }
      return json({
        success: true,
        result: [{
          id: "ffffffffffffffffffffffffffffffff",
          destination: {
            queue_id: continuityFixture.queue.queue_id,
            type: "queues.queue",
          },
        }],
        result_info: {
          page: 2,
          per_page: 100,
          count: 1,
          total_count: 101,
          total_pages: 2,
        },
      });
    }
    return baseFetch(url, options);
  };
  await assert.rejects(
    () => fetchAliceCloudflareContinuityState({
      fetchImpl,
      apiToken: "read-only-token",
      expectedDurableObjectNamespaceIds:
        continuityFixture.durableObjectNamespaceIds,
      accountId,
      zoneId,
      baseUrl,
    }),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  assert.equal(
    calls.some((call) => new URL(call.url).searchParams.get("page") === "2"),
    true,
  );
});

test("reads exact deployed Workflow version identities and rejects list/detail drift", async () => {
  const calls = [];
  let driftDetail = false;
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.href, options });
    const pathname = parsed.pathname.replace("/client/v4", "");
    const root = `/accounts/${accountId}/workflows/alice-production-plans/versions`;
    if (pathname === root) {
      return json({ success: true, result: workflowVersionFixture });
    }
    if (pathname === `${root}/${workflowVersionFixture[0].id}`) {
      return json({
        success: true,
        result: driftDetail
          ? { ...workflowVersionFixture[0], limits: { steps: 15 } }
          : workflowVersionFixture[0],
      });
    }
    throw new Error(`unexpected ${parsed.href}`);
  };
  const state = await fetchAliceCloudflareWorkflowVersionState({
    fetchImpl,
    apiToken: "read-only-token",
    expectedWorkflowId: continuityFixture.workflow.id,
    accountId,
    zoneId,
    baseUrl,
  });
  assert.deepEqual(state, [{
    id: workflowVersionFixture[0].id,
    className: "AlicePlanWorkflow",
    createdOn: "2026-08-22T12:00:00.000Z",
    modifiedOn: "2026-08-22T12:00:01.000Z",
    workflowId: continuityFixture.workflow.id,
    hasDag: true,
    language: "javascript",
    defaultRetention: {
      errorMs: 86_400_000,
      successMs: 86_400_000,
    },
    limits: { steps: 16 },
  }]);
  assert.equal(calls.length, 2);
  driftDetail = true;
  await assert.rejects(
    () => fetchAliceCloudflareWorkflowVersionState({
      fetchImpl,
      apiToken: "read-only-token",
      expectedWorkflowId: continuityFixture.workflow.id,
      accountId,
      zoneId,
      baseUrl,
    }),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
});

test("accepts only a canonical exact Workflow version snapshot", () => {
  const workflowId = continuityFixture.workflow.id;
  const snapshot = [{
    id: workflowVersionFixture[0].id,
    className: "AlicePlanWorkflow",
    createdOn: "2026-08-22T12:00:00.000Z",
    modifiedOn: "2026-08-22T12:00:01.000Z",
    workflowId,
    hasDag: true,
    language: "javascript",
    defaultRetention: {
      errorMs: 86_400_000,
      successMs: 86_400_000,
    },
    limits: { steps: 16 },
  }];
  assert.deepEqual(
    verifyAliceCloudflareWorkflowVersionSnapshot(snapshot, workflowId),
    snapshot,
  );
  assert.throws(
    () => verifyAliceCloudflareWorkflowVersionSnapshot(
      [{ ...snapshot[0], extra: true }],
      workflowId,
    ),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  assert.throws(
    () => verifyAliceCloudflareWorkflowVersionSnapshot(
      [{ ...snapshot[0], workflowId: "ffffffff-ffff-4fff-8fff-ffffffffffff" }],
      workflowId,
    ),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  assert.throws(
    () => verifyAliceCloudflareWorkflowVersionSnapshot(
      [snapshot[0], { ...snapshot[0] }],
      workflowId,
    ),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
});

test("fails closed when a later Access policy page contains an additional policy", async () => {
  const calls = [];
  const baseFetch = providerApi(calls);
  const app = fixtures.accessPolicyReadback.application;
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace("/client/v4", "");
    if (pathname === `/zones/${zoneId}/access/apps/${app.id}/policies`) {
      calls.push({ url: parsed.href, options });
      const page = Number(parsed.searchParams.get("page"));
      if (page === 1) {
        return json({
          success: true,
          result: Array.from(
            { length: 100 },
            (_, index) => ({
              ...fixtures.accessPolicyReadback.policies[0],
              id: `${index + 1}`.padStart(32, "0"),
            }),
          ),
          result_info: {
            page: 1,
            per_page: 100,
            count: 100,
            total_count: 101,
            total_pages: 2,
          },
        });
      }
      if (page === 2) {
        return json({
          success: true,
          result: [{
            ...fixtures.accessPolicyReadback.policies[0],
            id: "broad-policy-on-page-two",
            include: [{ everyone: {} }],
          }],
          result_info: {
            page: 2,
            per_page: 100,
            count: 1,
            total_count: 101,
            total_pages: 2,
          },
        });
      }
    }
    return baseFetch(url, options);
  };
  await assert.rejects(
    () => fetchAliceCloudflareProviderState({
      fetchImpl,
      apiToken: "read-only-token",
      ownerEmailSha256: fixtures.accessPolicyReadback.ownerEmailSha256,
      accessAudience,
      releaseAccessAudience:
        fixtures.accessPolicyReadback.releaseAccessAudience,
      releaseServiceTokenIdSha256:
        fixtures.accessPolicyReadback.releaseServiceTokenIdSha256,
      accountId,
      zoneId,
      baseUrl,
      now: () => Date.parse(fixtures.accessPolicyReadback.observedAt),
    }),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  assert.equal(
    calls.some((call) => new URL(call.url).searchParams.get("page") === "2"),
    true,
  );
});

test("post-deploy readback fetches every Worker surface and brackets content with deployment reads", async () => {
  const calls = [];
  const providerFetch = providerApi(calls);
  const roles = {
    access: "alice-access-gateway",
    control: "alice-production-control",
    aiGateway: "alice-ai-gateway",
    statePlane: "alice-state-plane",
    connectorPlane: "alice-connector-plane",
  };
  const deploymentByWorker = Object.fromEntries(
    Object.values(roles).map((worker, index) => [
      worker,
      {
        id: `33333333-3333-4333-8333-33333333333${index}`,
        versions: [
          {
            version_id: `44444444-4444-4444-8444-44444444444${index}`,
            percentage: 100,
          },
        ],
      },
    ]),
  );
  let includeExtraConsumer = false;
  let includeShadowRoute = false;
  let includeCustomDomain = false;
  let includeReleaseShadowRoute = false;
  let includeReleaseCustomDomain = false;
  let ownerPolicyReads = 0;
  let routeReads = 0;
  let consumerReads = 0;
  let workflowVersionReads = 0;
  let ownerPolicyStableThrough = Number.POSITIVE_INFINITY;
  let routesStableThrough = Number.POSITIVE_INFINITY;
  let consumersStableThrough = Number.POSITIVE_INFINITY;
  let workflowVersionsStableThrough = Number.POSITIVE_INFINITY;
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace("/client/v4", "");
    if (
      pathname.includes("/access/") ||
      pathname.includes("/devices/posture") ||
      pathname.includes("/ai-gateway/")
    ) {
      if (
        pathname ===
        `/zones/${zoneId}/access/apps/${fixtures.accessPolicyReadback.application.id}/policies`
      ) {
        ownerPolicyReads += 1;
        if (ownerPolicyReads > ownerPolicyStableThrough) {
          return json({
            success: true,
            result: [{
              ...fixtures.accessPolicyReadback.policies[0],
              precedence: 2,
            }],
          });
        }
      }
      return providerFetch(url, options);
    }
    calls.push({ url: parsed.href, options });
    if (pathname === `/zones/${zoneId}/workers/routes`) {
      routeReads += 1;
      return json({
        success: true,
        result: [
          { pattern: "alice.rndrntwrk.com/*", script: roles.access },
          { pattern: "alice.rndrntwrk.com/control/*", script: roles.control },
          {
            pattern: "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
            script: roles.control,
          },
        ].concat(
          includeShadowRoute
            ? [{
                pattern: "alice.rndrntwrk.com/v1/*",
                script: "unadmitted-worker",
              }]
            : [],
          includeReleaseShadowRoute
            ? [{
                pattern: "alice-release.rndrntwrk.com/control/*",
                script: "unadmitted-release-worker",
              }]
            : [],
          routeReads > routesStableThrough
            ? [{
                pattern: "alice.rndrntwrk.com/terminal-drift/*",
                script: "terminal-drift-worker",
              }]
            : [],
        ),
      });
    }
    if (pathname === `/accounts/${accountId}/workers/domains`) {
      const domains = [
        ...(includeCustomDomain ? [{
            hostname: "alice.rndrntwrk.com",
            service: "unadmitted-worker",
            zone_id: zoneId,
            zone_name: "rndrntwrk.com",
          }] : []),
        ...(includeReleaseCustomDomain ? [{
          hostname: "alice-release.rndrntwrk.com",
          service: "unadmitted-release-worker",
          zone_id: zoneId,
          zone_name: "rndrntwrk.com",
        }] : []),
      ];
      return json({
        success: true,
        result: domains,
        result_info: {
          page: 1,
          per_page: 100,
          count: domains.length,
          total_count: domains.length,
        },
      });
    }
    if (pathname === `/accounts/${accountId}/queues`) {
      return json({
        success: true,
        result: [continuityFixture.queue, continuityFixture.deadLetterQueue],
      });
    }
    if (
      pathname ===
      `/accounts/${accountId}/queues/${continuityFixture.queue.queue_id}/consumers`
    ) {
      consumerReads += 1;
      return json({
        success: true,
        result: [
          continuityFixture.queueConsumers[0],
          ...(includeExtraConsumer
            ? [{
                ...continuityFixture.queueConsumers[0],
                consumer_id: "99999999999999999999999999999999",
                script_name: "unadmitted-consumer",
              }]
            : []),
          ...(consumerReads > consumersStableThrough
            ? [{
                ...continuityFixture.queueConsumers[0],
                consumer_id: "88888888888888888888888888888888",
                script_name: "terminal-drift-consumer",
              }]
            : []),
        ],
      });
    }
    if (
      pathname ===
      `/accounts/${accountId}/queues/${continuityFixture.deadLetterQueue.queue_id}/consumers`
    ) {
      return json({ success: true, result: [] });
    }
    if (pathname === `/accounts/${accountId}/event_subscriptions/subscriptions`) {
      return json({ success: true, result: [] });
    }
    if (pathname === `/accounts/${accountId}/workflows/alice-production-plans`) {
      return json({ success: true, result: continuityFixture.workflow });
    }
    if (
      pathname ===
      `/accounts/${accountId}/workflows/alice-production-plans/versions`
    ) {
      workflowVersionReads += 1;
      return json({
        success: true,
        result: workflowVersionReads > workflowVersionsStableThrough
          ? [{
              ...workflowVersionFixture[0],
              modified_on: "2026-08-22T12:00:02.000Z",
            }]
          : workflowVersionFixture,
      });
    }
    if (
      pathname ===
      `/accounts/${accountId}/workflows/alice-production-plans/versions/${workflowVersionFixture[0].id}`
    ) {
      return json({ success: true, result: workflowVersionFixture[0] });
    }
    if (pathname === `/accounts/${accountId}/r2/buckets/alice-production-evidence`) {
      return json({ success: true, result: continuityFixture.bucket });
    }
    if (
      pathname ===
      `/accounts/${accountId}/r2/buckets/alice-production-evidence/objects`
    ) {
      return json({
        success: true,
        result: [{
          key: continuityFixture.sentinel.key,
          etag: continuityFixture.sentinel.etag,
          size: continuityFixture.sentinel.size,
          last_modified: continuityFixture.sentinel.uploaded,
          storage_class: continuityFixture.sentinel.storage_class,
          http_metadata: {
            contentType: continuityFixture.sentinel.content_type,
            cacheControl: continuityFixture.sentinel.cache_control,
          },
        }],
        result_info: { is_truncated: false, per_page: 2 },
      });
    }
    if (
      pathname ===
      `/accounts/${accountId}/r2/buckets/alice-production-evidence/objects/continuity/alice-production-core-v1`
    ) {
      return new Response(aliceCloudflareContinuitySentinelBytes(), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    for (const worker of Object.values(roles)) {
      const root = `/accounts/${accountId}/workers/scripts/${worker}`;
      if (pathname === `${root}/deployments`) {
        return json({
          success: true,
          result: { deployments: [deploymentByWorker[worker]] },
        });
      }
      if (pathname === `${root}/versions/${deploymentByWorker[worker].versions[0].version_id}`) {
        return json({
          success: true,
          result: {
            id: deploymentByWorker[worker].versions[0].version_id,
            resources: { script: { etag: `etag-${worker}` } },
          },
        });
      }
      if (pathname === `${root}/content/v2`) {
        return new Response(`export default ${JSON.stringify(worker)};\n`, {
          status: 200,
          headers: {
            "content-type": "application/javascript",
            etag: `"etag-${worker}"`,
          },
        });
      }
      if (pathname === `${root}/script-settings`) {
        return json({ success: true, result: {} });
      }
      if (pathname === `${root}/settings`) {
        return json({
          success: true,
          result: {
            cache_options: { enabled: false },
            compatibility_date: "2026-08-22",
            compatibility_flags: [],
            exports: { default: { state: "created", type: "worker" } },
          },
        });
      }
      if (pathname === `${root}/subdomain`) {
        return json({
          success: true,
          result: { enabled: worker === roles.aiGateway, previews_enabled: false },
        });
      }
    }
    throw new Error(`unexpected ${parsed.href}`);
  };

  const verifiedRoles = [];
  const postDeploymentInput = {
    fetchImpl,
    apiToken: "read-only-token",
    ownerEmailSha256: fixtures.accessPolicyReadback.ownerEmailSha256,
    accessAudience,
    releaseAccessAudience:
      fixtures.accessPolicyReadback.releaseAccessAudience,
    releaseServiceTokenIdSha256:
      fixtures.accessPolicyReadback.releaseServiceTokenIdSha256,
    accountId,
    zoneId,
    baseUrl,
    serializedManifest: "manifest",
    materializedWranglerConfigs: Object.fromEntries(
      Object.entries(roles).map(([role, name]) => [role, {
        name,
        main: `/artifact/${name}/index.js`,
        routes: role === "control"
          ? [
              { pattern: "alice.rndrntwrk.com/control/*" },
              {
                pattern: "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
              },
            ]
          : role === "access"
            ? [{ pattern: "alice.rndrntwrk.com/*" }]
            : [],
      }]),
    ),
    expectedEffectiveConfigs: {
      access: {},
      control: {},
      aiGateway: {},
      statePlane: {},
      connectorPlane: {},
    },
    expectedDurableObjectNamespaceIds:
      continuityFixture.durableObjectNamespaceIds,
    verifyProvider: async () => ({
      accessPolicyConfigSha256: `sha256:${"a".repeat(64)}`,
      aiGatewayProviderConfigSha256: `sha256:${"b".repeat(64)}`,
      continuityConfigSha256: `sha256:${"c".repeat(64)}`,
    }),
    verifyWorker: async (input) => {
      verifiedRoles.push(input.role);
      assert.equal(input.deployment.id, input.deploymentAfterContent.id);
      assert.equal(input.deploymentMainPath, input.materializedWranglerConfig.main);
      assert.equal(input.deployedMainModule.byteLength > 0, true);
      assert.deepEqual(
        input.expectedDurableObjectNamespaceIds,
        postDeploymentInput.expectedDurableObjectNamespaceIds[input.role],
      );
      return { role: input.role, worker: input.materializedWranglerConfig.name };
    },
    now: (() => {
      let value = Date.parse("2026-08-22T12:00:00.000Z");
      return () => value++;
    })(),
  };
  const evidence = await fetchAliceCloudflarePostDeploymentReadback(
    postDeploymentInput,
  );
  assert.deepEqual(verifiedRoles.sort(), [
    "access",
    "aiGateway",
    "connectorPlane",
    "control",
    "statePlane",
  ]);
  assert.deepEqual(Object.keys(evidence.workers).sort(), verifiedRoles.sort());
  for (const worker of Object.values(roles)) {
    const suffix = `/workers/scripts/${worker}/deployments`;
    assert.equal(calls.filter((call) => new URL(call.url).pathname.endsWith(suffix)).length, 3);
  }
  assert.equal(evidence.durationMs < 60_000, true);
  assert.equal(evidence.workflowVersions[0].id, workflowVersionFixture[0].id);
  for (const worker of Object.values(roles)) {
    const settings = `/workers/scripts/${worker}/settings`;
    assert.equal(
      calls.filter((call) => new URL(call.url).pathname.endsWith(settings)).length,
      2,
    );
  }

  ownerPolicyStableThrough = ownerPolicyReads + 1;
  await assert.rejects(
    () => fetchAliceCloudflarePostDeploymentReadback(postDeploymentInput),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  ownerPolicyStableThrough = Number.POSITIVE_INFINITY;

  routesStableThrough = routeReads + 1;
  await assert.rejects(
    () => fetchAliceCloudflarePostDeploymentReadback(postDeploymentInput),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  routesStableThrough = Number.POSITIVE_INFINITY;

  consumersStableThrough = consumerReads + 1;
  await assert.rejects(
    () => fetchAliceCloudflarePostDeploymentReadback(postDeploymentInput),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  consumersStableThrough = Number.POSITIVE_INFINITY;

  workflowVersionsStableThrough = workflowVersionReads + 1;
  await assert.rejects(
    () => fetchAliceCloudflarePostDeploymentReadback(postDeploymentInput),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  workflowVersionsStableThrough = Number.POSITIVE_INFINITY;

  includeShadowRoute = true;
  await assert.rejects(
    () => fetchAliceCloudflarePostDeploymentReadback(postDeploymentInput),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  includeShadowRoute = false;

  includeCustomDomain = true;
  await assert.rejects(
    () => fetchAliceCloudflarePostDeploymentReadback(postDeploymentInput),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  includeCustomDomain = false;

  includeReleaseShadowRoute = true;
  await assert.rejects(
    () => fetchAliceCloudflarePostDeploymentReadback(postDeploymentInput),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  includeReleaseShadowRoute = false;

  includeReleaseCustomDomain = true;
  await assert.rejects(
    () => fetchAliceCloudflarePostDeploymentReadback(postDeploymentInput),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
  includeReleaseCustomDomain = false;

  includeExtraConsumer = true;
  await assert.rejects(
    () => fetchAliceCloudflarePostDeploymentReadback(postDeploymentInput),
    /ALICE_CLOUDFLARE_LIVE_READBACK_INVALID/,
  );
});
