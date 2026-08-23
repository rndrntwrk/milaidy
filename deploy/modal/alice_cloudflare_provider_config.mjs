import crypto from "node:crypto";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const OWNER_HASH = /^[A-Za-z0-9_-]{43}$/;
const GOOGLE_CLIENT_ID = /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/;
// Spend-limit filters use Cloudflare's author/model form, not runtime @cf IDs.
const ALICE_AI_MODELS = Object.freeze([
  "baai/bge-m3",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
]);
const ALICE_AI_PROVIDERS = Object.freeze(["workers-ai"]);

function sha256Canonical(value) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(canonicalAliceJson(value))
    .digest("hex")}`;
}

function has(value, key) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function durationSeconds(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d+)(ms|s|m|h)$/.exec(value);
  if (!match) return null;
  const units = { ms: 0.001, s: 1, m: 60, h: 3_600 };
  return Number(match[1]) * units[match[2]];
}

function ownerHash(email) {
  if (typeof email !== "string" || email.trim() !== email) return null;
  return crypto
    .createHash("sha256")
    .update(email.toLowerCase())
    .digest("base64url");
}

function clientIdHash(clientId) {
  if (
    typeof clientId !== "string" ||
    !/^[A-Za-z0-9._-]{8,256}$/.test(clientId)
  ) {
    return null;
  }
  return crypto.createHash("sha256").update(clientId).digest("base64url");
}

function applicationCanAffectHost(application, hostname) {
  const domain = application?.domain;
  if (typeof domain !== "string" || typeof hostname !== "string") return false;
  const withoutProtocol = domain.replace(/^https?:\/\//i, "");
  const hostPattern = withoutProtocol.split("/", 1)[0].toLowerCase();
  if (
    hostPattern.length === 0 ||
    /[^a-z0-9.*_-]/.test(hostPattern) ||
    hostPattern.includes("**")
  ) {
    accessInvalid();
  }
  const expression = hostPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${expression}$`, "i").test(hostname);
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    return null;
  }
  return milliseconds;
}

function accessInvalid() {
  throw new Error("ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID");
}

export async function buildAliceAccessPolicyProviderConfig(readback) {
  try {
    const {
      application,
      deploymentApplication,
      policies,
      deploymentPolicies,
      accountApplications,
      zoneApplications,
      serviceTokens,
      identityProviders,
      postureRules,
      ownerEmailSha256,
      accessAudience,
      releaseAccessAudience,
      releaseServiceTokenIdSha256,
      observedAt,
    } = readback ?? {};
    const appDuration = durationSeconds(application?.session_duration);
    if (
      !UUID.test(application?.id ?? "") ||
      application?.aud !== accessAudience ||
      typeof accessAudience !== "string" ||
      application?.domain !== "alice.rndrntwrk.com" ||
      application?.type !== "self_hosted" ||
      appDuration === null ||
      appDuration <= 0 ||
      appDuration > 86_400 ||
      application?.auto_redirect_to_identity !== true ||
      application?.options_preflight_bypass !== false ||
      !Array.isArray(application?.allowed_idps) ||
      application.allowed_idps.length !== 1 ||
      !OWNER_HASH.test(ownerEmailSha256 ?? "") ||
      !Array.isArray(policies) ||
      policies.length !== 1 ||
      !Array.isArray(deploymentPolicies) ||
      deploymentPolicies.length !== 1 ||
      !Array.isArray(accountApplications) ||
      !Array.isArray(zoneApplications) ||
      !Array.isArray(serviceTokens) ||
      !Array.isArray(identityProviders) ||
      !Array.isArray(postureRules)
    ) {
      accessInvalid();
    }

    const expectedProtectedApplications = new Map([
      [application.id, application],
      [deploymentApplication?.id, deploymentApplication],
    ]);
    if (
      expectedProtectedApplications.size !== 2 ||
      [...expectedProtectedApplications.keys()].some((id) => !UUID.test(id ?? ""))
    ) {
      accessInvalid();
    }
    const protectedHosts = [
      "alice.rndrntwrk.com",
      "alice-release.rndrntwrk.com",
    ];
    const applicationScopes = {};
    const observedProtectedIds = new Set();
    for (const [scope, applications] of [
      ["account", accountApplications],
      ["zone", zoneApplications],
    ]) {
      const ids = [];
      for (const scopedApplication of applications) {
        if (
          !protectedHosts.some((hostname) =>
            applicationCanAffectHost(scopedApplication, hostname),
          )
        ) {
          continue;
        }
        const expected = expectedProtectedApplications.get(scopedApplication?.id);
        if (
          !expected ||
          scopedApplication.domain !== expected.domain ||
          scopedApplication.aud !== expected.aud ||
          scopedApplication.type !== expected.type
        ) {
          accessInvalid();
        }
        ids.push(scopedApplication.id);
        observedProtectedIds.add(scopedApplication.id);
      }
      applicationScopes[scope] = [...new Set(ids)].sort();
    }
    if (
      observedProtectedIds.size !== 2 ||
      [...expectedProtectedApplications.keys()].some(
        (id) => !observedProtectedIds.has(id),
      )
    ) {
      accessInvalid();
    }

    const identityProviderId = application.allowed_idps[0];
    const matchingProviders = identityProviders.filter(
      (provider) => provider?.id === identityProviderId,
    );
    const identityProvider = matchingProviders[0];
    if (
      !UUID.test(identityProviderId) ||
      matchingProviders.length !== 1 ||
      identityProvider?.name !== "555ID" ||
      identityProvider?.type !== "google-apps" ||
      !exactKeys(identityProvider?.config, [
        "apps_domain",
        "claims",
        "client_id",
        "client_secret",
        "email_claim_name",
      ]) ||
      identityProvider.config.apps_domain !== "sw4p.io" ||
      !Array.isArray(identityProvider.config.claims) ||
      identityProvider.config.claims.some(
        (claim) => typeof claim !== "string" || claim.length === 0,
      ) ||
      new Set(identityProvider.config.claims).size !==
        identityProvider.config.claims.length ||
      !GOOGLE_CLIENT_ID.test(identityProvider.config.client_id ?? "") ||
      identityProvider.config.client_secret !== "[REDACTED]" ||
      identityProvider.config.email_claim_name !== "email"
    ) {
      accessInvalid();
    }
    const identityProviderNonSecretConfig = {
      appsDomain: identityProvider.config.apps_domain,
      claims: [...identityProvider.config.claims].sort(),
      clientId: identityProvider.config.client_id,
      emailClaimName: identityProvider.config.email_claim_name,
    };

    const policy = policies[0];
    const policyDuration = durationSeconds(policy?.session_duration);
    if (
      !UUID.test(policy?.id ?? "") ||
      typeof policy?.name !== "string" ||
      policy.name.length === 0 ||
      policy?.decision !== "allow" ||
      !Number.isSafeInteger(policy?.precedence) ||
      policy.precedence < 1 ||
      policyDuration === null ||
      policyDuration <= 0 ||
      policyDuration > appDuration ||
      !Array.isArray(policy?.include) ||
      policy.include.length !== 1 ||
      !Array.isArray(policy?.exclude) ||
      policy.exclude.length !== 0 ||
      !Array.isArray(policy?.require) ||
      policy.require.length < 2
    ) {
      accessInvalid();
    }
    const include = policy.include[0];
    if (
      Object.keys(include ?? {}).length !== 1 ||
      !has(include, "email") ||
      ownerHash(include.email?.email) !== ownerEmailSha256
    ) {
      accessInvalid();
    }

    const loginMethodIds = [];
    const postureIds = [];
    for (const rule of policy.require) {
      if (!rule || typeof rule !== "object" || Object.keys(rule).length !== 1) {
        accessInvalid();
      }
      if (has(rule, "login_method")) {
        if (!UUID.test(rule.login_method?.id ?? "")) accessInvalid();
        loginMethodIds.push(rule.login_method.id);
      } else if (has(rule, "device_posture")) {
        if (!UUID.test(rule.device_posture?.integration_uid ?? "")) {
          accessInvalid();
        }
        postureIds.push(rule.device_posture.integration_uid);
      } else {
        accessInvalid();
      }
    }
    if (
      loginMethodIds.length !== 1 ||
      loginMethodIds[0] !== identityProviderId ||
      postureIds.length < 1 ||
      new Set(postureIds).size !== postureIds.length
    ) {
      accessInvalid();
    }

    const devicePostureRules = postureIds
      .map((id) => postureRules.filter((rule) => rule?.id === id))
      .map((matches) => {
        if (matches.length !== 1) accessInvalid();
        const rule = matches[0];
        if (
          rule.enabled !== true ||
          typeof rule.name !== "string" ||
          rule.name.length === 0 ||
          typeof rule.type !== "string" ||
          rule.type.length === 0 ||
          !has(rule, "input") ||
          !has(rule, "match") ||
          !has(rule, "schedule") ||
          !has(rule, "expiration")
        ) {
          accessInvalid();
        }
        return {
          id: rule.id,
          name: rule.name,
          type: rule.type,
          enabled: true,
          schedule: rule.schedule,
          expiration: rule.expiration,
          match: rule.match,
          inputSha256: sha256Canonical(rule.input),
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));

    const deploymentAppDuration = durationSeconds(
      deploymentApplication?.session_duration,
    );
    if (
      !UUID.test(deploymentApplication?.id ?? "") ||
      deploymentApplication?.name !==
        "Alice protected deployment controller" ||
      typeof releaseAccessAudience !== "string" ||
      deploymentApplication?.aud !== releaseAccessAudience ||
      deploymentApplication?.domain !==
        "alice-release.rndrntwrk.com/control/internal/v1/deployment/*" ||
      deploymentApplication?.type !== "self_hosted" ||
      deploymentApplication?.auto_redirect_to_identity !== false ||
      deploymentApplication?.options_preflight_bypass !== false ||
      deploymentApplication?.app_launcher_visible !== false ||
      !Array.isArray(deploymentApplication?.allowed_idps) ||
      deploymentApplication.allowed_idps.length !== 0 ||
      deploymentAppDuration === null ||
      deploymentAppDuration <= 0 ||
      deploymentAppDuration > 3_600 ||
      !OWNER_HASH.test(releaseServiceTokenIdSha256 ?? "")
    ) {
      accessInvalid();
    }
    const deploymentPolicy = deploymentPolicies[0];
    const deploymentPolicyDuration = durationSeconds(
      deploymentPolicy?.session_duration,
    );
    const serviceTokenRule = deploymentPolicy?.include?.[0];
    const serviceTokenId = serviceTokenRule?.service_token?.token_id;
    if (
      !UUID.test(deploymentPolicy?.id ?? "") ||
      deploymentPolicy?.name !==
        "Alice protected deployment service token" ||
      deploymentPolicy?.decision !== "non_identity" ||
      deploymentPolicy?.precedence !== 1 ||
      deploymentPolicyDuration === null ||
      deploymentPolicyDuration <= 0 ||
      deploymentPolicyDuration > deploymentAppDuration ||
      !Array.isArray(deploymentPolicy?.include) ||
      deploymentPolicy.include.length !== 1 ||
      !exactKeys(serviceTokenRule, ["service_token"]) ||
      !exactKeys(serviceTokenRule.service_token, ["token_id"]) ||
      !UUID.test(serviceTokenId ?? "") ||
      !Array.isArray(deploymentPolicy?.exclude) ||
      deploymentPolicy.exclude.length !== 0 ||
      !Array.isArray(deploymentPolicy?.require) ||
      deploymentPolicy.require.length !== 0
    ) {
      accessInvalid();
    }
    const matchingServiceTokens = serviceTokens.filter(
      (token) => token?.id === serviceTokenId,
    );
    const serviceToken = matchingServiceTokens[0];
    const observedAtMs = canonicalIsoTimestamp(observedAt);
    const expiresAtMs = canonicalIsoTimestamp(serviceToken?.expires_at);
    const derivedClientIdSha256 = clientIdHash(serviceToken?.client_id);
    if (
      matchingServiceTokens.length !== 1 ||
      serviceToken?.name !== "Alice protected deployment controller" ||
      serviceToken?.enabled !== true ||
      derivedClientIdSha256 !== releaseServiceTokenIdSha256 ||
      observedAtMs === null ||
      expiresAtMs === null ||
      expiresAtMs <= observedAtMs + 300_000 ||
      expiresAtMs > observedAtMs + 7 * 86_400_000
    ) {
      accessInvalid();
    }

    return {
      schemaVersion: "alice.access-policy-config.v1",
      application: {
        id: application.id,
        audience: application.aud,
        domain: application.domain,
        type: application.type,
        sessionDuration: application.session_duration,
        autoRedirectToIdentity: true,
        optionsPreflightBypass: false,
        allowedIdentityProviderIds: [identityProviderId],
      },
      identityProvider: {
        id: identityProvider.id,
        name: identityProvider.name,
        type: identityProvider.type,
        clientSecretState: "present-redacted",
        nonSecretConfigSha256: sha256Canonical(
          identityProviderNonSecretConfig,
        ),
      },
      policies: [
        {
          id: policy.id,
          name: policy.name,
          decision: policy.decision,
          precedence: policy.precedence,
          sessionDuration: policy.session_duration,
          includeRule: "email",
          ownerEmailSha256,
          excludeRules: [],
          requiredLoginMethodId: identityProviderId,
          requiredDevicePostureRuleIds: [...postureIds].sort(),
        },
      ],
      devicePostureRules,
      protectedApplicationScopes: applicationScopes,
      deploymentController: {
        application: {
          id: deploymentApplication.id,
          audience: deploymentApplication.aud,
          domain: deploymentApplication.domain,
          type: deploymentApplication.type,
          sessionDuration: deploymentApplication.session_duration,
          autoRedirectToIdentity: false,
          optionsPreflightBypass: false,
          appLauncherVisible: false,
          allowedIdentityProviderIds: [],
        },
        policy: {
          id: deploymentPolicy.id,
          name: deploymentPolicy.name,
          decision: deploymentPolicy.decision,
          precedence: deploymentPolicy.precedence,
          sessionDuration: deploymentPolicy.session_duration,
          serviceTokenId,
          excludeRules: [],
          requireRules: [],
        },
        serviceToken: {
          id: serviceToken.id,
          name: serviceToken.name,
          clientIdSha256: derivedClientIdSha256,
          enabled: true,
          expiresAt: serviceToken.expires_at,
        },
      },
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_ACCESS_POLICY_PROVIDER_CONFIG_INVALID"
    ) {
      throw error;
    }
    accessInvalid();
  }
}

function aiInvalid() {
  throw new Error("ALICE_AI_GATEWAY_PROVIDER_CONFIG_INVALID");
}

export function buildAliceAiGatewayProviderConfig(raw) {
  const required = [
    "id",
    "cache_invalidate_on_update",
    "cache_ttl",
    "collect_logs",
    "rate_limiting_interval",
    "rate_limiting_limit",
    "authentication",
    "log_management",
    "log_management_strategy",
    "logpush",
    "otel",
    "rate_limiting_technique",
    "retry_backoff",
    "retry_delay",
    "retry_max_attempts",
    "spend_limits",
    "dynamic_routes",
    "workers_ai_billing_mode",
    "zdr",
  ];
  if (
    !raw ||
    required.some((key) => !has(raw, key)) ||
    raw.id !== "alice-production" ||
    raw.cache_invalidate_on_update !== true ||
    raw.cache_ttl !== 0 ||
    raw.collect_logs !== false ||
    raw.authentication !== true ||
    !Number.isSafeInteger(raw.rate_limiting_interval) ||
    raw.rate_limiting_interval !== 60 ||
    !Number.isSafeInteger(raw.rate_limiting_limit) ||
    raw.rate_limiting_limit <= 0 ||
    raw.rate_limiting_limit > 60 ||
    raw.rate_limiting_technique !== "fixed" ||
    !Number.isSafeInteger(raw.log_management) ||
    raw.log_management < 10_000 ||
    !["STOP_INSERTING", "DELETE_OLDEST"].includes(
      raw.log_management_strategy,
    ) ||
    raw.logpush !== false ||
    !Array.isArray(raw.otel) ||
    raw.otel.length !== 0 ||
    raw.zdr !== true ||
    !["constant", "linear", "exponential"].includes(raw.retry_backoff) ||
    !Number.isSafeInteger(raw.retry_delay) ||
    raw.retry_delay < 0 ||
    raw.retry_delay > 5_000 ||
    !Number.isSafeInteger(raw.retry_max_attempts) ||
    raw.retry_max_attempts < 1 ||
    raw.retry_max_attempts > 3 ||
    raw.workers_ai_billing_mode !== "postpaid" ||
    raw.stripe != null ||
    raw.spend_limits?.enabled !== true ||
    !Array.isArray(raw.spend_limits?.rules) ||
    raw.spend_limits.rules.length !== 1 ||
    raw.dynamic_routes?.success !== true ||
    raw.dynamic_routes?.data?.page !== 1 ||
    raw.dynamic_routes?.data?.per_page !== 100 ||
    !Array.isArray(raw.dynamic_routes?.data?.routes) ||
    raw.dynamic_routes.data.routes.length !== 0
  ) {
    aiInvalid();
  }
  const spendRules = raw.spend_limits.rules.map((rule) => {
    if (
      typeof rule?.id !== "string" ||
      rule.id !== "alice-daily-cost" ||
      rule.enabled !== true ||
      typeof rule.limit !== "number" ||
      !Number.isFinite(rule.limit) ||
      rule.limit <= 0 ||
      rule.limit > 10 ||
      rule.limitType !== "cost" ||
      !Number.isSafeInteger(rule.window) ||
      rule.window !== 86_400 ||
      rule.technique !== "fixed" ||
      !exactKeys(rule.metadata ?? {}, []) ||
      !exactKeys(rule.model, ["mode", "values"]) ||
      rule.model.mode !== "filter" ||
      !Array.isArray(rule.model.values) ||
      JSON.stringify([...rule.model.values].sort()) !==
        JSON.stringify(ALICE_AI_MODELS) ||
      !exactKeys(rule.provider, ["mode", "values"]) ||
      rule.provider.mode !== "filter" ||
      !Array.isArray(rule.provider.values) ||
      JSON.stringify([...rule.provider.values].sort()) !==
        JSON.stringify(ALICE_AI_PROVIDERS)
    ) {
      aiInvalid();
    }
    return {
      id: rule.id,
      enabled: true,
      limit: rule.limit,
      limitType: rule.limitType,
      window: rule.window,
      technique: rule.technique,
      metadataSha256: sha256Canonical(rule.metadata ?? {}),
      models: [...ALICE_AI_MODELS],
      providers: [...ALICE_AI_PROVIDERS],
    };
  }).sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion: "alice.ai-gateway-provider-config.v1",
    id: raw.id,
    authentication: true,
    cache: {
      invalidateOnUpdate: raw.cache_invalidate_on_update,
      ttl: raw.cache_ttl,
    },
    logging: {
      collectLogs: false,
      logManagement: raw.log_management,
      logManagementStrategy: raw.log_management_strategy,
      logpush: false,
      otelDestinations: 0,
      zeroDataRetention: true,
    },
    rateLimit: {
      intervalSeconds: raw.rate_limiting_interval,
      requests: raw.rate_limiting_limit,
      technique: raw.rate_limiting_technique,
    },
    retry: {
      backoff: raw.retry_backoff,
      delayMilliseconds: raw.retry_delay,
      maxAttempts: raw.retry_max_attempts,
    },
    dynamicRoutes: { activeRouteCount: 0 },
    spendLimits: { enabled: true, rules: spendRules },
    workersAiBillingMode: raw.workers_ai_billing_mode,
    dlpSha256: sha256Canonical(raw.dlp ?? null),
    guardrailsSha256: sha256Canonical(raw.guardrails ?? null),
  };
}
