import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const MODULE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];
const require = createRequire(import.meta.url);

function getRequireFor(baseDir?: string) {
  if (!baseDir) {
    return require;
  }

  return createRequire(path.join(baseDir, "package.json"));
}

function firstExistingPath(
  candidates: Array<string | undefined>,
): string | undefined {
  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && existsSync(candidate),
  );
}

export function resolveModuleEntry(basePath: string): string {
  if (existsSync(basePath)) {
    return basePath;
  }

  const withExtension = firstExistingPath(
    MODULE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
  );

  return withExtension ?? basePath;
}

export function getInstalledPackageRoot(
  packageName: string,
  fromDir?: string,
): string | undefined {
  const scopedRequire = getRequireFor(fromDir);

  try {
    return path.dirname(scopedRequire.resolve(`${packageName}/package.json`));
  } catch {
    try {
      const entryPath = scopedRequire.resolve(packageName);
      const entryDir = path.dirname(entryPath);
      return path.basename(entryDir) === "src" ? entryDir : entryDir;
    } catch {
      return undefined;
    }
  }
}

export function getElizaCoreEntry(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@elizaos/core", repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return resolveModuleEntry(path.join(packageRoot, "index"));
  }

  return resolveModuleEntry(
    path.join(packageRoot, "dist", "node", "index.node"),
  );
}

export function getAutonomousSourceRoot(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@elizaos/autonomous", repoRoot);

  if (!packageRoot) {
    return undefined;
  }

  return path.basename(packageRoot) === "src"
    ? packageRoot
    : path.join(packageRoot, "packages", "autonomous", "src");
}

export function getAppCoreSourceRoot(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@elizaos/app-core", repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return packageRoot;
  }

  const sourceRoot = path.join(packageRoot, "src");
  return existsSync(sourceRoot) ? sourceRoot : packageRoot;
}
