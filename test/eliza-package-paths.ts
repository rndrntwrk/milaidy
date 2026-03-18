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
): string | undefined {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    return undefined;
  }
}

export function getElizaCoreEntry(_repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@elizaos/core");
  if (!packageRoot) {
    return undefined;
  }

  return resolveModuleEntry(
    path.join(packageRoot, "dist", "node", "index.node"),
  );
}

export function getAutonomousSourceRoot(_repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@elizaos/autonomous");

  return packageRoot
    ? path.join(packageRoot, "packages", "autonomous", "src")
    : undefined;
}

export function getAppCoreSourceRoot(_repoRoot: string): string | undefined {
  return getInstalledPackageRoot("@elizaos/app-core");
}
