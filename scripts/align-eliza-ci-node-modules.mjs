#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function linkRootPackage(packageName, targets) {
  const source = path.join(repoRoot, "node_modules", ...packageName.split("/"));
  if (!fs.existsSync(source)) {
    throw new Error(`missing root package install: ${source}`);
  }

  for (const targetRel of targets) {
    const target = path.join(repoRoot, targetRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(source, target, "dir");
    console.log(
      `[align-eliza-ci-node-modules] ${targetRel} -> ${path.relative(
        path.dirname(target),
        source,
      )}`,
    );
  }
}

linkRootPackage("@biomejs", ["eliza/node_modules/@biomejs"]);

linkRootPackage("drizzle-orm", [
  "eliza/node_modules/drizzle-orm",
  "eliza/packages/app-core/node_modules/drizzle-orm",
  "eliza/plugins/plugin-sql/node_modules/drizzle-orm",
]);
