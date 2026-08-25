import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ALICE_CLOUDFLARE_TARGET,
  buildAliceAccessEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceControlEffectiveConfig,
  canonicalAliceJson,
  encodeAliceDeploymentManifest,
  verifyAliceEffectiveConfigBinding,
} from "../../workers/alice-effective-config.js";
import {
  digestAliceDeploymentManifest,
  verifyAliceDeploymentManifest,
} from "./alice_deployment_manifest.mjs";

const ROLES = ["access", "control", "aiGateway"];
const CANONICAL_MAIN = Object.freeze({
  access: "src/index.ts",
  control: "src/index.ts",
  aiGateway: "src/index.mjs",
});
const WORKER_DIRECTORIES = Object.freeze({
  access: "alice-access-gateway",
  control: "alice-production-control",
  aiGateway: "alice-ai-gateway",
});
const SOURCE_MAIN = Object.freeze({
  access: "src/index.ts",
  control: "src/index.ts",
  aiGateway: "src/index.mjs",
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

export function aliceEffectiveConfigFromWrangler(role, config, options = {}) {
  if (!ROLES.includes(role) || !config || typeof config !== "object") {
    throw new Error("ALICE_WRANGLER_CONFIG_INVALID");
  }
  let identityConfig = config;
  if (options.artifactRoot !== undefined || options.configPath !== undefined) {
    resolveAliceWranglerDeploymentEntrypoint(role, config, options);
    identityConfig = { ...config, main: CANONICAL_MAIN[role] };
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
    return {
      schemaVersion: "alice.access-effective-config.v1",
      worker: baseWorker(identityConfig),
      bindings: commonBindings(identityConfig),
      values: {
        accessIssuer: identityConfig.vars?.ALICE_ACCESS_ISSUER,
        accessAudience: identityConfig.vars?.ALICE_ACCESS_AUDIENCE,
        ownerEmailSha256: identityConfig.vars?.ALICE_OWNER_EMAIL_SHA256,
        upstreamOrigin: identityConfig.vars?.ALICE_UPSTREAM_ORIGIN,
      },
      observability: observabilityFromWrangler(identityConfig.observability),
    };
  }
  if (role === "control") {
    const common = commonBindings(identityConfig);
    return {
      schemaVersion: "alice.control-effective-config.v1",
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
        queueProducer: {
          binding: identityConfig.queues?.producers?.[0]?.binding,
          queue: identityConfig.queues?.producers?.[0]?.queue,
        },
        queueConsumer: {
          queue: identityConfig.queues?.consumers?.[0]?.queue,
          maxBatchSize: identityConfig.queues?.consumers?.[0]?.max_batch_size,
          maxBatchTimeout: identityConfig.queues?.consumers?.[0]?.max_batch_timeout,
          maxRetries: identityConfig.queues?.consumers?.[0]?.max_retries,
          deadLetterQueue: identityConfig.queues?.consumers?.[0]?.dead_letter_queue,
          maxConcurrency: identityConfig.queues?.consumers?.[0]?.max_concurrency,
          retryDelay: identityConfig.queues?.consumers?.[0]?.retry_delay,
        },
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
        modalRevision: Number(identityConfig.vars?.ALICE_MODAL_REVISION),
        releaseAccessAudience:
          identityConfig.vars?.ALICE_RELEASE_ACCESS_AUDIENCE,
        releaseServiceTokenIdSha256:
          identityConfig.vars?.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
      },
      observability: observabilityFromWrangler(identityConfig.observability),
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
  const resolved = path.resolve(path.dirname(configPath), config.main);
  const relative = path.relative(artifactRoot, resolved);
  const allowed = new Set([
    path.join(WORKER_DIRECTORIES[role], "index.js"),
    path.join(WORKER_DIRECTORIES[role], SOURCE_MAIN[role]),
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
      ALICE_UPSTREAM_ORIGIN: values.upstreamOrigin,
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
      ALICE_MODAL_REVISION: String(values.modalRevision),
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
      access: buildAliceAccessEffectiveConfig({
        accessIssuer: commonValues.accessIssuer,
        accessAudience: commonValues.accessAudience,
        ownerEmailSha256: commonValues.ownerEmailSha256,
        upstreamOrigin: process.env.ALICE_UPSTREAM_ORIGIN,
      }),
      control: buildAliceControlEffectiveConfig({
        accessIssuer: commonValues.accessIssuer,
        accessAudience: commonValues.accessAudience,
        ownerEmailSha256: commonValues.ownerEmailSha256,
        modelDailyBudgetUnits: Number(
          process.env.ALICE_MODEL_DAILY_BUDGET_UNITS,
        ),
        modalRevision: Number(process.env.ALICE_MODAL_REVISION),
        releaseAccessAudience: process.env.ALICE_RELEASE_ACCESS_AUDIENCE,
        releaseServiceTokenIdSha256:
          process.env.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
      }),
      aiGateway: buildAliceAiGatewayEffectiveConfig(),
    };
    const sources = {
      access: loadJson(
        path.join(sourceRoot, "workers/alice-access-gateway/wrangler.jsonc"),
      ),
      control: loadJson(
        path.join(sourceRoot, "workers/alice-production-control/wrangler.jsonc"),
      ),
      aiGateway: loadJson(
        path.join(sourceRoot, "workers/alice-ai-gateway/wrangler.jsonc"),
      ),
    };
    fs.mkdirSync(outputDir, { recursive: false });
    for (const role of ROLES) {
      const roleValues = role === "access"
        ? { ...commonValues, upstreamOrigin: process.env.ALICE_UPSTREAM_ORIGIN }
        : role === "control"
          ? {
              ...commonValues,
              modelDailyBudgetUnits: Number(
                process.env.ALICE_MODEL_DAILY_BUDGET_UNITS,
              ),
              modalRevision: Number(process.env.ALICE_MODAL_REVISION),
              releaseAccessAudience:
                process.env.ALICE_RELEASE_ACCESS_AUDIENCE,
              releaseServiceTokenIdSha256:
                process.env.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
              programEnvelopeB64: process.env.ALICE_PROGRAM_ENVELOPE_B64,
              programSignatureB64: process.env.ALICE_PROGRAM_SIGNATURE_B64,
              programPublicJwkB64: process.env.ALICE_PROGRAM_PUBLIC_JWK_B64,
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
        WORKER_DIRECTORIES[role],
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
