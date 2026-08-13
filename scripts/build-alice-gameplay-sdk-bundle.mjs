#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const [sdkRootArg, outputArg] = process.argv.slice(2);
if (!sdkRootArg || !outputArg) {
  console.error("usage: node scripts/build-alice-gameplay-sdk-bundle.mjs <stream-agent-sdk-root> <output.mjs>");
  process.exit(1);
}

const sdkRoot = resolve(sdkRootArg);
const output = resolve(outputArg);
const builtSdkEntry = join(sdkRoot, "dist", "index.js");
const bunBin = process.env.ALICE_BUN_BIN || process.execPath;
const scratch = mkdtempSync(join(tmpdir(), "alice-gameplay-sdk-bundle-"));
const wrapper = join(scratch, "entry.mjs");

try {
  writeFileSync(
    wrapper,
    `export { GameplayApiClient, sha256GameplayCanonical } from ${JSON.stringify(builtSdkEntry)};\n`,
  );
  const build = spawnSync(
    bunBin,
    ["build", wrapper, "--target=node", "--format=esm", `--outfile=${output}`],
    { cwd: sdkRoot, encoding: "utf8" },
  );
  if (build.status !== 0) {
    process.stderr.write(build.stdout || "");
    process.stderr.write(build.stderr || "");
    process.exit(build.status ?? 1);
  }

  const allowedBuiltins = new Set([
    "buffer", "crypto", "events", "http", "https", "net", "stream", "tls", "url", "zlib",
  ]);
  let source = readFileSync(output, "utf8");
  source = source.replace(/__require\((['"])([^'"\\]+)\1\)/g, (match, quote, specifier) => {
    if (specifier.startsWith("node:")) return match;
    if (!allowedBuiltins.has(specifier)) {
      throw new Error(`gameplay SDK bundle contains non-built-in require: ${specifier}`);
    }
    return `__require(${quote}node:${specifier}${quote})`;
  });
  writeFileSync(output, source);

  const loaded = await import(`${new URL(`file://${output}`).href}?verify=${Date.now()}`);
  const exports = Object.keys(loaded).sort();
  if (exports.join(",") !== "GameplayApiClient,sha256GameplayCanonical") {
    throw new Error(`unexpected gameplay SDK exports: ${exports.join(",")}`);
  }
  const digest = createHash("sha256").update(source).digest("hex");
  console.log(JSON.stringify({ output, bytes: Buffer.byteLength(source), sha256: digest, exports }));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
