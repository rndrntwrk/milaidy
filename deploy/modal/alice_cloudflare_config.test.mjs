import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildAliceContainerAccessEffectiveConfig,
  buildAliceContainerControlEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceControlEffectiveConfig,
} from "../../workers/alice-effective-config.js";
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
};

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
      : commonValues;
}

test("renders every canonical effective config from its deployable Wrangler file", () => {
  for (const role of ["access", "control", "aiGateway"]) {
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

test("binds every Worker to the exact production account", () => {
  for (const role of ["access", "control", "aiGateway"]) {
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
  };
  try {
    const artifactRoot = path.join(runnerA, "alice-worker-bundles");
    const configDir = path.join(runnerA, "alice-release", "wrangler");
    fs.mkdirSync(configDir, { recursive: true });
    for (const role of ["access", "control", "aiGateway"]) {
      const deploymentMainPath = path.join(
        artifactRoot,
        workerNames[role],
        "index.js",
      );
      fs.mkdirSync(path.dirname(deploymentMainPath), { recursive: true });
      fs.writeFileSync(deploymentMainPath, `${role}\n`);
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
      fs.writeFileSync(configPath, `${JSON.stringify(deployable)}\n`);
    }

    fs.renameSync(runnerA, runnerB);
    for (const role of ["access", "control", "aiGateway"]) {
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
      };
      for (const role of ["access", "control", "aiGateway"]) {
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
        assert.equal(fs.statSync(path.join(outdir, "index.js")).size > 0, true);
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  },
);
