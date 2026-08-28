import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALICE_CLOUDFLARE_TARGET,
  buildAliceContainerAccessEffectiveConfig,
  buildAliceContainerControlEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceConnectorPlaneEffectiveConfig,
  buildAliceControlEffectiveConfig,
  buildAliceStatePlaneEffectiveConfig,
} from "../../workers/alice-effective-config.js";
import * as aliceEffectiveConfigModule from "../../workers/alice-effective-config.js";
import {
  aliceEffectiveConfigFromWrangler,
  assertAliceWranglerMatchesEffectiveConfig,
  bindAliceWranglerDeploymentEntrypoint,
  materializeAliceWranglerConfig,
} from "./alice_cloudflare_config.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const owner = "A".repeat(43);
const runtimeContainerImage =
  `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"9".repeat(64)}`;
const stateDatabaseId = "11111111-2222-3333-4444-555555555555";
const connectorProviderActivation = "disabled";
const releaseRoles = [
  "access",
  "control",
  "aiGateway",
  "statePlane",
  "connectorPlane",
];
const commonValues = {
  accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
  accessAudience: "alice-access-audience",
  ownerEmailSha256: owner,
  releaseAccessAudience: "alice-release-controller-audience",
  releaseServiceTokenIdSha256: "R".repeat(43),
  deploymentManifestSha256: `sha256:${"a".repeat(64)}`,
  deploymentManifestB64: "eyJ0ZXN0Ijp0cnVlfQo",
};
const source = {
  access: JSON.parse(
    fs.readFileSync(
      new URL("../../workers/alice-access-gateway/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ),
  control: JSON.parse(
    fs.readFileSync(
      new URL("../../workers/alice-production-control/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ),
  aiGateway: JSON.parse(
    fs.readFileSync(
      new URL("../../workers/alice-ai-gateway/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ),
  statePlane: JSON.parse(
    fs.readFileSync(
      new URL("../../workers/alice-state-plane/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ),
  connectorPlane: JSON.parse(
    fs.readFileSync(
      new URL("../../workers/alice-connector-plane/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ),
};
const expected = {
  access: buildAliceContainerAccessEffectiveConfig({
    accessIssuer: commonValues.accessIssuer,
    accessAudience: commonValues.accessAudience,
    ownerEmailSha256: owner,
    runtimeImage: runtimeContainerImage,
  }),
  control: buildAliceContainerControlEffectiveConfig({
    accessIssuer: commonValues.accessIssuer,
    accessAudience: commonValues.accessAudience,
    ownerEmailSha256: owner,
    modelDailyBudgetUnits: 10_000,
    runtimeRevision: 49,
    releaseAccessAudience: commonValues.releaseAccessAudience,
    releaseServiceTokenIdSha256:
      commonValues.releaseServiceTokenIdSha256,
  }),
  aiGateway: buildAliceAiGatewayEffectiveConfig(),
  statePlane: buildAliceStatePlaneEffectiveConfig({
    databaseId: stateDatabaseId,
  }),
  connectorPlane: buildAliceConnectorPlaneEffectiveConfig({
    providerActivation: connectorProviderActivation,
  }),
};

test("builds strict private state and connector effective configs", () => {
  assert.equal(ALICE_CLOUDFLARE_TARGET.statePlaneWorker, "alice-state-plane");
  assert.equal(
    ALICE_CLOUDFLARE_TARGET.connectorPlaneWorker,
    "alice-connector-plane",
  );
  assert.equal(
    typeof aliceEffectiveConfigModule.buildAliceStatePlaneEffectiveConfig,
    "function",
  );
  assert.equal(
    typeof aliceEffectiveConfigModule.buildAliceConnectorPlaneEffectiveConfig,
    "function",
  );
  assert.deepEqual(
    aliceEffectiveConfigModule.buildAliceStatePlaneEffectiveConfig({
      databaseId: stateDatabaseId,
    }),
    {
      schemaVersion: "alice.state-plane-effective-config.v1",
      worker: {
        accountId: "036df6c823669b8fa2f66cf4c16eeb29",
        name: "alice-state-plane",
        main: "src/index.ts",
        compatibilityDate: "2026-08-27",
        workersDev: false,
        previewUrls: false,
        routes: [],
      },
      bindings: {
        d1: [{
          binding: "ALICE_STATE_DB",
          databaseName: "alice-production-state",
          databaseId: stateDatabaseId,
          migrationsDir: "migrations",
        }],
        vectorize: [{
          binding: "ALICE_MEMORY_INDEX",
          indexName: "alice-memory-v1",
        }],
        r2: [{
          binding: "ALICE_STATE_OBJECTS",
          bucketName: "alice-production-state-objects",
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
        vectorIndexName: "alice-memory-v1",
        vectorModel: "bge-base-en-v1.5",
        vectorDimensions: 768,
        vectorMetric: "cosine",
      },
      observability: {
        enabled: true,
        headSamplingRate: 1,
        logs: {
          enabled: true,
          headSamplingRate: 1,
          invocationLogs: true,
        },
      },
    },
  );
  assert.deepEqual(
    aliceEffectiveConfigModule.buildAliceConnectorPlaneEffectiveConfig({
      providerActivation: connectorProviderActivation,
    }),
    {
      schemaVersion: "alice.connector-plane-effective-config.v1",
      worker: {
        accountId: "036df6c823669b8fa2f66cf4c16eeb29",
        name: "alice-connector-plane",
        main: "src/index.ts",
        compatibilityDate: "2026-08-27",
        workersDev: false,
        previewUrls: false,
        routes: [],
      },
      bindings: {
        services: [
          { binding: "ALICE_STATE_PLANE", service: "alice-state-plane" },
          { binding: "ALICE_CONTROL", service: "alice-production-control" },
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
      observability: {
        enabled: true,
        headSamplingRate: 1,
        logs: {
          enabled: true,
          headSamplingRate: 1,
          invocationLogs: true,
        },
      },
    },
  );
});

function rendered(role) {
  const values = role === "access"
    ? { ...commonValues, runtimeImage: runtimeContainerImage }
    : role === "control"
      ? {
          ...commonValues,
          modelDailyBudgetUnits: 10_000,
          runtimeRevision: 49,
          releaseAccessAudience: commonValues.releaseAccessAudience,
          releaseServiceTokenIdSha256:
            commonValues.releaseServiceTokenIdSha256,
          programEnvelopeB64: "program",
          programSignatureB64: "signature",
          programPublicJwkB64: "public-jwk",
        }
      : role === "statePlane"
        ? { ...commonValues, stateDatabaseId }
        : role === "connectorPlane"
          ? {
              ...commonValues,
              providerActivation: connectorProviderActivation,
            }
      : commonValues;
  return materializeAliceWranglerConfig(role, source[role], values);
}

function valuesForRole(role) {
  return role === "access"
    ? { ...commonValues, runtimeImage: runtimeContainerImage }
    : role === "control"
      ? {
          ...commonValues,
          modelDailyBudgetUnits: 10_000,
          runtimeRevision: 49,
          releaseAccessAudience: commonValues.releaseAccessAudience,
          releaseServiceTokenIdSha256:
            commonValues.releaseServiceTokenIdSha256,
          programEnvelopeB64: "program",
          programSignatureB64: "signature",
          programPublicJwkB64: "public-jwk",
        }
      : role === "statePlane"
        ? { ...commonValues, stateDatabaseId }
        : role === "connectorPlane"
          ? {
              ...commonValues,
              providerActivation: connectorProviderActivation,
            }
      : commonValues;
}

test("renders every canonical effective config from its deployable Wrangler file", () => {
  for (const role of releaseRoles) {
    assert.deepEqual(
      assertAliceWranglerMatchesEffectiveConfig(
        role,
        rendered(role),
        expected[role],
      ),
      expected[role],
    );
  }
});

test("materializes exact private state and inert connector bindings without provider credentials", () => {
  const state = rendered("statePlane");
  assert.equal(state.workers_dev, false);
  assert.deepEqual(state.routes, []);
  assert.equal(state.d1_databases[0].database_id, stateDatabaseId);
  assert.equal(state.d1_databases[0].database_name, "alice-production-state");
  assert.equal(state.vectorize[0].index_name, "alice-memory-v1");
  assert.equal(state.vars.ALICE_VECTOR_METRIC, "cosine");
  assert.equal(state.r2_buckets[0].bucket_name, "alice-production-state-objects");

  const connector = rendered("connectorPlane");
  assert.equal(connector.workers_dev, false);
  assert.deepEqual(connector.routes, []);
  assert.equal("ALICE_DISCORD_PRIVATE_DESTINATION_ID" in connector.vars, false);
  assert.equal("ALICE_TELEGRAM_PRIVATE_DESTINATION_ID" in connector.vars, false);
  assert.deepEqual(
    [...connector.secrets.required].sort(),
    expected.connectorPlane.bindings.secretNames,
  );
  for (const providerSecret of [
    "DISCORD_API_TOKEN",
    "DISCORD_APPLICATION_ID",
    "TELEGRAM_BOT_TOKEN",
  ]) {
    assert.equal(connector.secrets.required.includes(providerSecret), false);
  }
  for (const secretName of connector.secrets.required) {
    assert.equal(secretName in connector.vars, false);
  }
  assert.deepEqual(
    aliceEffectiveConfigFromWrangler("connectorPlane", connector).values
      .providerActivation,
    { discord: "disabled", telegram: "disabled" },
  );
});

test("fails closed rather than materializing connector provider credentials or destinations", () => {
  assert.throws(
    () => buildAliceConnectorPlaneEffectiveConfig({
      providerActivation: "enabled",
    }),
    /ALICE_CONNECTOR_PLANE_EFFECTIVE_CONFIG_INVALID/,
  );

  const configuredSource = structuredClone(source.connectorPlane);
  configuredSource.vars.ALICE_DISCORD_PRIVATE_DESTINATION_ID =
    "123456789012345678";
  configuredSource.secrets.required.push("DISCORD_API_TOKEN");
  const inert = materializeAliceWranglerConfig(
    "connectorPlane",
    configuredSource,
    { ...commonValues, providerActivation: connectorProviderActivation },
  );
  assert.equal("ALICE_DISCORD_PRIVATE_DESTINATION_ID" in inert.vars, false);
  assert.equal(inert.secrets.required.includes("DISCORD_API_TOKEN"), false);
  assert.deepEqual(inert.routes, []);
  assert.equal(inert.workers_dev, false);
});

test("rejects state or connector binding and exposure substitutions", () => {
  const substitutedState = rendered("statePlane");
  substitutedState.d1_databases[0].database_id =
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  assert.throws(
    () => assertAliceWranglerMatchesEffectiveConfig(
      "statePlane",
      substitutedState,
      expected.statePlane,
    ),
    /ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH/,
  );

  const substitutedConnector = rendered("connectorPlane");
  substitutedConnector.routes.push({
    pattern: "connector.rndrntwrk.com/*",
    zone_name: "rndrntwrk.com",
  });
  assert.throws(
    () => assertAliceWranglerMatchesEffectiveConfig(
      "connectorPlane",
      substitutedConnector,
      expected.connectorPlane,
    ),
    /ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH/,
  );
  const substitutedSecret = rendered("connectorPlane");
  substitutedSecret.secrets.required.push("ALICE_UNREVIEWED_SECRET");
  assert.throws(
    () => assertAliceWranglerMatchesEffectiveConfig(
      "connectorPlane",
      substitutedSecret,
      expected.connectorPlane,
    ),
    /ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH/,
  );
});

test("materializes one immutable Container image into the runtime var and Container binding", () => {
  const config = rendered("access");
  assert.equal(config.vars.ALICE_CLOUDFLARE_RUNTIME_IMAGE, runtimeContainerImage);
  assert.equal(config.containers.length, 1);
  assert.equal(config.containers[0].image, runtimeContainerImage);
  assert.equal("ALICE_UPSTREAM_ORIGIN" in config.vars, false);
});

test("rejects a deployment-time service binding substitution", () => {
  const substituted = rendered("access");
  substituted.services[0].service = "alice-control-substituted";
  assert.throws(
    () =>
      assertAliceWranglerMatchesEffectiveConfig(
        "access",
        substituted,
        expected.access,
      ),
    /ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH/,
  );
});

test("binds the stable evidence HMAC secret into the signed control closure", () => {
  assert.ok(
    expected.control.bindings.secretNames.includes(
      "ALICE_EVIDENCE_QUEUE_HMAC_KEY",
    ),
  );
  for (const secretNames of [
    rendered("control").secrets.required.filter(
      (name) => name !== "ALICE_EVIDENCE_QUEUE_HMAC_KEY",
    ),
    rendered("control").secrets.required.map((name) =>
      name === "ALICE_EVIDENCE_QUEUE_HMAC_KEY"
        ? "ALICE_EVIDENCE_QUEUE_HMAC_KEY_SUBSTITUTED"
        : name),
  ]) {
    const changed = rendered("control");
    changed.secrets.required = secretNames;
    assert.throws(
      () => assertAliceWranglerMatchesEffectiveConfig(
        "control",
        changed,
        expected.control,
      ),
      /ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH/,
    );
  }
});

test("binds the admitted capability BOM digest into the signed Container closure", () => {
  assert.ok(
    expected.access.bindings.secretNames.includes(
      "ALICE_CAPABILITY_BOM_SHA256",
    ),
  );
  assert.ok(
    rendered("access").secrets.required.includes(
      "ALICE_CAPABILITY_BOM_SHA256",
    ),
  );
  for (const secretNames of [
    rendered("access").secrets.required.filter(
      (name) => name !== "ALICE_CAPABILITY_BOM_SHA256",
    ),
    rendered("access").secrets.required.map((name) =>
      name === "ALICE_CAPABILITY_BOM_SHA256"
        ? "ALICE_CAPABILITY_BOM_SHA256_SUBSTITUTED"
        : name,
    ),
  ]) {
    const changed = rendered("access");
    changed.secrets.required = secretNames;
    assert.throws(
      () => assertAliceWranglerMatchesEffectiveConfig(
        "access",
        changed,
        expected.access,
      ),
      /ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH/,
    );
  }
});

test("binds every Worker to the exact production account", () => {
  for (const role of releaseRoles) {
    assert.equal(
      rendered(role).account_id,
      "036df6c823669b8fa2f66cf4c16eeb29",
    );
    const substituted = {
      ...source[role],
      account_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    assert.throws(
      () => materializeAliceWranglerConfig(
        role,
        substituted,
        valuesForRole(role),
      ),
      /ALICE_WRANGLER_ACCOUNT_INVALID/,
    );
  }
});

test("rejects a deployment-time observability substitution", () => {
  const substituted = rendered("control");
  substituted.observability.traces.persist = false;
  assert.notDeepEqual(
    aliceEffectiveConfigFromWrangler("control", substituted),
    expected.control,
  );
  assert.throws(
    () =>
      assertAliceWranglerMatchesEffectiveConfig(
        "control",
        substituted,
        expected.control,
      ),
    /ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH/,
  );
});

test("binds deploy configs to relocatable artifact-relative entrypoints", () => {
  const runnerA = fs.mkdtempSync(path.join(os.tmpdir(), "alice-runner-a."));
  const runnerB = `${runnerA}.relocated`;
  const workerNames = {
    access: "alice-access-gateway",
    control: "alice-production-control",
    aiGateway: "alice-ai-gateway",
    statePlane: "alice-state-plane",
    connectorPlane: "alice-connector-plane",
  };
  try {
    const artifactRoot = path.join(runnerA, "alice-worker-bundles");
    const configDir = path.join(runnerA, "alice-release", "wrangler");
    fs.mkdirSync(configDir, { recursive: true });
    for (const role of releaseRoles) {
      const deploymentMainPath = path.join(
        artifactRoot,
        workerNames[role],
        "index.js",
      );
      fs.mkdirSync(path.dirname(deploymentMainPath), { recursive: true });
      fs.writeFileSync(deploymentMainPath, `${role}\n`);
      if (role === "statePlane") {
        const migrationDir = path.join(
          artifactRoot,
          "alice-state-plane",
          "migrations",
        );
        fs.mkdirSync(migrationDir);
        for (const migration of [
          "0001_alice_state.sql",
          "0002_execution_records.sql",
          "0003_eliza_database.sql",
        ]) {
          fs.writeFileSync(path.join(migrationDir, migration), "SELECT 1;\n");
        }
      }
      const configPath = path.join(configDir, `${role}.wrangler.json`);
      const deployable = bindAliceWranglerDeploymentEntrypoint(
        role,
        rendered(role),
        deploymentMainPath,
        { artifactRoot, configPath },
      );
      assert.equal(path.isAbsolute(deployable.main), false);
      assert.equal(
        deployable.main,
        path.join(
          "..",
          "..",
          "alice-worker-bundles",
          workerNames[role],
          "index.js",
        ),
      );
      if (role === "statePlane") {
        assert.equal(
          deployable.d1_databases[0].migrations_dir,
          path.join(
            "..",
            "..",
            "alice-worker-bundles",
            "alice-state-plane",
            "migrations",
          ),
        );
      }
      fs.writeFileSync(configPath, `${JSON.stringify(deployable)}\n`);
    }

    fs.renameSync(runnerA, runnerB);
    for (const role of releaseRoles) {
      const relocatedArtifactRoot = path.join(runnerB, "alice-worker-bundles");
      const relocatedConfigPath = path.join(
        runnerB,
        "alice-release",
        "wrangler",
        `${role}.wrangler.json`,
      );
      const relocated = JSON.parse(fs.readFileSync(relocatedConfigPath, "utf8"));
      assert.deepEqual(
        assertAliceWranglerMatchesEffectiveConfig(
          role,
          relocated,
          expected[role],
          {
            artifactRoot: relocatedArtifactRoot,
            configPath: relocatedConfigPath,
          },
        ),
        expected[role],
      );
      if (role === "statePlane") {
        assert.equal(
          path.resolve(
            path.dirname(relocatedConfigPath),
            relocated.d1_databases[0].migrations_dir,
          ),
          path.join(
            relocatedArtifactRoot,
            "alice-state-plane",
            "migrations",
          ),
        );
        assert.throws(
          () => assertAliceWranglerMatchesEffectiveConfig(
            role,
            {
              ...relocated,
              d1_databases: [{
                ...relocated.d1_databases[0],
                migrations_dir: "../../other/migrations",
              }],
            },
            expected[role],
            {
              artifactRoot: relocatedArtifactRoot,
              configPath: relocatedConfigPath,
            },
          ),
          /ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH/,
        );
      }
      assert.throws(
        () =>
          assertAliceWranglerMatchesEffectiveConfig(
            role,
            { ...relocated, main: "../../other/index.js" },
            expected[role],
            {
              artifactRoot: relocatedArtifactRoot,
              configPath: relocatedConfigPath,
            },
          ),
        /ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH/,
      );
    }
  } finally {
    fs.rmSync(runnerA, { recursive: true, force: true });
    fs.rmSync(runnerB, { recursive: true, force: true });
  }
});

test(
  "every rendered production config passes the lockfile Wrangler dry run",
  { skip: !process.env.ALICE_WRANGLER_BIN },
  () => {
    const wranglerBin = process.env.ALICE_WRANGLER_BIN;
    const version = spawnSync(wranglerBin, ["--version"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(version.status, 0, version.stderr);
    assert.match(version.stdout, /\b4\.122\.0\b/);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "alice-wrangler-dry-run."));
    try {
      const workerNames = {
        access: "alice-access-gateway",
        control: "alice-production-control",
        aiGateway: "alice-ai-gateway",
        statePlane: "alice-state-plane",
        connectorPlane: "alice-connector-plane",
      };
      for (const role of releaseRoles) {
        const entrypoint = path.join(
          repoRoot,
          "workers",
          workerNames[role],
          source[role].main,
        );
        const configPath = path.join(tempRoot, `${role}.wrangler.json`);
        const config = bindAliceWranglerDeploymentEntrypoint(
          role,
          materializeAliceWranglerConfig(
            role,
            source[role],
            valuesForRole(role),
          ),
          entrypoint,
          {
            artifactRoot: path.join(repoRoot, "workers"),
            configPath,
          },
        );
        const outdir = path.join(tempRoot, `${role}.bundle`);
        fs.writeFileSync(configPath, `${JSON.stringify(config)}\n`);
        const dryRun = spawnSync(
          wranglerBin,
          ["deploy", "--dry-run", "--outdir", outdir, "--config", configPath],
          { cwd: repoRoot, encoding: "utf8" },
        );
        assert.equal(
          dryRun.status,
          0,
          `${role}: ${dryRun.stdout}\n${dryRun.stderr}`,
        );
        const executableModules = fs.readdirSync(outdir).filter(
          (fileName) => fileName.endsWith(".js"),
        );
        assert.equal(executableModules.length, 1, role);
        assert.equal(
          fs.statSync(path.join(outdir, executableModules[0])).size > 0,
          true,
        );
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  },
);
