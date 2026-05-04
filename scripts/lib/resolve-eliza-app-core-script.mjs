import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "..", "..");
const requireFromHere = createRequire(import.meta.url);

function localUpstreamsDisabled() {
  return (
    process.env.MILADY_SKIP_LOCAL_UPSTREAMS === "1" ||
    process.env.ELIZA_SKIP_LOCAL_UPSTREAMS === "1"
  );
}

function assertScriptName(scriptName) {
  if (
    typeof scriptName !== "string" ||
    scriptName.length === 0 ||
    path.isAbsolute(scriptName) ||
    scriptName.split(/[\\/]+/).includes("..")
  ) {
    throw new Error(`Invalid elizaOS app-core script name: ${scriptName}`);
  }
}

function resolvePublishedAppCoreRoot(repoRoot) {
  const packageJsonPath = requireFromHere.resolve(
    "@elizaos/app-core/package.json",
    {
      paths: [repoRoot],
    },
  );
  return path.dirname(packageJsonPath);
}

export function resolveElizaAppCoreRoot({
  repoRoot = defaultRepoRoot,
  preferLocal = !localUpstreamsDisabled(),
} = {}) {
  const localRoot = path.join(repoRoot, "eliza", "packages", "app-core");
  if (preferLocal && existsSync(path.join(localRoot, "package.json"))) {
    return localRoot;
  }

  try {
    return resolvePublishedAppCoreRoot(repoRoot);
  } catch (error) {
    if (existsSync(path.join(localRoot, "package.json"))) {
      return localRoot;
    }
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(
      `Could not resolve @elizaos/app-core.${detail} Run bun install with local upstreams enabled, or set MILADY_SKIP_LOCAL_UPSTREAMS=1 after published @elizaos packages are installed.`,
    );
  }
}

export function resolveElizaAppCoreScript(
  scriptName,
  { repoRoot = defaultRepoRoot, preferLocal } = {},
) {
  assertScriptName(scriptName);
  const appCoreRoot = resolveElizaAppCoreRoot({ repoRoot, preferLocal });
  const scriptPath = path.join(appCoreRoot, "scripts", scriptName);
  if (!existsSync(scriptPath)) {
    throw new Error(
      `@elizaos/app-core script not found: ${path.relative(repoRoot, scriptPath)}`,
    );
  }
  return scriptPath;
}
