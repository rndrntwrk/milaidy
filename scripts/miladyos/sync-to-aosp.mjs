#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const defaultSourceVendor = path.join(
  repoRoot,
  "os",
  "android",
  "vendor",
  "milady",
);

function usage() {
  console.error(
    "Usage: bun run miladyos:sync -- [--source-vendor <VENDOR_DIR>] <AOSP_ROOT>",
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    aospRoot: null,
    sourceVendor: defaultSourceVendor,
  };
  const readFlagValue = (flag, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a path value`);
    }
    return path.resolve(value);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source-vendor") {
      args.sourceVendor = readFlagValue(arg, i);
      i += 1;
    } else if (!args.aospRoot) {
      args.aospRoot = path.resolve(arg);
    } else {
      usage();
    }
  }
  return args;
}

const { aospRoot, sourceVendor } = parseArgs(process.argv.slice(2));
if (!aospRoot) usage();
if (!fs.existsSync(sourceVendor)) {
  throw new Error(`Missing MiladyOS vendor source: ${sourceVendor}`);
}

const buildEnvsetup = path.join(aospRoot, "build", "envsetup.sh");
if (!fs.existsSync(buildEnvsetup)) {
  throw new Error(
    `${aospRoot} does not look like an AOSP checkout; missing build/envsetup.sh`,
  );
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
  throw new Error(
    "[miladyos] vendor/milady synced without Milady.apk. Run `bun run build:android:system` before syncing the AOSP product.",
  );
}

console.log(`[miladyos] Synced ${sourceVendor} -> ${targetVendor}`);
