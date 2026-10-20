#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALICE_CLOUDFLARE_TARGET,
  canonicalAliceJson,
} from "../../workers/alice-effective-config.js";

export const ALICE_CONTAINER_APPLICATION_PROBE_SCHEMA =
  "alice.container-application-probe.v1";

const API_BASE = "https://api.cloudflare.com/client/v4";
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const VERSION_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CONTAINER_IMAGE =
  /^registry\.cloudflare\.com\/036df6c823669b8fa2f66cf4c16eeb29\/alice-runtime@sha256:[a-f0-9]{64}$/;
const NAMESPACE_ID = /^[a-f0-9]{32}$/;
const APPLICATION_NAME = "alice-production-runtime";
const ALLOWED_PREDICATES = new Set([
  "OK",
  "PROVIDER_RESPONSE_INVALID",
  "PROVIDER_TRANSPORT_INVALID",
  "PROVIDER_HTTP_INVALID",
  "PROVIDER_JSON_INVALID",
  "PROVIDER_ENVELOPE_INVALID",
  "PROVIDER_APPLICATION_LIST_INVALID",
  "PROVIDER_APPLICATION_CARDINALITY_INVALID",
  "PROVIDER_APPLICATION_LIST_NAME_INVALID",
  "PROVIDER_APPLICATION_LIST_ID_INVALID",
  "APPLICATION_MISSING",
  "APPLICATION_VERSIONS_NOT_ARRAY",
  "APPLICATION_INSTANCES_NOT_ARRAY",
  "APPLICATION_INSTANCE_CARDINALITY_INVALID",
  "APPLICATION_INSTANCE_SHAPE_INVALID",
  "APPLICATION_ID_INVALID",
  "APPLICATION_ACCOUNT_ID_MISMATCH",
  "APPLICATION_NAME_MISMATCH",
  "APPLICATION_VERSION_INVALID",
  "APPLICATION_SCHEDULING_POLICY_INVALID",
  "APPLICATION_MAX_INSTANCES_INVALID",
  "APPLICATION_ROLLOUT_GRACE_INVALID",
  "APPLICATION_NAMESPACE_ID_INVALID",
  "APPLICATION_HEALTH_INSTANCES_MISSING",
  "APPLICATION_HEALTH_FAILED_INVALID",
  "APPLICATION_ACTIVE_ROLLOUT_INVALID",
  "APPLICATION_VERSION_NUMBER_INVALID",
  "APPLICATION_VERSION_PERCENTAGE_INVALID",
  "APPLICATION_ACTIVE_VERSION_CARDINALITY_INVALID",
  "APPLICATION_ACTIVE_VERSION_MISMATCH",
  "APPLICATION_CONFIGURATION_INVALID",
  "APPLICATION_IMAGE_INVALID",
  "APPLICATION_INSTANCE_RESOURCES_INVALID",
  "APPLICATION_LOGGING_INVALID",
  "ACTIVE_VERSION_CONFIGURATION_INVALID",
  "ACTIVE_VERSION_IMAGE_INVALID",
  "ACTIVE_VERSION_INSTANCE_RESOURCES_INVALID",
  "ACTIVE_VERSION_LOGGING_INVALID",
  "APPLICATION_CONFIGURATION_MISMATCH",
  "CAPTURE_DRIFT",
]);

export class AliceContainerApplicationProbeError extends Error {
  constructor(predicateId, details = {}) {
    super(`ALICE_CONTAINER_APPLICATION_PROBE_INVALID:${predicateId}`);
    this.name = "AliceContainerApplicationProbeError";
    this.code = "ALICE_CONTAINER_APPLICATION_PROBE_INVALID";
    this.predicateId = predicateId;
    this.details = Object.freeze({ ...details });
  }
}

class AliceContainerApplicationProviderError extends Error {
  constructor({ predicateId, operation, status = 0, providerCode = null }) {
    super(predicateId);
    this.name = "AliceContainerApplicationProviderError";
    this.predicateId = predicateId;
    this.operation = operation;
    this.status = status;
    this.providerCode = providerCode;
  }
}

const fail = (predicateId, details = {}) => {
  throw new AliceContainerApplicationProbeError(predicateId, details);
};
const sha256 = (value) =>
  `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
const digestValue = (value) => sha256(Buffer.from(`${canonicalAliceJson(value)}\n`));

function exactKeys(value, expected, predicateId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(predicateId);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(predicateId, { expectedKeys: wanted, observedKeys: actual });
  }
}

function observedType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function outcome({
  predicateId,
  field,
  expected,
  observed,
  role = null,
  index = null,
  applicationId = null,
  providerOperation = "APPLICATION_STATE",
  providerHttpStatus = 200,
  providerCode = null,
}) {
  if (!ALLOWED_PREDICATES.has(predicateId)) {
    fail("PREDICATE_NOT_ALLOWLISTED", { predicateId });
  }
  return Object.freeze({
    predicateId,
    field,
    role,
    index,
    applicationId,
    expectedDigest: digestValue(expected),
    observedDigest: digestValue(observed),
    observedType: observedType(observed),
    providerOperation,
    providerHttpStatus,
    providerCode,
    mutations: 0,
  });
}

function invalid(predicateId, field, expected, observed, context = {}) {
  return {
    ok: false,
    outcome: outcome({
      predicateId,
      field,
      expected,
      observed,
      ...context,
    }),
  };
}

function normalizeConfiguration(value, role, applicationId) {
  const prefix = role === "application" ? "APPLICATION" : "ACTIVE_VERSION";
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid(
      `${prefix}_CONFIGURATION_INVALID`,
      "configuration",
      "object",
      observedType(value),
      { role, applicationId },
    );
  }
  if (!CONTAINER_IMAGE.test(value.image ?? "")) {
    return invalid(
      `${prefix}_IMAGE_INVALID`,
      "configuration.image",
      "registry.cloudflare.com/<account>/alice-runtime@sha256:<64hex>",
      value.image ?? null,
      { role, applicationId },
    );
  }
  const standardOne =
    value.instance_type === "standard-1" ||
    (
      value.vcpu === 0.5 &&
      value.memory_mib === 4096 &&
      value.disk?.size_mb === 8000
    );
  if (!standardOne) {
    return invalid(
      `${prefix}_INSTANCE_RESOURCES_INVALID`,
      "configuration.instance_type|resources",
      {
        instance_type: "standard-1",
        resolved: { vcpu: 0.5, memory_mib: 4096, disk_mb: 8000 },
      },
      {
        instance_type: value.instance_type ?? null,
        vcpu: value.vcpu ?? null,
        memory_mib: value.memory_mib ?? null,
        disk_mb: value.disk?.size_mb ?? null,
      },
      { role, applicationId },
    );
  }
  if (value.observability?.logs?.enabled !== true) {
    return invalid(
      `${prefix}_LOGGING_INVALID`,
      "configuration.observability.logs.enabled",
      true,
      value.observability?.logs?.enabled ?? null,
      { role, applicationId },
    );
  }
  return {
    ok: true,
    normalized: Object.freeze({
      image: value.image,
      instance_type: "standard-1",
      observability: { logs: { enabled: true } },
    }),
  };
}

export function diagnoseAliceContainerApplicationRollbackState(value) {
  const application = value?.application;
  const applicationVersions = value?.applicationVersions;
  const applicationInstances = value?.applicationInstances;
  const applicationId = VERSION_ID.test(application?.id ?? "")
    ? application.id
    : null;

  if (!application || typeof application !== "object" || Array.isArray(application)) {
    return invalid(
      "APPLICATION_MISSING",
      "application",
      "object",
      observedType(application),
    ).outcome;
  }
  if (!Array.isArray(applicationVersions)) {
    return invalid(
      "APPLICATION_VERSIONS_NOT_ARRAY",
      "applicationVersions",
      "array",
      observedType(applicationVersions),
      { applicationId },
    ).outcome;
  }
  if (!Array.isArray(applicationInstances)) {
    return invalid(
      "APPLICATION_INSTANCES_NOT_ARRAY",
      "applicationInstances",
      "array",
      observedType(applicationInstances),
      { applicationId },
    ).outcome;
  }
  if (applicationInstances.length > 1) {
    return invalid(
      "APPLICATION_INSTANCE_CARDINALITY_INVALID",
      "applicationInstances.length",
      "0..1",
      applicationInstances.length,
      { applicationId },
    ).outcome;
  }
  const badInstance = applicationInstances.findIndex(
    (instance) =>
      !instance || typeof instance !== "object" || Array.isArray(instance),
  );
  if (badInstance >= 0) {
    return invalid(
      "APPLICATION_INSTANCE_SHAPE_INVALID",
      "applicationInstances[]",
      "object",
      observedType(applicationInstances[badInstance]),
      { applicationId, index: badInstance },
    ).outcome;
  }
  if (!VERSION_ID.test(application.id ?? "")) {
    return invalid(
      "APPLICATION_ID_INVALID",
      "application.id",
      "uuid",
      application.id ?? null,
    ).outcome;
  }
  if (application.account_id !== ALICE_CLOUDFLARE_TARGET.accountId) {
    return invalid(
      "APPLICATION_ACCOUNT_ID_MISMATCH",
      "application.account_id",
      ALICE_CLOUDFLARE_TARGET.accountId,
      application.account_id ?? null,
      { applicationId },
    ).outcome;
  }
  if (application.name !== APPLICATION_NAME) {
    return invalid(
      "APPLICATION_NAME_MISMATCH",
      "application.name",
      APPLICATION_NAME,
      application.name ?? null,
      { applicationId },
    ).outcome;
  }
  if (!Number.isSafeInteger(application.version) || application.version < 1) {
    return invalid(
      "APPLICATION_VERSION_INVALID",
      "application.version",
      "positive-safe-integer",
      application.version ?? null,
      { applicationId },
    ).outcome;
  }
  if (application.scheduling_policy !== "default") {
    return invalid(
      "APPLICATION_SCHEDULING_POLICY_INVALID",
      "application.scheduling_policy",
      "default",
      application.scheduling_policy ?? null,
      { applicationId },
    ).outcome;
  }
  if (application.max_instances !== 1) {
    return invalid(
      "APPLICATION_MAX_INSTANCES_INVALID",
      "application.max_instances",
      1,
      application.max_instances ?? null,
      { applicationId },
    ).outcome;
  }
  if (application.rollout_active_grace_period !== 0) {
    return invalid(
      "APPLICATION_ROLLOUT_GRACE_INVALID",
      "application.rollout_active_grace_period",
      0,
      application.rollout_active_grace_period ?? null,
      { applicationId },
    ).outcome;
  }
  if (!NAMESPACE_ID.test(application.durable_objects?.namespace_id ?? "")) {
    return invalid(
      "APPLICATION_NAMESPACE_ID_INVALID",
      "application.durable_objects.namespace_id",
      "32-lowercase-hex",
      application.durable_objects?.namespace_id ?? null,
      { applicationId },
    ).outcome;
  }
  const health = application.health?.instances;
  if (!health || typeof health !== "object" || Array.isArray(health)) {
    return invalid(
      "APPLICATION_HEALTH_INSTANCES_MISSING",
      "application.health.instances",
      "object",
      observedType(health),
      { applicationId },
    ).outcome;
  }
  if (health.failed !== 0) {
    return invalid(
      "APPLICATION_HEALTH_FAILED_INVALID",
      "application.health.instances.failed",
      0,
      health.failed ?? null,
      { applicationId },
    ).outcome;
  }
  if (
    application.active_rollout_id !== undefined &&
    application.active_rollout_id !== null &&
    application.active_rollout_id !== ""
  ) {
    return invalid(
      "APPLICATION_ACTIVE_ROLLOUT_INVALID",
      "application.active_rollout_id",
      "absent|null|empty",
      application.active_rollout_id,
      { applicationId },
    ).outcome;
  }

  for (let index = 0; index < applicationVersions.length; index += 1) {
    const version = applicationVersions[index];
    if (!Number.isSafeInteger(version?.version) || version.version < 1) {
      return invalid(
        "APPLICATION_VERSION_NUMBER_INVALID",
        "applicationVersions[].version",
        "positive-safe-integer",
        version?.version ?? null,
        { applicationId, role: "active-version-set", index },
      ).outcome;
    }
    if (
      !Number.isSafeInteger(version.percentage) ||
      ![0, 100].includes(version.percentage)
    ) {
      return invalid(
        "APPLICATION_VERSION_PERCENTAGE_INVALID",
        "applicationVersions[].percentage",
        "0|100",
        version.percentage ?? null,
        { applicationId, role: "active-version-set", index },
      ).outcome;
    }
  }

  const activeVersions = applicationVersions.filter(
    (version) => version.percentage === 100,
  );
  if (activeVersions.length !== 1) {
    return invalid(
      "APPLICATION_ACTIVE_VERSION_CARDINALITY_INVALID",
      "applicationVersions[percentage=100].length",
      1,
      activeVersions.length,
      { applicationId },
    ).outcome;
  }
  if (activeVersions[0].version !== application.version) {
    return invalid(
      "APPLICATION_ACTIVE_VERSION_MISMATCH",
      "activeVersion.version",
      application.version,
      activeVersions[0].version,
      { applicationId },
    ).outcome;
  }

  const applicationConfiguration = normalizeConfiguration(
    application.configuration,
    "application",
    applicationId,
  );
  if (!applicationConfiguration.ok) return applicationConfiguration.outcome;
  const activeConfiguration = normalizeConfiguration(
    activeVersions[0].configuration,
    "active-version",
    applicationId,
  );
  if (!activeConfiguration.ok) return activeConfiguration.outcome;
  if (
    canonicalAliceJson(applicationConfiguration.normalized) !==
      canonicalAliceJson(activeConfiguration.normalized)
  ) {
    return invalid(
      "APPLICATION_CONFIGURATION_MISMATCH",
      "application.configuration|activeVersion.configuration",
      applicationConfiguration.normalized,
      activeConfiguration.normalized,
      { applicationId },
    ).outcome;
  }

  const normalized = Object.freeze({
    schemaVersion: "alice.container-application-state.v1",
    accountId: application.account_id,
    applicationId: application.id,
    applicationName: application.name,
    applicationVersion: application.version,
    namespaceId: application.durable_objects.namespace_id,
    schedulingPolicy: application.scheduling_policy,
    maxInstances: application.max_instances,
    rolloutActiveGracePeriod: application.rollout_active_grace_period,
    target: { configuration: applicationConfiguration.normalized },
  });
  return outcome({
    predicateId: "OK",
    field: "application",
    expected: normalized,
    observed: normalized,
    applicationId,
  });
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

async function providerJson({ fetchImpl, apiToken, pathname, operation }) {
  let response;
  try {
    response = await fetchImpl(`${API_BASE}${pathname}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiToken}`,
        accept: "application/json",
        "cache-control": "no-cache",
      },
    });
  } catch {
    throw new AliceContainerApplicationProviderError({
      predicateId: "PROVIDER_TRANSPORT_INVALID",
      operation,
    });
  }
  if (!(response instanceof Response)) {
    throw new AliceContainerApplicationProviderError({
      predicateId: "PROVIDER_RESPONSE_INVALID",
      operation,
    });
  }
  let envelope = null;
  try {
    envelope = await response.json();
  } catch {
    throw new AliceContainerApplicationProviderError({
      predicateId: response.ok ? "PROVIDER_JSON_INVALID" : "PROVIDER_HTTP_INVALID",
      operation,
      status: response.status,
    });
  }
  const providerCode = Array.isArray(envelope?.errors) &&
    Number.isSafeInteger(envelope.errors[0]?.code)
    ? envelope.errors[0].code
    : null;
  if (!response.ok) {
    throw new AliceContainerApplicationProviderError({
      predicateId: "PROVIDER_HTTP_INVALID",
      operation,
      status: response.status,
      providerCode,
    });
  }
  if (envelope?.success !== true || !("result" in envelope)) {
    throw new AliceContainerApplicationProviderError({
      predicateId: "PROVIDER_ENVELOPE_INVALID",
      operation,
      status: response.status,
      providerCode,
    });
  }
  return envelope.result;
}

async function captureRawState({ fetchImpl, apiToken }) {
  const base = `/accounts/${ALICE_CLOUDFLARE_TARGET.accountId}/containers`;
  const applications = await providerJson({
    fetchImpl,
    apiToken,
    pathname: `${base}/applications?name=${APPLICATION_NAME}`,
    operation: "LIST_APPLICATIONS",
  });
  if (!Array.isArray(applications)) {
    return {
      outcome: outcome({
        predicateId: "PROVIDER_APPLICATION_LIST_INVALID",
        field: "applications",
        expected: "array",
        observed: observedType(applications),
        providerOperation: "LIST_APPLICATIONS",
      }),
    };
  }
  if (applications.length !== 1) {
    return {
      outcome: outcome({
        predicateId: "PROVIDER_APPLICATION_CARDINALITY_INVALID",
        field: "applications.length",
        expected: 1,
        observed: applications.length,
        providerOperation: "LIST_APPLICATIONS",
      }),
    };
  }
  if (applications[0]?.name !== APPLICATION_NAME) {
    return {
      outcome: outcome({
        predicateId: "PROVIDER_APPLICATION_LIST_NAME_INVALID",
        field: "applications[0].name",
        expected: APPLICATION_NAME,
        observed: applications[0]?.name ?? null,
        providerOperation: "LIST_APPLICATIONS",
      }),
    };
  }
  if (!VERSION_ID.test(applications[0]?.id ?? "")) {
    return {
      outcome: outcome({
        predicateId: "PROVIDER_APPLICATION_LIST_ID_INVALID",
        field: "applications[0].id",
        expected: "uuid",
        observed: applications[0]?.id ?? null,
        providerOperation: "LIST_APPLICATIONS",
      }),
    };
  }
  const applicationId = applications[0].id;
  const [application, applicationVersions, instancePage] = await Promise.all([
    providerJson({
      fetchImpl,
      apiToken,
      pathname: `${base}/applications/${applicationId}`,
      operation: "GET_APPLICATION",
    }),
    providerJson({
      fetchImpl,
      apiToken,
      pathname: `${base}/applications/${applicationId}/versions`,
      operation: "LIST_APPLICATION_VERSIONS",
    }),
    providerJson({
      fetchImpl,
      apiToken,
      pathname: `${base}/applications/${applicationId}/instances`,
      operation: "LIST_APPLICATION_INSTANCES",
    }),
  ]);
  return {
    outcome: diagnoseAliceContainerApplicationRollbackState({
      application,
      applicationVersions,
      applicationInstances: instancePage?.instances,
    }),
  };
}

async function captureSemantic({ fetchImpl, apiToken }) {
  try {
    return (await captureRawState({ fetchImpl, apiToken })).outcome;
  } catch (error) {
    if (!(error instanceof AliceContainerApplicationProviderError)) throw error;
    return outcome({
      predicateId: error.predicateId,
      field: "provider",
      expected: { status: 200, success: true, result: true },
      observed: {
        status: error.status,
        providerCode: error.providerCode,
      },
      providerOperation: error.operation,
      providerHttpStatus: error.status,
      providerCode: error.providerCode,
    });
  }
}

export async function captureAliceContainerApplicationProbe({
  fetchImpl = globalThis.fetch,
  apiToken,
  sourceCommit,
  now = () => new Date().toISOString(),
  sleep = () => new Promise((resolve) => setTimeout(resolve, 250)),
}) {
  if (
    typeof fetchImpl !== "function" ||
    typeof apiToken !== "string" ||
    apiToken.length < 32 ||
    !COMMIT.test(sourceCommit ?? "") ||
    typeof now !== "function" ||
    typeof sleep !== "function"
  ) {
    fail("CAPTURE_INPUT_INVALID");
  }
  const observedAtFirst = now();
  if (!canonicalTimestamp(observedAtFirst)) fail("CAPTURE_TIMESTAMP_INVALID");
  const first = await captureSemantic({ fetchImpl, apiToken });
  await sleep();
  const observedAtSecond = now();
  if (!canonicalTimestamp(observedAtSecond)) fail("CAPTURE_TIMESTAMP_INVALID");
  const second = await captureSemantic({ fetchImpl, apiToken });
  const firstDigest = digestValue(first);
  const secondDigest = digestValue(second);
  const stable = firstDigest === secondDigest;
  const semantic = stable
    ? first
    : outcome({
        predicateId: "CAPTURE_DRIFT",
        field: "semanticCapture",
        expected: firstDigest,
        observed: secondDigest,
        applicationId: first.applicationId ?? second.applicationId,
        providerOperation: "DOUBLE_CAPTURE",
        providerHttpStatus: second.providerHttpStatus,
        providerCode: second.providerCode,
      });
  const unsigned = Object.freeze({
    schemaVersion: ALICE_CONTAINER_APPLICATION_PROBE_SCHEMA,
    sourceCommit,
    observedAtFirst,
    observedAtSecond,
    captureCount: 2,
    ...semantic,
    stableCaptureSha256: stable
      ? firstDigest
      : digestValue({ firstDigest, secondDigest }),
  });
  return Object.freeze({
    ...unsigned,
    probeSha256: digestValue(unsigned),
  });
}

export function verifyAliceContainerApplicationProbe(value) {
  exactKeys(value, [
    "schemaVersion",
    "sourceCommit",
    "observedAtFirst",
    "observedAtSecond",
    "captureCount",
    "predicateId",
    "field",
    "role",
    "index",
    "applicationId",
    "expectedDigest",
    "observedDigest",
    "observedType",
    "providerOperation",
    "providerHttpStatus",
    "providerCode",
    "mutations",
    "stableCaptureSha256",
    "probeSha256",
  ], "PROBE_KEYS_INVALID");
  if (value.schemaVersion !== ALICE_CONTAINER_APPLICATION_PROBE_SCHEMA) {
    fail("PROBE_SCHEMA_INVALID");
  }
  if (!COMMIT.test(value.sourceCommit ?? "")) fail("PROBE_SOURCE_INVALID");
  if (
    !canonicalTimestamp(value.observedAtFirst) ||
    !canonicalTimestamp(value.observedAtSecond) ||
    Date.parse(value.observedAtSecond) < Date.parse(value.observedAtFirst)
  ) {
    fail("PROBE_TIMESTAMP_INVALID");
  }
  if (value.captureCount !== 2 || value.mutations !== 0) {
    fail("PROBE_EXECUTION_INVALID");
  }
  if (!ALLOWED_PREDICATES.has(value.predicateId)) {
    fail("PROBE_PREDICATE_INVALID");
  }
  for (const field of ["expectedDigest", "observedDigest", "stableCaptureSha256", "probeSha256"]) {
    if (!DIGEST.test(value[field] ?? "")) fail("PROBE_DIGEST_INVALID", { field });
  }
  if (
    typeof value.field !== "string" ||
    typeof value.observedType !== "string" ||
    typeof value.providerOperation !== "string" ||
    !Number.isSafeInteger(value.providerHttpStatus) ||
    value.providerHttpStatus < 0 ||
    value.providerHttpStatus > 599 ||
    (value.providerCode !== null && !Number.isSafeInteger(value.providerCode)) ||
    (value.applicationId !== null && !VERSION_ID.test(value.applicationId)) ||
    (value.role !== null && typeof value.role !== "string") ||
    (value.index !== null && (!Number.isSafeInteger(value.index) || value.index < 0))
  ) {
    fail("PROBE_FIELD_INVALID");
  }
  const { probeSha256, ...unsigned } = value;
  const expected = digestValue(unsigned);
  if (probeSha256 !== expected) {
    fail("PROBE_DIGEST_MISMATCH", { expected, observed: probeSha256 });
  }
  return Object.freeze(value);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith("--") || !value || value.startsWith("--")) {
      fail("CLI_ARGUMENT_INVALID", { token: token?.slice(0, 120) ?? null });
    }
    const name = token.slice(2);
    if (values.has(name)) fail("CLI_DUPLICATE_ARGUMENT", { name });
    values.set(name, value);
  }
  return values;
}

async function main(argv) {
  const values = parseArgs(argv);
  const output = values.get("output");
  if (!output || !path.isAbsolute(output)) fail("CLI_OUTPUT_INVALID");
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const sourceCommit = process.env.ALICE_SOURCE_COMMIT;
  const probe = await captureAliceContainerApplicationProbe({
    apiToken: token,
    sourceCommit,
  });
  verifyAliceContainerApplicationProbe(probe);
  fs.writeFileSync(output, `${canonicalAliceJson(probe)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    predicateId: probe.predicateId,
    probeSha256: probe.probeSha256,
    mutations: probe.mutations,
  })}\n`);
}

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof AliceContainerApplicationProbeError) {
      process.stderr.write(`${JSON.stringify({
        code: error.code,
        predicateId: error.predicateId,
        details: error.details,
      })}\n`);
    } else {
      process.stderr.write(`${JSON.stringify({
        code: "ALICE_CONTAINER_APPLICATION_PROBE_INTERNAL",
        message: error?.message ?? String(error),
      })}\n`);
    }
    process.exitCode = 1;
  });
}
