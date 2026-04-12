import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const extraArgs = process.argv.slice(2);

function resolveBunCommand() {
  const bunFromEnv = process.env.BUN?.trim();
  if (bunFromEnv && fs.existsSync(bunFromEnv)) {
    return bunFromEnv;
  }

  if (
    typeof process.versions.bun === "string" &&
    typeof process.execPath === "string" &&
    process.execPath.length > 0 &&
    fs.existsSync(process.execPath)
  ) {
    return process.execPath;
  }

  const bunInstallRoot = process.env.BUN_INSTALL?.trim();
  if (bunInstallRoot) {
    const bunFromInstall = path.join(
      bunInstallRoot,
      "bin",
      process.platform === "win32" ? "bun.exe" : "bun",
    );
    if (fs.existsSync(bunFromInstall)) {
      return bunFromInstall;
    }
  }

  return process.platform === "win32" ? "bun.exe" : "bun";
}

const specGroups = [
  [
    "test/ui-smoke/apps-session.spec.ts",
    "test/ui-smoke/browser-workspace.spec.ts",
  ],
  ["test/ui-smoke/ui-smoke.spec.ts"],
];

for (const specs of specGroups) {
  const result = spawnSync(
    resolveBunCommand(),
    [
      "scripts/run-playwright.mjs",
      "apps/app",
      "test",
      "--config",
      "playwright.ui-smoke.config.ts",
      ...specs,
      ...extraArgs,
    ],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
