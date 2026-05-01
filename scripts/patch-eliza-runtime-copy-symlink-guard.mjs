#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const targetPath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "copy-runtime-node-modules.ts",
);
const checkOnly = process.argv.includes("--check");
const sentinel = "function isRecursivePackageSymlinkTarget";

const original = `export function shouldCopyPackageEntry(entry: string): boolean {
  if (path.basename(entry) === "node_modules") {
    return false;
  }

  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(entry);
  } catch {
    return false;
  }

  if (!stats.isSymbolicLink()) {
    return true;
  }

  try {
    const resolvedTarget = path.resolve(
      path.dirname(entry),
      fs.readlinkSync(entry),
    );
    return fs.existsSync(resolvedTarget);
  } catch {
    return false;
  }
}`;

const replacement = `function isRecursivePackageSymlinkTarget(
  entry: string,
  resolvedTarget: string,
): boolean {
  let targetStats: fs.Stats;
  try {
    targetStats = fs.statSync(resolvedTarget);
  } catch {
    return true;
  }

  if (!targetStats.isDirectory()) {
    return false;
  }

  const relative = path.relative(resolvedTarget, entry);
  return (
    relative === "" ||
    (Boolean(relative) &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative))
  );
}

export function shouldCopyPackageEntry(entry: string): boolean {
  if (path.basename(entry) === "node_modules") {
    return false;
  }

  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(entry);
  } catch {
    return false;
  }

  if (!stats.isSymbolicLink()) {
    return true;
  }

  try {
    const resolvedTarget = path.resolve(
      path.dirname(entry),
      fs.readlinkSync(entry),
    );
    if (!fs.existsSync(resolvedTarget)) {
      return false;
    }
    return !isRecursivePackageSymlinkTarget(entry, resolvedTarget);
  } catch {
    return false;
  }
}`;

function withNativeNewlines(source, newline) {
  return source.replace(/\n/g, newline);
}

function main() {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`missing eliza runtime copy script: ${targetPath}`);
  }

  const source = fs.readFileSync(targetPath, "utf8");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const normalized = source.replace(/\r\n/g, "\n");

  if (normalized.includes(sentinel)) {
    console.log("[patch-eliza-runtime-copy-symlink-guard] already patched");
    return;
  }

  if (!normalized.includes(original)) {
    throw new Error(
      "could not find copy-runtime-node-modules symlink filter anchor",
    );
  }

  if (checkOnly) {
    console.log("[patch-eliza-runtime-copy-symlink-guard] patch anchor found");
    return;
  }

  fs.writeFileSync(
    targetPath,
    withNativeNewlines(normalized.replace(original, replacement), newline),
  );
  console.log(
    "[patch-eliza-runtime-copy-symlink-guard] patched recursive package symlink guard",
  );
}

try {
  main();
} catch (error) {
  console.error(
    `[patch-eliza-runtime-copy-symlink-guard] ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
