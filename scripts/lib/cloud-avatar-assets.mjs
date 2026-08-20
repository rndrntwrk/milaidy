import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const APP_PUBLIC = "apps/app/public";
const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";

export const REQUIRED_CLOUD_AVATAR_ASSETS = [
  ...Array.from(
    { length: 9 },
    (_, index) => `${APP_PUBLIC}/vrms/milady-${index + 1}.vrm.gz`,
  ),
  `${APP_PUBLIC}/animations/idle.glb.gz`,
  `${APP_PUBLIC}/animations/emotes/dance-happy.glb.gz`,
];

function failure(relativePath, reason) {
  return { path: relativePath, reason };
}

export function validateCloudAvatarAssets(
  rootDir,
  requiredAssets = REQUIRED_CLOUD_AVATAR_ASSETS,
) {
  const failures = [];
  const assets = [];

  for (const relativePath of requiredAssets) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      failures.push(failure(relativePath, "missing"));
      continue;
    }

    const compressed = fs.readFileSync(absolutePath);
    if (
      compressed.subarray(0, LFS_POINTER_PREFIX.length).toString("utf8") ===
      LFS_POINTER_PREFIX
    ) {
      failures.push(failure(relativePath, "git-lfs-pointer"));
      continue;
    }
    if (compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
      failures.push(failure(relativePath, "not-gzip"));
      continue;
    }

    let decompressed;
    try {
      decompressed = gunzipSync(compressed);
    } catch {
      failures.push(failure(relativePath, "invalid-gzip"));
      continue;
    }
    if (decompressed.subarray(0, 4).toString("ascii") !== "glTF") {
      failures.push(failure(relativePath, "not-glb"));
      continue;
    }

    assets.push({
      path: relativePath,
      size: compressed.length,
      sha256: crypto.createHash("sha256").update(compressed).digest("hex"),
    });
  }

  return { ok: failures.length === 0, failures, assets };
}
