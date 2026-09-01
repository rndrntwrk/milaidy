import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  AliceImageObservationError,
  buildAliceImageObservation,
  buildAliceRuntimeObservation,
  verifyAliceImageObservation,
  verifyAliceRuntimeObservation,
} from "./alice_image_observation.mjs";
import { buildAliceRuntimeRootContract } from "./alice_runtime_root_contract.mjs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const SOURCE = "1".repeat(40);
const ELIZA = "2".repeat(40);
const digest = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function rootContract(kind, files) {
  const root = await mkdtemp(path.join(tmpdir(), `alice-${kind}-`));
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  const contract = await buildAliceRuntimeRootContract({
    root,
    contractKind: kind,
    sourceCommit: SOURCE,
    elizaCommit: ELIZA,
    policy: {
      schemaVersion: "alice.runtime-root-policy.v1",
      forbiddenPrefixes: [".git", ".github"],
      forbiddenBasenames: [".env", "auth.json"],
      maxFileBytes: 1024 * 1024,
      maxEntryCount: 1000,
      maxTotalFileBytes: 4 * 1024 * 1024,
      allowDanglingSymlinks: false,
    },
  });
  await rm(root, { recursive: true, force: true });
  return contract;
}

function inspectFixture(overrides = {}) {
  return [{
    Id: `sha256:${"a".repeat(64)}`,
    RepoDigests: [
      `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"b".repeat(64)}`,
    ],
    Size: 123456,
    VirtualSize: 123456,
    Os: "linux",
    Architecture: "amd64",
    Variant: "",
    Config: {
      User: "",
      WorkingDir: "/app",
      Entrypoint: ["/usr/local/bin/docker-entrypoint.sh"],
      Cmd: ["node", "dist/index.js"],
      Env: ["NODE_ENV=production", "PORT=2138"],
      Labels: {
        "org.opencontainers.image.revision": SOURCE,
        "org.opencontainers.image.version": "cloud-v2.0.1",
      },
      ExposedPorts: { "2138/tcp": {} },
      Healthcheck: {
        Test: ["CMD", "node", "health.js"],
        Interval: 30000000000,
        Timeout: 5000000000,
        StartPeriod: 10000000000,
        Retries: 3,
      },
      StopSignal: "SIGTERM",
      Shell: null,
    },
    RootFS: {
      Type: "layers",
      Layers: [
        `sha256:${"c".repeat(64)}`,
        `sha256:${"d".repeat(64)}`,
      ],
    },
    ...overrides,
  }];
}

async function expectPredicate(fn, predicateId) {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof AliceImageObservationError);
    assert.equal(error.predicateId, predicateId);
    return true;
  });
}

test("image observation is canonical across provider-owned map ordering", () => {
  const first = buildAliceImageObservation(inspectFixture());
  const secondInput = inspectFixture();
  secondInput[0].Config.Labels = {
    "org.opencontainers.image.version": "cloud-v2.0.1",
    "org.opencontainers.image.revision": SOURCE,
  };
  secondInput[0].Config.ExposedPorts = {
    "2138/tcp": {},
  };
  const second = buildAliceImageObservation(secondInput);
  assert.deepEqual(second, first);
  assert.equal(verifyAliceImageObservation(first), first);
  assert.equal(first.config.workingDir, "/app");
  assert.equal(first.rootFsLayers.length, 2);
});

test("image observation rejects wrong platform and malformed digest", async () => {
  await expectPredicate(
    async () =>
      buildAliceImageObservation(
        inspectFixture({ Architecture: "arm64" }),
      ),
    "IMAGE_PLATFORM_INVALID",
  );
  const malformed = inspectFixture();
  malformed[0].Id = "latest";
  await expectPredicate(
    async () => buildAliceImageObservation(malformed),
    "IMAGE_ID_INVALID",
  );
});

test("runtime observation binds exact context, runtime root, image, manifests, and size inventory", async () => {
  const context = await rootContract("build-context", {
    "packages/agent/src/index.ts": "agent\n",
    "apps/app/dist/index.js": "ui\n",
  });
  const runtime = await rootContract("runtime-root", {
    "dist/index.js": "runtime\n",
    "node_modules/pkg/index.js": "package-bytes\n",
    "node_modules/pkg/large.bin": "x".repeat(128),
  });
  const image = buildAliceImageObservation(inspectFixture());
  const runtimeManifest = Buffer.from('{"runtime":"manifest"}\n');
  const capabilityBom = Buffer.from('{"capabilities":[]}\n');
  const contextBytes = Buffer.from(`${JSON.stringify(context, null, 2)}\n`);
  const runtimeBytes = Buffer.from(`${JSON.stringify(runtime, null, 2)}\n`);

  const observation = buildAliceRuntimeObservation({
    contextContract: context,
    contextContractBytes: contextBytes,
    runtimeRootContract: runtime,
    runtimeRootContractBytes: runtimeBytes,
    imageObservation: image,
    runtimeBuildManifestBytes: runtimeManifest,
    capabilityBomBytes: capabilityBom,
  });

  assert.equal(verifyAliceRuntimeObservation(observation), observation);
  assert.equal(observation.sourceCommit, SOURCE);
  assert.equal(observation.elizaCommit, ELIZA);
  assert.equal(
    observation.runtimeBuildManifestSha256,
    digest(runtimeManifest),
  );
  assert.equal(observation.capabilityBomSha256, digest(capabilityBom));
  assert.equal(observation.runtimeRoot.totalFileBytes, runtime.totalFileBytes);
  assert.equal(observation.runtimeRoot.topLevel[0].path, "node_modules");
  assert.equal(observation.runtimeRoot.largestFiles[0].path, "node_modules/pkg/large.bin");
  assert.equal(observation.runtimeRoot.contractBytes, runtimeBytes.length);
});

test("runtime observation rejects source mismatch", async () => {
  const context = await rootContract("build-context", { "a.txt": "a" });
  const runtime = await rootContract("runtime-root", { "b.txt": "b" });
  const changedRuntime = structuredClone(runtime);
  changedRuntime.sourceCommit = "9".repeat(40);
  await expectPredicate(
    async () =>
      buildAliceRuntimeObservation({
        contextContract: context,
        contextContractBytes: Buffer.from(`${JSON.stringify(context, null, 2)}\n`),
        runtimeRootContract: changedRuntime,
        runtimeRootContractBytes: Buffer.from(`${JSON.stringify(changedRuntime, null, 2)}\n`),
        imageObservation: buildAliceImageObservation(inspectFixture()),
        runtimeBuildManifestBytes: Buffer.from("{}\n"),
        capabilityBomBytes: Buffer.from("{}\n"),
      }),
    "SOURCE_IDENTITY_MISMATCH",
  );
});
