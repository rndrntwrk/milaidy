import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");

const PLUGINS = [
  {
    packageName: "@rndrntwrk/plugin-555arcade",
    localRepoDir: path.resolve(workspaceRoot, "../../arcade-plugin"),
    requiredEntry: path.join("dist", "index.js"),
    copyTargets: ["dist"],
  },
];

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureLocalBuild(repoDir) {
  const distDir = path.join(repoDir, "dist");
  if (await pathExists(path.join(distDir, "index.js"))) {
    return true;
  }
  try {
    execFileSync("bun", ["run", "build"], {
      cwd: repoDir,
      stdio: "inherit",
      env: process.env,
    });
    return await pathExists(path.join(distDir, "index.js"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      `[hydrate-plugin-artifacts] build failed in ${repoDir}: ${detail}`,
    );
    return false;
  }
}

async function copyTarget(sourceRoot, installRoot, relativeTarget) {
  const sourcePath = path.join(sourceRoot, relativeTarget);
  const targetPath = path.join(installRoot, relativeTarget);
  if (!(await pathExists(sourcePath))) return;
  await fs.rm(targetPath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true });
}

async function hydratePlugin({
  packageName,
  localRepoDir,
  requiredEntry,
  copyTargets,
}) {
  let installedPackageJson;
  try {
    installedPackageJson = require.resolve(`${packageName}/package.json`);
  } catch {
    const scopedPackagePath = path.join(
      workspaceRoot,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    );
    if (await pathExists(scopedPackagePath)) {
      installedPackageJson = scopedPackagePath;
    } else {
      console.log(
        `[hydrate-plugin-artifacts] ${packageName} not installed - skipping`,
      );
      return;
    }
  }

  const installRoot = path.dirname(installedPackageJson);
  const installEntry = path.join(installRoot, requiredEntry);
  if (await pathExists(installEntry)) {
    return;
  }

  if (!(await pathExists(localRepoDir))) {
    console.warn(
      `[hydrate-plugin-artifacts] ${packageName} missing ${requiredEntry} and local repo not found at ${localRepoDir}`,
    );
    return;
  }

  const built = await ensureLocalBuild(localRepoDir);
  if (!built) {
    console.warn(
      `[hydrate-plugin-artifacts] ${packageName} still missing ${requiredEntry} after local build attempt`,
    );
    return;
  }

  for (const relativeTarget of copyTargets) {
    await copyTarget(localRepoDir, installRoot, relativeTarget);
  }
  console.log(
    `[hydrate-plugin-artifacts] hydrated ${packageName} from ${localRepoDir}`,
  );
}

for (const plugin of PLUGINS) {
  // eslint-disable-next-line no-await-in-loop
  await hydratePlugin(plugin);
}
