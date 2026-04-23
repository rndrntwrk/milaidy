#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const sourceVendor = path.join(repoRoot, "os", "android", "vendor", "milady");

function usage() {
  console.error("Usage: bun run miladyos:sync -- <AOSP_ROOT>");
  process.exit(1);
}

const aospRoot = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!aospRoot) usage();

const buildEnvsetup = path.join(aospRoot, "build", "envsetup.sh");
if (!fs.existsSync(buildEnvsetup)) {
  throw new Error(`${aospRoot} does not look like an AOSP checkout; missing build/envsetup.sh`);
}

const targetVendor = path.join(aospRoot, "vendor", "milady");
fs.rmSync(targetVendor, { recursive: true, force: true });
fs.mkdirSync(path.dirname(targetVendor), { recursive: true });
fs.cpSync(sourceVendor, targetVendor, {
  recursive: true,
  filter: (source) => !source.endsWith(".DS_Store"),
});

const apk = path.join(targetVendor, "apps", "Milady", "Milady.apk");
if (!fs.existsSync(apk)) {
  console.warn(
    "[miladyos] vendor/milady synced, but Milady.apk is missing. Run `bun run build:android:system` before building the AOSP product.",
  );
}

console.log(`[miladyos] Synced ${sourceVendor} -> ${targetVendor}`);
