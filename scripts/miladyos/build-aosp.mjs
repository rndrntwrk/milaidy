#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { main as compileLibllamaMain } from "./compile-libllama.mjs";
import { main as syncToAospMain } from "./sync-to-aosp.mjs";
import { main as validateMain } from "./validate.mjs";

const PRODUCT_LUNCH = "milady_cf_x86_64_phone-trunk_staging-userdebug";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

// soong_build is single-process and routinely peaks at ~25 GB RSS for a
// trunk_staging build. Once the kati/clang phases start they fan out to -jN
// workers that each take a few GB. On a 30 GB host with -j24 we hit the
// kernel OOM killer; the safe heuristic is roughly one worker per 4 GB of
// physical RAM, leaving 4 GB headroom for the kernel + soong itself.
export function recommendedJobs(totalMemBytes, cpuCount) {
  const totalGiB = totalMemBytes / (1024 * 1024 * 1024);
  const ramCap = Math.max(1, Math.floor((totalGiB - 4) / 4));
  return Math.max(1, Math.min(cpuCount, ramCap));
}

export function parseArgs(argv) {
  const args = {
    aospRoot: null,
    jobs: recommendedJobs(os.totalmem(), os.cpus().length),
    sourceVendor: null,
    skipBuild: false,
    launch: false,
    bootValidate: false,
    skipStopCvd: false,
    // AOSP builds need a musl-linked libllama.so per ABI for the on-device
    // bun process to dlopen via bun:ffi (see compile-libllama.mjs and
    // eliza/packages/agent/src/runtime/aosp-llama-adapter.ts). Default on;
    // --skip-libllama lets developers iterate on non-inference paths
    // without paying the llama.cpp cross-compile cost.
    skipLibllama: false,
    // When set, also re-run `bun run build:android:system` with AOSP env
    // flags so the privileged APK staged into vendor/milady is rebuilt
    // with libllama.so + BuildConfig.AOSP_BUILD=true. Off by default to
    // preserve the existing two-step contract documented in SETUP_AOSP.md.
    rebuildPrivilegedApk: false,
  };

  const readFlagValue = (flag, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--aosp-root") {
      args.aospRoot = path.resolve(readFlagValue(arg, i));
      i += 1;
    } else if (arg === "--jobs" || arg === "-j") {
      args.jobs = Number.parseInt(readFlagValue(arg, i), 10);
      i += 1;
    } else if (arg === "--source-vendor") {
      args.sourceVendor = path.resolve(readFlagValue(arg, i));
      i += 1;
    } else if (arg === "--skip-build") {
      args.skipBuild = true;
    } else if (arg === "--launch") {
      args.launch = true;
    } else if (arg === "--boot-validate") {
      args.bootValidate = true;
    } else if (arg === "--skip-stop-cvd") {
      args.skipStopCvd = true;
    } else if (arg === "--skip-libllama") {
      args.skipLibllama = true;
    } else if (arg === "--rebuild-privileged-apk") {
      args.rebuildPrivilegedApk = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: node scripts/miladyos/build-aosp.mjs --aosp-root <AOSP_ROOT> [--source-vendor <VENDOR_DIR>] [--jobs <N>] [--skip-build] [--skip-stop-cvd] [--skip-libllama] [--rebuild-privileged-apk] [--launch] [--boot-validate]",
      );
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else if (!args.aospRoot) {
      args.aospRoot = path.resolve(arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.aospRoot) {
    throw new Error("--aosp-root is required");
  }
  if (!Number.isFinite(args.jobs) || args.jobs <= 0) {
    throw new Error("--jobs must be a positive integer");
  }
  return args;
}

function assertLinuxBuilder() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(
      "MiladyOS AOSP/Cuttlefish builds require a Linux x86_64 builder with KVM.",
    );
  }
  if (!fs.existsSync("/dev/kvm")) {
    throw new Error("MiladyOS Cuttlefish launch requires /dev/kvm.");
  }
}

function assertAospRoot(aospRoot) {
  const envsetup = path.join(aospRoot, "build", "envsetup.sh");
  if (!fs.existsSync(envsetup)) {
    throw new Error(`${aospRoot} is missing build/envsetup.sh`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with code ${result.status}`,
    );
  }
}

// A previous --launch run leaves crosvm + cuttlefish workers holding several
// GB of RAM. If we then re-enter `m`, soong_build stacks on top and OOMs the
// host. Tear them down before compiling. cvd 1.x exposes `cvd reset -y`;
// older host packages used `stop_cvd`. Best-effort: never fail the build if
// no device is running.
function stopRunningCvd() {
  spawnSync(
    "bash",
    ["-lc", "cvd reset -y >/dev/null 2>&1 || stop_cvd >/dev/null 2>&1 || true"],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
}

function runAospBuild(aospRoot, jobs) {
  run(
    "bash",
    [
      "-lc",
      `source build/envsetup.sh && lunch ${PRODUCT_LUNCH} && m -j${jobs}`,
    ],
    { cwd: aospRoot },
  );
}

function launchCuttlefish(aospRoot) {
  // Cuttlefish 1.x ships `cvd start`; 0.x exposed `launch_cvd`. Prefer the
  // newer command and fall back so older host packages keep working.
  // `cvd start` reads host artifacts from $ANDROID_HOST_OUT, which lunch
  // populates from build/envsetup.sh.
  run(
    "bash",
    [
      "-lc",
      `source build/envsetup.sh && lunch ${PRODUCT_LUNCH} && (cvd start --daemon 2>/dev/null || launch_cvd --daemon)`,
    ],
    { cwd: aospRoot },
  );
}

/**
 * Re-build the privileged Capacitor APK with AOSP-only env flags so the
 * staged Milady.apk picks up BuildConfig.AOSP_BUILD=true and the agent
 * bundle is produced with MILADY_AOSP_BUILD=1 (bundler then keeps
 * `node-llama-cpp` real instead of stubbing it; see
 * eliza/packages/agent/scripts/build-mobile-bundle.mjs).
 *
 * Both flags are propagated explicitly via env so subprocesses spawned by
 * gradle and bun see them. The gradle property `-PmiladyAospBuild=true`
 * controls the BuildConfig field via run-mobile-build.mjs.
 */
function rebuildPrivilegedApk() {
  const env = {
    ...process.env,
    MILADY_AOSP_BUILD: "1",
    MILADY_GRADLE_AOSP_BUILD: "true",
  };
  const result = spawnSync("bun", ["run", "build:android:system"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(
      `bun run build:android:system failed: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `bun run build:android:system exited with code ${result.status}`,
    );
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  assertLinuxBuilder();
  assertAospRoot(args.aospRoot);

  // Cross-compile libllama.so per ABI BEFORE we rebuild the privileged APK
  // (so it's already in assets/agent/{abi}/ when gradle packs the APK) and
  // BEFORE we sync vendor/milady into AOSP (so the synced APK contains it).
  // The compile step is idempotent — `--skip-if-present` keeps re-runs cheap.
  if (!args.skipLibllama) {
    await compileLibllamaMain(["--skip-if-present"]);
  }

  if (args.rebuildPrivilegedApk) {
    rebuildPrivilegedApk();
  }

  const syncArgs = args.sourceVendor
    ? ["--source-vendor", args.sourceVendor, args.aospRoot]
    : [args.aospRoot];
  await syncToAospMain(syncArgs);

  const validateArgs = args.sourceVendor
    ? ["--vendor-dir", args.sourceVendor, "--aosp-root", args.aospRoot]
    : ["--aosp-root", args.aospRoot];
  await validateMain(validateArgs);

  if (!args.skipStopCvd) {
    stopRunningCvd();
  }

  if (!args.skipBuild) {
    runAospBuild(args.aospRoot, args.jobs);
  }

  if (args.launch) {
    launchCuttlefish(args.aospRoot);
  }

  if (args.bootValidate) {
    run("node", [path.join(here, "boot-validate.mjs")], { cwd: repoRoot });
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await main();
}
