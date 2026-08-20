#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCloudAvatarAssets } from "./lib/cloud-avatar-assets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = validateCloudAvatarAssets(repoRoot);

if (!result.ok) {
  console.error(JSON.stringify({ ok: false, failures: result.failures }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, assets: result.assets }));
}
