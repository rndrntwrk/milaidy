const DIGEST = /^sha256:[a-f0-9]{64}$/;
const BASE64_URL_SHA256 = /^[A-Za-z0-9_-]{43}$/;
const ACCESS_AUDIENCE = /^[A-Za-z0-9_-]{8,128}$/;
const D1_DATABASE_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const CLOUDFLARE_CONTAINER_IMAGE =
  /^registry\.cloudflare\.com\/036df6c823669b8fa2f66cf4c16eeb29\/alice-runtime@sha256:[a-f0-9]{64}$/;

export const ALICE_CLOUDFLARE_TARGET = Object.freeze({
  accountId: "036df6c823669b8fa2f66cf4c16eeb29",
  accessDomain: "alice.rndrntwrk.com",
  releaseControlDomain: "alice-release.rndrntwrk.com",
  accessWorker: "alice-access-gateway",
  controlWorker: "alice-production-control",
  aiGatewayWorker: "alice-ai-gateway",
  statePlaneWorker: "alice-state-plane",
  connectorPlaneWorker: "alice-connector-plane",
  aiGateway: "alice-production",
  evidenceBucket: "alice-production-evidence",
  evidenceQueue: "alice-production-evidence-v1",
  evidenceDlq: "alice-production-evidence-dlq-v1",
  planWorkflow: "alice-production-plans",
  stateDatabase: "alice-production-state",
  stateObjectsBucket: "alice-production-state-objects",
  memoryIndex: "alice-memory-v1",
  workQueue: "alice-production-work-v1",
  workDlq: "alice-production-work-dlq-v1",
});

export const ALICE_AI_CHAT_MODELS = Object.freeze({
  "workers-ai/@cf/openai/gpt-oss-20b": "@cf/openai/gpt-oss-20b",
  "workers-ai/@cf/openai/gpt-oss-120b": "@cf/openai/gpt-oss-120b",
});
export const ALICE_AI_EMBEDDING_MODELS = Object.freeze(["@cf/baai/bge-m3"]);
export const ALICE_AI_GATEWAY_OPTIONS = Object.freeze({
  gateway: Object.freeze({
    id: ALICE_CLOUDFLARE_TARGET.aiGateway,
    skipCache: true,
    cacheTtl: 0,
    collectLog: false,
  }),
});

const ALICE_OBSERVABILITY = Object.freeze({
  enabled: true,
  headSamplingRate: 1,
  logs: Object.freeze({
    enabled: true,
    headSamplingRate: 1,
    invocationLogs: true,
    persist: true,
  }),
  traces: Object.freeze({
    enabled: true,
    headSamplingRate: 1,
    persist: true,
  }),
});

function aliceObservability() {
  return {
    enabled: ALICE_OBSERVABILITY.enabled,
    headSamplingRate: ALICE_OBSERVABILITY.headSamplingRate,
    logs: { ...ALICE_OBSERVABILITY.logs },
    traces: { ...ALICE_OBSERVABILITY.traces },
  };
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function validIssuer(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.hostname.endsWith(".cloudflareaccess.com")
    );
  } catch {
    return false;
  }
}

function validModalOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.hostname.endsWith(".modal.run")
    );
  } catch {
    return false;
  }
}

function validateOwnerInputs(inputs, expectedKeys) {
  return (
    exactKeys(inputs, expectedKeys) &&
    validIssuer(inputs.accessIssuer) &&
    ACCESS_AUDIENCE.test(inputs.accessAudience) &&
    BASE64_URL_SHA256.test(inputs.ownerEmailSha256)
  );
}

export function canonicalAliceJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("ALICE_CANONICAL_JSON_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalAliceJson(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalAliceJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("ALICE_CANONICAL_JSON_INVALID");
}

async function sha256Text(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return `sha256:${Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export async function digestAliceEffectiveConfig(config) {
  return sha256Text(canonicalAliceJson(config));
}

export function buildAliceAccessEffectiveConfig(inputs) {
  if (
    !validateOwnerInputs(inputs, [
      "accessAudience",
      "accessIssuer",
      "ownerEmailSha256",
      "upstreamOrigin",
    ]) ||
    !validModalOrigin(inputs.upstreamOrigin)
  ) {
    throw new Error("ALICE_ACCESS_EFFECTIVE_CONFIG_INVALID");
  }
  return {
    schemaVersion: "alice.access-effective-config.v1",
    worker: {
      accountId: ALICE_CLOUDFLARE_TARGET.accountId,
      name: ALICE_CLOUDFLARE_TARGET.accessWorker,
      main: "src/index.ts",
      compatibilityDate: "2026-08-22",
      workersDev: false,
      previewUrls: false,
      minify: true,
      uploadSourceMaps: true,
      routes: [
        {
          pattern: `${ALICE_CLOUDFLARE_TARGET.accessDomain}/*`,
          zoneName: "rndrntwrk.com",
        },
      ],
    },
    bindings: {
      services: [
        {
          binding: "ALICE_CONTROL",
          service: ALICE_CLOUDFLARE_TARGET.controlWorker,
        },
      ],
      versionMetadata: { binding: "ALICE_VERSION" },
      secretNames: [
        "ALICE_ACCESS_CONTROL_SERVICE_TOKEN",
        "ALICE_ACCESS_PROXY_SECRET",
        "ALICE_MODAL_PROXY_KEY",
        "ALICE_MODAL_PROXY_SECRET",
      ],
    },
    values: {
      accessIssuer: inputs.accessIssuer,
      accessAudience: inputs.accessAudience,
      ownerEmailSha256: inputs.ownerEmailSha256,
      upstreamOrigin: inputs.upstreamOrigin,
    },
    observability: aliceObservability(),
  };
}

export function buildAliceContainerAccessEffectiveConfig(inputs) {
  if (
    !validateOwnerInputs(inputs, [
      "accessAudience",
      "accessIssuer",
      "ownerEmailSha256",
      "runtimeImage",
    ]) ||
    !CLOUDFLARE_CONTAINER_IMAGE.test(inputs.runtimeImage)
  ) {
    throw new Error("ALICE_CONTAINER_ACCESS_EFFECTIVE_CONFIG_INVALID");
  }
  return {
    schemaVersion: "alice.container-access-effective-config.v1",
    worker: {
      accountId: ALICE_CLOUDFLARE_TARGET.accountId,
      name: ALICE_CLOUDFLARE_TARGET.accessWorker,
      main: "src/worker.ts",
      compatibilityDate: "2026-08-22",
      workersDev: false,
      previewUrls: false,
      minify: true,
      uploadSourceMaps: true,
      routes: [
        {
          pattern: `${ALICE_CLOUDFLARE_TARGET.accessDomain}/*`,
          zoneName: "rndrntwrk.com",
        },
      ],
    },
    bindings: {
      services: [
        {
          binding: "ALICE_CONTROL",
          service: ALICE_CLOUDFLARE_TARGET.controlWorker,
        },
        {
          binding: "ALICE_AI_GATEWAY",
          service: ALICE_CLOUDFLARE_TARGET.aiGatewayWorker,
        },
        {
          binding: "ALICE_STATE_PLANE",
          service: "alice-state-plane",
        },
      ],
      durableObjects: [
        {
          binding: "ALICE_RUNTIME_CONTAINER",
          className: "AliceRuntimeContainer",
        },
      ],
      migrations: [
        {
          tag: "v2-alice-runtime-container",
          newSqliteClasses: ["AliceRuntimeContainer"],
        },
      ],
      containers: [
        {
          name: "alice-production-runtime",
          className: "AliceRuntimeContainer",
          image: inputs.runtimeImage,
          instanceType: "standard-1",
          maxInstances: 1,
        },
      ],
      versionMetadata: { binding: "ALICE_VERSION" },
      secretNames: [
        "ALICE_ACCESS_CONTROL_SERVICE_TOKEN",
        "ALICE_ACCESS_PROXY_SECRET",
        "ALICE_CAPABILITY_BOM_SHA256",
        "ALICE_DEPLOYMENT_CONTROLLER_COMMIT",
        "ALICE_ELIZA_COMMIT",
        "ALICE_POLICY_HASH",
        "ALICE_PROGRAM_DIGEST",
        "ALICE_RELEASE_DIGEST",
        "ALICE_RUNTIME_API_TOKEN",
        "ALICE_RUNTIME_BUILD_MANIFEST_SHA256",
        "ALICE_RUNTIME_IMAGE",
        "ALICE_RUNTIME_RELEASE_TOKEN",
        "ALICE_RUNTIME_REVISION",
        "ALICE_RUNTIME_VAULT_PASSPHRASE",
        "ALICE_SOURCE_COMMIT",
        "ALICE_STATE_PLANE_SERVICE_TOKEN",
      ],
    },
    values: {
      accessIssuer: inputs.accessIssuer,
      accessAudience: inputs.accessAudience,
      ownerEmailSha256: inputs.ownerEmailSha256,
      runtimeImage: inputs.runtimeImage,
      runtimeContainerName: "alice-production-runtime",
      runtimePort: 2138,
      runtimeEgress: "deny-by-default",
    },
    observability: aliceObservability(),
  };
}

export function buildAliceControlEffectiveConfig(inputs) {
  if (
    !validateOwnerInputs(inputs, [
      "accessAudience",
      "accessIssuer",
      "modelDailyBudgetUnits",
      "modalRevision",
      "ownerEmailSha256",
      "releaseAccessAudience",
      "releaseServiceTokenIdSha256",
    ]) ||
    !Number.isSafeInteger(inputs.modelDailyBudgetUnits) ||
    inputs.modelDailyBudgetUnits <= 0 ||
    inputs.modelDailyBudgetUnits > 10_000 ||
    !Number.isSafeInteger(inputs.modalRevision) ||
    inputs.modalRevision < 49 ||
    !ACCESS_AUDIENCE.test(inputs.releaseAccessAudience) ||
    !BASE64_URL_SHA256.test(inputs.releaseServiceTokenIdSha256)
  ) {
    throw new Error("ALICE_CONTROL_EFFECTIVE_CONFIG_INVALID");
  }
  return {
    schemaVersion: "alice.control-effective-config.v1",
    worker: {
      accountId: ALICE_CLOUDFLARE_TARGET.accountId,
      name: ALICE_CLOUDFLARE_TARGET.controlWorker,
      main: "src/index.ts",
      compatibilityDate: "2026-08-22",
      workersDev: false,
      previewUrls: false,
      minify: true,
      uploadSourceMaps: true,
      routes: [
        {
          pattern: `${ALICE_CLOUDFLARE_TARGET.accessDomain}/control/*`,
          zoneName: "rndrntwrk.com",
        },
        {
          pattern: `${ALICE_CLOUDFLARE_TARGET.releaseControlDomain}/control/internal/v1/deployment/*`,
          zoneName: "rndrntwrk.com",
        },
      ],
    },
    bindings: {
      durableObjects: [
        { name: "ALICE_AUTHORITY", className: "AliceAuthority" },
        { name: "ALICE_SESSIONS", className: "AliceSession" },
      ],
      migrations: [
        {
          tag: "alice-production-core-v1",
          newSqliteClasses: ["AliceAuthority", "AliceSession"],
        },
      ],
      workflows: [
        {
          binding: "ALICE_PLANS",
          name: ALICE_CLOUDFLARE_TARGET.planWorkflow,
          className: "AlicePlanWorkflow",
          steps: 16,
        },
      ],
      services: [{ binding: "ALICE_STATE_PLANE", service: "alice-state-plane" }],
      queueProducers: [
        {
          binding: "ALICE_EVIDENCE_QUEUE",
          queue: ALICE_CLOUDFLARE_TARGET.evidenceQueue,
        },
        { binding: "ALICE_WORK_QUEUE", queue: "alice-production-work-v1" },
      ],
      queueConsumers: [
        {
          queue: ALICE_CLOUDFLARE_TARGET.evidenceQueue,
          maxBatchSize: 10,
          maxBatchTimeout: 5,
          maxRetries: 3,
          deadLetterQueue: ALICE_CLOUDFLARE_TARGET.evidenceDlq,
          maxConcurrency: 1,
          retryDelay: 10,
        },
        {
          queue: "alice-production-work-v1",
          maxBatchSize: 10,
          maxBatchTimeout: 5,
          maxRetries: 3,
          deadLetterQueue: "alice-production-work-dlq-v1",
          maxConcurrency: 1,
          retryDelay: 10,
        },
        {
          queue: "alice-production-work-dlq-v1",
          maxBatchSize: 10,
          maxBatchTimeout: 5,
          maxRetries: 3,
          maxConcurrency: 1,
          retryDelay: 10,
        },
      ],
      r2: {
        binding: "ALICE_EVIDENCE",
        bucketName: ALICE_CLOUDFLARE_TARGET.evidenceBucket,
      },
      versionMetadata: { binding: "ALICE_VERSION" },
      secretNames: [
        "ALICE_ACCESS_GATEWAY_SERVICE_TOKEN",
        "ALICE_AI_GATEWAY_SERVICE_TOKEN",
        "ALICE_CONTROL_CONNECTOR_SERVICE_TOKEN",
        "ALICE_CONTROL_RECOVERY_TOKEN",
        "ALICE_DEPLOYMENT_PAUSE_TOKEN",
        "ALICE_EVIDENCE_QUEUE_HMAC_KEY",
        "ALICE_STATE_PLANE_SERVICE_TOKEN",
      ],
    },
    values: {
      accessIssuer: inputs.accessIssuer,
      accessAudience: inputs.accessAudience,
      ownerEmailSha256: inputs.ownerEmailSha256,
      modelDailyBudgetUnits: inputs.modelDailyBudgetUnits,
      modalRevision: inputs.modalRevision,
      releaseAccessAudience: inputs.releaseAccessAudience,
      releaseServiceTokenIdSha256: inputs.releaseServiceTokenIdSha256,
    },
    observability: aliceObservability(),
  };
}

export function buildAliceContainerControlEffectiveConfig(inputs) {
  if (
    !validateOwnerInputs(inputs, [
      "accessAudience",
      "accessIssuer",
      "modelDailyBudgetUnits",
      "ownerEmailSha256",
      "releaseAccessAudience",
      "releaseServiceTokenIdSha256",
      "runtimeRevision",
    ]) ||
    !Number.isSafeInteger(inputs.runtimeRevision) ||
    inputs.runtimeRevision < 49
  ) {
    throw new Error("ALICE_CONTROL_EFFECTIVE_CONFIG_INVALID");
  }
  const { runtimeRevision, ...common } = inputs;
  const legacy = buildAliceControlEffectiveConfig({
    ...common,
    modalRevision: runtimeRevision,
  });
  const { modalRevision: _legacyRevision, ...values } = legacy.values;
  return {
    ...legacy,
    schemaVersion: "alice.container-control-effective-config.v1",
    values: { ...values, runtimeRevision },
  };
}

export function buildAliceAiGatewayEffectiveConfig() {
  return {
    schemaVersion: "alice.ai-gateway-effective-config.v1",
    worker: {
      accountId: ALICE_CLOUDFLARE_TARGET.accountId,
      name: ALICE_CLOUDFLARE_TARGET.aiGatewayWorker,
      main: "src/index.mjs",
      compatibilityDate: "2026-08-22",
      workersDev: true,
      previewUrls: false,
      minify: true,
      uploadSourceMaps: true,
      runtimeOrigin: "https://alice-ai-gateway.gl4sspr1sm.workers.dev",
    },
    bindings: {
      ai: { binding: "AI" },
      services: [
        {
          binding: "ALICE_CONTROL",
          service: ALICE_CLOUDFLARE_TARGET.controlWorker,
        },
      ],
      versionMetadata: { binding: "ALICE_VERSION" },
      secretNames: [
        "ALICE_AI_CONTROL_SERVICE_TOKEN",
        "ALICE_RUNTIME_RELEASE_TOKEN_SHA256",
      ],
    },
    values: {
      aiGatewayId: ALICE_CLOUDFLARE_TARGET.aiGateway,
      skipCache: true,
      cacheTtl: 0,
      collectLog: false,
      chatModels: { ...ALICE_AI_CHAT_MODELS },
      embeddingModels: [...ALICE_AI_EMBEDDING_MODELS],
    },
    observability: aliceObservability(),
  };
}

function alicePrivatePlaneObservability() {
  return {
    enabled: true,
    headSamplingRate: 1,
    logs: {
      enabled: true,
      headSamplingRate: 1,
      invocationLogs: true,
    },
  };
}

function alicePrivatePlaneWorker(name) {
  return {
    accountId: ALICE_CLOUDFLARE_TARGET.accountId,
    name,
    main: "src/index.ts",
    compatibilityDate: "2026-08-27",
    workersDev: false,
    previewUrls: false,
    routes: [],
  };
}

export function buildAliceStatePlaneEffectiveConfig(inputs) {
  if (
    !exactKeys(inputs, ["databaseId"]) ||
    !D1_DATABASE_ID.test(inputs.databaseId)
  ) {
    throw new Error("ALICE_STATE_PLANE_EFFECTIVE_CONFIG_INVALID");
  }
  return {
    schemaVersion: "alice.state-plane-effective-config.v1",
    worker: alicePrivatePlaneWorker(ALICE_CLOUDFLARE_TARGET.statePlaneWorker),
    bindings: {
      d1: [{
        binding: "ALICE_STATE_DB",
        databaseName: ALICE_CLOUDFLARE_TARGET.stateDatabase,
        databaseId: inputs.databaseId,
        migrationsDir: "migrations",
      }],
      vectorize: [{
        binding: "ALICE_MEMORY_INDEX",
        indexName: ALICE_CLOUDFLARE_TARGET.memoryIndex,
      }],
      r2: [{
        binding: "ALICE_STATE_OBJECTS",
        bucketName: ALICE_CLOUDFLARE_TARGET.stateObjectsBucket,
      }],
      durableObjects: [{
        name: "ALICE_COORDINATION",
        className: "AliceStateCoordination",
      }],
      migrations: [{
        tag: "alice-state-plane-v1",
        newSqliteClasses: ["AliceStateCoordination"],
      }],
      services: [],
      secretNames: ["ALICE_STATE_PLANE_SERVICE_TOKEN"],
    },
    values: {
      vectorIndexName: ALICE_CLOUDFLARE_TARGET.memoryIndex,
      vectorModel: "bge-base-en-v1.5",
      vectorDimensions: 768,
      vectorMetric: "cosine",
    },
    observability: alicePrivatePlaneObservability(),
  };
}

export function buildAliceConnectorPlaneEffectiveConfig(inputs) {
  if (
    !exactKeys(inputs, ["providerActivation"]) ||
    inputs.providerActivation !== "disabled"
  ) {
    throw new Error("ALICE_CONNECTOR_PLANE_EFFECTIVE_CONFIG_INVALID");
  }
  return {
    schemaVersion: "alice.connector-plane-effective-config.v1",
    worker: alicePrivatePlaneWorker(
      ALICE_CLOUDFLARE_TARGET.connectorPlaneWorker,
    ),
    bindings: {
      services: [
        {
          binding: "ALICE_STATE_PLANE",
          service: ALICE_CLOUDFLARE_TARGET.statePlaneWorker,
        },
        {
          binding: "ALICE_CONTROL",
          service: ALICE_CLOUDFLARE_TARGET.controlWorker,
        },
      ],
      durableObjects: [{
        name: "ALICE_CONNECTOR_OUTBOUND",
        className: "AliceConnectorOutboundCoordination",
      }],
      migrations: [{
        tag: "alice-connector-plane-v1",
        newSqliteClasses: ["AliceConnectorOutboundCoordination"],
      }],
      secretNames: [
        "ALICE_CONNECTOR_SERVICE_TOKEN",
        "ALICE_CONTROL_CONNECTOR_SERVICE_TOKEN",
        "ALICE_STATE_PLANE_SERVICE_TOKEN",
      ],
    },
    values: {
      stateOwnerId: "alice-owner-production",
      connectorSessionId: "alice-connectors-production",
      providerActivation: {
        discord: "disabled",
        telegram: "disabled",
      },
    },
    observability: alicePrivatePlaneObservability(),
  };
}

function decodeBase64UrlText(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
}

export function encodeAliceDeploymentManifest(serializedManifest) {
  const bytes = new TextEncoder().encode(serializedManifest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function validDeploymentManifest(value) {
  const containerMode = value?.schemaVersion === "alice.deployment-manifest.v2";
  return (
    exactKeys(value, ["cloudflare", "release", "schemaVersion", "source"]) &&
    (containerMode || value.schemaVersion === "alice.deployment-manifest.v1") &&
    exactKeys(value.cloudflare, [
      ...Object.keys(ALICE_CLOUDFLARE_TARGET),
      "accessConfigSha256",
      "accessPolicyConfigSha256",
      "accessWorkerBundleSha256",
      "aiGatewayConfigSha256",
      "aiGatewayProviderConfigSha256",
      "aiGatewayWorkerBundleSha256",
      "controlWorkerBundleSha256",
      "controlConfigSha256",
      "connectorPlaneConfigSha256",
      "connectorPlaneWorkerBundleSha256",
      "continuityConfigSha256",
      "stateMigrationSetSha256",
      "statePlaneConfigSha256",
      "statePlaneWorkerBundleSha256",
      "vectorizeProviderConfigSha256",
    ]) &&
    Object.entries(ALICE_CLOUDFLARE_TARGET).every(
      ([key, expected]) => value.cloudflare[key] === expected,
    ) &&
    DIGEST.test(value.cloudflare.accessConfigSha256) &&
    DIGEST.test(value.cloudflare.accessPolicyConfigSha256) &&
    DIGEST.test(value.cloudflare.aiGatewayConfigSha256) &&
    DIGEST.test(value.cloudflare.aiGatewayProviderConfigSha256) &&
    DIGEST.test(value.cloudflare.accessWorkerBundleSha256) &&
    DIGEST.test(value.cloudflare.controlWorkerBundleSha256) &&
    DIGEST.test(value.cloudflare.aiGatewayWorkerBundleSha256) &&
    DIGEST.test(value.cloudflare.controlConfigSha256) &&
    DIGEST.test(value.cloudflare.statePlaneConfigSha256) &&
    DIGEST.test(value.cloudflare.connectorPlaneConfigSha256) &&
    DIGEST.test(value.cloudflare.statePlaneWorkerBundleSha256) &&
    DIGEST.test(value.cloudflare.vectorizeProviderConfigSha256) &&
    DIGEST.test(value.cloudflare.connectorPlaneWorkerBundleSha256) &&
    DIGEST.test(value.cloudflare.stateMigrationSetSha256) &&
    DIGEST.test(value.cloudflare.continuityConfigSha256) &&
    exactKeys(
      value.release,
      containerMode
        ? ["runtimeRevision", "policyHash", "releaseEpoch", "rollbackBoundary"]
        : ["modalRevision", "policyHash", "releaseEpoch", "rollbackBoundary"],
    ) &&
    Number.isSafeInteger(value.release.releaseEpoch) &&
    value.release.releaseEpoch > 0 &&
    Number.isSafeInteger(
      containerMode ? value.release.runtimeRevision : value.release.modalRevision,
    ) &&
    (containerMode ? value.release.runtimeRevision : value.release.modalRevision) >= 49 &&
    DIGEST.test(value.release.policyHash) &&
    value.release.rollbackBoundary ===
      `${containerMode ? "container" : "modal"}:alice-runtime:v${
        containerMode ? value.release.runtimeRevision : value.release.modalRevision
      }` &&
    exactKeys(value.source, [
      "capabilityBomSha256",
      "deploymentControllerCommit",
      "elizaCommit",
      "runtimeBuildManifestSha256",
      "runtimeImage",
      "sourceCommit",
    ]) &&
    /^[a-f0-9]{40}$/.test(value.source.sourceCommit) &&
    /^[a-f0-9]{40}$/.test(value.source.deploymentControllerCommit) &&
    /^[a-f0-9]{40}$/.test(value.source.elizaCommit) &&
    (containerMode
      ? /^registry\.cloudflare\.com\/036df6c823669b8fa2f66cf4c16eeb29\/alice-runtime@sha256:[a-f0-9]{64}$/.test(value.source.runtimeImage)
      : /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/.test(value.source.runtimeImage)) &&
    DIGEST.test(value.source.runtimeBuildManifestSha256)
    && DIGEST.test(value.source.capabilityBomSha256)
  );
}

export async function verifyAliceDeploymentManifestBinding({
  encodedManifest,
  expectedManifestSha256,
}) {
  if (!DIGEST.test(expectedManifestSha256)) {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
  const serialized = decodeBase64UrlText(encodedManifest);
  if (!serialized.endsWith("\n") || serialized.endsWith("\n\n")) {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
  let manifest;
  try {
    manifest = JSON.parse(serialized);
  } catch {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
  if (
    !validDeploymentManifest(manifest) ||
    `${canonicalAliceJson(manifest)}\n` !== serialized ||
    (await sha256Text(serialized)) !== expectedManifestSha256
  ) {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
  return manifest;
}

export async function verifyAliceEffectiveConfigBinding({
  encodedManifest,
  expectedManifestSha256,
  role,
  effectiveConfig,
}) {
  const manifest = await verifyAliceDeploymentManifestBinding({
    encodedManifest,
    expectedManifestSha256,
  });
  const digestField = {
    access: "accessConfigSha256",
    control: "controlConfigSha256",
    aiGateway: "aiGatewayConfigSha256",
    statePlane: "statePlaneConfigSha256",
    connectorPlane: "connectorPlaneConfigSha256",
  }[role];
  if (
    !digestField ||
    (await digestAliceEffectiveConfig(effectiveConfig)) !==
      manifest.cloudflare[digestField]
  ) {
    throw new Error("ALICE_EFFECTIVE_CONFIG_MISMATCH");
  }
  return manifest;
}
