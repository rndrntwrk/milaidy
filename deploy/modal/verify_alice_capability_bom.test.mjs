import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyAliceCapabilityBom } from "./verify_alice_capability_bom.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-capability-verify-"));
  const packageRoot = path.join(root, "node_modules/@fixture/plugin-core");
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    '{"name":"@fixture/plugin-core","version":"1.0.0","type":"module","exports":{".":"./index.mjs"}}\n',
  );
  fs.writeFileSync(
    path.join(packageRoot, "index.mjs"),
    'export default { name: "core-real", actions: [{ name: "REAL" }] };\n',
  );
  const policy = {
    schemaVersion: "alice.capability-policy.v1",
    entries: [
      {
        id: "package:@fixture/plugin-core",
        classification: "core",
        source: { type: "package", package: "@fixture/plugin-core", entrypoint: "." },
        runtimeNames: ["core-real"],
        adapter: null,
        policyState: "enabled",
      },
    ],
  };
  fs.mkdirSync(path.join(root, "deploy/alice"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "deploy/alice/alice-capability-policy.v1.json"),
    `${JSON.stringify(policy, null, 2)}\n`,
  );
  return { root, policy };
}

test("verifier detects package byte tampering after BOM generation", async () => {
  const { root } = fixture();
  try {
    const generated = await verifyAliceCapabilityBom({
      root,
      write: true,
      discovery: {
        packageNames: ["@fixture/plugin-core"],
        internalCapabilityIds: [],
      },
    });
    assert.equal(generated.ok, true);
    fs.appendFileSync(path.join(root, "node_modules/@fixture/plugin-core/index.mjs"), "tamper\n");
    await assert.rejects(
      verifyAliceCapabilityBom({
        root,
        expectedDigest: generated.bomSha256,
        discovery: {
          packageNames: ["@fixture/plugin-core"],
          internalCapabilityIds: [],
        },
      }),
      /ALICE_CAPABILITY_BOM_BYTES_MISMATCH/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runtime, build, and deployment digest expectations must all match exact BOM bytes", async () => {
  const { root } = fixture();
  try {
    const generated = await verifyAliceCapabilityBom({
      root,
      write: true,
      discovery: {
        packageNames: ["@fixture/plugin-core"],
        internalCapabilityIds: [],
      },
    });
    const wrong = `sha256:${crypto.createHash("sha256").update("wrong").digest("hex")}`;
    for (const expectedDigests of [
      { runtime: wrong, build: generated.bomSha256, deployment: generated.bomSha256 },
      { runtime: generated.bomSha256, build: wrong, deployment: generated.bomSha256 },
      { runtime: generated.bomSha256, build: generated.bomSha256, deployment: wrong },
    ]) {
      await assert.rejects(
        verifyAliceCapabilityBom({
          root,
          expectedDigest: generated.bomSha256,
          expectedDigests,
          discovery: {
            packageNames: ["@fixture/plugin-core"],
            internalCapabilityIds: [],
          },
        }),
        /ALICE_CAPABILITY_BOM_DIGEST_MISMATCH/,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
