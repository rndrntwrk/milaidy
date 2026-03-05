#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const milaidyRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(milaidyRoot, "..");
const arcadeRoot = path.resolve(workspaceRoot, "arcade-plugin");
const installedArcadeRoot = path.resolve(
  milaidyRoot,
  "node_modules",
  "@rndrntwrk",
  "plugin-555arcade",
);

const SOURCE_ROOTS = [
  { label: "milaidy", dir: path.join(milaidyRoot, "src"), baseDir: milaidyRoot },
  { label: "milaidy", dir: path.join(milaidyRoot, "apps"), baseDir: milaidyRoot },
  { label: "milaidy", dir: path.join(milaidyRoot, "scripts"), baseDir: milaidyRoot },
];

if (existsSync(path.join(arcadeRoot, "src"))) {
  SOURCE_ROOTS.push({
    label: "arcade-plugin",
    dir: path.join(arcadeRoot, "src"),
    baseDir: arcadeRoot,
  });
} else if (existsSync(path.join(installedArcadeRoot, "src"))) {
  SOURCE_ROOTS.push({
    label: "arcade-plugin",
    dir: path.join(installedArcadeRoot, "src"),
    baseDir: installedArcadeRoot,
  });
}

const INCLUDE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".sh",
]);

const IGNORE_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "coverage",
  "output",
  "archive",
]);

const IGNORE_FILE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\/__tests__\//,
  /\/test\//,
  /\/docs\//,
];

const LEGACY_ARCADE_PATTERNS = [
  {
    label: "legacy arcade namespace",
    regex:
      /\b(?:FIVE55_GAMES_|FIVE55_SCORE_CAPTURE_|FIVE55_LEADERBOARD_|FIVE55_QUESTS_|FIVE55_BATTLES_|FIVE55_REWARDS_|FIVE55_SOCIAL_|FIVE55_THEME_SET|FIVE55_EVENT_TRIGGER|FIVE55_CABINET_|FIVE55_GITHUB_)\b|\/api\/five55\/(?:games|mastery)\b/g,
  },
  {
    label: "legacy local arcade ownership import",
    regex: /five55-games\/(?:mastery|intelligence)\b/g,
  },
];

const ALLOWLIST = [
  // Canonical infrastructure that intentionally bridges legacy and canonical surfaces.
  /^milaidy\/src\/api\/server\.ts$/,
  /^milaidy\/src\/api\/openapi\/spec\.ts$/,
  /^milaidy\/src\/runtime\/eliza\.ts$/,
  /^milaidy\/src\/runtime\/five55-capability-(policy|routing)\.ts$/,

  // Compatibility wrappers that intentionally preserve old plugin IDs and namespaces.
  /^milaidy\/src\/plugins\/five55-arcade-compat\.ts$/,
  /^milaidy\/src\/plugins\/five55-[^/]+\/.*$/,

  // Deprecated client compatibility surface retained for Release B.
  /^milaidy\/apps\/app\/src\/api-client\.ts$/,
  /^milaidy\/apps\/app\/src\/components\/ChatView\.tsx$/,
  /^milaidy\/apps\/app\/src\/components\/quickLayerCatalog\.ts$/,
  /^milaidy\/apps\/app\/src\/components\/PluginsView\.tsx$/,

  // Legacy smoke/dev compatibility entrypoints retained for Release B.
  /^milaidy\/scripts\/five55-game-smoke\.mjs$/,
  /^milaidy\/scripts\/five55-local-pipeline\.sh$/,
  /^milaidy\/scripts\/dev-ui\.mjs$/,
  /^milaidy\/scripts\/check-arcade555-canonical\.mjs$/,

  // Canonical package compatibility internals.
  /^arcade-plugin\/src\/actions\/legacyAliases\.ts$/,
  /^arcade-plugin\/src\/actions\/gamesAgentRuntime\.ts$/,
  /^arcade-plugin\/src\/compat\/.*$/,
  /^arcade-plugin\/src\/mastery\/.*$/,
  /^arcade-plugin\/src\/services\/ArcadeControlService\.ts$/,
  /^arcade-plugin\/src\/types\/index\.ts$/,
];

function toRepoRelative(filePath, rootLabel, rootDir) {
  return `${rootLabel}/${path.relative(rootDir, filePath).split(path.sep).join("/")}`;
}

function shouldIgnoreFile(filePath, rootLabel, rootDir) {
  const relative = toRepoRelative(filePath, rootLabel, rootDir);
  return IGNORE_FILE_PATTERNS.some((pattern) => pattern.test(relative));
}

function isAllowed(relativePath) {
  return ALLOWLIST.some((pattern) => pattern.test(relativePath));
}

function walk(root, out = []) {
  const { dir: dirPath, label, baseDir } = root;
  if (!existsSync(dirPath)) return out;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (IGNORE_DIR_NAMES.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk({ dir: fullPath, label, baseDir }, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!INCLUDE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (shouldIgnoreFile(fullPath, label, baseDir)) continue;
    out.push({ filePath: fullPath, label, rootDir: baseDir });
  }
  return out;
}

const findings = [];

function recordFinding(file, label, sample) {
  findings.push({ file, label, sample });
}

const milaidyPackageJsonPath = path.join(milaidyRoot, "package.json");
const milaidyPackageText = readFileSync(milaidyPackageJsonPath, "utf8");
if (/"@rndrntwrk\/plugin-555arcade"\s*:\s*"file:\.\.\/arcade-plugin"/.test(milaidyPackageText)) {
  recordFinding(
    "milaidy/package.json",
    "non-immutable arcade package dependency",
    "file:../arcade-plugin",
  );
}

const milaidyTsconfigPath = path.join(milaidyRoot, "tsconfig.json");
const milaidyTsconfigText = readFileSync(milaidyTsconfigPath, "utf8");
if (
  /"@rndrntwrk\/plugin-555arcade"\s*:\s*\[\s*"\.\.\/arcade-plugin\/src\/index\.ts"\s*\]/.test(
    milaidyTsconfigText,
  ) ||
  /"@rndrntwrk\/plugin-555arcade\/\*"\s*:\s*\[\s*"\.\.\/arcade-plugin\/src\/\*"\s*\]/.test(
    milaidyTsconfigText,
  )
) {
  recordFinding(
    "milaidy/tsconfig.json",
    "local arcade source path mapping",
    "../arcade-plugin/src/*",
  );
}

for (const root of SOURCE_ROOTS) {
  for (const { filePath, label, rootDir } of walk(root)) {
    const relativePath = toRepoRelative(filePath, label, rootDir);
    const contents = readFileSync(filePath, "utf8");
    for (const { label, regex } of LEGACY_ARCADE_PATTERNS) {
      regex.lastIndex = 0;
      const match = regex.exec(contents);
      if (!match) continue;
      if (isAllowed(relativePath)) continue;
      recordFinding(relativePath, label, match[0]);
      break;
    }
  }
}

if (findings.length > 0) {
  console.error("[arcade555-guard] found legacy arcade references outside approved compatibility surfaces:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.label} (${finding.sample})`);
  }
  process.exit(1);
}

console.log("[arcade555-guard] ok");
