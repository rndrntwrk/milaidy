import assert from "node:assert/strict";
import test from "node:test";

import {
  aliceExpectedControlTrafficState,
  aliceExpectedReleaseControlTrafficState,
  aliceExpectedProductionTrafficState,
  fetchAliceCloudflareTrafficState,
  planAliceCandidateTrafficMutations,
  planAliceTrafficRestoration,
} from "./alice_cloudflare_traffic.mjs";

const current = {
  routes: [{
    id: "11111111111111111111111111111111",
    pattern: "alice.rndrntwrk.com/*",
    script: "alice-access-gateway",
  }],
  customDomains: [],
  subdomains: {
    access: { enabled: false, previewsEnabled: false },
    control: { enabled: false, previewsEnabled: false },
    aiGateway: { enabled: true, previewsEnabled: false },
  },
};

test("adds only the two exact control routes and never uses generic triggers", () => {
  const expected = aliceExpectedProductionTrafficState();
  const plan = planAliceCandidateTrafficMutations(current, expected);
  assert.deepEqual(plan.deleteRoutes, []);
  assert.deepEqual(plan.updateRoutes, []);
  assert.deepEqual(plan.setSubdomains, []);
  assert.deepEqual(plan.createRoutes, [
    {
      pattern: "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
      script: "alice-production-control",
    },
    {
      pattern: "alice.rndrntwrk.com/control/*",
      script: "alice-production-control",
    },
  ]);
});

test("attaches only the release-controller route before PAUSE_ALL", () => {
  const expected = aliceExpectedReleaseControlTrafficState(current);
  const plan = planAliceCandidateTrafficMutations(current, expected);
  assert.deepEqual(plan.deleteRoutes, []);
  assert.deepEqual(plan.updateRoutes, []);
  assert.deepEqual(plan.setSubdomains, []);
  assert.deepEqual(plan.createRoutes, [
    {
      pattern: "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
      script: "alice-production-control",
    },
  ]);
  assert.equal(
    expected.routes.some((route) => route.pattern === "alice.rndrntwrk.com/control/*"),
    false,
  );
});

test("attaches the exact owner and machine control routes without touching serving traffic", () => {
  const expected = aliceExpectedControlTrafficState(current);
  const plan = planAliceCandidateTrafficMutations(current, expected);
  assert.deepEqual(plan.deleteRoutes, []);
  assert.deepEqual(plan.updateRoutes, []);
  assert.deepEqual(plan.setSubdomains, []);
  assert.deepEqual(plan.createRoutes, [
    {
      pattern: "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
      script: "alice-production-control",
    },
    {
      pattern: "alice.rndrntwrk.com/control/*",
      script: "alice-production-control",
    },
  ]);
  assert.equal(expected.subdomains.access.enabled, false);
  assert.equal(expected.subdomains.aiGateway.enabled, true);
});

test("rejects a shadow route or custom domain instead of broadening traffic", () => {
  const expected = aliceExpectedProductionTrafficState();
  assert.throws(
    () => planAliceCandidateTrafficMutations({
      ...current,
      routes: current.routes.concat({
        id: "22222222222222222222222222222222",
        pattern: "alice.rndrntwrk.com/v1/*",
        script: "shadow-worker",
      }),
    }, expected),
    /ALICE_CLOUDFLARE_TRAFFIC_INVALID/,
  );
  assert.throws(
    () => planAliceCandidateTrafficMutations({
      ...current,
      customDomains: [{ hostname: "alice.rndrntwrk.com", service: "shadow" }],
    }, expected),
    /ALICE_CLOUDFLARE_TRAFFIC_INVALID/,
  );
});

test("restores only Alice traffic bindings captured by the rollback anchor", () => {
  const expected = aliceExpectedProductionTrafficState();
  const candidate = {
    ...current,
    routes: expected.routes.map((route, index) => ({
      id: `${index + 1}`.repeat(32),
      ...route,
    })),
  };
  const plan = planAliceTrafficRestoration(candidate, current);
  assert.deepEqual(plan.createRoutes, []);
  assert.deepEqual(plan.updateRoutes, []);
  assert.deepEqual(plan.deleteRoutes.map((route) => route.pattern), [
    "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
    "alice.rndrntwrk.com/control/*",
  ]);
  assert.deepEqual(plan.setSubdomains, []);
});

function cloudflareResponse(result, resultInfo) {
  return new Response(JSON.stringify({
    success: true,
    result,
    ...(resultInfo === undefined ? {} : { result_info: resultInfo }),
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function paginatedTrafficFetch({ shadowRoute = false, customDomain = false }) {
  const requests = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    requests.push(`${url.pathname}${url.search}`);
    const page = Number(url.searchParams.get("page"));
    if (url.pathname.endsWith("/workers/routes")) {
      const firstPage = [
        current.routes[0],
        ...Array.from({ length: 99 }, (_, index) => ({
          id: `${index + 100}`.padStart(32, "0"),
          pattern: `unrelated-${index}.example/*`,
          script: "unrelated-worker",
        })),
      ];
      return cloudflareResponse(
        page === 1
          ? firstPage
          : shadowRoute
            ? [{
                id: "22222222222222222222222222222222",
                pattern: "alice.rndrntwrk.com/v1/*",
                script: "shadow-worker",
              }]
            : [{
                id: "33333333333333333333333333333333",
                pattern: "unrelated.example/*",
                script: "unrelated-worker",
              }],
        {
          page,
          per_page: 100,
          count: page === 1 ? 100 : 1,
          total_count: 101,
          total_pages: 2,
        },
      );
    }
    if (url.pathname.endsWith("/workers/domains")) {
      const firstPage = Array.from({ length: 100 }, (_, index) => ({
        hostname: `unrelated-${index}.example`,
        service: "unrelated-worker",
      }));
      return cloudflareResponse(
        page === 2 && customDomain
          ? [{ hostname: "alice.rndrntwrk.com", service: "shadow-worker" }]
          : page === 1
            ? firstPage
            : [{ hostname: "unrelated-terminal.example", service: "unrelated-worker" }],
        {
          page,
          per_page: 100,
          count: page === 1 ? 100 : 1,
          total_count: 101,
          total_pages: 2,
        },
      );
    }
    if (url.pathname.endsWith("/subdomain")) {
      const aiGateway = url.pathname.includes("alice-ai-gateway");
      return cloudflareResponse({
        enabled: aiGateway,
        previews_enabled: false,
      });
    }
    throw new Error(`unexpected request ${url}`);
  };
  return { fetchImpl, requests };
}

test("exhausts route pages and rejects an Alice shadow route on a later page", async () => {
  const { fetchImpl, requests } = paginatedTrafficFetch({ shadowRoute: true });
  const observed = await fetchAliceCloudflareTrafficState({
    fetchImpl,
    apiToken: "test-api-token",
    baseUrl: "https://api.cloudflare.test/client/v4",
  });
  assert.ok(requests.some((request) =>
    request.includes("/workers/routes?page=2&per_page=100")));
  assert.throws(
    () => planAliceCandidateTrafficMutations(
      observed,
      aliceExpectedProductionTrafficState(),
    ),
    /ALICE_CLOUDFLARE_TRAFFIC_INVALID/,
  );
});

test("exhausts custom-domain pages and rejects a later-page Alice domain", async () => {
  const { fetchImpl, requests } = paginatedTrafficFetch({ customDomain: true });
  await assert.rejects(
    () => fetchAliceCloudflareTrafficState({
      fetchImpl,
      apiToken: "test-api-token",
      baseUrl: "https://api.cloudflare.test/client/v4",
    }),
    /ALICE_CLOUDFLARE_TRAFFIC_INVALID/,
  );
  assert.ok(requests.some((request) =>
    request.includes("/workers/domains?zone_id=7b24984479ee4cddb6c5d8a9b7a0f2c6&page=2&per_page=100")));
});

test("accepts Cloudflare's page-one metadata for an empty collection", async () => {
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/workers/routes") ||
        url.pathname.endsWith("/workers/domains")) {
      return cloudflareResponse([], {
        page: 1,
        per_page: 100,
        count: 0,
        total_count: 0,
        total_pages: 0,
      });
    }
    if (url.pathname.endsWith("/subdomain")) {
      return cloudflareResponse({ enabled: false, previews_enabled: false });
    }
    throw new Error(`unexpected request ${url}`);
  };
  const observed = await fetchAliceCloudflareTrafficState({
    fetchImpl,
    apiToken: "test-api-token",
    baseUrl: "https://api.cloudflare.test/client/v4",
  });
  assert.deepEqual(observed.routes, []);
  assert.deepEqual(observed.customDomains, []);
});
