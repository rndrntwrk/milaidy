import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  buildAliceAccessPolicyProviderConfig,
  buildAliceAiGatewayProviderConfig,
} from "./alice_cloudflare_provider_config.mjs";

const idpId = "11111111-1111-4111-8111-111111111111";
const staleGoogleIdpId = "88888888-8888-4888-8888-888888888888";
const postureId = "22222222-2222-4222-8222-222222222222";
const appId = "33333333-3333-4333-8333-333333333333";
const policyId = "44444444-4444-4444-8444-444444444444";
const releaseAppId = "55555555-5555-4555-8555-555555555555";
const releasePolicyId = "66666666-6666-4666-8666-666666666666";
const serviceTokenId = "77777777-7777-4777-8777-777777777777";
const serviceClientId = "alice-release-controller-client.access";
const serviceClientIdSha256 = crypto
  .createHash("sha256")
  .update(serviceClientId)
  .digest("base64url");
const ownerEmail = "alice-owner@rndrntwrk.com";
const ownerEmailSha256 = crypto
  .createHash("sha256")
  .update(ownerEmail.toLowerCase())
  .digest("base64url");

function accessReadback() {
  const application = {
      id: appId,
      aud: "alice-access-audience",
      domain: "alice.rndrntwrk.com",
      type: "self_hosted",
      allowed_idps: [idpId],
      auto_redirect_to_identity: true,
      options_preflight_bypass: false,
      session_duration: "24h",
  };
  const deploymentApplication = {
    id: releaseAppId,
    name: "Alice protected deployment controller",
    aud: "alice-release-controller-audience",
    domain:
      "alice-release.rndrntwrk.com/control/internal/v1/deployment/*",
    type: "self_hosted",
    allowed_idps: [],
    auto_redirect_to_identity: false,
    options_preflight_bypass: false,
    session_duration: "1h",
    app_launcher_visible: false,
  };
  return {
    application,
    deploymentApplication,
    accountApplications: [application, deploymentApplication],
    zoneApplications: [application, deploymentApplication],
    policies: [
      {
        id: policyId,
        name: "Alice owner on managed device",
        decision: "allow",
        precedence: 1,
        include: [{ email: { email: ownerEmail } }],
        exclude: [],
        require: [
          { login_method: { id: idpId } },
          { device_posture: { integration_uid: postureId } },
        ],
        session_duration: "24h",
      },
    ],
    deploymentPolicies: [
      {
        id: releasePolicyId,
        name: "Alice protected deployment service token",
        decision: "non_identity",
        precedence: 1,
        include: [{ service_token: { token_id: serviceTokenId } }],
        exclude: [],
        require: [],
        session_duration: "1h",
      },
    ],
    serviceTokens: [
      {
        id: serviceTokenId,
        name: "Alice protected deployment controller",
        client_id: serviceClientId,
        enabled: true,
        expires_at: "2026-08-23T12:00:00.000Z",
      },
    ],
    identityProviders: [
      {
        id: idpId,
        name: "One-time PIN",
        type: "onetimepin",
        config: {
          redirect_url:
            "https://rndrntwrk.cloudflareaccess.com/cdn-cgi/access/callback",
        },
      },
      {
        id: staleGoogleIdpId,
        name: "555ID",
        type: "google-apps",
        config: {
          apps_domain: "sw4p.io",
          claims: [],
          client_id: "alice-555id.apps.googleusercontent.com",
          client_secret: "[REDACTED]",
          email_claim_name: "email",
        },
      },
    ],
    postureRules: [
      {
        id: postureId,
        name: "Alice managed encrypted device",
        type: "disk_encryption",
        enabled: true,
        description: "Require encrypted device storage",
        expiration: "5m",
        schedule: "5m",
        input: { checkDisks: ["all"], requireAll: true },
        match: [{ platform: "mac" }],
      },
    ],
    ownerEmailSha256,
    accessAudience: "alice-access-audience",
    releaseAccessAudience: "alice-release-controller-audience",
    releaseServiceTokenIdSha256: serviceClientIdSha256,
    observedAt: "2026-08-22T12:00:00.000Z",
  };
}

function aiReadback() {
  return {
    id: "alice-production",
    cache_invalidate_on_update: true,
    cache_ttl: 0,
    collect_logs: false,
    rate_limiting_interval: 60,
    rate_limiting_limit: 60,
    authentication: true,
    log_management: 10_000,
    log_management_strategy: "STOP_INSERTING",
    logpush: false,
    otel: [],
    rate_limiting_technique: "fixed",
    retry_backoff: "constant",
    retry_delay: 0,
    retry_max_attempts: 1,
    spend_limits: {
      enabled: true,
      rules: [
        {
          id: "alice-daily-cost",
          enabled: true,
          limit: 10,
          limitType: "cost",
          window: 86_400,
          technique: "fixed",
          metadata: {},
          model: {
            mode: "filter",
            values: [
              "baai/bge-m3",
              "openai/gpt-oss-120b",
              "openai/gpt-oss-20b",
            ],
          },
          provider: { mode: "filter", values: ["workers-ai"] },
        },
      ],
    },
    dynamic_routes: {
      success: true,
      data: { page: 1, per_page: 100, routes: [] },
    },
    workers_ai_billing_mode: "postpaid",
    zdr: true,
  };
}

test("normalizes exact owner-only One-time PIN and device-posture Access policy", async () => {
  const canonical = await buildAliceAccessPolicyProviderConfig(accessReadback());
  assert.equal(canonical.schemaVersion, "alice.access-policy-config.v1");
  assert.deepEqual(canonical.application.allowedIdentityProviderIds, [idpId]);
  assert.equal(canonical.identityProvider.name, "One-time PIN");
  assert.equal(canonical.identityProvider.type, "onetimepin");
  assert.match(
    canonical.identityProvider.nonSecretConfigSha256,
    /^sha256:[a-f0-9]{64}$/,
  );
  assert.equal("clientSecretState" in canonical.identityProvider, false);
  assert.equal(canonical.policies[0].ownerEmailSha256, ownerEmailSha256);
  assert.deepEqual(canonical.policies[0].requiredDevicePostureRuleIds, [postureId]);
  assert.equal(canonical.devicePostureRules[0].enabled, true);
  assert.match(canonical.devicePostureRules[0].inputSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(canonical).includes(ownerEmail), false);
  assert.equal(JSON.stringify(canonical).includes("sw4p.io"), false);
  assert.equal(JSON.stringify(canonical).includes(staleGoogleIdpId), false);
  assert.equal(JSON.stringify(canonical).includes("[REDACTED]"), false);
});

test("binds exact One-time PIN config and rejects stale Google or non-owner activation", async () => {
  const substituted = accessReadback();
  substituted.application.allowed_idps = [staleGoogleIdpId];
  substituted.policies[0].require[0] = {
    login_method: { id: staleGoogleIdpId },
  };
  await assert.rejects(
    () => buildAliceAccessPolicyProviderConfig(substituted),
    /ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID/,
  );

  const nonOwner = accessReadback();
  nonOwner.policies[0].include[0].email.email = "attacker@example.test";
  await assert.rejects(
    () => buildAliceAccessPolicyProviderConfig(nonOwner),
    /ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID/,
  );
});

test("rejects substituted or expanded One-time PIN provider-owned config", async () => {
  for (const config of [
    {
      redirect_url:
        "https://attacker.example.test/cdn-cgi/access/callback",
    },
    {
      redirect_url:
        "https://rndrntwrk.cloudflareaccess.com/cdn-cgi/access/callback",
      client_secret: "must-not-be-admitted",
    },
  ]) {
    const substituted = accessReadback();
    substituted.identityProviders[0].config = config;
    await assert.rejects(
      () => buildAliceAccessPolicyProviderConfig(substituted),
      /ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID/,
    );
  }
});

test("rejects missing, broad, unknown, or disabled Access controls", async () => {
  const missing = accessReadback();
  delete missing.application.session_duration;
  await assert.rejects(
    () => buildAliceAccessPolicyProviderConfig(missing),
    /ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID/,
  );

  const broad = accessReadback();
  broad.policies[0].include = [{ everyone: {} }];
  await assert.rejects(
    () => buildAliceAccessPolicyProviderConfig(broad),
    /ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID/,
  );

  const unknown = accessReadback();
  unknown.policies[0].require.push({ country: { country_code: "US" } });
  await assert.rejects(
    () => buildAliceAccessPolicyProviderConfig(unknown),
    /ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID/,
  );

  const disabled = accessReadback();
  disabled.postureRules[0].enabled = false;
  await assert.rejects(
    () => buildAliceAccessPolicyProviderConfig(disabled),
    /ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID/,
  );
});

test("rejects account- or zone-scope applications that can shadow either Alice host", async () => {
  for (const [scope, domain] of [
    ["accountApplications", "*.rndrntwrk.com/private/*"],
    ["accountApplications", "alice.rndrntwrk.com/v1/*"],
    [
      "zoneApplications",
      "alice-release.rndrntwrk.com/control/internal/v1/deployment/status",
    ],
  ]) {
    const shadowed = accessReadback();
    shadowed[scope].push({
      id: "88888888-8888-4888-8888-888888888888",
      aud: "shadow-audience",
      domain,
      type: "self_hosted",
    });
    await assert.rejects(
      () => buildAliceAccessPolicyProviderConfig(shadowed),
      /ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID/,
    );
  }
});

test("binds one enabled, short-lived Service Auth token and exact policy order", async () => {
  const canonical = await buildAliceAccessPolicyProviderConfig(accessReadback());
  assert.equal(canonical.deploymentController.application.id, releaseAppId);
  assert.equal(canonical.deploymentController.policy.precedence, 1);
  assert.equal(canonical.deploymentController.serviceToken.id, serviceTokenId);
  assert.equal(
    canonical.deploymentController.serviceToken.clientIdSha256,
    serviceClientIdSha256,
  );
  assert.equal(canonical.deploymentController.serviceToken.enabled, true);

  for (const mutate of [
    (raw) => {
      raw.deploymentPolicies[0].include[0].service_token.token_id =
        "88888888-8888-4888-8888-888888888888";
    },
    (raw) => { raw.deploymentPolicies[0].precedence = 2; },
    (raw) => { raw.serviceTokens[0].enabled = false; },
    (raw) => { raw.serviceTokens[0].expires_at = raw.observedAt; },
    (raw) => { raw.serviceTokens[0].client_id = "wrong-client.access"; },
    (raw) => { raw.deploymentPolicies.push({ ...raw.deploymentPolicies[0] }); },
  ]) {
    const substituted = accessReadback();
    mutate(substituted);
    await assert.rejects(
      () => buildAliceAccessPolicyProviderConfig(substituted),
      /ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID/,
    );
  }
});

test("normalizes every admitted AI Gateway safety and budget setting", () => {
  const canonical = buildAliceAiGatewayProviderConfig(aiReadback());
  assert.deepEqual(canonical.cache, {
    invalidateOnUpdate: true,
    ttl: 0,
  });
  assert.deepEqual(canonical.logging, {
    collectLogs: false,
    logManagement: 10_000,
    logManagementStrategy: "STOP_INSERTING",
    logpush: false,
    otelDestinations: 0,
    zeroDataRetention: true,
  });
  assert.equal(canonical.spendLimits.enabled, true);
  assert.equal(canonical.retry.maxAttempts, 1);
  assert.deepEqual(canonical.dynamicRoutes, { activeRouteCount: 0 });
  assert.equal("fallbackConfigured" in canonical, false);
  assert.deepEqual(canonical.spendLimits.rules[0].models, [
    "baai/bge-m3",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
  ]);
  assert.deepEqual(canonical.spendLimits.rules[0].providers, ["workers-ai"]);
});

test("rejects runtime-prefixed model ids in Cloudflare spend filters", () => {
  const raw = aiReadback();
  raw.spend_limits.rules[0].model.values = [
    "@cf/baai/bge-m3",
    "@cf/openai/gpt-oss-120b",
    "@cf/openai/gpt-oss-20b",
  ];
  assert.throws(
    () => buildAliceAiGatewayProviderConfig(raw),
    /ALICE_AI_GATEWAY_PROVIDER_CONFIG_INVALID/,
  );
});

test("rejects missing, unbounded, retained, or externally exported AI settings", () => {
  for (const mutate of [
    (raw) => delete raw.authentication,
    (raw) => { raw.collect_logs = true; },
    (raw) => { raw.rate_limiting_limit = 0; },
    (raw) => { raw.zdr = false; },
    (raw) => { raw.logpush = true; },
    (raw) => { raw.spend_limits.enabled = false; },
    (raw) => { raw.retry_max_attempts = 4; },
    (raw) => { raw.rate_limiting_limit = 61; },
    (raw) => { raw.spend_limits.rules[0].limit = 10.01; },
    (raw) => { raw.spend_limits.rules[0].window = 86_401; },
    (raw) => { raw.spend_limits.rules[0].model.values = ["other-model"]; },
    (raw) => { raw.spend_limits.rules[0].provider.values = ["openai"]; },
    (raw) => { raw.spend_limits.rules.push({ ...raw.spend_limits.rules[0], id: "unrelated" }); },
    (raw) => { raw.dynamic_routes.data.routes.push({ id: "fallback-route" }); },
  ]) {
    const raw = aiReadback();
    mutate(raw);
    assert.throws(
      () => buildAliceAiGatewayProviderConfig(raw),
      /ALICE_AI_GATEWAY_PROVIDER_CONFIG_INVALID/,
    );
  }
});
