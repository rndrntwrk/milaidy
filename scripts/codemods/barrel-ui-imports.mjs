#!/usr/bin/env node
/**
 * Codemod: convert deep @elizaos/ui sub-path imports to barrel imports.
 *
 * Before:
 *   import { Button } from "@elizaos/ui/components/ui/button";
 *   import { Input }  from "@elizaos/ui/components/ui/input";
 *
 * After:
 *   import { Button, Input } from "@elizaos/ui";
 *
 * Run: node scripts/codemods/barrel-ui-imports.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const targetDir = path.join(
  rootDir,
  "eliza/packages/app-core/src",
);

// Matches:  import { A, B, type C } from "@elizaos/ui/...";
// Also handles multi-line imports by joining first.
const DEEP_IMPORT_RE =
  /^import\s+(\{[^}]*\})\s+from\s+"@elizaos\/ui\/[^"]+"\s*;?/gm;

// Also need to catch the case where the brace spans multiple lines.
// Strategy: process file as whole string and normalize multi-line imports first.

function normalizeMultilineImports(src) {
  // Replace newlines inside import braces with spaces so each import is one line.
  return src.replace(
    /import\s+\{([^}]*)\}\s+from\s+"@elizaos\/ui\/[^"]+"\s*;?/gs,
    (match) => match.replace(/\n\s*/g, " "),
  );
}

/**
 * Parse `{ A, B, type C, D as E }` into individual specifier strings.
 */
function parseSpecifiers(bracesContent) {
  return bracesContent
    .trim()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function transformFile(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  const original = src;

  // Step 1: normalize any multi-line deep imports onto single lines.
  src = normalizeMultilineImports(src);

  // Step 2: collect all specifiers from deep @elizaos/ui imports.
  const deepImportLines = [];
  const deepRe =
    /^import\s+\{([^}]*)\}\s+from\s+"@elizaos\/ui\/[^"]+"\s*;?/gm;
  let m;
  while ((m = deepRe.exec(src)) !== null) {
    deepImportLines.push({
      full: m[0],
      specifiers: parseSpecifiers(m[1]),
    });
  }

  if (deepImportLines.length === 0) return false;

  const allNewSpecifiers = deepImportLines.flatMap((d) => d.specifiers);

  // Step 3: remove all deep import lines.
  for (const { full } of deepImportLines) {
    src = src.replace(full, "");
  }

  // Step 4: check for an existing barrel import `from "@elizaos/ui"`.
  const barrelRe = /^import\s+\{([^}]*)\}\s+from\s+"@elizaos\/ui"\s*;?/m;
  const barrelMatch = barrelRe.exec(src);

  if (barrelMatch) {
    // Merge into existing barrel import.
    const existingSpecifiers = parseSpecifiers(barrelMatch[1]);
    const merged = dedupeSpecifiers([
      ...existingSpecifiers,
      ...allNewSpecifiers,
    ]);
    const newImport = `import { ${merged.join(", ")} } from "@elizaos/ui";`;
    src = src.replace(barrelMatch[0], newImport);
  } else {
    // Insert a new barrel import. Find the best insertion point:
    // - After the last existing import block, OR at the top of the file.
    const newImport = `import { ${dedupeSpecifiers(allNewSpecifiers).join(", ")} } from "@elizaos/ui";`;

    // Find position after existing imports (last import line).
    const lastImportMatch = findLastImportPosition(src);
    if (lastImportMatch !== null) {
      src =
        src.slice(0, lastImportMatch) +
        "\n" +
        newImport +
        src.slice(lastImportMatch);
    } else {
      src = newImport + "\n" + src;
    }
  }

  // Clean up blank lines left by removed imports (max 2 consecutive blank lines).
  src = src.replace(/\n{3,}/g, "\n\n");

  if (src !== original) {
    fs.writeFileSync(filePath, src, "utf8");
    return true;
  }
  return false;
}

/**
 * Deduplicate specifiers while preserving order and handling `type` keyword.
 * `type Foo` and `Foo` are treated as the same export name — keep `type` variant
 * if that's what we have, unless non-type already present.
 */
function dedupeSpecifiers(specs) {
  const seen = new Map(); // lowerName → canonical specifier string
  for (const spec of specs) {
    const isType = spec.startsWith("type ");
    const name = isType ? spec.slice(5).trim() : spec.trim();
    const key = name.split(/\s+as\s+/)[0].trim(); // handle `A as B`
    if (!seen.has(key)) {
      seen.set(key, spec);
    } else if (!isType) {
      // Non-type import wins over type import.
      seen.set(key, spec);
    }
  }
  return [...seen.values()];
}

/**
 * Return the string index just after the last top-level import statement.
 */
function findLastImportPosition(src) {
  // Match all import statements (single-line only at this point).
  const re = /^import\s[^\n]*/gm;
  let last = null;
  let match;
  while ((match = re.exec(src)) !== null) {
    last = match.index + match[0].length;
  }
  return last;
}

function walkDir(dir, exts, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, exts, callback);
    } else if (exts.some((e) => full.endsWith(e))) {
      callback(full);
    }
  }
}

let changed = 0;
let total = 0;
walkDir(targetDir, [".ts", ".tsx"], (file) => {
  total++;
  if (transformFile(file)) {
    changed++;
    console.log("  updated:", path.relative(rootDir, file));
  }
});

console.log(`\nDone. ${changed}/${total} files updated.`);
