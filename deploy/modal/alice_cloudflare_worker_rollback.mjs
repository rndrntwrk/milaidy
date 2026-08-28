import {
  ALICE_CLOUDFLARE_TARGET,
  canonicalAliceJson,
} from "../../workers/alice-effective-config.js";

const API_BASE = "https://api.cloudflare.com/client/v4";
const ROLES = [
  "access",
  "control",
  "aiGateway",
  "statePlane",
  "connectorPlane",
];
const RESTORE_ORDER = [
  "access",
  "connectorPlane",
  "aiGateway",
  "control",
  "statePlane",
];
const WORKERS = Object.freeze({
  access: ALICE_CLOUDFLARE_TARGET.accessWorker,
  control: ALICE_CLOUDFLARE_TARGET.controlWorker,
  aiGateway: ALICE_CLOUDFLARE_TARGET.aiGatewayWorker,
  statePlane: ALICE_CLOUDFLARE_TARGET.statePlaneWorker,
  connectorPlane: ALICE_CLOUDFLARE_TARGET.connectorPlaneWorker,
});
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/;

function invalid() {
  throw new Error("ALICE_CLOUDFLARE_WORKER_ROLLBACK_INVALID");
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, allowed, required = []) {
  if (!plainObject(value)) invalid();
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    invalid();
  }
}

function stringValue(value, allowNull = false) {
  if (allowNull && (value === undefined || value === null)) return null;
  if (typeof value !== "string" || value.length === 0 || /[\r\n]/.test(value)) {
    invalid();
  }
  return value;
}

function stringArray(value, fallback = []) {
  if (value === undefined || value === null) return [...fallback];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0) ||
    new Set(value).size !== value.length
  ) {
    invalid();
  }
  return [...value].sort();
}

function samplingRate(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    invalid();
  }
  return value;
}

function normalizeLogs(value) {
  if (value === undefined || value === null) return null;
  exactKeys(
    value,
    ["destinations", "enabled", "head_sampling_rate", "invocation_logs", "persist"],
    ["enabled", "invocation_logs"],
  );
  if (
    typeof value.enabled !== "boolean" ||
    typeof value.invocation_logs !== "boolean" ||
    (value.persist !== undefined && value.persist !== null &&
      typeof value.persist !== "boolean")
  ) {
    invalid();
  }
  return {
    enabled: value.enabled,
    invocation_logs: value.invocation_logs,
    destinations: stringArray(value.destinations),
    head_sampling_rate: samplingRate(value.head_sampling_rate),
    persist: value.persist ?? null,
  };
}

function normalizeTraces(value) {
  if (value === undefined || value === null) return null;
  exactKeys(
    value,
    ["destinations", "enabled", "head_sampling_rate", "persist", "propagation_policy"],
    ["enabled"],
  );
  if (
    typeof value.enabled !== "boolean" ||
    (value.persist !== undefined && value.persist !== null &&
      typeof value.persist !== "boolean") ||
    (value.propagation_policy !== undefined && value.propagation_policy !== null &&
      !["accept", "authenticated"].includes(value.propagation_policy))
  ) {
    invalid();
  }
  return {
    enabled: value.enabled,
    destinations: stringArray(value.destinations),
    head_sampling_rate: samplingRate(value.head_sampling_rate),
    persist: value.persist ?? null,
    propagation_policy: value.propagation_policy ?? null,
  };
}

function normalizeObservability(value) {
  if (value === undefined || value === null) {
    return {
      enabled: false,
      head_sampling_rate: null,
      logs: null,
      redact_query_string: false,
      traces: null,
    };
  }
  exactKeys(
    value,
    ["enabled", "head_sampling_rate", "logs", "redact_query_string", "traces"],
    ["enabled"],
  );
  if (
    typeof value.enabled !== "boolean" ||
    (Object.hasOwn(value, "redact_query_string") &&
      typeof value.redact_query_string !== "boolean")
  ) {
    invalid();
  }
  return {
    enabled: value.enabled,
    head_sampling_rate: samplingRate(value.head_sampling_rate),
    logs: normalizeLogs(value.logs),
    redact_query_string: value.redact_query_string ?? false,
    traces: normalizeTraces(value.traces),
  };
}

function normalizeTailConsumers(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) invalid();
  const normalized = value.map((consumer) => {
    exactKeys(
      consumer,
      ["environment", "namespace", "service"],
      ["service"],
    );
    return {
      service: stringValue(consumer.service),
      environment: stringValue(consumer.environment, true),
      namespace: stringValue(consumer.namespace, true),
    };
  });
  if (new Set(normalized.map(canonicalAliceJson)).size !== normalized.length) {
    invalid();
  }
  return normalized.sort((left, right) =>
    canonicalAliceJson(left).localeCompare(canonicalAliceJson(right)));
}

export function normalizeAliceCloudflareScriptSettings(value) {
  exactKeys(value, ["logpush", "observability", "tags", "tail_consumers"]);
  if (value.logpush !== undefined && typeof value.logpush !== "boolean") invalid();
  return {
    logpush: value.logpush ?? false,
    observability: value.observability === null
      ? null
      : normalizeObservability(value.observability),
    tags: value.tags === null ? null : stringArray(value.tags),
    tail_consumers: value.tail_consumers === null
      ? null
      : normalizeTailConsumers(value.tail_consumers),
  };
}

const BINDING_KEYS = Object.freeze({
  ai: { required: ["name", "type"], optional: ["project"] },
  d1: { required: ["database_id", "name", "type"], optional: ["id"] },
  durable_object_namespace: {
    required: ["name", "type"],
    optional: [
      "class_name",
      "dispatch_namespace",
      "environment",
      "namespace_id",
      "script_name",
    ],
  },
  plain_text: { required: ["name", "text", "type"], optional: [] },
  queue: { required: ["name", "queue_name", "type"], optional: [] },
  r2_bucket: {
    required: ["bucket_name", "name", "type"],
    optional: ["jurisdiction"],
  },
  secret_key: {
    required: ["algorithm", "format", "name", "type", "usages"],
    optional: [],
  },
  secret_text: { required: ["name", "type"], optional: [] },
  service: {
    required: ["name", "service", "type"],
    optional: ["entrypoint", "environment"],
  },
  version_metadata: { required: ["name", "type"], optional: [] },
  vectorize: { required: ["index_name", "name", "type"], optional: [] },
  workflow: {
    required: ["name", "type", "workflow_name"],
    optional: ["class_name", "script_name"],
  },
});

function normalizeBinding(binding) {
  if (!plainObject(binding) || !Object.hasOwn(BINDING_KEYS, binding.type)) {
    invalid();
  }
  const schema = BINDING_KEYS[binding.type];
  exactKeys(binding, [...schema.required, ...schema.optional], schema.required);
  if (!NAME.test(binding.name ?? "")) invalid();
  const normalized = {};
  for (const key of Object.keys(binding).sort()) {
    const value = binding[key];
    if (binding.type === "plain_text" && key === "text") {
      if (typeof value !== "string" || /[\r\n]/.test(value)) invalid();
      normalized[key] = value;
    } else if (key === "usages") {
      normalized[key] = stringArray(value);
    } else if (key === "algorithm") {
      if (!plainObject(value) && typeof value !== "string") invalid();
      normalized[key] = structuredClone(value);
    } else if (typeof value === "string" && value.length > 0 && !/[\r\n]/.test(value)) {
      normalized[key] = value;
    } else {
      invalid();
    }
  }
  return normalized;
}

function normalizeBindings(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) invalid();
  const bindings = value.map(normalizeBinding).sort((left, right) =>
    canonicalAliceJson(left).localeCompare(canonicalAliceJson(right)));
  if (
    new Set(bindings.map((binding) => `${binding.type}:${binding.name}`)).size !==
    bindings.length
  ) {
    invalid();
  }
  return bindings;
}

function normalizeScriptResource(value) {
  exactKeys(
    value,
    ["etag", "handlers", "last_deployed_from", "named_handlers"],
    ["etag"],
  );
  if (value.handlers !== undefined) stringArray(value.handlers);
  if (value.last_deployed_from !== undefined) {
    stringValue(value.last_deployed_from);
  }
  if (value.named_handlers !== undefined) {
    if (!Array.isArray(value.named_handlers)) invalid();
    const names = [];
    for (const handler of value.named_handlers) {
      exactKeys(handler, ["handlers", "name"], ["handlers", "name"]);
      names.push(stringValue(handler.name));
      stringArray(handler.handlers);
    }
    if (new Set(names).size !== names.length) invalid();
  }
  return { etag: normalizedEtag(value.etag) };
}

function normalizeScriptRuntime(value) {
  exactKeys(value, [
    "cache_options",
    "compatibility_date",
    "compatibility_flags",
    "exports",
    "limits",
    "migration_tag",
    "usage_model",
  ]);
  if (
    value.usage_model !== undefined &&
    value.usage_model !== null &&
    !["bundled", "standard", "unbound"].includes(value.usage_model)
  ) {
    invalid();
  }
  return {
    cache_options: normalizeCacheOptions(value.cache_options),
    compatibility_date: stringValue(value.compatibility_date, true),
    compatibility_flags: stringArray(value.compatibility_flags),
    exports: normalizeExports(value.exports),
    limits: normalizeLimits(value.limits),
    migration_tag: stringValue(value.migration_tag, true),
    usage_model: value.usage_model ?? null,
  };
}

export function normalizeAliceCloudflareVersionResources(value) {
  exactKeys(value, ["bindings", "script", "script_runtime"], [
    "bindings",
    "script",
    "script_runtime",
  ]);
  return {
    bindings: normalizeBindings(value.bindings),
    script: normalizeScriptResource(value.script),
    script_runtime: normalizeScriptRuntime(value.script_runtime),
  };
}

function normalizeCacheOptions(value) {
  if (value === undefined || value === null) return null;
  exactKeys(value, ["cross_version_cache", "enabled"], ["enabled"]);
  if (
    typeof value.enabled !== "boolean" ||
    (value.cross_version_cache !== undefined && value.cross_version_cache !== null &&
      typeof value.cross_version_cache !== "boolean")
  ) {
    invalid();
  }
  return {
    cross_version_cache: value.cross_version_cache ?? null,
    enabled: value.enabled,
  };
}

function normalizeExports(value) {
  if (value === undefined || value === null) return {};
  if (!plainObject(value)) invalid();
  const normalized = {};
  for (const name of Object.keys(value).sort()) {
    if (!NAME.test(name)) invalid();
    const exported = value[name];
    if (exported?.type === "worker") {
      exactKeys(exported, ["cache", "state", "type"], ["type"]);
      if (exported.state !== undefined && exported.state !== "created") invalid();
      let cache = null;
      if (exported.cache !== undefined && exported.cache !== null) {
        exactKeys(exported.cache, ["enabled"], ["enabled"]);
        if (typeof exported.cache.enabled !== "boolean") invalid();
        cache = { enabled: exported.cache.enabled };
      }
      normalized[name] = { cache, state: exported.state ?? "created", type: "worker" };
    } else if (exported?.type === "durable-object") {
      exactKeys(exported, ["container", "state", "storage", "type"], ["storage", "type"]);
      if (
        !["legacy-kv", "sqlite"].includes(exported.storage) ||
        (exported.state !== undefined && exported.state !== "created")
      ) {
        invalid();
      }
      normalized[name] = {
        container: stringValue(exported.container, true),
        state: exported.state ?? "created",
        storage: exported.storage,
        type: "durable-object",
      };
    } else {
      invalid();
    }
  }
  return normalized;
}

function normalizeLimits(value) {
  if (value === undefined || value === null) return null;
  exactKeys(value, ["cpu_ms", "subrequests"]);
  const result = { cpu_ms: null, subrequests: null };
  for (const key of Object.keys(result)) {
    if (value[key] !== undefined && value[key] !== null) {
      if (!Number.isSafeInteger(value[key]) || value[key] <= 0) invalid();
      result[key] = value[key];
    }
  }
  return result;
}

function classList(value) {
  return stringArray(value);
}

function classMoves(value, transferred = false) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) invalid();
  const keys = transferred ? ["from", "from_script", "to"] : ["from", "to"];
  const moves = value.map((move) => {
    exactKeys(move, keys, keys);
    return Object.fromEntries(keys.map((key) => [key, stringValue(move[key])]));
  });
  return moves.sort((left, right) =>
    canonicalAliceJson(left).localeCompare(canonicalAliceJson(right)));
}

function normalizeMigrationStep(value) {
  exactKeys(value, [
    "deleted_classes",
    "new_classes",
    "new_sqlite_classes",
    "renamed_classes",
    "transferred_classes",
  ]);
  return {
    deleted_classes: classList(value.deleted_classes),
    new_classes: classList(value.new_classes),
    new_sqlite_classes: classList(value.new_sqlite_classes),
    renamed_classes: classMoves(value.renamed_classes),
    transferred_classes: classMoves(value.transferred_classes, true),
  };
}

function normalizeMigrations(value) {
  if (value === undefined || value === null) return null;
  exactKeys(value, [
    "deleted_classes",
    "new_classes",
    "new_sqlite_classes",
    "new_tag",
    "old_tag",
    "renamed_classes",
    "steps",
    "transferred_classes",
  ]);
  const steps = value.steps === undefined || value.steps === null
    ? []
    : Array.isArray(value.steps)
      ? value.steps.map(normalizeMigrationStep)
      : invalid();
  return {
    deleted_classes: classList(value.deleted_classes),
    new_classes: classList(value.new_classes),
    new_sqlite_classes: classList(value.new_sqlite_classes),
    new_tag: stringValue(value.new_tag, true),
    old_tag: stringValue(value.old_tag, true),
    renamed_classes: classMoves(value.renamed_classes),
    steps,
    transferred_classes: classMoves(value.transferred_classes, true),
  };
}

function normalizePlacement(value) {
  if (value === undefined || value === null) return null;
  exactKeys(value, ["host", "hostname", "mode", "region", "target"]);
  const normalized = {};
  for (const key of ["host", "hostname", "mode", "region"]) {
    if (value[key] !== undefined) normalized[key] = stringValue(value[key]);
  }
  if (value.target !== undefined) {
    if (!Array.isArray(value.target) || value.target.length !== 1) invalid();
    const target = value.target[0];
    exactKeys(target, ["host", "hostname", "region"]);
    if (Object.keys(target).length !== 1) invalid();
    normalized.target = Object.fromEntries(
      Object.entries(target).map(([key, item]) => [key, stringValue(item)]),
    );
  }
  if (Object.keys(normalized).length === 0) invalid();
  return normalized;
}

function validateAnnotations(value) {
  if (value === undefined || value === null) return;
  exactKeys(value, ["workers/message", "workers/tag", "workers/triggered_by"]);
  for (const item of Object.values(value)) stringValue(item);
}

export function normalizeAliceCloudflareVersionSettings(value) {
  exactKeys(value, [
    "annotations",
    "bindings",
    "cache_options",
    "compatibility_date",
    "compatibility_flags",
    "exports",
    "exports_reconciliation",
    "limits",
    "logpush",
    "migrations",
    "observability",
    "placement",
    "tags",
    "tail_consumers",
    "usage_model",
  ]);
  validateAnnotations(value.annotations);
  if (value.exports_reconciliation !== undefined &&
      !plainObject(value.exports_reconciliation)) invalid();
  if (value.logpush !== undefined && typeof value.logpush !== "boolean") invalid();
  if (
    value.usage_model !== undefined &&
    value.usage_model !== null &&
    !["bundled", "standard", "unbound"].includes(value.usage_model)
  ) {
    invalid();
  }
  return {
    bindings: normalizeBindings(value.bindings),
    cache_options: normalizeCacheOptions(value.cache_options),
    compatibility_date: stringValue(value.compatibility_date, true),
    compatibility_flags: stringArray(value.compatibility_flags),
    exports: normalizeExports(value.exports),
    limits: normalizeLimits(value.limits),
    logpush: value.logpush ?? false,
    migrations: normalizeMigrations(value.migrations),
    observability: normalizeObservability(value.observability),
    placement: normalizePlacement(value.placement),
    tags: stringArray(value.tags),
    tail_consumers: normalizeTailConsumers(value.tail_consumers),
    usage_model: value.usage_model ?? null,
  };
}

function withoutNulls(value) {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (!plainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, withoutNulls(item)]),
  );
}

function scriptSettingsPatch(value) {
  return {
    logpush: value.logpush,
    observability: value.observability === null
      ? null
      : withoutNulls(value.observability),
    tags: value.tags,
    tail_consumers: value.tail_consumers === null
      ? null
      : value.tail_consumers.map(withoutNulls),
  };
}

function validInputs({ fetchImpl, apiToken, accountId, baseUrl }) {
  try {
    return (
      typeof fetchImpl === "function" &&
      typeof apiToken === "string" &&
      apiToken.length >= 8 &&
      !/[\r\n]/.test(apiToken) &&
      accountId === ALICE_CLOUDFLARE_TARGET.accountId &&
      new URL(baseUrl).protocol === "https:"
    );
  } catch {
    return false;
  }
}

async function apiRequest(client, method, pathname, body) {
  const response = await client.fetchImpl(`${client.baseUrl}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${client.apiToken}`,
      accept: "application/json",
      "cache-control": "no-cache",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!(response instanceof Response) || !response.ok) invalid();
  let envelope;
  try {
    envelope = await response.json();
  } catch {
    invalid();
  }
  if (envelope?.success !== true || !("result" in envelope)) invalid();
  return envelope.result;
}

function deploymentIdentity(value) {
  const deployment = value?.deployments?.[0];
  if (
    !deployment ||
    !UUID.test(deployment.id ?? "") ||
    !Array.isArray(deployment.versions) ||
    deployment.versions.length !== 1 ||
    deployment.versions[0]?.percentage !== 100 ||
    !UUID.test(deployment.versions[0]?.version_id ?? "")
  ) {
    invalid();
  }
  return {
    deploymentId: deployment.id,
    versionId: deployment.versions[0].version_id,
  };
}

function normalizedEtag(value) {
  const result = typeof value === "string"
    ? value.replace(/^W\//, "").replaceAll('"', "")
    : "";
  if (result.length < 8 || result.length > 256 || /[\s\r\n]/.test(result)) invalid();
  return result;
}

async function captureWorker(client, role) {
  const worker = WORKERS[role];
  const root = `/accounts/${client.accountId}/workers/scripts/${worker}`;
  const serving = deploymentIdentity(
    await apiRequest(client, "GET", `${root}/deployments`),
  );
  const version = await apiRequest(
    client,
    "GET",
    `${root}/versions/${serving.versionId}`,
  );
  if (version?.id !== serving.versionId) invalid();
  const snapshot = {
    worker,
    serving,
    scriptSettings: normalizeAliceCloudflareScriptSettings(
      await apiRequest(client, "GET", `${root}/script-settings`),
    ),
    versionResources: normalizeAliceCloudflareVersionResources(version.resources),
  };
  const servingAfter = deploymentIdentity(
    await apiRequest(client, "GET", `${root}/deployments`),
  );
  if (canonicalAliceJson(servingAfter) !== canonicalAliceJson(serving)) {
    invalid();
  }
  return snapshot;
}

function verifyWorkerSnapshot(value, role) {
  exactKeys(value, ["scriptSettings", "serving", "versionResources", "worker"], [
    "scriptSettings",
    "serving",
    "versionResources",
    "worker",
  ]);
  if (value.worker !== WORKERS[role]) invalid();
  exactKeys(
    value.serving,
    ["deploymentId", "versionId"],
    ["deploymentId", "versionId"],
  );
  if (
    !UUID.test(value.serving.deploymentId ?? "") ||
    !UUID.test(value.serving.versionId ?? "")
  ) {
    invalid();
  }
  if (
    canonicalAliceJson(normalizeAliceCloudflareScriptSettings(value.scriptSettings)) !==
      canonicalAliceJson(value.scriptSettings) ||
    canonicalAliceJson(
      normalizeAliceCloudflareVersionResources(value.versionResources),
    ) !== canonicalAliceJson(value.versionResources)
  ) {
    invalid();
  }
  return value;
}

export function verifyAliceCloudflareWorkerRollbackStateSnapshot(value) {
  exactKeys(value, ROLES, ROLES);
  for (const role of ROLES) verifyWorkerSnapshot(value[role], role);
  return value;
}

export async function captureAliceCloudflareWorkerRollbackState({
  fetchImpl = globalThis.fetch,
  apiToken,
  accountId = ALICE_CLOUDFLARE_TARGET.accountId,
  baseUrl = API_BASE,
}) {
  if (!validInputs({ fetchImpl, apiToken, accountId, baseUrl })) invalid();
  const client = { fetchImpl, apiToken, accountId, baseUrl };
  const state = {};
  for (const role of ROLES) state[role] = await captureWorker(client, role);
  return verifyAliceCloudflareWorkerRollbackStateSnapshot(state);
}

export async function restoreAliceCloudflareWorkerRollbackState({
  expected,
  fetchImpl = globalThis.fetch,
  apiToken,
  accountId = ALICE_CLOUDFLARE_TARGET.accountId,
  baseUrl = API_BASE,
}) {
  verifyAliceCloudflareWorkerRollbackStateSnapshot(expected);
  if (!validInputs({ fetchImpl, apiToken, accountId, baseUrl })) invalid();
  const client = { fetchImpl, apiToken, accountId, baseUrl };
  for (const role of RESTORE_ORDER) {
    const root = `/accounts/${accountId}/workers/scripts/${WORKERS[role]}`;
    const patched = normalizeAliceCloudflareScriptSettings(
      await apiRequest(
        client,
        "PATCH",
        `${root}/script-settings`,
        scriptSettingsPatch(expected[role].scriptSettings),
      ),
    );
    if (
      canonicalAliceJson(patched) !==
      canonicalAliceJson(expected[role].scriptSettings)
    ) {
      invalid();
    }
  }
  const first = await captureAliceCloudflareWorkerRollbackState({
    fetchImpl,
    apiToken,
    accountId,
    baseUrl,
  });
  const second = await captureAliceCloudflareWorkerRollbackState({
    fetchImpl,
    apiToken,
    accountId,
    baseUrl,
  });
  const rollbackTarget = (state) => Object.fromEntries(
    ROLES.map((role) => {
      const { deploymentId: _deploymentId, ...serving } = state[role].serving;
      return [role, { ...state[role], serving }];
    }),
  );
  if (
    canonicalAliceJson(rollbackTarget(first)) !==
      canonicalAliceJson(rollbackTarget(expected)) ||
    canonicalAliceJson(rollbackTarget(second)) !==
      canonicalAliceJson(rollbackTarget(expected)) ||
    ROLES.some((role) =>
      first[role].serving.deploymentId !==
        second[role].serving.deploymentId ||
      first[role].serving.deploymentId ===
        expected[role].serving.deploymentId)
  ) {
    invalid();
  }
  return {
    deployments: Object.fromEntries(ROLES.map((role) => [role, {
      previousDeploymentId: expected[role].serving.deploymentId,
      rollbackDeploymentId: second[role].serving.deploymentId,
      versionId: second[role].serving.versionId,
    }])),
    restored: second,
  };
}
