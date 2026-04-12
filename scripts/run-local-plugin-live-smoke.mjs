import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cwd = path.resolve(process.cwd());
const pluginsManifestPath = path.join(repoRoot, "plugins.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolvePackageRoot(dirName) {
  const candidates = [
    path.join(repoRoot, "plugins", dirName, "typescript"),
    path.join(repoRoot, "plugins", dirName),
    path.join(repoRoot, "packages", dirName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return path.resolve(candidate);
    }
  }

  return null;
}

function resolvePluginFilter() {
  const manifest = readJson(pluginsManifestPath);
  const candidates = [];

  for (const plugin of manifest.plugins ?? []) {
    const packageRoot = resolvePackageRoot(plugin.dirName);
    if (!packageRoot) {
      continue;
    }
    candidates.push({
      id: plugin.id,
      npmName: plugin.npmName,
      dirName: plugin.dirName,
      packageRoot,
    });
  }

  const match = candidates.find((plugin) => cwd === plugin.packageRoot);
  if (match) {
    return match.id;
  }

  const fallbackMatch = candidates.find((plugin) =>
    cwd.startsWith(`${plugin.packageRoot}${path.sep}`),
  );
  if (fallbackMatch) {
    return fallbackMatch.id;
  }

  const packageJsonPath = path.join(cwd, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const pkg = readJson(packageJsonPath);
    const byName = candidates.find((plugin) => plugin.npmName === pkg.name);
    if (byName) {
      return byName.id;
    }
  }

  throw new Error(
    `Unable to resolve a local plugin id for ${cwd}. Expected a first-party plugin package root.`,
  );
}

const pluginId = resolvePluginFilter();
const result = spawnSync(
  process.env.npm_execpath || process.env.BUN || "bun",
  [
    "x",
    "vitest",
    "run",
    "--config",
    "vitest.live-e2e.config.ts",
    "packages/agent/test/plugin-lifecycle.live.e2e.test.ts",
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      MILADY_LIVE_TEST: "1",
      ELIZA_LIVE_TEST: "1",
      MILADY_PLUGIN_LIFECYCLE_FILTER: pluginId,
    },
  },
);

process.exit(result.status ?? 1);
