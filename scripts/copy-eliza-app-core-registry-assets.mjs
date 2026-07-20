import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "..");

function countFiles(rootDir) {
  let count = 0;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(entryPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

function assertLifeOpsRoutePlugin(sourceDir) {
  const lifeOpsPath = path.join(sourceDir, "apps", "lifeops.json");
  if (!existsSync(lifeOpsPath)) {
    throw new Error(`LifeOps registry entry is missing: ${lifeOpsPath}`);
  }

  const lifeOps = JSON.parse(readFileSync(lifeOpsPath, "utf8"));
  const routePlugin = lifeOps?.launch?.routePlugin;
  if (
    lifeOps?.id !== "lifeops" ||
    typeof routePlugin?.specifier !== "string" ||
    typeof routePlugin?.exportName !== "string"
  ) {
    throw new Error(
      `LifeOps registry entry does not declare a named route plugin: ${lifeOpsPath}`,
    );
  }
}

export function copyElizaAppCoreRegistryAssets(repoRoot = defaultRepoRoot) {
  const sourceDir = path.join(
    repoRoot,
    "eliza",
    "packages",
    "app-core",
    "src",
    "registry",
    "entries",
  );
  const targetDir = path.join(repoRoot, "dist", "entries");

  if (!existsSync(sourceDir)) {
    throw new Error(`registry source directory is missing: ${sourceDir}`);
  }
  assertLifeOpsRoutePlugin(sourceDir);

  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(path.dirname(targetDir), { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });

  const fileCount = countFiles(targetDir);
  return { sourceDir, targetDir, fileCount };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  const result = copyElizaAppCoreRegistryAssets();
  console.log(
    `[copy-eliza-app-core-registry-assets] copied ${result.fileCount} registry entries to ${result.targetDir}`,
  );
}
