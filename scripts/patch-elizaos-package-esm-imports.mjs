#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const LOG_PREFIX = "[patch-elizaos-package-esm-imports]";

function resolvePackageDir(packageName) {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    return null;
  }
}

function listJsFiles(rootDir) {
  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      for (const file of listJsFiles(fullPath)) {
        files.push(file);
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveRelativeSpecifier(filePath, specifier) {
  if (/\.(?:cjs|css|js|json|mjs|node)$/.test(specifier)) {
    return specifier;
  }

  const basePath = path.resolve(path.dirname(filePath), specifier);
  if (fs.existsSync(`${basePath}.js`)) {
    return `${specifier}.js`;
  }
  if (fs.existsSync(path.join(basePath, "index.js"))) {
    return `${specifier}/index.js`;
  }
  return specifier;
}

function patchFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  const next = original.replace(
    /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
    (match, prefix, specifier, suffix) => {
      const resolved = resolveRelativeSpecifier(filePath, specifier);
      return resolved === specifier ? match : `${prefix}${resolved}${suffix}`;
    },
  );

  if (next === original) return false;
  fs.writeFileSync(filePath, next);
  return true;
}

const sharedDir = resolvePackageDir("@elizaos/shared");
if (!sharedDir) {
  console.warn(`${LOG_PREFIX} @elizaos/shared is not installed; skipping.`);
  process.exit(0);
}

const patchedFiles = listJsFiles(sharedDir).filter(patchFile);
if (patchedFiles.length === 0) {
  console.log(`${LOG_PREFIX} package ESM imports already compatible.`);
} else {
  console.log(
    `${LOG_PREFIX} patched ${patchedFiles.length} @elizaos/shared file(s).`,
  );
}
