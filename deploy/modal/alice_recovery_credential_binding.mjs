import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";

const ACCOUNT_ID = "036df6c823669b8fa2f66cf4c16eeb29";
const ZONE_ID = "7b24984479ee4cddb6c5d8a9b7a0f2c6";
const MODAL_APP_ID = "ap-oFaCNy2jJDFalZienNB2Ht";
const MODAL_APP_ID_PATTERN = /^ap-[A-Za-z0-9]{20,32}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const CLOUDFLARE_TOKEN_ID = /^[a-f0-9]{32}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const MODAL_PROVIDER_IDENTITY_KEYS = Object.freeze([
  "appId",
  "environment",
  "providerVersion",
]);
const MODAL_PROVIDER_CAPTURE_KEYS = Object.freeze([
  ...MODAL_PROVIDER_IDENTITY_KEYS,
  "providerHistory",
  "functionIds",
  "function",
  "mountedSecretObjects",
  "mountedVolumeIds",
  "imageObjectIds",
  "autoscalerEnforcement",
]);
export const ALICE_RECOVERY_CREDENTIAL_MIN_VALIDITY_MS = 5 * 60 * 60 * 1000;
export const ALICE_CLOUDFLARE_POLICY_READBACK_MAX_BYTES = 128 * 1024;

export const ALICE_CLOUDFLARE_RECOVERY_CAPABILITIES = Object.freeze([
  "account.containers.read-write",
  "account.queues.read-write",
  "account.r2.read",
  "account.workers-scripts.read-write",
  "account.workflows.read",
  "zone.workers-routes.read-write",
]);

export const ALICE_CLOUDFLARE_RECOVERY_PERMISSION_GROUPS = Object.freeze([
  Object.freeze({
    name: "Queues Write",
    scope: "com.cloudflare.api.account",
  }),
  Object.freeze({
    name: "Workers R2 Storage Read",
    scope: "com.cloudflare.api.account",
  }),
  Object.freeze({
    name: "Workers Scripts Write",
    scope: "com.cloudflare.api.account",
  }),
  Object.freeze({
    name: "Workers Containers Write",
    scope: "com.cloudflare.api.account",
  }),
  Object.freeze({
    name: "Workers Routes Write",
    scope: "com.cloudflare.api.account.zone",
  }),
]);

export const ALICE_MODAL_RECOVERY_OPERATIONS = Object.freeze([
  "app.deployment-history.read",
  "app.layout.read",
  "app.read",
  "app.rollback",
  "secret.delete",
  "secret.list",
]);

function invalid() {
  throw new Error("ALICE_RECOVERY_CREDENTIAL_BINDING_INVALID");
}

function exactKeys(value, keys) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      JSON.stringify(Object.keys(value).sort()) ===
        JSON.stringify([...keys].sort()),
  );
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function decodePolicy(encodedPolicy, expectedPolicySha256) {
  if (
    typeof encodedPolicy !== "string" ||
    encodedPolicy.length < 64 ||
    encodedPolicy.length > 64 * 1024 ||
    !/^[A-Za-z0-9_-]+$/.test(encodedPolicy) ||
    !DIGEST.test(expectedPolicySha256 ?? "")
  ) {
    invalid();
  }
  const bytes = Buffer.from(encodedPolicy, "base64url");
  if (
    bytes.length < 32 ||
    bytes.length > 48 * 1024 ||
    bytes.toString("base64url") !== encodedPolicy ||
    sha256(bytes) !== expectedPolicySha256
  ) {
    invalid();
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes));
  } catch {
    invalid();
  }
  if (canonicalAliceJson(value) !== bytes.toString("utf8")) invalid();
  return value;
}

export function encodeAliceRecoveryCredentialPolicy(policy) {
  return Buffer.from(canonicalAliceJson(policy), "utf8").toString("base64url");
}

function validateCommon(input) {
  if (
    !COMMIT.test(input.sourceSha ?? "") ||
    !Number.isSafeInteger(input.watchdogRunId) ||
    input.watchdogRunId < 1 ||
    input.watchdogRunAttempt !== 1 ||
    !Number.isSafeInteger(input.parentRunId) ||
    input.parentRunId < 1 ||
    input.parentRunAttempt !== 1 ||
    !["modal", "cloudflare"].includes(input.provider)
  ) {
    invalid();
  }
}

function validateModalPolicy(policy, credentialId, providerReadback) {
  if (
    !exactKeys(policy, [
      "appId",
      "appName",
      "authorityModel",
      "environment",
      "provider",
      "requiredOperations",
      "schemaVersion",
      "tokenIdSha256",
    ]) ||
    policy.schemaVersion !== "alice.modal-recovery-credential-policy.v1" ||
    policy.provider !== "modal" ||
    policy.authorityModel !== "workspace-token-non-granular" ||
    policy.environment !== "main" ||
    policy.appId !== MODAL_APP_ID ||
    policy.appName !== "alice-runtime" ||
    canonicalAliceJson(policy.requiredOperations) !==
      canonicalAliceJson(ALICE_MODAL_RECOVERY_OPERATIONS) ||
    !DIGEST.test(policy.tokenIdSha256 ?? "") ||
    typeof credentialId !== "string" ||
    credentialId.length < 16 ||
    credentialId.length > 256 ||
    sha256(credentialId) !== policy.tokenIdSha256 ||
    !(
      exactKeys(providerReadback, MODAL_PROVIDER_IDENTITY_KEYS) ||
      exactKeys(providerReadback, MODAL_PROVIDER_CAPTURE_KEYS)
    ) ||
    !MODAL_APP_ID_PATTERN.test(providerReadback.appId ?? "") ||
    providerReadback.environment !== policy.environment ||
    !Number.isSafeInteger(providerReadback.providerVersion) ||
    providerReadback.providerVersion < 1
  ) {
    invalid();
  }
  return {
    appId: providerReadback.appId,
    environment: providerReadback.environment,
    providerVersion: providerReadback.providerVersion,
  };
}

function optionalTimestamp(value) {
  if (value === undefined || value === null) return null;
  if (!RFC3339.test(value) || !Number.isFinite(Date.parse(value))) invalid();
  return value;
}

function exactEnvelopeResult(envelope) {
  if (
    !envelope ||
    typeof envelope !== "object" ||
    Array.isArray(envelope) ||
    envelope.success !== true ||
    !("result" in envelope)
  ) {
    invalid();
  }
  return envelope.result;
}

function exactCloudflareVerifyEnvelope(envelope) {
  const hasCompactShape = exactKeys(envelope, ["result", "success"]);
  const hasStandardShape = exactKeys(envelope, [
    "errors",
    "messages",
    "result",
    "success",
  ]);
  return Boolean(
    (hasCompactShape || hasStandardShape) &&
      (!hasStandardShape || (
        Array.isArray(envelope.errors) &&
        envelope.errors.length === 0 &&
        Array.isArray(envelope.messages)
      )),
  );
}

function normalizeResources(resources) {
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) {
    invalid();
  }
  const keys = Object.keys(resources).sort();
  if (keys.length !== 1 || resources[keys[0]] !== "*") invalid();
  return { [keys[0]]: "*" };
}

export function normalizeAliceCloudflareRecoveryTokenPolicy({
  tokenId,
  providerPolicyReadback,
  observedAtMs,
}) {
  if (
    !CLOUDFLARE_TOKEN_ID.test(tokenId ?? "") ||
    !Number.isSafeInteger(observedAtMs) ||
    observedAtMs < 1
  ) {
    invalid();
  }
  if (
    !exactKeys(providerPolicyReadback, ["permissionGroups", "token"]) ||
    !Array.isArray(exactEnvelopeResult(providerPolicyReadback.permissionGroups))
  ) {
    invalid();
  }
  const token = exactEnvelopeResult(providerPolicyReadback.token);
  if (
    !token ||
    typeof token !== "object" ||
    Array.isArray(token) ||
    token.id !== tokenId ||
    token.status !== "active" ||
    !(
      token.condition === undefined ||
      token.condition === null ||
      exactKeys(token.condition, [])
    ) ||
    !Array.isArray(token.policies) ||
    token.policies.length !== 2
  ) {
    invalid();
  }

  const catalog = new Map();
  for (const group of providerPolicyReadback.permissionGroups.result) {
    if (
      !group ||
      typeof group !== "object" ||
      Array.isArray(group) ||
      !CLOUDFLARE_TOKEN_ID.test(group.id ?? "") ||
      typeof group.name !== "string" ||
      !Array.isArray(group.scopes) ||
      group.scopes.some((scope) => typeof scope !== "string") ||
      catalog.has(group.id)
    ) {
      invalid();
    }
    catalog.set(group.id, {
      name: group.name,
      scopes: [...group.scopes].sort(),
    });
  }

  const normalizedPolicies = token.policies.map((providerPolicy) => {
    if (
      !providerPolicy ||
      typeof providerPolicy !== "object" ||
      Array.isArray(providerPolicy) ||
      !CLOUDFLARE_TOKEN_ID.test(providerPolicy.id ?? "") ||
      providerPolicy.effect !== "allow" ||
      !Array.isArray(providerPolicy.permission_groups) ||
      providerPolicy.permission_groups.length < 1
    ) {
      invalid();
    }
    const permissionGroups = providerPolicy.permission_groups.map((group) => {
      if (
        !group ||
        typeof group !== "object" ||
        Array.isArray(group) ||
        !CLOUDFLARE_TOKEN_ID.test(group.id ?? "") ||
        !catalog.has(group.id)
      ) {
        invalid();
      }
      const providerGroup = catalog.get(group.id);
      if (group.name !== undefined && group.name !== providerGroup.name) invalid();
      return {
        id: group.id,
        name: providerGroup.name,
        scopes: providerGroup.scopes,
      };
    }).sort((left, right) => left.id.localeCompare(right.id));
    if (new Set(permissionGroups.map((group) => group.id)).size !==
        permissionGroups.length) invalid();
    return {
      id: providerPolicy.id,
      effect: "allow",
      permissionGroups,
      resources: normalizeResources(providerPolicy.resources),
    };
  }).sort((left, right) => canonicalAliceJson(left).localeCompare(
    canonicalAliceJson(right),
  ));

  const accountResource = `com.cloudflare.api.account.${ACCOUNT_ID}`;
  const zoneResource = `com.cloudflare.api.account.zone.${ZONE_ID}`;
  const accountPolicy = normalizedPolicies.find((entry) =>
    canonicalAliceJson(entry.resources) ===
      canonicalAliceJson({ [accountResource]: "*" }));
  const zonePolicy = normalizedPolicies.find((entry) =>
    canonicalAliceJson(entry.resources) ===
      canonicalAliceJson({ [zoneResource]: "*" }));
  if (!accountPolicy || !zonePolicy || accountPolicy === zonePolicy) invalid();
  const observedGroups = normalizedPolicies.flatMap((entry) =>
    entry.permissionGroups.map((group) => ({
      name: group.name,
      scope: group.scopes.length === 1 ? group.scopes[0] : "",
    })));
  if (
    canonicalAliceJson(observedGroups.sort((left, right) =>
      canonicalAliceJson(left).localeCompare(canonicalAliceJson(right)))) !==
    canonicalAliceJson([...ALICE_CLOUDFLARE_RECOVERY_PERMISSION_GROUPS].sort(
      (left, right) => canonicalAliceJson(left).localeCompare(
        canonicalAliceJson(right),
      ),
    )) ||
    accountPolicy.permissionGroups.some((group) =>
      group.scopes.length !== 1 ||
      group.scopes[0] !== "com.cloudflare.api.account") ||
    zonePolicy.permissionGroups.length !== 1 ||
    zonePolicy.permissionGroups[0].scopes.length !== 1 ||
    zonePolicy.permissionGroups[0].scopes[0] !==
      "com.cloudflare.api.account.zone"
  ) {
    invalid();
  }

  const notBefore = optionalTimestamp(token.not_before);
  const expiresOn = optionalTimestamp(token.expires_on);
  if (
    (notBefore !== null && Date.parse(notBefore) > observedAtMs) ||
    (expiresOn !== null &&
      Date.parse(expiresOn) <
        observedAtMs + ALICE_RECOVERY_CREDENTIAL_MIN_VALIDITY_MS)
  ) {
    invalid();
  }
  return {
    tokenId,
    status: "active",
    notBefore,
    expiresOn,
    condition: null,
    policies: normalizedPolicies,
  };
}

function validateCloudflarePolicy(
  policy,
  providerReadback,
  providerPolicyReadback,
  observedAtMs,
) {
  if (
    !exactKeys(policy, [
      "accountId",
      "capabilities",
      "expectedProviderPolicySha256",
      "provider",
      "resources",
      "schemaVersion",
      "status",
      "tokenIdSha256",
      "zoneId",
    ]) ||
    policy.schemaVersion !==
      "alice.cloudflare-recovery-credential-policy.v1" ||
    policy.provider !== "cloudflare" ||
    policy.status !== "active" ||
    policy.accountId !== ACCOUNT_ID ||
    policy.zoneId !== ZONE_ID ||
    !DIGEST.test(policy.tokenIdSha256 ?? "") ||
    !DIGEST.test(policy.expectedProviderPolicySha256 ?? "") ||
    !exactKeys(policy.resources, ["accounts", "zones"]) ||
    canonicalAliceJson(policy.resources) !== canonicalAliceJson({
      accounts: [ACCOUNT_ID],
      zones: [ZONE_ID],
    }) ||
    canonicalAliceJson(policy.capabilities) !==
      canonicalAliceJson(ALICE_CLOUDFLARE_RECOVERY_CAPABILITIES) ||
    !exactCloudflareVerifyEnvelope(providerReadback) ||
    providerReadback.success !== true ||
    !providerReadback.result ||
    typeof providerReadback.result !== "object" ||
    Array.isArray(providerReadback.result) ||
    Object.keys(providerReadback.result).some((key) =>
      !["expires_on", "id", "not_before", "status"].includes(key)) ||
    !CLOUDFLARE_TOKEN_ID.test(providerReadback.result.id ?? "") ||
    providerReadback.result.status !== "active" ||
    (Object.prototype.hasOwnProperty.call(
      providerReadback.result,
      "not_before",
    ) && optionalTimestamp(providerReadback.result.not_before) !==
      optionalTimestamp(providerPolicyReadback?.token?.result?.not_before)) ||
    (Object.prototype.hasOwnProperty.call(
      providerReadback.result,
      "expires_on",
    ) && optionalTimestamp(providerReadback.result.expires_on) !==
      optionalTimestamp(providerPolicyReadback?.token?.result?.expires_on)) ||
    sha256(providerReadback.result.id) !== policy.tokenIdSha256
  ) {
    invalid();
  }
  const normalizedProviderPolicy =
    normalizeAliceCloudflareRecoveryTokenPolicy({
      tokenId: providerReadback.result.id,
      providerPolicyReadback,
      observedAtMs,
    });
  const providerPolicySha256 = sha256(canonicalAliceJson(
    normalizedProviderPolicy,
  ));
  if (providerPolicySha256 !== policy.expectedProviderPolicySha256) invalid();
  return {
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    tokenStatus: "active",
    providerPolicySha256,
    credentialValidity: {
      observedAt: new Date(observedAtMs).toISOString(),
      minimumValidUntil: new Date(
        observedAtMs + ALICE_RECOVERY_CREDENTIAL_MIN_VALIDITY_MS,
      ).toISOString(),
      notBefore: normalizedProviderPolicy.notBefore,
      expiresOn: normalizedProviderPolicy.expiresOn,
    },
  };
}

export function buildAliceRecoveryCredentialReadiness(input) {
  validateCommon(input);
  const policy = decodePolicy(
    input.encodedPolicy,
    input.expectedPolicySha256,
  );
  const providerIdentity = input.provider === "modal"
    ? validateModalPolicy(policy, input.credentialId, input.providerReadback)
    : validateCloudflarePolicy(
      policy,
      input.providerReadback,
      input.providerPolicyReadback,
      input.observedAtMs,
    );
  return {
    schemaVersion: 1,
    sourceSha: input.sourceSha,
    watchdogRunId: input.watchdogRunId,
    watchdogRunAttempt: input.watchdogRunAttempt,
    parentRunId: input.parentRunId,
    parentRunAttempt: input.parentRunAttempt,
    provider: input.provider,
    providerReadback: "verified",
    providerIdentity,
    credentialIdSha256: policy.tokenIdSha256,
    credentialPolicySha256: input.expectedPolicySha256,
    ...(input.provider === "cloudflare"
      ? { providerPolicySha256: providerIdentity.providerPolicySha256 }
      : {}),
  };
}

function readJson(filePath, maxBytes = 64 * 1024) {
  try {
    const stat = fs.lstatSync(filePath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size < 2 ||
      stat.size > maxBytes
    ) {
      invalid();
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof Error && error.message ===
      "ALICE_RECOVERY_CREDENTIAL_BINDING_INVALID") throw error;
    invalid();
  }
}

export function readAliceCloudflareRecoveryPolicyReadback(filePath) {
  return readJson(filePath, ALICE_CLOUDFLARE_POLICY_READBACK_MAX_BYTES);
}

function positiveInteger(value) {
  if (!/^[1-9][0-9]*$/.test(value ?? "")) invalid();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) invalid();
  return parsed;
}

function writeReadonly(filePath, value) {
  if (!path.isAbsolute(filePath) || !fs.existsSync(path.dirname(filePath))) invalid();
  fs.writeFileSync(filePath, `${canonicalAliceJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

async function main() {
  const provider = process.env.ALICE_RECOVERY_PROVIDER;
  const input = {
    provider,
    sourceSha: process.env.ALICE_SOURCE_COMMIT,
    watchdogRunId: positiveInteger(process.env.ALICE_WATCHDOG_RUN_ID),
    watchdogRunAttempt: positiveInteger(
      process.env.ALICE_WATCHDOG_RUN_ATTEMPT,
    ),
    parentRunId: positiveInteger(process.env.ALICE_PARENT_RUN_ID),
    parentRunAttempt: positiveInteger(process.env.ALICE_PARENT_RUN_ATTEMPT),
    credentialId: provider === "modal" ? process.env.MODAL_TOKEN_ID : undefined,
    encodedPolicy: process.env.ALICE_RECOVERY_CREDENTIAL_POLICY_B64URL,
    expectedPolicySha256:
      process.env.ALICE_RECOVERY_CREDENTIAL_POLICY_SHA256,
    providerReadback: readJson(
      process.env.ALICE_RECOVERY_PROVIDER_READBACK_PATH,
    ),
    providerPolicyReadback: provider === "cloudflare"
      ? readAliceCloudflareRecoveryPolicyReadback(
        process.env.ALICE_RECOVERY_PROVIDER_POLICY_READBACK_PATH,
      )
      : undefined,
    observedAtMs: provider === "cloudflare" ? Date.now() : undefined,
  };
  const readiness = buildAliceRecoveryCredentialReadiness(input);
  writeReadonly(process.env.ALICE_RECOVERY_READINESS_PATH, readiness);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
