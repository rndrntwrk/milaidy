import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const prohibitedPackages = [
  "@elizaos/native-activity-tracker",
  "@elizaos/plugin-cron",
  "@elizaos/plugin-local-embedding",
  "@elizaos/plugin-todo",
  "@huggingface/tokenizers",
  "@huggingface/transformers",
  "onnxruntime-node",
  "onnxruntime-web",
];

test("actual full-gated dist never evaluates local embedding when prohibited packages are unavailable", () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "alice-full-gated-dist-import-"),
  );
  try {
    const distRoot = path.join(temporaryRoot, "dist");
    execFileSync(
      path.join(repoRoot, "node_modules", ".bin", "tsdown"),
      ["--out-dir", distRoot, "--logLevel", "silent"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          MILADY_ELIZA_APP_CORE_ROOT: "packages/app-core",
        },
        stdio: "pipe",
      },
    );
    fs.writeFileSync(
      path.join(distRoot, "package.json"),
      '{"type":"module"}\n',
    );
    const canonicalDistRoot = fs.realpathSync(distRoot);

    const localEmbeddingAttemptPath = path.join(
      temporaryRoot,
      "local-embedding-resolution-attempt.txt",
    );
    const loaderPath = path.join(temporaryRoot, "deny-prohibited-loader.mjs");
    fs.writeFileSync(
      loaderPath,
      `import fs from "node:fs";
import { registerHooks } from "node:module";
const denied = new Set(${JSON.stringify(prohibitedPackages)});
const buildRoot = ${JSON.stringify(pathToFileURL(canonicalDistRoot).href)};
const repoAnchor = ${JSON.stringify(pathToFileURL(path.join(repoRoot, "package.json")).href)};
const attemptPath = ${JSON.stringify(localEmbeddingAttemptPath)};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (denied.has(specifier)) {
      if (specifier === "@elizaos/plugin-local-embedding") {
        fs.appendFileSync(attemptPath, specifier + "\\n");
      }
      const error = new Error("PROHIBITED_PACKAGE_UNAVAILABLE: " + specifier);
      error.code = "ERR_MODULE_NOT_FOUND";
      throw error;
    }
    if (
      context.parentURL?.startsWith(buildRoot) &&
      !specifier.startsWith("node:") &&
      !specifier.startsWith("file:") &&
      !specifier.startsWith(".") &&
      !specifier.startsWith("/")
    ) {
      return nextResolve(specifier, { ...context, parentURL: repoAnchor });
    }
    return nextResolve(specifier, context);
  },
});
`,
    );

    const result = spawnSync(
      process.execPath,
      [
        "--import",
        path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs"),
        "--import",
        loaderPath,
        "--input-type=module",
        "--eval",
        `await import(${JSON.stringify(pathToFileURL(path.join(canonicalDistRoot, "eliza.js")).href)});`,
      ],
      {
        cwd: temporaryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
          ALICE_RUNTIME_PROFILE: "full-gated",
          NODE_ENV: "production",
        },
      },
    );

    assert.equal(
      result.status,
      0,
      `full-gated dist import failed:\n${result.stderr || result.stdout}`,
    );
    assert.equal(
      fs.existsSync(localEmbeddingAttemptPath),
      false,
      fs.existsSync(localEmbeddingAttemptPath)
        ? `local embedding was evaluated:\n${fs.readFileSync(localEmbeddingAttemptPath, "utf8")}`
        : undefined,
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
