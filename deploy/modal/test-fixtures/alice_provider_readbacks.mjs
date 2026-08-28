import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildAliceWorkerBundleArtifact,
  serializeAliceWorkerBundleArtifact,
  verifyAliceWorkerBundleArtifact,
} from "../alice_worker_bundle_artifact.mjs";
import {
  aliceCloudflareContinuitySentinelBytes,
} from "../alice_cloudflare_continuity.mjs";

const artifactRoots = new Set();
process.once("exit", () => {
  for (const root of artifactRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

export function aliceTestVerifiedWorkerBundleArtifact({
  sourceCommit,
  workerModules = {},
}) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "alice-test-worker-artifact."),
  );
  artifactRoots.add(root);
  const roles = {
    access: "alice-access-gateway",
    control: "alice-production-control",
    aiGateway: "alice-ai-gateway",
    statePlane: "alice-state-plane",
    connectorPlane: "alice-connector-plane",
  };
  for (const [role, worker] of Object.entries(roles)) {
    fs.mkdirSync(path.join(root, worker));
    fs.writeFileSync(
      path.join(root, worker, "index.js"),
      workerModules[role] ?? `export default ${JSON.stringify(role)};\n`,
    );
  }
  const migrationsRoot = path.join(root, roles.statePlane, "migrations");
  fs.mkdirSync(migrationsRoot);
  for (const migration of [
    "0001_alice_state.sql",
    "0002_execution_records.sql",
    "0003_eliza_database.sql",
  ]) {
    fs.writeFileSync(
      path.join(migrationsRoot, migration),
      `-- ${migration}\nSELECT 1;\n`,
    );
  }
  const serialized = serializeAliceWorkerBundleArtifact(
    buildAliceWorkerBundleArtifact({
      root,
      sourceCommit,
      wranglerVersion: "4.122.0",
    }),
  );
  return verifyAliceWorkerBundleArtifact(serialized, {
    root,
    expectedSourceCommit: sourceCommit,
  });
}

export function aliceTestOwnerEmailSha256(ownerEmail) {
  return crypto
    .createHash("sha256")
    .update(ownerEmail.toLowerCase())
    .digest("base64url");
}

export function aliceTestLiveWorkerRollbackReadbacks() {
  const observability = (tracesEnabled) => ({
    enabled: true,
    head_sampling_rate: 1,
    redact_query_string: false,
    logs: {
      enabled: true,
      head_sampling_rate: 1,
      persist: true,
      invocation_logs: true,
    },
    traces: {
      enabled: tracesEnabled,
      persist: true,
      head_sampling_rate: 1,
    },
  });
  const fixture = ({
    worker,
    deploymentId,
    versionId,
    script,
    bindings,
    scriptRuntime,
    scriptSettings,
  }) => ({
    worker,
    deployment: {
      deployments: [{
        id: deploymentId,
        versions: [{ percentage: 100, version_id: versionId }],
      }],
    },
    version: {
      id: versionId,
      resources: {
        bindings,
        script,
        script_runtime: scriptRuntime,
      },
    },
    scriptSettings,
  });
  return {
    access: fixture({
      worker: "alice-access-gateway",
      deploymentId: "11111111-1111-4111-8111-111111111111",
      versionId: "11111111-1111-4111-8111-111111111112",
      script: {
        etag: "access-live-etag",
        handlers: ["fetch"],
        last_deployed_from: "wrangler",
      },
      bindings: [
        { name: "ASSET_BUST_TAG", text: "prod-live", type: "plain_text" },
        { name: "UPSTREAM_API_TOKEN", type: "secret_text" },
        { name: "UPSTREAM_HOST_HEADER", text: "", type: "plain_text" },
        { name: "UPSTREAM_ORIGIN", text: "", type: "plain_text" },
      ],
      scriptRuntime: {
        compatibility_date: "2026-02-18",
        usage_model: "standard",
      },
      scriptSettings: {
        logpush: false,
        tags: null,
        tail_consumers: null,
        observability: null,
      },
    }),
    control: fixture({
      worker: "alice-production-control",
      deploymentId: "22222222-2222-4222-8222-222222222221",
      versionId: "22222222-2222-4222-8222-222222222222",
      script: {
        etag: "control-live-etag",
        handlers: ["fetch", "queue"],
        last_deployed_from: "wrangler",
        named_handlers: [
          { name: "AliceAuthority", handlers: ["class"] },
          { name: "AliceSession", handlers: ["class"] },
          {
            name: "AlicePlanWorkflow",
            handlers: ["__workflow_entrypoint", "run"],
          },
        ],
      },
      scriptRuntime: {
        compatibility_date: "2026-08-22",
        migration_tag: "alice-production-core-v1",
        usage_model: "standard",
      },
      scriptSettings: {
        logpush: false,
        tags: null,
        tail_consumers: null,
        observability: observability(true),
      },
      bindings: [
          {
            class_name: "AliceAuthority",
            name: "ALICE_AUTHORITY",
            namespace_id: "b8e8471d24e043e4a0114fecabab913c",
            type: "durable_object_namespace",
          },
          { name: "ALICE_CONTROL_RECOVERY_TOKEN", type: "secret_text" },
          {
            bucket_name: "alice-production-evidence",
            name: "ALICE_EVIDENCE",
            type: "r2_bucket",
          },
          {
            name: "ALICE_EVIDENCE_QUEUE",
            queue_name: "alice-production-evidence-v1",
            type: "queue",
          },
          {
            class_name: "AlicePlanWorkflow",
            name: "ALICE_PLANS",
            type: "workflow",
            workflow_name: "alice-production-plans",
          },
          {
            class_name: "AliceSession",
            name: "ALICE_SESSIONS",
            namespace_id: "0ecdd7fb1aa94d6c912a4b12790586bb",
            type: "durable_object_namespace",
          },
          { name: "ALICE_VERSION", type: "version_metadata" },
      ],
    }),
    aiGateway: fixture({
      worker: "alice-ai-gateway",
      deploymentId: "33333333-3333-4333-8333-333333333331",
      versionId: "33333333-3333-4333-8333-333333333333",
      script: {
        etag: "ai-gateway-live-etag",
        handlers: ["fetch"],
        last_deployed_from: "wrangler",
        named_handlers: [{ name: "fetch", handlers: ["class"] }],
      },
      scriptRuntime: {
        compatibility_date: "2026-08-14",
        compatibility_flags: ["nodejs_compat"],
        usage_model: "standard",
      },
      scriptSettings: {
        logpush: false,
        tags: null,
        tail_consumers: null,
        observability: observability(false),
      },
      bindings: [
        { name: "AI", project: "alice-production", type: "ai" },
        { name: "ALICE_GATEWAY_TOKEN", type: "secret_text" },
      ],
    }),
    statePlane: fixture({
      worker: "alice-state-plane",
      deploymentId: "44444444-4444-4444-8444-444444444441",
      versionId: "44444444-4444-4444-8444-444444444442",
      script: {
        etag: "state-plane-live-etag",
        handlers: ["fetch"],
        last_deployed_from: "wrangler",
        named_handlers: [
          { name: "AliceStateCoordination", handlers: ["class"] },
        ],
      },
      scriptRuntime: {
        compatibility_date: "2026-08-27",
        migration_tag: "alice-state-plane-v1",
        usage_model: "standard",
      },
      scriptSettings: {
        logpush: false,
        tags: null,
        tail_consumers: null,
        observability: observability(true),
      },
      bindings: [
        { name: "ALICE_VECTOR_INDEX_NAME", text: "alice-memory-v1", type: "plain_text" },
        { name: "ALICE_VECTOR_MODEL", text: "bge-base-en-v1.5", type: "plain_text" },
        { name: "ALICE_VECTOR_DIMENSIONS", text: "768", type: "plain_text" },
        { name: "ALICE_VECTOR_METRIC", text: "cosine", type: "plain_text" },
        {
          database_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "ALICE_STATE_DB",
          type: "d1",
        },
        {
          index_name: "alice-memory-v1",
          name: "ALICE_MEMORY_INDEX",
          type: "vectorize",
        },
        {
          bucket_name: "alice-production-state-objects",
          name: "ALICE_STATE_OBJECTS",
          type: "r2_bucket",
        },
        {
          class_name: "AliceStateCoordination",
          name: "ALICE_COORDINATION",
          namespace_id: "33333333333333333333333333333333",
          type: "durable_object_namespace",
        },
        { name: "ALICE_STATE_PLANE_SERVICE_TOKEN", type: "secret_text" },
      ],
    }),
    connectorPlane: fixture({
      worker: "alice-connector-plane",
      deploymentId: "55555555-5555-4555-8555-555555555551",
      versionId: "55555555-5555-4555-8555-555555555552",
      script: {
        etag: "connector-plane-live-etag",
        handlers: ["fetch"],
        last_deployed_from: "wrangler",
        named_handlers: [
          { name: "AliceConnectorOutboundCoordination", handlers: ["class"] },
        ],
      },
      scriptRuntime: {
        compatibility_date: "2026-08-27",
        migration_tag: "alice-connector-plane-v1",
        usage_model: "standard",
      },
      scriptSettings: {
        logpush: false,
        tags: null,
        tail_consumers: null,
        observability: observability(true),
      },
      bindings: [
        { name: "ALICE_STATE_OWNER_ID", text: "alice-owner-production", type: "plain_text" },
        { name: "ALICE_CONNECTOR_SESSION_ID", text: "alice-connectors-production", type: "plain_text" },
        {
          class_name: "AliceConnectorOutboundCoordination",
          name: "ALICE_CONNECTOR_OUTBOUND",
          namespace_id: "44444444444444444444444444444444",
          type: "durable_object_namespace",
        },
        {
          name: "ALICE_STATE_PLANE",
          service: "alice-state-plane",
          type: "service",
        },
        {
          name: "ALICE_CONTROL",
          service: "alice-production-control",
          type: "service",
        },
        { name: "ALICE_CONNECTOR_SERVICE_TOKEN", type: "secret_text" },
        { name: "ALICE_STATE_PLANE_SERVICE_TOKEN", type: "secret_text" },
        { name: "ALICE_CONTROL_CONNECTOR_SERVICE_TOKEN", type: "secret_text" },
      ],
    }),
  };
}

export function aliceTestCloudflareContinuityReadback() {
  const timestamp = "2026-08-22T12:00:00.000Z";
  const sentinelBytes = aliceCloudflareContinuitySentinelBytes();
  return {
    accountId: "036df6c823669b8fa2f66cf4c16eeb29",
    queue: {
      queue_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      queue_name: "alice-production-evidence-v1",
      created_on: timestamp,
      modified_on: timestamp,
      producers: [{ script: "alice-production-control", type: "worker" }],
      producers_total_count: 1,
      settings: {
        delivery_delay: 0,
        delivery_paused: false,
        message_retention_period: 86400,
      },
    },
    deadLetterQueue: {
      queue_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      queue_name: "alice-production-evidence-dlq-v1",
      created_on: timestamp,
      modified_on: timestamp,
      producers: [],
      producers_total_count: 0,
      settings: {
        delivery_delay: 0,
        delivery_paused: true,
        message_retention_period: 86400,
      },
    },
    queueConsumers: [{
      consumer_id: "cccccccccccccccccccccccccccccccc",
      created_on: timestamp,
      queue_name: "alice-production-evidence-v1",
      script_name: "alice-production-control",
      dead_letter_queue: "alice-production-evidence-dlq-v1",
      type: "worker",
      settings: {
        batch_size: 10,
        max_concurrency: 1,
        max_retries: 3,
        max_wait_time_ms: 5000,
        retry_delay: 10,
      },
    }],
    deadLetterQueueConsumers: [],
    eventSubscriptions: [],
    workflow: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      name: "alice-production-plans",
      script_name: "alice-production-control",
      class_name: "AlicePlanWorkflow",
      created_on: timestamp,
    },
    bucket: {
      name: "alice-production-evidence",
      creation_date: timestamp,
      jurisdiction: "default",
      location: "enam",
      storage_class: "Standard",
    },
    sentinel: {
      key: "continuity/alice-production-core-v1",
      etag: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      size: Buffer.byteLength(sentinelBytes),
      uploaded: timestamp,
      storage_class: "Standard",
      content_type: "application/json",
      cache_control: "no-store",
      content_sha256: `sha256:${crypto
        .createHash("sha256")
        .update(sentinelBytes)
        .digest("hex")}`,
    },
    durableObjectNamespaceIds: {
      access: [
        {
          className: "AliceRuntimeContainer",
          name: "ALICE_RUNTIME_CONTAINER",
          namespaceId: "55555555555555555555555555555555",
        },
      ],
      aiGateway: [],
      control: [
        {
          className: "AliceAuthority",
          name: "ALICE_AUTHORITY",
          namespaceId: "11111111111111111111111111111111",
        },
        {
          className: "AliceSession",
          name: "ALICE_SESSIONS",
          namespaceId: "22222222222222222222222222222222",
        },
      ],
      statePlane: [
        {
          className: "AliceStateCoordination",
          name: "ALICE_COORDINATION",
          namespaceId: "33333333333333333333333333333333",
        },
      ],
      connectorPlane: [
        {
          className: "AliceConnectorOutboundCoordination",
          name: "ALICE_CONNECTOR_OUTBOUND",
          namespaceId: "44444444444444444444444444444444",
        },
      ],
    },
  };
}

export function aliceTestWorkflowVersions() {
  return [{
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    class_name: "AlicePlanWorkflow",
    created_on: "2026-08-22T12:00:00.000Z",
    modified_on: "2026-08-22T12:00:01.000Z",
    workflow_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    has_dag: true,
    language: "javascript",
    default_retention: {
      error_retention: 86_400_000,
      success_retention: 86_400_000,
    },
    limits: { steps: 16 },
  }];
}

export function aliceTestProviderReadbacks({
  accessAudience,
  ownerEmail = "alice-owner@rndrntwrk.com",
}) {
  const identityProviderId = "11111111-1111-4111-8111-111111111111";
  const staleGoogleIdentityProviderId =
    "88888888-8888-4888-8888-888888888888";
  const postureRuleId = "22222222-2222-4222-8222-222222222222";
  const releaseApplicationId = "55555555-5555-4555-8555-555555555555";
  const releasePolicyId = "66666666-6666-4666-8666-666666666666";
  const serviceTokenId = "77777777-7777-4777-8777-777777777777";
  const serviceClientId = "alice-release-controller-client.access";
  const application = {
    id: "33333333-3333-4333-8333-333333333333",
    aud: accessAudience,
    domain: "alice.rndrntwrk.com",
    type: "self_hosted",
    allowed_idps: [identityProviderId],
    auto_redirect_to_identity: true,
    options_preflight_bypass: false,
    session_duration: "24h",
  };
  const deploymentApplication = {
    id: releaseApplicationId,
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
    accessPolicyReadback: {
      application,
      deploymentApplication,
      accountApplications: [application, deploymentApplication],
      zoneApplications: [application, deploymentApplication],
      policies: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "Alice owner on managed device",
          decision: "allow",
          precedence: 1,
          include: [{ email: { email: ownerEmail } }],
          exclude: [],
          require: [
            { login_method: { id: identityProviderId } },
            { device_posture: { integration_uid: postureRuleId } },
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
          id: identityProviderId,
          name: "One-time PIN",
          type: "onetimepin",
          config: {
            redirect_url:
              "https://rndrntwrk.cloudflareaccess.com/cdn-cgi/access/callback",
          },
        },
        {
          id: staleGoogleIdentityProviderId,
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
          id: postureRuleId,
          name: "Alice managed encrypted device",
          type: "disk_encryption",
          enabled: true,
          expiration: "5m",
          schedule: "5m",
          input: { checkDisks: ["all"], requireAll: true },
          match: [{ platform: "mac" }],
        },
      ],
      ownerEmailSha256: aliceTestOwnerEmailSha256(ownerEmail),
      accessAudience,
      releaseAccessAudience: "alice-release-controller-audience",
      releaseServiceTokenIdSha256: crypto
        .createHash("sha256")
        .update(serviceClientId)
        .digest("base64url"),
      observedAt: "2026-08-22T12:00:00.000Z",
    },
    aiGatewayProviderReadback: {
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
    },
    vectorizeProviderReadback: {
      name: "alice-memory-v1",
      description: "Alice production memory index",
      config: { dimensions: 768, metric: "cosine" },
      created_on: "2026-08-27T12:00:00.000Z",
      modified_on: "2026-08-27T12:00:00.000Z",
    },
  };
}
