import crypto from "node:crypto";
import fs from "node:fs";

import {
  ALICE_CLOUDFLARE_RECOVERY_PERMISSION_GROUPS,
  buildAliceRecoveryCredentialReadiness,
  normalizeAliceCloudflareRecoveryTokenPolicy,
} from "../deploy/modal/alice_recovery_credential_binding.mjs";
import { canonicalAliceJson } from "../workers/alice-effective-config.js";

const digest = (value) => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
const read = (name) => fs.readFileSync(process.env[name], "utf8");
const encodedPolicy = process.env.ALICE_RECOVERY_CREDENTIAL_POLICY_B64URL ?? "";
const policyBytes = Buffer.from(encodedPolicy, "base64url");
const policy = JSON.parse(policyBytes.toString("utf8"));
const verify = JSON.parse(read("ALICE_RECOVERY_PROVIDER_READBACK_PATH"));
const policyReadbackBytes = read("ALICE_RECOVERY_PROVIDER_POLICY_READBACK_PATH");
const providerPolicyReadback = JSON.parse(policyReadbackBytes);
const token = providerPolicyReadback?.token?.result;
const catalog = providerPolicyReadback?.permissionGroups?.result;
const tokenId = verify?.result?.id;
const observedAtMs = Date.now();
const policies = Array.isArray(token?.policies) ? token.policies : [];
const catalogById = new Map(Array.isArray(catalog)
  ? catalog.map((group) => [group?.id, group])
  : []);
const references = policies.flatMap((entry) =>
  Array.isArray(entry?.permission_groups) ? entry.permission_groups : []);
const observedGroups = references.map((reference) => {
  const group = catalogById.get(reference?.id);
  return group && {
    name: group.name,
    scope: Array.isArray(group.scopes) && group.scopes.length === 1
      ? group.scopes[0]
      : "",
  };
});
const sorted = (items) => [...items].sort((left, right) =>
  canonicalAliceJson(left).localeCompare(canonicalAliceJson(right)));

function callsite(error) {
  const frames = String(error?.stack ?? "").split("\n");
  const frame = frames.slice(2).find((line) =>
    line.includes("alice_recovery_credential_binding.mjs:"));
  return Number(frame?.match(/alice_recovery_credential_binding\.mjs:(\d+):/)?.[1] ?? 0);
}

const report = {
  schemaVersion: 1,
  policyDigestMatches: digest(policyBytes) ===
    process.env.ALICE_RECOVERY_CREDENTIAL_POLICY_SHA256,
  policyCanonical: canonicalAliceJson(policy) === policyBytes.toString("utf8"),
  verifySuccess: verify?.success === true,
  verifyResultShapeExact: Object.keys(verify?.result ?? {}).every((key) =>
    ["expires_on", "id", "not_before", "status"].includes(key)),
  verifyStatusActive: verify?.result?.status === "active",
  verifyIdMatchesSignedPolicy: typeof tokenId === "string" &&
    digest(tokenId) === policy.tokenIdSha256,
  tokenDetailSuccess: providerPolicyReadback?.token?.success === true,
  tokenDetailIdMatchesVerify: token?.id === tokenId,
  tokenDetailStatusActive: token?.status === "active",
  verifyDatesMatchDetail:
    (!("not_before" in (verify?.result ?? {})) ||
      verify.result.not_before === token?.not_before) &&
    (!("expires_on" in (verify?.result ?? {})) ||
      verify.result.expires_on === token?.expires_on),
  validityAtLeastFiveHours: token?.expires_on == null ||
    Date.parse(token.expires_on) >= observedAtMs + 5 * 60 * 60 * 1000,
  tokenConditionEmpty: token?.condition == null ||
    (typeof token.condition === "object" &&
      !Array.isArray(token.condition) && Object.keys(token.condition).length === 0),
  tokenPolicyCount: Array.isArray(token?.policies) ? token.policies.length : -1,
  permissionCatalogSuccess: providerPolicyReadback?.permissionGroups?.success === true,
  permissionCatalogCount: Array.isArray(catalog) ? catalog.length : -1,
  permissionReferencesResolvable: observedGroups.every(Boolean),
  referencedGroupsMatchExpected: observedGroups.every(Boolean) &&
    canonicalAliceJson(sorted(observedGroups)) ===
      canonicalAliceJson(sorted(ALICE_CLOUDFLARE_RECOVERY_PERMISSION_GROUPS)),
  policyResourcesMatchExpected: policies.length === 2 &&
    policies.every((entry) => Object.values(entry?.resources ?? {}).length === 1 &&
      Object.values(entry.resources)[0] === "*") &&
    canonicalAliceJson(policies.flatMap((entry) => Object.keys(entry.resources)).sort()) ===
      canonicalAliceJson([
        `com.cloudflare.api.account.${policy.accountId}`,
        `com.cloudflare.api.account.zone.${policy.zoneId}`,
      ].sort()),
  policyReadbackBytes: Buffer.byteLength(policyReadbackBytes),
};

try {
  const normalized = normalizeAliceCloudflareRecoveryTokenPolicy({
    tokenId,
    providerPolicyReadback,
    observedAtMs,
  });
  report.normalization = "pass";
  report.providerPolicyDigestMatches = digest(canonicalAliceJson(normalized)) ===
    policy.expectedProviderPolicySha256;
} catch (error) {
  report.normalization = "fail";
  report.normalizationFailureLine = callsite(error);
}

try {
  buildAliceRecoveryCredentialReadiness({
    provider: "cloudflare",
    sourceSha: process.env.ALICE_SOURCE_COMMIT,
    watchdogRunId: Number(process.env.GITHUB_RUN_ID),
    watchdogRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    parentRunId: Number(process.env.GITHUB_RUN_ID),
    parentRunAttempt: 1,
    encodedPolicy,
    expectedPolicySha256: process.env.ALICE_RECOVERY_CREDENTIAL_POLICY_SHA256,
    providerReadback: verify,
    providerPolicyReadback,
    observedAtMs,
  });
  report.binding = "pass";
} catch (error) {
  report.binding = "fail";
  report.bindingFailureLine = callsite(error);
}

process.stdout.write(`${JSON.stringify(report)}\n`);
if (report.binding !== "pass") process.exitCode = 1;
