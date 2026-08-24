import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";

import {
  ALICE_CLOUDFLARE_RECOVERY_CAPABILITIES,
  ALICE_CLOUDFLARE_RECOVERY_PERMISSION_GROUPS,
  ALICE_RECOVERY_CREDENTIAL_MIN_VALIDITY_MS,
  ALICE_MODAL_RECOVERY_OPERATIONS,
  buildAliceRecoveryCredentialReadiness,
  encodeAliceRecoveryCredentialPolicy,
  normalizeAliceCloudflareRecoveryTokenPolicy,
} from "./alice_recovery_credential_binding.mjs";

const sourceSha = "a".repeat(40);
const accountId = "036df6c823669b8fa2f66cf4c16eeb29";
const zoneId = "7b24984479ee4cddb6c5d8a9b7a0f2c6";
const observedAtMs = 1_787_400_000_000;

function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function common() {
  return {
    sourceSha,
    watchdogRunId: 101,
    watchdogRunAttempt: 1,
    parentRunId: 202,
    parentRunAttempt: 1,
  };
}

function cloudflareProviderFixture({
  tokenId = "0123456789abcdef0123456789abcdef",
  expiresOn,
  broaden = false,
} = {}) {
  const groupIds = ["1", "2", "3", "4"].map((value) => value.repeat(32));
  const groups = ALICE_CLOUDFLARE_RECOVERY_PERMISSION_GROUPS.map(
    (group, index) => ({
      id: groupIds[index],
      name: group.name,
      scopes: [group.scope],
    }),
  );
  if (broaden) {
    groups.push({
      id: "5".repeat(32),
      name: "Access: Apps and Policies Write",
      scopes: ["com.cloudflare.api.account"],
    });
  }
  const accountGroups = groups.filter((group) =>
    group.scopes[0] === "com.cloudflare.api.account");
  const token = {
    id: tokenId,
    status: "active",
    ...(expiresOn === undefined ? {} : { expires_on: expiresOn }),
    policies: [
      {
        id: "a".repeat(32),
        effect: "allow",
        resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
        permission_groups: accountGroups.map((group) => ({
          id: group.id,
          name: group.name,
        })),
      },
      {
        id: "b".repeat(32),
        effect: "allow",
        resources: { [`com.cloudflare.api.account.zone.${zoneId}`]: "*" },
        permission_groups: [{
          id: groups[3].id,
          name: groups[3].name,
        }],
      },
    ],
  };
  return {
    verify: {
      success: true,
      result: {
        id: tokenId,
        status: "active",
        ...(expiresOn === undefined ? {} : { expires_on: expiresOn }),
      },
    },
    policy: {
      token: { success: true, result: token },
      permissionGroups: { success: true, result: groups },
    },
  };
}

function cloudflarePolicy(tokenId, providerPolicyReadback) {
  const normalized = normalizeAliceCloudflareRecoveryTokenPolicy({
    tokenId,
    providerPolicyReadback,
    observedAtMs,
  });
  return {
    schemaVersion: "alice.cloudflare-recovery-credential-policy.v1",
    provider: "cloudflare",
    tokenIdSha256: digest(tokenId),
    expectedProviderPolicySha256: digest(canonicalAliceJson(normalized)),
    status: "active",
    accountId,
    zoneId,
    resources: { accounts: [accountId], zones: [zoneId] },
    capabilities: [...ALICE_CLOUDFLARE_RECOVERY_CAPABILITIES],
  };
}

test("binds an exact non-granular Modal credential and provider workspace", () => {
  const credentialId = "ak-test-modal-recovery-token-id";
  const policy = {
    schemaVersion: "alice.modal-recovery-credential-policy.v1",
    provider: "modal",
    tokenIdSha256: digest(credentialId),
    authorityModel: "workspace-token-non-granular",
    environment: "main",
    appId: "ap-oFaCNy2jJDFalZienNB2Ht",
    appName: "alice-runtime",
    requiredOperations: [...ALICE_MODAL_RECOVERY_OPERATIONS],
  };
  const encodedPolicy = encodeAliceRecoveryCredentialPolicy(policy);
  const policySha256 = digest(Buffer.from(encodedPolicy, "base64url"));
  const readiness = buildAliceRecoveryCredentialReadiness({
    ...common(),
    provider: "modal",
    credentialId,
    encodedPolicy,
    expectedPolicySha256: policySha256,
    providerReadback: {
      appId: policy.appId,
      environment: "main",
      providerVersion: 48,
    },
  });
  assert.deepEqual(readiness, {
    schemaVersion: 1,
    sourceSha,
    watchdogRunId: 101,
    watchdogRunAttempt: 1,
    parentRunId: 202,
    parentRunAttempt: 1,
    provider: "modal",
    providerReadback: "verified",
    providerIdentity: {
      appId: policy.appId,
      environment: "main",
      providerVersion: 48,
    },
    credentialIdSha256: policy.tokenIdSha256,
    credentialPolicySha256: policySha256,
  });
  assert.equal(JSON.stringify(readiness).includes(credentialId), false);
});

test("binds the full sanitized Modal capture emitted by the watchdog", () => {
  const credentialId = "ak-test-modal-recovery-token-id";
  const policy = {
    schemaVersion: "alice.modal-recovery-credential-policy.v1",
    provider: "modal",
    tokenIdSha256: digest(credentialId),
    authorityModel: "workspace-token-non-granular",
    environment: "main",
    appId: "ap-oFaCNy2jJDFalZienNB2Ht",
    appName: "alice-runtime",
    requiredOperations: [...ALICE_MODAL_RECOVERY_OPERATIONS],
  };
  const encodedPolicy = encodeAliceRecoveryCredentialPolicy(policy);
  const readiness = buildAliceRecoveryCredentialReadiness({
    ...common(),
    provider: "modal",
    credentialId,
    encodedPolicy,
    expectedPolicySha256: digest(Buffer.from(encodedPolicy, "base64url")),
    providerReadback: {
      appId: policy.appId,
      environment: "main",
      providerVersion: 48,
      providerHistory: [{
        providerVersion: 48,
        rollbackVersion: 47,
        clientVersion: "1.5.4",
        deployedBy: "ci",
        commitHash: sourceSha,
        dirty: false,
      }],
      functionIds: { alice_web: "fu-1234567890123456789012" },
      function: {
        name: "alice_web",
        id: "fu-1234567890123456789012",
        webUrl: "https://rndrntwrk--alice.modal.run",
        inputFormats: ["DATA_FORMAT_PICKLE"],
      },
      mountedSecretObjects: [],
      mountedVolumeIds: [],
      imageObjectIds: ["im-1234567890123456789012"],
      autoscalerEnforcement: { status: "provider-unverifiable" },
    },
  });

  assert.deepEqual(readiness.providerIdentity, {
    appId: policy.appId,
    environment: "main",
    providerVersion: 48,
  });
});

test("binds an active Cloudflare token to the exact reviewed recovery policy", () => {
  const tokenId = "0123456789abcdef0123456789abcdef";
  const provider = cloudflareProviderFixture({
    tokenId,
    expiresOn: "2099-01-01T00:00:00Z",
  });
  const policy = cloudflarePolicy(tokenId, provider.policy);
  const encodedPolicy = encodeAliceRecoveryCredentialPolicy(policy);
  const policySha256 = digest(Buffer.from(encodedPolicy, "base64url"));
  const readiness = buildAliceRecoveryCredentialReadiness({
    ...common(),
    provider: "cloudflare",
    encodedPolicy,
    expectedPolicySha256: policySha256,
    providerReadback: provider.verify,
    providerPolicyReadback: provider.policy,
    observedAtMs,
  });
  assert.equal(readiness.credentialIdSha256, policy.tokenIdSha256);
  assert.equal(readiness.credentialPolicySha256, policySha256);
  assert.deepEqual(readiness.providerIdentity, {
    accountId,
    zoneId,
    tokenStatus: "active",
    providerPolicySha256: policy.expectedProviderPolicySha256,
    credentialValidity: {
      observedAt: new Date(observedAtMs).toISOString(),
      minimumValidUntil: new Date(
        observedAtMs + ALICE_RECOVERY_CREDENTIAL_MIN_VALIDITY_MS,
      ).toISOString(),
      notBefore: null,
      expiresOn: "2099-01-01T00:00:00Z",
    },
  });
  assert.equal(
    readiness.providerPolicySha256,
    policy.expectedProviderPolicySha256,
  );
});

test("binds a no-filter token when Cloudflare serializes condition as an empty object", () => {
  const tokenId = "0123456789abcdef0123456789abcdef";
  const provider = cloudflareProviderFixture({
    tokenId,
    expiresOn: "2099-01-01T00:00:00Z",
  });
  const policy = cloudflarePolicy(tokenId, provider.policy);
  provider.policy.token.result.condition = {};
  const encodedPolicy = encodeAliceRecoveryCredentialPolicy(policy);

  assert.doesNotThrow(() => buildAliceRecoveryCredentialReadiness({
    ...common(),
    provider: "cloudflare",
    encodedPolicy,
    expectedPolicySha256: digest(Buffer.from(encodedPolicy, "base64url")),
    providerReadback: provider.verify,
    providerPolicyReadback: provider.policy,
    observedAtMs,
  }));
});

test("binds the standard Cloudflare v4 verify response envelope", () => {
  const tokenId = "0123456789abcdef0123456789abcdef";
  const provider = cloudflareProviderFixture({
    tokenId,
    expiresOn: "2099-01-01T00:00:00Z",
  });
  const policy = cloudflarePolicy(tokenId, provider.policy);
  const encodedPolicy = encodeAliceRecoveryCredentialPolicy(policy);

  assert.doesNotThrow(() => buildAliceRecoveryCredentialReadiness({
    ...common(),
    provider: "cloudflare",
    encodedPolicy,
    expectedPolicySha256: digest(Buffer.from(encodedPolicy, "base64url")),
    providerReadback: {
      ...provider.verify,
      errors: [],
      messages: [{
        code: 10000,
        message: "This API Token is valid and active",
        type: null,
      }],
    },
    providerPolicyReadback: provider.policy,
    observedAtMs,
  }));
});

test("binds verify identity when token validity is only in policy detail", () => {
  const tokenId = "0123456789abcdef0123456789abcdef";
  const provider = cloudflareProviderFixture({
    tokenId,
    expiresOn: "2099-01-01T00:00:00Z",
  });
  const policy = cloudflarePolicy(tokenId, provider.policy);
  const encodedPolicy = encodeAliceRecoveryCredentialPolicy(policy);

  assert.doesNotThrow(() => buildAliceRecoveryCredentialReadiness({
    ...common(),
    provider: "cloudflare",
    encodedPolicy,
    expectedPolicySha256: digest(Buffer.from(encodedPolicy, "base64url")),
    providerReadback: {
      success: true,
      errors: [],
      messages: [{
        code: 10000,
        message: "This API Token is valid and active",
        type: null,
      }],
      result: { id: tokenId, status: "active" },
    },
    providerPolicyReadback: provider.policy,
    observedAtMs,
  }));
});

test("rejects unrecognized recovery readback fields and Cloudflare errors", () => {
  const modalCredentialId = "ak-test-modal-recovery-token-id";
  const modalPolicy = {
    schemaVersion: "alice.modal-recovery-credential-policy.v1",
    provider: "modal",
    tokenIdSha256: digest(modalCredentialId),
    authorityModel: "workspace-token-non-granular",
    environment: "main",
    appId: "ap-oFaCNy2jJDFalZienNB2Ht",
    appName: "alice-runtime",
    requiredOperations: [...ALICE_MODAL_RECOVERY_OPERATIONS],
  };
  const encodedModalPolicy = encodeAliceRecoveryCredentialPolicy(modalPolicy);
  assert.throws(() => buildAliceRecoveryCredentialReadiness({
    ...common(),
    provider: "modal",
    credentialId: modalCredentialId,
    encodedPolicy: encodedModalPolicy,
    expectedPolicySha256: digest(
      Buffer.from(encodedModalPolicy, "base64url"),
    ),
    providerReadback: {
      appId: modalPolicy.appId,
      environment: "main",
      providerVersion: 48,
      unexpected: true,
    },
  }), /ALICE_RECOVERY_CREDENTIAL_BINDING_INVALID/);

  const cloudflareTokenId = "0123456789abcdef0123456789abcdef";
  const provider = cloudflareProviderFixture({ tokenId: cloudflareTokenId });
  const cloudflareRecoveryPolicy = cloudflarePolicy(
    cloudflareTokenId,
    provider.policy,
  );
  const encodedCloudflarePolicy = encodeAliceRecoveryCredentialPolicy(
    cloudflareRecoveryPolicy,
  );
  assert.throws(() => buildAliceRecoveryCredentialReadiness({
    ...common(),
    provider: "cloudflare",
    encodedPolicy: encodedCloudflarePolicy,
    expectedPolicySha256: digest(
      Buffer.from(encodedCloudflarePolicy, "base64url"),
    ),
    providerReadback: {
      ...provider.verify,
      errors: [{ code: 1000, message: "provider error" }],
      messages: [],
    },
    providerPolicyReadback: provider.policy,
    observedAtMs,
  }), /ALICE_RECOVERY_CREDENTIAL_BINDING_INVALID/);
});

test("rejects stale attempts, token drift, and broadened recovery policy", () => {
  const tokenId = "0123456789abcdef0123456789abcdef";
  const provider = cloudflareProviderFixture({ tokenId });
  const policy = {
    ...cloudflarePolicy(tokenId, provider.policy),
    capabilities: [
      ...ALICE_CLOUDFLARE_RECOVERY_CAPABILITIES,
      "account.access.write",
    ],
  };
  const encodedPolicy = Buffer.from(JSON.stringify(policy)).toString("base64url");
  const expectedPolicySha256 = digest(Buffer.from(encodedPolicy, "base64url"));
  for (const overrides of [
    { watchdogRunAttempt: 2 },
    { parentRunAttempt: 2 },
    { providerReadback: { success: true, result: { id: "f".repeat(32), status: "active" } } },
  ]) {
    assert.throws(
      () => buildAliceRecoveryCredentialReadiness({
        ...common(),
        provider: "cloudflare",
        encodedPolicy,
        expectedPolicySha256,
        providerReadback: provider.verify,
        providerPolicyReadback: provider.policy,
        observedAtMs,
        ...overrides,
      }),
      /ALICE_RECOVERY_CREDENTIAL_BINDING_INVALID/,
    );
  }
});

test("rejects a live Cloudflare recovery token policy that drifted broader", () => {
  const tokenId = "0123456789abcdef0123456789abcdef";
  const expectedProvider = cloudflareProviderFixture({ tokenId });
  const broadenedProvider = cloudflareProviderFixture({
    tokenId,
    broaden: true,
  });
  const policy = cloudflarePolicy(tokenId, expectedProvider.policy);
  const encodedPolicy = encodeAliceRecoveryCredentialPolicy(policy);
  assert.throws(
    () => buildAliceRecoveryCredentialReadiness({
      ...common(),
      provider: "cloudflare",
      encodedPolicy,
      expectedPolicySha256: digest(Buffer.from(encodedPolicy, "base64url")),
      providerReadback: broadenedProvider.verify,
      providerPolicyReadback: broadenedProvider.policy,
      observedAtMs,
    }),
    /ALICE_RECOVERY_CREDENTIAL_BINDING_INVALID/,
  );
});

test("accepts optional verify validity fields only when they match live policy", () => {
  const tokenId = "0123456789abcdef0123456789abcdef";
  const provider = cloudflareProviderFixture({
    tokenId,
    expiresOn: "2099-01-01T00:00:00Z",
  });
  const policy = cloudflarePolicy(tokenId, provider.policy);
  const encodedPolicy = encodeAliceRecoveryCredentialPolicy(policy);
  const input = {
    ...common(),
    provider: "cloudflare",
    encodedPolicy,
    expectedPolicySha256: digest(Buffer.from(encodedPolicy, "base64url")),
    providerReadback: provider.verify,
    providerPolicyReadback: provider.policy,
    observedAtMs,
  };
  assert.doesNotThrow(() => buildAliceRecoveryCredentialReadiness(input));
  assert.throws(
    () => buildAliceRecoveryCredentialReadiness({
      ...input,
      providerReadback: {
        ...provider.verify,
        result: {
          ...provider.verify.result,
          expires_on: "2099-01-02T00:00:00Z",
        },
      },
    }),
    /ALICE_RECOVERY_CREDENTIAL_BINDING_INVALID/,
  );
});

test("rejects a recovery token that expires inside the watchdog window", () => {
  const tokenId = "0123456789abcdef0123456789abcdef";
  const expiresOn = new Date(
    observedAtMs + ALICE_RECOVERY_CREDENTIAL_MIN_VALIDITY_MS - 1,
  ).toISOString();
  const provider = cloudflareProviderFixture({ tokenId, expiresOn });
  assert.throws(
    () => normalizeAliceCloudflareRecoveryTokenPolicy({
      tokenId,
      providerPolicyReadback: provider.policy,
      observedAtMs,
    }),
    /ALICE_RECOVERY_CREDENTIAL_BINDING_INVALID/,
  );
});
