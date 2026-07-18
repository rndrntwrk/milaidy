#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "..");

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? path.resolve(process.argv[index + 1])
    : fallback;
}

const root = readOption("--root", defaultRoot);
const manifestPath = readOption(
  "--manifest",
  path.join(root, "docs/alice/release/alice-companion-assets.json"),
);

function resolveAssetPath(rawPath) {
  const withoutQuery = rawPath.split("?", 1)[0];
  const relativePath = withoutQuery.startsWith("/")
    ? path.join("apps/app/public", withoutQuery.replace(/^\/+/, ""))
    : withoutQuery;
  const resolved = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, resolved);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(
      `Alice companion asset escapes repository root: ${rawPath}`,
    );
  }
  return resolved;
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const assets = [
  ["requiredVrm", "requiredVrmSha256"],
  ["requiredSourceVrm", "requiredSourceVrmSha256"],
  ["requiredPreview", "requiredPreviewSha256"],
  ["requiredBackground", "requiredBackgroundSha256"],
];

for (const [pathKey, hashKey] of assets) {
  const rawPath = manifest[pathKey];
  const expectedHash = manifest.integrity?.[hashKey];
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    throw new Error(`Alice companion asset manifest is missing ${pathKey}`);
  }
  if (
    typeof expectedHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(expectedHash)
  ) {
    throw new Error(`Alice companion asset manifest is missing ${hashKey}`);
  }
  const filePath = resolveAssetPath(rawPath);
  if (!existsSync(filePath)) {
    throw new Error(`missing required Alice companion asset: ${rawPath}`);
  }
  const actualHash = await sha256(filePath);
  if (actualHash !== expectedHash.toLowerCase()) {
    throw new Error(`hash mismatch for Alice companion asset: ${rawPath}`);
  }
}

console.log(`verified ${assets.length} Alice companion assets`);
