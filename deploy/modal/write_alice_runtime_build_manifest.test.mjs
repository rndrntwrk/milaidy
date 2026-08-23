import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  REQUIRED_RUNTIME_PATHS,
  buildAliceRuntimeBuildManifest,
} from "./write_alice_runtime_build_manifest.mjs";
import { verifyAliceRuntimeBuildManifest } from "./verify_alice_runtime_build_manifest.mjs";

test("binds exact source, Eliza, and every admitted runtime path", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-build-manifest-"));
  try {
    for (const [index, relativePath] of REQUIRED_RUNTIME_PATHS.entries()) {
      const absolutePath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, `runtime-file-${index}\n`);
    }
    const manifest = buildAliceRuntimeBuildManifest({
      root,
      sourceCommit: "4".repeat(40),
      elizaCommit: "6".repeat(40),
    });
    assert.equal(manifest.schemaVersion, "alice.runtime-build-manifest.v1");
    assert.equal(manifest.sourceCommit, "4".repeat(40));
    assert.equal(manifest.elizaCommit, "6".repeat(40));
    assert.deepEqual(
      manifest.runtimePaths.map((entry) => entry.path),
      REQUIRED_RUNTIME_PATHS.map((entry) => `/app/${entry}`),
    );
    for (const [index, entry] of manifest.runtimePaths.entries()) {
      assert.equal(
        entry.sha256,
        `sha256:${crypto.createHash("sha256").update(`runtime-file-${index}\n`).digest("hex")}`,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fails closed on missing paths, non-commits, or path escape", () => {
  assert.throws(() =>
    buildAliceRuntimeBuildManifest({
      root: "/tmp",
      sourceCommit: "not-a-commit",
      elizaCommit: "6".repeat(40),
    }),
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-build-manifest-"));
  try {
    assert.throws(() =>
      buildAliceRuntimeBuildManifest({
        root,
        sourceCommit: "4".repeat(40),
        elizaCommit: "6".repeat(40),
      }),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("verifies the manifest bytes and every runtime path against signed expectations", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-build-manifest-"));
  try {
    for (const [index, relativePath] of REQUIRED_RUNTIME_PATHS.entries()) {
      const absolutePath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, `runtime-file-${index}\n`);
    }
    const manifest = buildAliceRuntimeBuildManifest({
      root,
      sourceCommit: "4".repeat(40),
      elizaCommit: "6".repeat(40),
    });
    const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(path.join(root, "alice-runtime-build-manifest.json"), manifestBytes);
    const manifestSha256 = `sha256:${crypto.createHash("sha256").update(manifestBytes).digest("hex")}`;
    assert.deepEqual(
      verifyAliceRuntimeBuildManifest({
        root,
        expectedSourceCommit: "4".repeat(40),
        expectedElizaCommit: "6".repeat(40),
        expectedManifestSha256: manifestSha256,
      }),
      {
        ok: true,
        manifestSha256,
        sourceCommit: "4".repeat(40),
        elizaCommit: "6".repeat(40),
        runtimePathCount: REQUIRED_RUNTIME_PATHS.length,
      },
    );
    fs.appendFileSync(path.join(root, REQUIRED_RUNTIME_PATHS[0]), "tamper");
    assert.throws(() =>
      verifyAliceRuntimeBuildManifest({
        root,
        expectedSourceCommit: "4".repeat(40),
        expectedElizaCommit: "6".repeat(40),
        expectedManifestSha256: manifestSha256,
      }),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
