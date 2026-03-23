#!/usr/bin/env node
/**
 * find-collisions.mjs
 *
 * Walk workspace source directories, extract exported names from .ts/.tsx files,
 * group by name, compute SHA-256 hashes, and report collisions.
 *
 * Usage: node scripts/find-collisions.mjs [--json]
 * Output: collision-report.json (when --json) or human-readable table to stdout.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";

// Use Bun's glob or fallback
let glob;
try {
  // Bun has built-in Glob
  const { Glob } = await import("bun");
  glob = (pattern, opts) => {
    const g = new Glob(pattern);
    return [...g.scanSync(opts?.cwd ?? ".")];
  };
} catch {
  // Node.js fallback
  const { globSync: gs } = await import("node:fs");
  glob = (pattern, opts) => gs(pattern, { cwd: opts?.cwd ?? "." });
}

const WORKSPACES = [
  { name: "packages/ui", dir: "packages/ui/src" },
  { name: "packages/app-core", dir: "packages/app-core/src" },
  { name: "apps/app", dir: "apps/app/src" },
  { name: "apps/homepage", dir: "apps/homepage/src" },
];

const ROOT = resolve(import.meta.dirname, "..");

/**
 * Extract named exports from a file using regex.
 * This is intentionally lightweight — catches the common patterns:
 *   export function Foo
 *   export const Foo
 *   export class Foo
 *   export type Foo
 *   export interface Foo
 *   export { Foo, Bar }
 *   export default function Foo
 */
function extractExports(content) {
  const names = new Set();

  // export function/const/let/var/class/type/interface/enum Name
  const declRe =
    /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|var\s+|class\s+|type\s+|interface\s+|enum\s+)(\w+)/g;
  for (;;) {
    const m = declRe.exec(content);
    if (!m) break;
    names.add(m[1]);
  }

  // export { Foo, Bar as Baz }
  const braceRe = /export\s*\{([^}]+)\}/g;
  for (;;) {
    const m = braceRe.exec(content);
    if (!m) break;
    for (const item of m[1].split(",")) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      // "Foo as Bar" → take "Bar" (the exported name)
      const asMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
      names.add(asMatch ? asMatch[2] : trimmed.split(/\s/)[0]);
    }
  }

  return [...names];
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// Collect all files
const filesByName = new Map(); // name → [{path, workspace, hash, lines, exports}]
const exportsByName = new Map(); // exportName → [{path, workspace}]

for (const ws of WORKSPACES) {
  const wsDir = resolve(ROOT, ws.dir);
  let files;
  try {
    files = glob("**/*.{ts,tsx}", { cwd: wsDir });
  } catch {
    console.warn(`Skipping ${ws.name}: directory not found`);
    continue;
  }

  for (const file of files) {
    // Skip test files, .d.ts, .js
    if (
      file.endsWith(".d.ts") ||
      file.endsWith(".test.ts") ||
      file.endsWith(".test.tsx") ||
      file.includes("__tests__") ||
      file.includes("__mocks__")
    )
      continue;

    const fullPath = resolve(wsDir, file);
    const content = readFileSync(fullPath, "utf8");
    const hash = sha256(content);
    const lines = content.split("\n").length;
    const stem = basename(file, extname(file));
    const relPath = relative(ROOT, fullPath);

    // Track by filename stem
    if (!filesByName.has(stem)) filesByName.set(stem, []);
    filesByName.get(stem).push({
      path: relPath,
      workspace: ws.name,
      hash,
      lines,
    });

    // Track by export name
    const exports = extractExports(content);
    for (const exp of exports) {
      if (!exportsByName.has(exp)) exportsByName.set(exp, []);
      exportsByName.get(exp).push({
        path: relPath,
        workspace: ws.name,
      });
    }
  }
}

// Find collisions (same name appearing in 2+ workspaces)
function findCrossWorkspaceCollisions(map) {
  const collisions = [];
  for (const [name, entries] of map) {
    const workspaces = new Set(entries.map((e) => e.workspace));
    if (workspaces.size < 2) continue;
    collisions.push({ name, entries });
  }
  return collisions;
}

const fileCollisions = findCrossWorkspaceCollisions(filesByName);
const exportCollisions = findCrossWorkspaceCollisions(exportsByName);

// Classify file collisions
const report = {
  generated: new Date().toISOString(),
  summary: {
    totalFiles: [...filesByName.values()].flat().length,
    fileNameCollisions: fileCollisions.length,
    exportNameCollisions: exportCollisions.length,
  },
  fileCollisions: fileCollisions.map(({ name, entries }) => {
    const hashes = new Set(entries.map((e) => e.hash));
    let verdict;
    if (hashes.size === 1) {
      verdict = "byte-identical";
    } else if (entries.some((e) => e.lines <= 10)) {
      verdict = "re-export-wrapper";
    } else {
      verdict = "same-name-different-content";
    }
    return { name, verdict, locations: entries };
  }),
  exportCollisions: exportCollisions.map(({ name, entries }) => ({
    name,
    locations: entries,
  })),
};

// Also find within-workspace duplicates (same hash, different path)
const hashMap = new Map();
for (const entries of filesByName.values()) {
  for (const entry of entries) {
    if (!hashMap.has(entry.hash)) hashMap.set(entry.hash, []);
    hashMap.get(entry.hash).push(entry);
  }
}
report.identicalFiles = [...hashMap.entries()]
  .filter(([, entries]) => entries.length > 1)
  .map(([hash, entries]) => ({ hash, files: entries.map((e) => e.path) }));

const jsonFlag = process.argv.includes("--json");
if (jsonFlag) {
  writeFileSync(
    resolve(ROOT, "collision-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("Written to collision-report.json");
} else {
  console.log("\n=== FILE NAME COLLISIONS (cross-workspace) ===\n");
  if (report.fileCollisions.length === 0) {
    console.log("  None found.");
  }
  for (const c of report.fileCollisions) {
    console.log(`  ${c.name} [${c.verdict}]`);
    for (const loc of c.locations) {
      console.log(`    ${loc.path} (${loc.lines} lines, ${loc.workspace})`);
    }
  }

  console.log("\n=== EXPORT NAME COLLISIONS (cross-workspace) ===\n");
  if (report.exportCollisions.length === 0) {
    console.log("  None found.");
  }
  for (const c of report.exportCollisions.slice(0, 30)) {
    const workspaces = [...new Set(c.locations.map((l) => l.workspace))].join(
      ", ",
    );
    console.log(
      `  ${c.name} (${c.locations.length} locations across: ${workspaces})`,
    );
  }
  if (report.exportCollisions.length > 30) {
    console.log(
      `  ... and ${report.exportCollisions.length - 30} more export collisions`,
    );
  }

  console.log("\n=== IDENTICAL FILES (same hash, any workspace) ===\n");
  if (report.identicalFiles.length === 0) {
    console.log("  None found.");
  }
  for (const g of report.identicalFiles) {
    console.log(`  Hash ${g.hash}:`);
    for (const f of g.files) {
      console.log(`    ${f}`);
    }
  }

  console.log(
    `\nSummary: ${report.summary.fileNameCollisions} file name collisions, ${report.summary.exportNameCollisions} export collisions, ${report.identicalFiles.length} identical-hash file groups`,
  );
}
