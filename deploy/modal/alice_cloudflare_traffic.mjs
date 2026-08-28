import {
  ALICE_CLOUDFLARE_TARGET,
  canonicalAliceJson,
} from "../../workers/alice-effective-config.js";

const API_BASE = "https://api.cloudflare.com/client/v4";
const ZONE_ID = "7b24984479ee4cddb6c5d8a9b7a0f2c6";
const ROUTE_ID = /^[a-f0-9]{32}$/;
const ROLES = [
  "access",
  "control",
  "aiGateway",
  "statePlane",
  "connectorPlane",
];
const POST_CREATE_CONVERGENCE_READS = 12;
const POST_CREATE_CONVERGENCE_DELAY_MS = 1_000;
const CONVERGENCE_FAILURES = new Set([
  "PRIOR_STATE_TIMEOUT",
  "READ_INVALID",
  "SEMANTIC_DRIFT",
]);
const WORKERS = Object.freeze({
  access: ALICE_CLOUDFLARE_TARGET.accessWorker,
  control: ALICE_CLOUDFLARE_TARGET.controlWorker,
  aiGateway: ALICE_CLOUDFLARE_TARGET.aiGatewayWorker,
  statePlane: ALICE_CLOUDFLARE_TARGET.statePlaneWorker,
  connectorPlane: ALICE_CLOUDFLARE_TARGET.connectorPlaneWorker,
});

function invalid() {
  throw new Error("ALICE_CLOUDFLARE_TRAFFIC_INVALID");
}

function convergenceInvalid(reason) {
  if (!CONVERGENCE_FAILURES.has(reason)) invalid();
  throw new Error(
    `ALICE_CLOUDFLARE_TRAFFIC_INVALID:VERIFY_POST_CREATE:${reason}`,
  );
}

function defaultConvergenceSleep() {
  return new Promise((resolve) => {
    setTimeout(resolve, POST_CREATE_CONVERGENCE_DELAY_MS);
  });
}

function sortedRoutes(routes) {
  return [...routes].sort((left, right) =>
    canonicalAliceJson(left).localeCompare(canonicalAliceJson(right)),
  );
}

function routeCanMatchHostname(pattern, hostname) {
  if (typeof pattern !== "string") invalid();
  const hostPattern = pattern
    .replace(/^https?:\/\//i, "")
    .split("/", 1)[0]
    .toLowerCase();
  if (!hostPattern || /[^a-z0-9.*_-]/.test(hostPattern)) invalid();
  const expression = hostPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${expression}$`, "i").test(hostname);
}

function isAliceRoute(route) {
  return [
    ALICE_CLOUDFLARE_TARGET.accessDomain,
    ALICE_CLOUDFLARE_TARGET.releaseControlDomain,
  ].some((hostname) => routeCanMatchHostname(route?.pattern, hostname));
}

function normalizedObservedState(value) {
  if (
    !value ||
    !Array.isArray(value.routes) ||
    !Array.isArray(value.customDomains) ||
    value.customDomains.length !== 0 ||
    !value.subdomains ||
    canonicalAliceJson(Object.keys(value.subdomains).sort()) !==
      canonicalAliceJson([...ROLES].sort())
  ) {
    invalid();
  }
  const routes = sortedRoutes(value.routes.map((route) => {
    if (
      !ROUTE_ID.test(route?.id ?? "") ||
      typeof route?.pattern !== "string" ||
      route.pattern.length < 3 ||
      typeof route?.script !== "string" ||
      route.script.length < 3
    ) {
      invalid();
    }
    return { id: route.id, pattern: route.pattern, script: route.script };
  }));
  if (
    new Set(routes.map((route) => route.id)).size !== routes.length ||
    new Set(routes.map((route) => route.pattern)).size !== routes.length
  ) {
    invalid();
  }
  const subdomains = {};
  for (const role of ROLES) {
    const state = value.subdomains[role];
    if (
      typeof state?.enabled !== "boolean" ||
      typeof state?.previewsEnabled !== "boolean"
    ) {
      invalid();
    }
    subdomains[role] = {
      enabled: state.enabled,
      previewsEnabled: state.previewsEnabled,
    };
  }
  return { routes, customDomains: [], subdomains };
}

function targetSemantic(value) {
  if (
    !value ||
    !Array.isArray(value.routes) ||
    !Array.isArray(value.customDomains) ||
    value.customDomains.length !== 0 ||
    !value.subdomains ||
    canonicalAliceJson(Object.keys(value.subdomains).sort()) !==
      canonicalAliceJson([...ROLES].sort())
  ) {
    invalid();
  }
  const routes = sortedRoutes(value.routes.map((route) => {
    if (
      typeof route?.pattern !== "string" ||
      typeof route?.script !== "string" ||
      route.pattern.length < 3 ||
      route.script.length < 3
    ) {
      invalid();
    }
    return { pattern: route.pattern, script: route.script };
  }));
  if (new Set(routes.map((route) => route.pattern)).size !== routes.length) {
    invalid();
  }
  const subdomains = {};
  for (const role of ROLES) {
    const state = value.subdomains[role];
    if (
      typeof state?.enabled !== "boolean" ||
      typeof state?.previewsEnabled !== "boolean"
    ) {
      invalid();
    }
    subdomains[role] = {
      enabled: state.enabled,
      previewsEnabled: state.previewsEnabled,
    };
  }
  return { routes, customDomains: [], subdomains };
}

export function aliceExpectedProductionTrafficState() {
  return targetSemantic({
    routes: [
      {
        pattern: "alice.rndrntwrk.com/*",
        script: ALICE_CLOUDFLARE_TARGET.accessWorker,
      },
      {
        pattern: "alice.rndrntwrk.com/control/*",
        script: ALICE_CLOUDFLARE_TARGET.controlWorker,
      },
      {
        pattern:
          "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
        script: ALICE_CLOUDFLARE_TARGET.controlWorker,
      },
    ],
    customDomains: [],
    subdomains: {
      access: { enabled: false, previewsEnabled: false },
      control: { enabled: false, previewsEnabled: false },
      aiGateway: { enabled: true, previewsEnabled: false },
      statePlane: { enabled: false, previewsEnabled: false },
      connectorPlane: { enabled: false, previewsEnabled: false },
    },
  });
}

export function aliceExpectedReleaseControlTrafficState(currentInput) {
  const current = normalizedObservedState(currentInput);
  // Validate the complete observed Alice traffic set against the final target
  // before deriving the narrow pre-pause state. This rejects shadow routes and
  // custom domains while preserving existing production traffic unchanged.
  planAliceCandidateTrafficMutations(
    current,
    aliceExpectedProductionTrafficState(),
  );
  const releaseRoute = {
    pattern:
      "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
    script: ALICE_CLOUDFLARE_TARGET.controlWorker,
  };
  const routes = current.routes.map(({ pattern, script }) => ({ pattern, script }));
  if (!routes.some((route) => route.pattern === releaseRoute.pattern)) {
    routes.push(releaseRoute);
  }
  return targetSemantic({
    routes,
    customDomains: [],
    subdomains: current.subdomains,
  });
}

export function aliceExpectedControlTrafficState(currentInput) {
  const current = normalizedObservedState(currentInput);
  const finalTarget = aliceExpectedProductionTrafficState();
  planAliceCandidateTrafficMutations(current, finalTarget);
  const controlPatterns = new Set([
    "alice.rndrntwrk.com/control/*",
    "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
  ]);
  const routes = current.routes.map(({ pattern, script }) => ({ pattern, script }));
  for (const route of finalTarget.routes) {
    if (
      controlPatterns.has(route.pattern) &&
      !routes.some((currentRoute) => currentRoute.pattern === route.pattern)
    ) {
      routes.push(route);
    }
  }
  return targetSemantic({
    routes,
    customDomains: [],
    subdomains: current.subdomains,
  });
}

function planTraffic(currentInput, targetInput, allowReplacement) {
  const current = normalizedObservedState(currentInput);
  const target = targetSemantic(targetInput);
  const currentByPattern = new Map(
    current.routes.map((route) => [route.pattern, route]),
  );
  const targetByPattern = new Map(
    target.routes.map((route) => [route.pattern, route]),
  );
  const createRoutes = [];
  const updateRoutes = [];
  const deleteRoutes = [];
  for (const route of current.routes) {
    const expected = targetByPattern.get(route.pattern);
    if (!expected) {
      if (!allowReplacement) invalid();
      deleteRoutes.push(route);
    } else if (route.script !== expected.script) {
      if (!allowReplacement) invalid();
      updateRoutes.push({ id: route.id, ...expected });
    }
  }
  for (const route of target.routes) {
    if (!currentByPattern.has(route.pattern)) createRoutes.push(route);
  }
  const setSubdomains = ROLES.flatMap((role) =>
    canonicalAliceJson(current.subdomains[role]) ===
      canonicalAliceJson(target.subdomains[role])
      ? []
      : [{ role, ...target.subdomains[role] }],
  );
  return {
    createRoutes: sortedRoutes(createRoutes),
    updateRoutes: sortedRoutes(updateRoutes),
    deleteRoutes: sortedRoutes(deleteRoutes),
    setSubdomains,
  };
}

export function planAliceCandidateTrafficMutations(current, expected) {
  return planTraffic(current, expected, false);
}

export function planAliceTrafficRestoration(current, previous) {
  return planTraffic(current, previous, true);
}

async function apiEnvelope(
  { fetchImpl, apiToken, baseUrl },
  method,
  pathname,
  body,
) {
  const response = await fetchImpl(`${baseUrl}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${apiToken}`,
      accept: "application/json",
      "cache-control": "no-cache",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!(response instanceof Response) || !response.ok) invalid();
  let value;
  try {
    value = await response.json();
  } catch {
    invalid();
  }
  if (value?.success !== true || !("result" in value)) invalid();
  return value;
}

async function apiJson(client, method, pathname, body) {
  return (await apiEnvelope(client, method, pathname, body)).result;
}

function pathWithSearch(pathname, search) {
  const url = new URL(pathname, "https://alice.invalid");
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

async function apiGetAll(client, pathname, search = {}) {
  const values = [];
  let expectedTotalPages;
  let expectedTotalCount;
  for (let page = 1; page <= 100; page += 1) {
    const body = await apiEnvelope(
      client,
      "GET",
      pathWithSearch(pathname, { ...search, page, per_page: 100 }),
    );
    if (!Array.isArray(body.result)) invalid();
    values.push(...body.result);
    if (body.result_info === undefined) {
      if (body.result.length >= 100) invalid();
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
      body.result.length === 0 &&
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
      info.count !== body.result.length ||
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

export async function fetchAliceCloudflareTrafficState({
  fetchImpl = globalThis.fetch,
  apiToken,
  accountId = ALICE_CLOUDFLARE_TARGET.accountId,
  zoneId = ZONE_ID,
  baseUrl = API_BASE,
}) {
  if (
    typeof fetchImpl !== "function" ||
    typeof apiToken !== "string" ||
    apiToken.length < 8 ||
    accountId !== ALICE_CLOUDFLARE_TARGET.accountId ||
    zoneId !== ZONE_ID ||
    new URL(baseUrl).protocol !== "https:"
  ) {
    invalid();
  }
  const client = { fetchImpl, apiToken, baseUrl };
  const allRoutes = await apiGetAll(
    client,
    `/zones/${zoneId}/workers/routes`,
  );
  const domains = await apiGetAll(
    client,
    `/accounts/${accountId}/workers/domains`,
    { zone_id: zoneId },
  );
  if (!Array.isArray(allRoutes) || !Array.isArray(domains)) invalid();
  const subdomains = {};
  for (const role of ROLES) {
    const state = await apiJson(
      client,
      "GET",
      `/accounts/${accountId}/workers/scripts/${WORKERS[role]}/subdomain`,
    );
    subdomains[role] = {
      enabled: state?.enabled,
      previewsEnabled: state?.previews_enabled,
    };
  }
  const customDomains = domains
    .filter((domain) => [
      ALICE_CLOUDFLARE_TARGET.accessDomain,
      ALICE_CLOUDFLARE_TARGET.releaseControlDomain,
    ].includes(domain?.hostname?.toLowerCase()))
    .map((domain) => ({ hostname: domain.hostname, service: domain.service }));
  return normalizedObservedState({
    routes: allRoutes.filter(isAliceRoute).map((route) => ({
      id: route.id,
      pattern: route.pattern,
      script: route.script,
    })),
    customDomains,
    subdomains,
  });
}

async function applyPlan(client, plan) {
  for (const route of plan.deleteRoutes) {
    await apiJson(
      client,
      "DELETE",
      `/zones/${client.zoneId}/workers/routes/${route.id}`,
    );
  }
  for (const route of plan.updateRoutes) {
    await apiJson(
      client,
      "PUT",
      `/zones/${client.zoneId}/workers/routes/${route.id}`,
      { pattern: route.pattern, script: route.script },
    );
  }
  for (const route of plan.createRoutes) {
    await apiJson(
      client,
      "POST",
      `/zones/${client.zoneId}/workers/routes`,
      route,
    );
  }
  for (const subdomain of plan.setSubdomains) {
    await apiJson(
      client,
      "POST",
      `/accounts/${client.accountId}/workers/scripts/${WORKERS[subdomain.role]}/subdomain`,
      {
        enabled: subdomain.enabled,
        previews_enabled: subdomain.previewsEnabled,
      },
    );
  }
}

function semanticFromObserved(value) {
  return targetSemantic(value);
}

async function applyAndVerify({
  apiToken,
  expected,
  restore,
  convergenceSleep = defaultConvergenceSleep,
  ...options
}) {
  if (typeof convergenceSleep !== "function") invalid();
  const accountId = options.accountId ?? ALICE_CLOUDFLARE_TARGET.accountId;
  const zoneId = options.zoneId ?? ZONE_ID;
  const baseUrl = options.baseUrl ?? API_BASE;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const before = await fetchAliceCloudflareTrafficState({
    fetchImpl,
    apiToken,
    accountId,
    zoneId,
    baseUrl,
  });
  const plan = restore
    ? planAliceTrafficRestoration(before, expected)
    : planAliceCandidateTrafficMutations(before, expected);
  await applyPlan({ fetchImpl, apiToken, baseUrl, accountId, zoneId }, plan);
  const expectedSemantic = canonicalAliceJson(targetSemantic(expected));
  const priorSemantic = canonicalAliceJson(semanticFromObserved(before));
  const createOnly =
    !restore &&
    plan.createRoutes.length > 0 &&
    plan.updateRoutes.length === 0 &&
    plan.deleteRoutes.length === 0 &&
    plan.setSubdomains.length === 0;
  let after;
  for (let read = 1; read <= POST_CREATE_CONVERGENCE_READS; read += 1) {
    try {
      after = await fetchAliceCloudflareTrafficState({
        fetchImpl,
        apiToken,
        accountId,
        zoneId,
        baseUrl,
      });
    } catch (error) {
      if (
        createOnly &&
        error instanceof Error &&
        error.message === "ALICE_CLOUDFLARE_TRAFFIC_INVALID"
      ) {
        convergenceInvalid("READ_INVALID");
      }
      throw error;
    }
    const observedSemantic = canonicalAliceJson(semanticFromObserved(after));
    if (observedSemantic === expectedSemantic) {
      return { before, after, plan };
    }
    if (!createOnly || observedSemantic !== priorSemantic) {
      convergenceInvalid("SEMANTIC_DRIFT");
    }
    if (read === POST_CREATE_CONVERGENCE_READS) {
      convergenceInvalid("PRIOR_STATE_TIMEOUT");
    }
    await convergenceSleep();
  }
  invalid();
}

export async function applyAliceCandidateTrafficState(options) {
  return applyAndVerify({
    ...options,
    expected: options.expected ?? aliceExpectedProductionTrafficState(),
    restore: false,
  });
}

export async function restoreAliceTrafficState(options) {
  return applyAndVerify({ ...options, restore: true });
}

export function aliceTrafficSemanticState(value) {
  return semanticFromObserved(normalizedObservedState(value));
}
