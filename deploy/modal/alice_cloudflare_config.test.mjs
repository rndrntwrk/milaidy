import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildAliceAccessEffectiveConfig,
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
  access: buildAliceAccessEffectiveConfig({
    accessIssuer: commonValues.accessIssuer,
    accessAudience: commonValues.accessAudience,
    ownerEmailSha256: owner,
    upstreamOrigin: "https://rndrntwrk--alice.modal.run",
  }),
  control: buildAliceControlEffectiveConfig({
    accessIssuer: commonValues.accessIssuer,
    accessAudience: commonValues.accessAudience,
    ownerEmailSha256: owner,
    modelDailyBudgetUnits: 10_000,
    modalRevision: 49,
    releaseAccessAudience: commonValues.releaseAccessAudience,
    releaseServiceTokenIdSha256:
      commonValues.releaseServiceTokenIdSha256,
  }),
  aiGateway: buildAliceAiGatewayEffectiveConfig(),
};

function rendered(role) {
  const values = role === "access"
    ? { ...commonValues, upstreamOrigin: "https://rndrntwrk--alice.modal.run" }
    : role === "control"
      ? {
          ...commonValues,
          modelDailyBudgetUnits: 10_000,
          modalRevision: 49,
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
    ? { ...commonValues, upstreamOrigin: "https://rndrntwrk--alice.modal.run" }
    : role === "control"
      ? {
          ...commonValues,
          modelDailyBudgetUnits: 10_000,
          modalRevision: 49,
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

test("binds each rendered config to an explicit absolute deployment entrypoint", () => {
  const entrypoints = {
    access: path.join(repoRoot, "workers/alice-access-gateway/src/index.ts"),
    control: path.join(repoRoot, "workers/alice-production-control/src/index.ts"),
    aiGateway: path.join(repoRoot, "workers/alice-ai-gateway/src/index.mjs"),
  };
  for (const role of ["access", "control", "aiGateway"]) {
    const deployable = bindAliceWranglerDeploymentEntrypoint(
      role,
      rendered(role),
      entrypoints[role],
    );
    assert.equal(deployable.main, entrypoints[role]);
    assert.deepEqual(
      assertAliceWranglerMatchesEffectiveConfig(
        role,
        deployable,
        expected[role],
        { deploymentMainPath: entrypoints[role] },
      ),
      expected[role],
    );
    assert.throws(
      () =>
        assertAliceWranglerMatchesEffectiveConfig(
          role,
          { ...deployable, main: path.join(repoRoot, "other.js") },
          expected[role],
          { deploymentMainPath: entrypoints[role] },
        ),
      /ALICE_WRANGLER_EFFECTIVE_CONFIG_MISMATCH/,
    );
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
        const config = bindAliceWranglerDeploymentEntrypoint(
          role,
          materializeAliceWranglerConfig(
            role,
            source[role],
            valuesForRole(role),
          ),
          entrypoint,
        );
        const configPath = path.join(tempRoot, `${role}.wrangler.json`);
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
