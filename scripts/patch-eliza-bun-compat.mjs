import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const replacements = [
  {
    needle:
      "String.raw`\\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\\b\\s*[=:]\\s*([\"']?)([^\\s\"'\\\\]+)\\1`",
    replacement:
      `"\\\\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\\\\b\\\\s*[=:]\\\\s*([\\"']?)([^\\\\s\\"'\\\\\\\\]+)\\\\1"`,
  },
  {
    needle:
      "String.raw`--(?:api[-_]?key|token|secret|password|passwd)\\s+([\"']?)([^\\s\"']+)\\1`",
    replacement:
      `"--(?:api[-_]?key|token|secret|password|passwd)\\\\s+([\\"']?)([^\\\\s\\"']+)\\\\1"`,
  },
];

const SOURCE_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".ts"]);

function walkFiles(dir, targets) {
  if (!existsSync(dir)) {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(next, targets);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      targets.add(next);
    }
  }
}

function collectPackageTargets(packageRoot, targets) {
  walkFiles(path.join(packageRoot, "dist"), targets);
  walkFiles(path.join(packageRoot, "src/security"), targets);
}

function collectNodeModuleTargets(targets) {
  const directScopeDir = path.join(root, "node_modules/@elizaos");
  if (existsSync(directScopeDir)) {
    for (const entry of readdirSync(directScopeDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        collectPackageTargets(path.join(directScopeDir, entry.name), targets);
      }
    }
  }

  const pnpmDir = path.join(root, "node_modules/.pnpm");
  if (!existsSync(pnpmDir)) {
    return;
  }

  for (const entry of readdirSync(pnpmDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("@elizaos+")) {
      continue;
    }
    const scopeDir = path.join(pnpmDir, entry.name, "node_modules/@elizaos");
    if (!existsSync(scopeDir)) {
      continue;
    }
    for (const scopedEntry of readdirSync(scopeDir, { withFileTypes: true })) {
      if (scopedEntry.isDirectory()) {
        collectPackageTargets(path.join(scopeDir, scopedEntry.name), targets);
      }
    }
  }
}

function patchFile(filePath) {
  if (!existsSync(filePath)) {
    return false;
  }

  const original = readFileSync(filePath, "utf8");
  let next = original;
  for (const { needle, replacement } of replacements) {
    next = next.split(needle).join(replacement);
  }

  if (next === original) {
    return false;
  }

  writeFileSync(filePath, next, "utf8");
  console.log(`[patch-eliza-bun-compat] patched ${path.relative(root, filePath)}`);
  return true;
}

const targets = new Set([
  path.join(root, "eliza/packages/typescript/src/security/redact.ts"),
  path.join(root, "node_modules/@elizaos/core/src/security/redact.ts"),
]);

collectNodeModuleTargets(targets);

let patched = 0;
for (const target of targets) {
  if (patchFile(target)) {
    patched += 1;
  }
}

if (patched === 0) {
  console.log("[patch-eliza-bun-compat] no matching targets found");
}
