#!/usr/bin/env -S node --import tsx

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type PackFile = { path: string };
type PackResult = { files?: PackFile[] };

const requiredPaths = [
  "dist/index.js",
  "dist/entry.js",
  "dist/build-info.json",
];
const forbiddenPrefixes = ["dist/Milady.app/"];

function ensureBuildArtifacts(): void {
  const missing = requiredPaths.filter((filePath) => !existsSync(filePath));
  if (missing.length === 0) return;

  console.log(
    `release-check: missing packaged runtime artifacts (${missing.join(", ")}); running pack-prep build first...`,
  );
  execSync(
    [
      "bunx tsdown",
      "node -e \"const fs=require('fs');const src='src/plugins/telegram-enhanced/package.json';const dest='dist/plugins/telegram-enhanced/package.json';if(fs.existsSync(src)){fs.mkdirSync('dist/plugins/telegram-enhanced',{recursive:true});fs.copyFileSync(src,dest);}\"",
      "node --import tsx scripts/write-build-info.ts",
    ].join(" && "),
    {
      stdio: "inherit",
      env: process.env,
      maxBuffer: 1024 * 1024 * 100,
    },
  );
}

function runPackDry(): PackResult[] {
  const npmCacheDir = path.join(os.tmpdir(), "milaidy-npm-pack-cache");
  const raw = execSync("npm pack --dry-run --json --ignore-scripts", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache || npmCacheDir,
    },
    maxBuffer: 1024 * 1024 * 100,
  });
  return JSON.parse(raw) as PackResult[];
}

function main() {
  ensureBuildArtifacts();
  const results = runPackDry();
  const files = results.flatMap((entry) => entry.files ?? []);
  const paths = new Set(files.map((file) => file.path));

  const missing = requiredPaths.filter((path) => !paths.has(path));
  const forbidden = [...paths].filter((path) =>
    forbiddenPrefixes.some((prefix) => path.startsWith(prefix)),
  );

  if (missing.length > 0 || forbidden.length > 0) {
    if (missing.length > 0) {
      console.error("release-check: missing files in npm pack:");
      for (const path of missing) {
        console.error(`  - ${path}`);
      }
    }
    if (forbidden.length > 0) {
      console.error("release-check: forbidden files in npm pack:");
      for (const path of forbidden) {
        console.error(`  - ${path}`);
      }
    }
    process.exit(1);
  }

  console.log("release-check: npm pack contents look OK.");
}

main();
