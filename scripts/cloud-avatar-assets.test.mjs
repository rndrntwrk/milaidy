import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  REQUIRED_CLOUD_AVATAR_ASSETS,
  validateCloudAvatarAssets,
} from "./lib/cloud-avatar-assets.mjs";

function writeRuntimeAsset(rootDir, relativePath, content = Buffer.from("glTFbinary")) {
  const absolutePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, gzipSync(content));
}

test("accepts the complete compressed Alice avatar runtime set", (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-cloud-assets-"));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  for (const relativePath of REQUIRED_CLOUD_AVATAR_ASSETS) {
    writeRuntimeAsset(rootDir, relativePath);
  }

  const result = validateCloudAvatarAssets(rootDir);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("rejects a Git LFS pointer in the selected production VRM", (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-cloud-assets-"));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  for (const relativePath of REQUIRED_CLOUD_AVATAR_ASSETS) {
    writeRuntimeAsset(rootDir, relativePath);
  }
  const selectedVrm = "apps/app/public/vrms/milady-9.vrm.gz";
  fs.writeFileSync(
    path.join(rootDir, selectedVrm),
    "version https://git-lfs.github.com/spec/v1\noid sha256:deadbeef\nsize 2812179\n",
  );

  const result = validateCloudAvatarAssets(rootDir);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    { path: selectedVrm, reason: "git-lfs-pointer" },
  ]);
});

test("rejects missing, non-gzip, and non-glTF runtime assets", (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-cloud-assets-"));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const [missing, nonGzip, nonGlb] = REQUIRED_CLOUD_AVATAR_ASSETS;
  for (const relativePath of REQUIRED_CLOUD_AVATAR_ASSETS.slice(1)) {
    writeRuntimeAsset(rootDir, relativePath);
  }
  fs.writeFileSync(path.join(rootDir, nonGzip), "not gzip");
  writeRuntimeAsset(rootDir, nonGlb, Buffer.from("JSONnot-a-binary-glb"));

  const result = validateCloudAvatarAssets(rootDir);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    { path: missing, reason: "missing" },
    { path: nonGzip, reason: "not-gzip" },
    { path: nonGlb, reason: "not-glb" },
  ]);
});
