#!/usr/bin/env node
/**
 * Cleanup pass: fix cases where the barrel import was inserted inside a
 * multiline import block, producing malformed output like:
 *
 *   import {
 *   import { Button, Input } from "@elizaos/ui";
 *     Foo, Bar,
 *   } from "./somewhere";
 *
 * Also handles remaining missed patterns:
 * - `import type { X } from "@elizaos/ui/..."` (type-only)
 * - `export { X } from "@elizaos/ui/..."` (re-exports)
 * - multiline imports ending in `} from "@elizaos/ui/..."` (missed by pass 1)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const targetDir = path.join(rootDir, "eliza/packages/app-core/src");

function processFile(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  const original = src;

  // ── Pass 1: fix misplaced barrel imports ──────────────────────────────────
  // Pattern: orphan `import {` line immediately before the barrel import line.
  //   import {
  //   import { A, B } from "@elizaos/ui";
  //     Foo,
  //   } from "./somewhere";
  // → move barrel line to just BEFORE the `import {`.
  const _barrelLineRe = /^(import \{[^}]*\} from "@elizaos\/ui";)$/m;
  const orphanRe = /^(import \{)\n(import \{[^}]*\} from "@elizaos\/ui";)\n/m;
  if (orphanRe.test(src)) {
    src = src.replace(orphanRe, (_match, openBrace, barrelLine) => {
      return `${barrelLine}\n${openBrace}\n`;
    });
  }

  // ── Pass 2: handle remaining deep @elizaos/ui imports ────────────────────
  // Normalise multiline deep imports (import type and plain import).
  src = src.replace(
    /import\s+(type\s+)?\{([^}]*)\}\s+from\s+"@elizaos\/ui\/[^"]+"\s*;?/gs,
    (match) => match.replace(/\n\s*/g, " "),
  );

  // Also handle re-exports: export { X } from "@elizaos/ui/..."
  src = src.replace(
    /export\s+\{([^}]*)\}\s+from\s+"@elizaos\/ui\/[^"]+"\s*;?/gs,
    (match) => match.replace(/\n\s*/g, " "),
  );

  // Collect all remaining deep imports (plain, type, re-export).
  const deepPatterns = [
    // import { A } from "@elizaos/ui/..."
    /^import\s+(\{[^}]*\})\s+from\s+"@elizaos\/ui\/[^"]+"\s*;?/gm,
    // import type { A } from "@elizaos/ui/..."
    /^import\s+type\s+(\{[^}]*\})\s+from\s+"@elizaos\/ui\/[^"]+"\s*;?/gm,
  ];

  const deepLines = [];
  for (const re of deepPatterns) {
    for (let m = re.exec(src); m !== null; m = re.exec(src)) {
      deepLines.push({
        full: m[0],
        specifiers: parseSpecifiers(m[1]),
      });
    }
  }

  // Collect re-export lines and convert them to export from barrel.
  const reExportRe =
    /^export\s+\{([^}]*)\}\s+from\s+"@elizaos\/ui\/[^"]+"\s*;?/gm;
  const reExportLines = [];
  for (let rm = reExportRe.exec(src); rm !== null; rm = reExportRe.exec(src)) {
    reExportLines.push({ full: rm[0], specifiers: parseSpecifiers(rm[1]) });
  }

  // Process re-exports: merge into barrel re-export or insert new one.
  for (const { full, specifiers } of reExportLines) {
    src = src.replace(full, "");
    const existingReExportRe =
      /^export\s+\{([^}]*)\}\s+from\s+"@elizaos\/ui"\s*;?/m;
    const existing = existingReExportRe.exec(src);
    if (existing) {
      const merged = dedupeSpecifiers([
        ...parseSpecifiers(existing[1]),
        ...specifiers,
      ]);
      src = src.replace(
        existing[0],
        `export { ${merged.join(", ")} } from "@elizaos/ui";`,
      );
    } else {
      // Insert after last import.
      const pos = findLastImportEnd(src);
      const line = `export { ${dedupeSpecifiers(specifiers).join(", ")} } from "@elizaos/ui";`;
      if (pos !== null) {
        src = `${src.slice(0, pos)}\n${line}${src.slice(pos)}`;
      } else {
        src = `${line}\n${src}`;
      }
    }
  }

  // Process plain + type imports.
  if (deepLines.length > 0) {
    const allSpecifiers = deepLines.flatMap((d) => d.specifiers);
    for (const { full } of deepLines) {
      src = src.replace(full, "");
    }

    const barrelRe = /^import\s+\{([^}]*)\}\s+from\s+"@elizaos\/ui"\s*;?/m;
    const barrelMatch = barrelRe.exec(src);
    if (barrelMatch) {
      const merged = dedupeSpecifiers([
        ...parseSpecifiers(barrelMatch[1]),
        ...allSpecifiers,
      ]);
      src = src.replace(
        barrelMatch[0],
        `import { ${merged.join(", ")} } from "@elizaos/ui";`,
      );
    } else {
      const line = `import { ${dedupeSpecifiers(allSpecifiers).join(", ")} } from "@elizaos/ui";`;
      const pos = findLastImportEnd(src);
      if (pos !== null) {
        src = `${src.slice(0, pos)}\n${line}${src.slice(pos)}`;
      } else {
        src = `${line}\n${src}`;
      }
    }
  }

  // Tidy up any extra blank lines produced by removals.
  src = src.replace(/\n{3,}/g, "\n\n");

  if (src !== original) {
    fs.writeFileSync(filePath, src, "utf8");
    return true;
  }
  return false;
}

function parseSpecifiers(bracesContent) {
  return bracesContent
    .trim()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupeSpecifiers(specs) {
  const seen = new Map();
  for (const spec of specs) {
    const isType = spec.startsWith("type ");
    const name = isType ? spec.slice(5).trim() : spec.trim();
    const key = name.split(/\s+as\s+/)[0].trim();
    if (!seen.has(key)) {
      seen.set(key, spec);
    } else if (!isType) {
      seen.set(key, spec);
    }
  }
  return [...seen.values()];
}

/**
 * Find the character index just after the last complete import statement
 * (including multiline ones).
 */
function findLastImportEnd(src) {
  // Find all `} from "..."` line endings and `import ... from "..."` single lines.
  // A complete import ends at a line containing `} from "..."` or
  // at a single-line `import ... from "..."`.
  const lines = src.split("\n");
  let lastEnd = null;
  let pos = 0;
  let inImport = false;

  for (const line of lines) {
    const lineEnd = pos + line.length;
    const trimmed = line.trim();

    if (!inImport) {
      if (trimmed.startsWith("import ") || trimmed.startsWith("export {")) {
        if (!trimmed.includes("} from ") && trimmed.endsWith("{")) {
          // Multi-line start
          inImport = true;
        } else if (trimmed.includes(" from ")) {
          // Single-line import/export — ends here
          lastEnd = lineEnd;
        }
      }
    } else {
      if (trimmed.startsWith("} from ")) {
        // End of multiline import
        inImport = false;
        lastEnd = lineEnd;
      }
    }
    pos += line.length + 1; // +1 for the "\n"
  }

  return lastEnd;
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
  if (processFile(file)) {
    changed++;
    console.log("  fixed:", path.relative(rootDir, file));
  }
});

console.log(`\nDone. ${changed}/${total} files fixed.`);
