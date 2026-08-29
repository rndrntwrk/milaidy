import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ALICE_CLOUDFLARE_TARGET,
  buildAliceContainerAccessEffectiveConfig,
  buildAliceContainerControlEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceConnectorPlaneEffectiveConfig,
  buildAliceControlEffectiveConfig,
  buildAliceRuntimeHostEffectiveConfig,
  buildAliceStatePlaneEffectiveConfig,
  canonicalAliceJson,
  encodeAliceDeploymentManifest,
  verifyAliceEffectiveConfigBinding,
} from "../../workers/alice-effective-config.js";
import {
  digestAliceDeploymentManifest,
  verifyAliceDeploymentManifest,
} from "./alice_deployment_manifest.mjs";

const ROLES = [
  "access",
  "runtimeHost",
  "control",
  "aiGateway",
  "statePlane",
  "connectorPlane",
];
const CANONICAL_MAIN = Object.freeze({
  access: "src/worker.ts",
  runtimeHost: "src/runtime-host.ts",
  control: "src/index.ts",
  aiGateway: "src/index.mjs",
  statePlane: "src/index.ts",
  connectorPlane: "src/index.ts",
});
const WORKER_DIRECTORIES = Object.freeze({
  access: "alice-access-gateway",
  runtimeHost: "alice-runtime-container-host",
  control: "alice-production-control",
  aiGateway: "alice-ai-gateway",
  statePlane: "alice-state-plane",
  connectorPlane: "alice-connector-plane",
});
const SOURCE_WORKER_DIRECTORIES = Object.freeze({
  ...WORKER_DIRECTORIES,
  runtimeHost: "alice-access-gateway",
});
const SOURCE_MAIN = Object.freeze({
  access: "src/worker.ts",
  runtimeHost: "src/runtime-host.ts",
  control: "src/index.ts",
  aiGateway: "src/index.mjs",
  statePlane: "src/index.ts",
  connectorPlane: "src/index.ts",
});

function canonicalArtifactMain(role) {
  return path.join(
    "..",
    "..",
    "alice-worker-bundles",
    WORKER_DIRECTORIES[role],
    "index.js",
  );
}

function canonicalArtifactMigrationDir() {
  return path.join(
    "..",
    "..",
    "alice-worker-bundles",
    WORKER_DIRECTORIES.statePlane,
    "migrations",
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function observabilityFromWrangler(value) {
  return {
    enabled: value?.enabled,
    headSamplingRate: value?.head_sampling_rate,
    logs: {
      enabled: value?.logs?.enabled,
      headSamplingRate: value?.logs?.head_sampling_rate,
      invocationLogs: value?.logs?.invocation_logs,
      persist: value?.logs?.persist,
    },
    traces: {
      enabled: value?.traces?.enabled,
      headSamplingRate: value?.traces?.head_sampling_rate,
      persist: value?.traces?.persist,
    },
  };
}

function baseWorker(config, includeRoutes = true) {
  const worker = {
    accountId: config.account_id,
    name: config.name,
    main: config.main,
    compatibilityDate: config.compatibility_date,
    workersDev: config.workers_dev,
    previewUrls: config.preview_urls,
    minify: config.minify,
    uploadSourceMaps: config.upload_source_maps,
  };
  if (includeRoutes) {
    worker.routes = (config.routes ?? []).map((route) => ({
      pattern: route.pattern,
      zoneName: route.zone_name,
    }));
  }
  return worker;
}

function privatePlaneWorker(config) {
  return {
    accountId: config.account_id,
    name: config.name,
    main: config.main,
    compatibilityDate: config.compatibility_date,
    workersDev: config.workers_dev,
    previewUrls: config.preview_urls,
    routes: (config.routes ?? []).map((route) => ({
      pattern: route.pattern,
      zoneName: route.zone_name,
    })),
  };
}

function privatePlaneObservabilityFromWrangler(value) {
  return {
    enabled: value?.enabled,
    headSamplingRate: value?.head_sampling_rate,
    logs: {
      enabled: value?.logs?.enabled,
      headSamplingRate: value?.logs?.head_sampling_rate,
      invocationLogs: value?.logs?.invocation_logs,
    },
  };
}

function commonBindings(config) {
  return {
    services: (config.services ?? []).map((binding) => ({
      binding: binding.binding,
      service: binding.service,
    })),
    versionMetadata: { binding: config.version_metadata?.binding },
    secretNames: [...(config.secrets?.required ?? [])].sort(),
  };
}

function durableObjectBindings(config) {
  return (config.durable_objects?.bindings ?? []).map((binding) => ({
    name: binding.name,
    className: binding.class_name,
    ...(binding.script_name === undefined
      ? {}
      : { scriptName: binding.script_name }),
  }));
}

function durableObjectMigrations(config) {
  return (config.migrations ?? []).map((migration) => ({
    tag: migration.tag,
    newSqliteClasses: migration.new_sqlite_classes,
  }));
}

function connectorProviderActivation(config) {
  const secretNames = new Set(config.secrets?.required ?? []);
  return {
    discord:
      Object.hasOwn(config.vars ?? {}, "ALICE_DISCORD_PRIVATE_DESTINATION_ID") ||
        secretNames.has("DISCORD_API_TOKEN") ||
        secretNames.has("DISCORD_APPLICATION_ID")
        ? "configured"
        : "disabled",
    telegram:
      Object.hasOwn(config.vars ?? {}, "ALICE_TELEGRAM_PRIVATE_DESTINATION_ID") ||
        secretNames.has("TELEGRAM_BOT_TOKEN")
        ? "configured"
        : "disabled",
  };
}

export function aliceEffectiveConfigFromWrangler(role, config, options = {}) {
  if (!ROLES.includes(role) || !config || typeof config !== "object") {
    throw new Error("ALICE_WRANGLER_CONFIG_INVALID");
  }
  let identityConfig = config;
  if (options.artifactRoot !== undefined || options.configPath !== undefined) {
    resolveAliceWranglerDeploymentEntrypoint(role, config, options);
    identityConfig = { ...clone(config), main: CANONICAL_MAIN[role] };
    if (role === "statePlane") {
      identityConfig.d1_databases[0].migrations_dir = "migrations";
    }
  } else if (options.deploymentMainPath !== undefined) {
    if (
      typeof options.deploymentMainPath !== "string" ||
      config.main !== options.deploymentMainPath ||
      (!path.isAbsolute(options.deploymentMainPath) &&
        options.deploymentMainPath !== canonicalArtifactMain(role))
    ) {
      throw new Error("ALICE_WRANGLER_CONFIG_INVALID");
    }
    identityConfig = { ...config, main: CANONICAL_MAIN[role] };
  }
  if (role === "access") {
    const common = commonBindings(identityConfig);
    return {
      schemaVersion: "alice.container-access-effective-config.v2",
      worker: baseWorker(identityConfig),
      bindings: {
        services: common.services,
        durableObjects: (identityConfig.durable_objects?.bindings ?? []).map(
          (binding) => ({
            binding: binding.name,
            className: binding.class_name,
            ...(binding.script_name === undefined
              ? {}
              : { scriptName: binding.script_name }),
          }),
        ),
        migrations: (identityConfig.migrations ?? []).map((migration) => ({
          tag: migration.tag,
          newSqliteClasses: migration.new_sqlite_classes,
        })),
        containers: (identityConfig.containers ?? []).map((container) => ({
          name: container.name,
          className: container.class_name,
          image: container.image,
          instanceType: container.instance_type,
          maxInstances: container.max_instances,
        })),
        versionMetadata: common.versionMetadata,
        secretNames: common.secretNames,
      },
      values: {
        accessIssuer: identityConfig.vars?.ALICE_ACCESS_ISSUER,
        accessAudience: identityConfig.vars?.ALICE_ACCESS_AUDIENCE,
        ownerEmailSha256: identityConfig.vars?.ALICE_OWNER_EMAIL_SHA256,
        runtimeImage: identityConfig.vars?.ALICE_CLOUDFLARE_RUNTIME_IMAGE,
        runtimeContainerName: "alice-production-runtime",
        runtimePort: 2138,
        runtimeEgress: "deny-by-default",
      },
      observability: observabilityFromWrangler(identityConfig.observability),
    };
  }
  if (role === "runtimeHost") {
    const common = commonBindings(identityConfig);
    return {
      schemaVersion: "alice.container-runtime-host-effective-config.v1",
      worker: baseWorker(identityConfig),
      bindings: {
        services: common.services,
        durableObjects: (identityConfig.durable_objects?.bindings ?? []).map(
          (binding) => ({
            binding: binding.name,
            className: binding.class_name,
          }),
        ),
        migrations: durableObjectMigrations(identityConfig),
        containers: (identityConfig.containers ?? []).map((container) => ({
          name: container.name,
          className: container.class_name,
          image: container.image,
          instanceType: container.instance_type,
          maxInstances: container.max_instances,
        })),
        versionMetadata: common.versionMetadata,
        secretNames: common.secretNames,
      },
      values: {
        runtimeImage: identityConfig.containers?.[0]?.image,
        runtimeContainerName: identityConfig.containers?.[0]?.name,
        runtimePort: 2138,
        runtimeEgress: "deny-by-default",
      },
      observability: observabilityFromWrangler(identityConfig.observability),
    };
  }
  if (role === "control") {
    const common = commonBindings(identityConfig);
    return {
      schemaVersion: "alice.container-control-effective-config.v1",
      worker: baseWorker(identityConfig),
      bindings: {
        durableObjects: (identityConfig.durable_objects?.bindings ?? []).map((binding) => ({
          name: binding.name,
          className: binding.class_name,
        })),
        migrations: (identityConfig.migrations ?? []).map((migration) => ({
          tag: migration.tag,
          newSqliteClasses: migration.new_sqlite_classes,
        })),
        workflows: (identityConfig.workflows ?? []).map((workflow) => ({
          binding: workflow.binding,
          name: workflow.name,
          className: workflow.class_name,
          steps: workflow.limits?.steps,
        })),
        services: common.services,
        queueProducers: (identityConfig.queues?.producers ?? []).map((producer) => ({
          binding: producer.binding,
          queue: producer.queue,
        })),
        queueConsumers: (identityConfig.queues?.consumers ?? []).map((consumer) => ({
          queue: consumer.queue,
          maxBatchSize: consumer.max_batch_size,
          maxBatchTimeout: consumer.max_batch_timeout,
          maxRetries: consumer.max_retries,
          ...(consumer.dead_letter_queue === undefined
            ? {}
            : { deadLetterQueue: consumer.dead_letter_queue }),
          maxConcurrency: consumer.max_concurrency,
          retryDelay: consumer.retry_delay,
        })),
        r2: {
          binding: identityConfig.r2_buckets?.[0]?.binding,
          bucketName: identityConfig.r2_buckets?.[0]?.bucket_name,
        },
        versionMetadata: common.versionMetadata,
        secretNames: common.secretNames,
      },
      values: {
        accessIssuer: identityConfig.vars?.ALICE_ACCESS_ISSUER,
        accessAudience: identityConfig.vars?.ALICE_ACCESS_AUDIENCE,
        ownerEmailSha256: identityConfig.vars?.ALICE_OWNER_EMAIL_SHA256,
        modelDailyBudgetUnits: Number(
          identityConfig.vars?.ALICE_MODEL_DAILY_BUDGET_UNITS,
        ),
        runtimeRevision: Number(identityConfig.vars?.ALICE_RUNTIME_REVISION),
        releaseAccessAudience:
          identityConfig.vars?.ALICE_RELEASE_ACCESS_AUDIENCE,
        releaseServiceTokenIdSha256:
          identityConfig.vars?.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
      },
      observability: observabilityFromWrangler(identityConfig.observability),
    };
  }
  if (role === "statePlane") {
    const common = commonBindings(identityConfig);
    return {
      schemaVersion: "alice.state-plane-effective-config.v1",
      worker: privatePlaneWorker(identityConfig),
      bindings: {
        d1: (identityConfig.d1_databases ?? []).map((database) => ({
          binding: database.binding,
          databaseName: database.database_name,
          databaseId: database.database_id,
          migrationsDir: database.migrations_dir,
        })),
        vectorize: (identityConfig.vectorize ?? []).map((index) => ({
          binding: index.binding,
          indexName: index.index_name,
        })),
        r2: (identityConfig.r2_buckets ?? []).map((bucket) => ({
          binding: bucket.binding,
          bucketName: bucket.bucket_name,
        })),
        durableObjects: durableObjectBindings(identityConfig),
        migrations: durableObjectMigrations(identityConfig),
        services: common.services,
        secretNames: common.secretNames,
      },
      values: {
        vectorIndexName: identityConfig.vars?.ALICE_VECTOR_INDEX_NAME,
        vectorModel: identityConfig.vars?.ALICE_VECTOR_MODEL,
        vectorDimensions: Number(
          identityConfig.vars?.ALICE_VECTOR_DIMENSIONS,
        ),
        vectorMetric: identityConfig.vars?.ALICE_VECTOR_METRIC,
      },
      observability: privatePlaneObservabilityFromWrangler(
        identityConfig.observability,
      ),
    };
  }
  if (role === "connectorPlane") {
    const common = commonBindings(identityConfig);
    return {
      schemaVersion: "alice.connector-plane-effective-config.v1",
      worker: privatePlaneWorker(identityConfig),
      bindings: {
        services: common.services,
        durableObjects: durableObjectBindings(identityConfig),
        migrations: durableObjectMigrations(identityConfig),
        secretNames: common.secretNames,
      },
      values: {
        stateOwnerId: identityConfig.vars?.ALICE_STATE_OWNER_ID,
        connectorSessionId:
          identityConfig.vars?.ALICE_CONNECTOR_SESSION_ID,
        providerActivation: connectorProviderActivation(identityConfig),
      },
      observability: privatePlaneObservabilityFromWrangler(
        identityConfig.observability,
      ),
    };
  }
  const common = commonBindings(identityConfig);
  return {
    schemaVersion: "alice.ai-gateway-effective-config.v1",
    worker: {
      ...baseWorker(identityConfig, false),
      runtimeOrigin: "https://alice-ai-gateway.gl4sspr1sm.workers.dev",
    },
    bindings: {
      ai: { binding: identityConfig.ai?.binding },
      services: common.services,
      versionMetadata: common.versionMetadata,
      secretNames: common.secretNames,
    },
    values: buildAliceAiGatewayEffectiveConfig().values,
    observability: observabilityFromWrangler(identityConfig.observability),
  };
}

export function resolveAliceWranglerDeploymentEntrypoint(
  role,
  config,
  { artifactRoot, configPath } = {},
) {
  if (
    !ROLES.includes(role) ||
    !config ||
    typeof config !== "object" ||
    typeof config.main !== "string" ||
    config.main.length === 0 ||
    path.isAbsolute(config.main) ||
    typeof artifactRoot !== "string" ||
    !path.isAbsolute(artifactRoot) ||
    typeof configPath !== "string" ||
    !path.isAbsolute(configPath)
  ) {
    throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
  }
  if (role === "statePlane") {
    const databases = config.d1_databases;
    if (
      !Array.isArray(databases) ||
      databases.length !== 1 ||
      typeof databases[0]?.migrations_dir !== "string" ||
      databases[0].migrations_dir.length === 0 ||
      path.isAbsolute(databases[0].migrations_dir)
    ) {
      throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
    }
    const migrationDir = path.resolve(
      path.dirname(configPath),
      databases[0].migrations_dir,
    );
    const migrationRelative = path.relative(artifactRoot, migrationDir);
    let migrationRootReal;
    let migrationDirReal;
    let migrationStat;
    try {
      migrationRootReal = fs.realpathSync(artifactRoot);
      migrationDirReal = fs.realpathSync(migrationDir);
      migrationStat = fs.lstatSync(migrationDir);
    } catch {
      throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
    }
    if (
      databases[0].migrations_dir !==
        path.relative(path.dirname(configPath), migrationDir) ||
      path.isAbsolute(migrationRelative) ||
      migrationRelative !==
        path.join(WORKER_DIRECTORIES.statePlane, "migrations") ||
      migrationDirReal !== path.join(
        migrationRootReal,
        WORKER_DIRECTORIES.statePlane,
        "migrations",
      ) ||
      !migrationStat.isDirectory() ||
      migrationStat.isSymbolicLink()
    ) {
      throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
    }
  }
  const resolved = path.resolve(path.dirname(configPath), config.main);
  const relative = path.relative(artifactRoot, resolved);
  const allowed = new Set([
    path.join(WORKER_DIRECTORIES[role], "index.js"),
    path.join(SOURCE_WORKER_DIRECTORIES[role], SOURCE_MAIN[role]),
  ]);
  if (
    config.main !== path.relative(path.dirname(configPath), resolved) ||
    path.isAbsolute(relative) ||
    !allowed.has(relative) ||
    (relative === path.join(WORKER_DIRECTORIES[role], "index.js") &&
      config.main !== canonicalArtifactMain(role))
  ) {
    throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
  }
  let rootReal;
  let resolvedReal;
  let stat;
  try {
    rootReal = fs.realpathSync(artifactRoot);
    resolvedReal = fs.realpathSync(resolved);
    stat = fs.lstatSync(resolved);
  } catch {
    throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
  }
  const realRelative = path.relative(rootReal, resolvedReal);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    path.isAbsolute(realRelative) ||
    !allowed.has(realRelative)
  ) {
    throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
  }
  return resolved;
}

export function bindAliceWranglerDeploymentEntrypoint(
  role,
  config,
  deploymentMainPath,
  options = {},
) {
  if (
    !ROLES.includes(role) ||
    !config ||
    typeof config !== "object" ||
    typeof deploymentMainPath !== "string" ||
    !path.isAbsolute(deploymentMainPath) ||
    typeof options.configPath !== "string" ||
    !path.isAbsolute(options.configPath) ||
    typeof options.artifactRoot !== "string" ||
    !path.isAbsolute(options.artifactRoot)
  ) {
    throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
  }
  const rendered = {
    ...clone(config),
    main: path.relative(path.dirname(options.configPath), deploymentMainPath),
  };
  if (role === "statePlane") {
    if (
      !Array.isArray(rendered.d1_databases) ||
      rendered.d1_databases.length !== 1
    ) {
      throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
    }
    rendered.d1_databases[0].migrations_dir = path.relative(
      path.dirname(options.configPath),
      path.join(
        options.artifactRoot,
        WORKER_DIRECTORIES.statePlane,
        "migrations",
      ),
    );
    if (
      rendered.d1_databases[0].migrations_dir !==
        canonicalArtifactMigrationDir() &&
      path.basename(options.artifactRoot) === "alice-worker-bundles"
    ) {
      throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
    }
  }
  const resolved = resolveAliceWranglerDeploymentEntrypoint(
    role,
    rendered,
    options,
  );
  if (resolved !== deploymentMainPath) {
    throw new Error("ALICE_WRANGLER_DEPLOYMENT_ENTRYPOINT_INVALID");
  }
  return rendered;
}

export function materializeAliceWranglerConfig(role, sourceConfig, values) {
  if (!ROLES.includes(role) || !values || typeof values !== "object") {
    throw new Error("ALICE_WRANGLER_CONFIG_INVALID");
  }
  const config = clone(sourceConfig);
  if (config.account_id !== ALICE_CLOUDFLARE_TARGET.accountId) {
    throw new Error("ALICE_WRANGLER_ACCOUNT_INVALID");
  }
  config.vars ??= {};
  if (role === "access") {
    Object.assign(config.vars, {
      ALICE_ACCESS_ISSUER: values.accessIssuer,
      ALICE_ACCESS_AUDIENCE: values.accessAudience,
      ALICE_OWNER_EMAIL_SHA256: values.ownerEmailSha256,
      ALICE_CLOUDFLARE_RUNTIME_IMAGE: values.runtimeImage,
      ALICE_DEPLOYMENT_MANIFEST_SHA256: values.deploymentManifestSha256,
      ALICE_DEPLOYMENT_MANIFEST_B64: values.deploymentManifestB64,
    });
  } else if (role === "runtimeHost") {
    if (!Array.isArray(config.containers) || config.containers.length !== 1) {
      throw new Error("ALICE_WRANGLER_CONFIG_INVALID");
    }
    config.containers[0].image = values.runtimeImage;
    Object.assign(config.vars, {
      ALICE_DEPLOYMENT_MANIFEST_SHA256: values.deploymentManifestSha256,
      ALICE_DEPLOYMENT_MANIFEST_B64: values.deploymentManifestB64,
    });
  } else if (role === "control") {
    Object.assign(config.vars, {
      ALICE_ACCESS_ISSUER: values.accessIssuer,
      ALICE_ACCESS_AUDIENCE: values.accessAudience,
      ALICE_OWNER_EMAIL_SHA256: values.ownerEmailSha256,
      ALICE_RELEASE_ACCESS_AUDIENCE: values.releaseAccessAudience,
      ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256:
        values.releaseServiceTokenIdSha256,
      ALICE_MODEL_DAILY_BUDGET_UNITS: String(values.modelDailyBudgetUnits),
      ALICE_PROGRAM_ENVELOPE_B64: values.programEnvelopeB64,
      ALICE_PROGRAM_SIGNATURE_B64: values.programSignatureB64,
      ALICE_PROGRAM_PUBLIC_JWK_B64: values.programPublicJwkB64,
      ALICE_RUNTIME_REVISION: String(values.runtimeRevision),
      ALICE_DEPLOYMENT_MANIFEST_SHA256: values.deploymentManifestSha256,
      ALICE_DEPLOYMENT_MANIFEST_B64: values.deploymentManifestB64,
    });
  } else if (role === "statePlane") {
    buildAliceStatePlaneEffectiveConfig({ databaseId: values.stateDatabaseId });
    if (!Array.isArray(config.d1_databases) || config.d1_databases.length !== 1) {
      throw new Error("ALICE_WRANGLER_CONFIG_INVALID");
    }
    config.d1_databases[0].database_id = values.stateDatabaseId;
    Object.assign(config.vars, {
      ALICE_DEPLOYMENT_MANIFEST_SHA256: values.deploymentManifestSha256,
      ALICE_DEPLOYMENT_MANIFEST_B64: values.deploymentManifestB64,
    });
  } else if (role === "connectorPlane") {
    buildAliceConnectorPlaneEffectiveConfig({
      providerActivation: values.providerActivation,
    });
    delete config.vars.ALICE_DISCORD_PRIVATE_DESTINATION_ID;
    delete config.vars.ALICE_TELEGRAM_PRIVATE_DESTINATION_ID;
    if (!Array.isArray(config.secrets?.required)) {
      throw new Error("ALICE_WRANGLER_CONFIG_INVALID");
    }
    const providerSecretNames = new Set([
      "DISCORD_API_TOKEN",
      "DISCORD_APPLICATION_ID",
      "TELEGRAM_BOT_TOKEN",
    ]);
    config.secrets.required = config.secrets.required.filter(
      (secretName) => !providerSecretNames.has(secretName),
    );
    Object.assign(config.vars, {
      ALICE_DEPLOYMENT_MANIFEST_SHA256: values.deploymentManifestSha256,
      ALICE_DEPLOYMENT_MANIFEST_B64: values.deploymentManifestB64,
    });
  } else {
    Object.assign(config.vars, {
      ALICE_DEPLOYMENT_MANIFEST_SHA256: values.deploymentManifestSha256,
      ALICE_DEPLOYMENT_MANIFEST_B64: values.deploymentManifestB64,
    });
  }
  return config;
}

export function assertAliceWranglerMatchesEffectiveConfig(
  role,
  config,
  expectedEffectiveConfig,
  options = {},
) {
  let actual;
  try {
    actual = aliceEffectiveConfigFromWrangler(role, config, options);
  } catch {
    throw new Error("ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH");
  }
  if (
    canonicalAliceJson(actual) !== canonicalAliceJson(expectedEffectiveConfig)
  ) {
    throw new Error("ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH");
  }
  return actual;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const sourceRoot = process.env.ALICE_SOURCE_ROOT;
    const outputDir = process.env.ALICE_WRANGLER_OUTPUT_DIR;
    const manifestPath = process.env.ALICE_DEPLOYMENT_MANIFEST_PATH;
    const workerBundleRoot = process.env.ALICE_WORKER_BUNDLE_ROOT;
    if (
      !sourceRoot ||
      !path.isAbsolute(sourceRoot) ||
      !outputDir ||
      !path.isAbsolute(outputDir) ||
      !manifestPath ||
      !path.isAbsolute(manifestPath) ||
      (workerBundleRoot !== undefined && !path.isAbsolute(workerBundleRoot))
    ) {
      throw new Error("ALICE_WRANGLER_PATH_INVALID");
    }
    const serializedManifest = fs.readFileSync(manifestPath, "utf8");
    verifyAliceDeploymentManifest(serializedManifest);
    const deploymentManifestSha256 =
      digestAliceDeploymentManifest(serializedManifest);
    const deploymentManifestB64 =
      encodeAliceDeploymentManifest(serializedManifest);
    const commonValues = {
      accessIssuer: process.env.ALICE_ACCESS_ISSUER,
      accessAudience: process.env.ALICE_ACCESS_AUDIENCE,
      ownerEmailSha256: process.env.ALICE_OWNER_EMAIL_SHA256,
      deploymentManifestSha256,
      deploymentManifestB64,
    };
    const expected = {
      access: buildAliceContainerAccessEffectiveConfig({
        accessIssuer: commonValues.accessIssuer,
        accessAudience: commonValues.accessAudience,
        ownerEmailSha256: commonValues.ownerEmailSha256,
        runtimeImage: process.env.ALICE_CLOUDFLARE_RUNTIME_IMAGE,
      }),
      runtimeHost: buildAliceRuntimeHostEffectiveConfig({
        runtimeImage: process.env.ALICE_CLOUDFLARE_RUNTIME_IMAGE,
      }),
      control: buildAliceContainerControlEffectiveConfig({
        accessIssuer: commonValues.accessIssuer,
        accessAudience: commonValues.accessAudience,
        ownerEmailSha256: commonValues.ownerEmailSha256,
        modelDailyBudgetUnits: Number(
          process.env.ALICE_MODEL_DAILY_BUDGET_UNITS,
        ),
        runtimeRevision: Number(process.env.ALICE_RUNTIME_REVISION),
        releaseAccessAudience: process.env.ALICE_RELEASE_ACCESS_AUDIENCE,
        releaseServiceTokenIdSha256:
          process.env.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
      }),
      aiGateway: buildAliceAiGatewayEffectiveConfig(),
      statePlane: buildAliceStatePlaneEffectiveConfig({
        databaseId: process.env.ALICE_STATE_DATABASE_ID,
      }),
      connectorPlane: buildAliceConnectorPlaneEffectiveConfig({
        providerActivation: "disabled",
      }),
    };
    const sources = {
      access: loadJson(
        path.join(sourceRoot, "workers/alice-access-gateway/wrangler.jsonc"),
      ),
      runtimeHost: loadJson(
        path.join(
          sourceRoot,
          "workers/alice-access-gateway/wrangler.runtime-host.jsonc",
        ),
      ),
      control: loadJson(
        path.join(sourceRoot, "workers/alice-production-control/wrangler.jsonc"),
      ),
      aiGateway: loadJson(
        path.join(sourceRoot, "workers/alice-ai-gateway/wrangler.jsonc"),
      ),
      statePlane: loadJson(
        path.join(sourceRoot, "workers/alice-state-plane/wrangler.jsonc"),
      ),
      connectorPlane: loadJson(
        path.join(sourceRoot, "workers/alice-connector-plane/wrangler.jsonc"),
      ),
    };
    fs.mkdirSync(outputDir, { recursive: false });
    for (const role of ROLES) {
      const roleValues = role === "access" || role === "runtimeHost"
        ? {
            ...commonValues,
            runtimeImage: process.env.ALICE_CLOUDFLARE_RUNTIME_IMAGE,
          }
        : role === "control"
          ? {
              ...commonValues,
              modelDailyBudgetUnits: Number(
                process.env.ALICE_MODEL_DAILY_BUDGET_UNITS,
              ),
              runtimeRevision: Number(process.env.ALICE_RUNTIME_REVISION),
              releaseAccessAudience:
                process.env.ALICE_RELEASE_ACCESS_AUDIENCE,
              releaseServiceTokenIdSha256:
                process.env.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
              programEnvelopeB64: process.env.ALICE_PROGRAM_ENVELOPE_B64,
              programSignatureB64: process.env.ALICE_PROGRAM_SIGNATURE_B64,
              programPublicJwkB64: process.env.ALICE_PROGRAM_PUBLIC_JWK_B64,
            }
          : role === "statePlane"
            ? {
                ...commonValues,
                stateDatabaseId: process.env.ALICE_STATE_DATABASE_ID,
              }
            : role === "connectorPlane"
              ? {
                  ...commonValues,
                  providerActivation: "disabled",
                }
          : commonValues;
      const renderedIdentity = materializeAliceWranglerConfig(
        role,
        sources[role],
        roleValues,
      );
      const sourceWorkerRoot = path.join(
        sourceRoot,
        "workers",
        SOURCE_WORKER_DIRECTORIES[role],
      );
      const deploymentRoot = workerBundleRoot
        ? path.join(workerBundleRoot, WORKER_DIRECTORIES[role])
        : sourceWorkerRoot;
      const deploymentMainPath = workerBundleRoot
        ? path.join(deploymentRoot, "index.js")
        : path.resolve(deploymentRoot, renderedIdentity.main);
      const renderedConfigPath = path.join(
        outputDir,
        `${role}.wrangler.json`,
      );
      const rendered = bindAliceWranglerDeploymentEntrypoint(
        role,
        renderedIdentity,
        deploymentMainPath,
        {
          artifactRoot: workerBundleRoot ?? path.join(sourceRoot, "workers"),
          configPath: renderedConfigPath,
        },
      );
      const effective = assertAliceWranglerMatchesEffectiveConfig(
        role,
        rendered,
        expected[role],
        {
          artifactRoot: workerBundleRoot ?? path.join(sourceRoot, "workers"),
          configPath: renderedConfigPath,
        },
      );
      await verifyAliceEffectiveConfigBinding({
        encodedManifest: deploymentManifestB64,
        expectedManifestSha256: deploymentManifestSha256,
        role,
        effectiveConfig: effective,
      });
      fs.writeFileSync(
        renderedConfigPath,
        `${JSON.stringify(rendered)}\n`,
        { encoding: "utf8", mode: 0o444 },
      );
    }
    process.stdout.write(
      `${JSON.stringify({ ok: true, deploymentManifestSha256, outputDir })}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
