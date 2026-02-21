#!/usr/bin/env -S node --import tsx

import { spawn } from "node:child_process";
import { resolve } from "node:path";

interface CliArgs {
  knowledgeRoot: string;
  outDir: string;
  label: string;
  seed: string;
  apiBase: string;
  token?: string;
  prune: boolean;
  skipSync: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
      continue;
    }
    args.set(key, "true");
  }

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const label = args.get("label") ?? `knowledge-sft-${now}`;
  return {
    knowledgeRoot: resolve(args.get("knowledge-root") ?? "knowledge"),
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    label,
    seed: args.get("seed") ?? "alice-knowledge-sft-v1",
    apiBase:
      args.get("base")?.trim() ||
      process.env.MILAIDY_API_BASE?.trim() ||
      "http://127.0.0.1:3000",
    token: args.get("token")?.trim() || process.env.MILAIDY_API_TOKEN?.trim(),
    prune: args.get("prune") === "true",
    skipSync: args.get("skip-sync") === "true",
  };
}

async function runStep(name: string, command: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${name} failed with exit code ${code ?? -1}`));
    });
  });
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(cli.outDir, `${cli.label}.manifest.json`);

  if (!cli.skipSync) {
    const syncArgs = [
      process.execPath,
      "--import",
      "tsx",
      resolve("scripts/sync-knowledge.ts"),
      cli.knowledgeRoot,
      "--base",
      cli.apiBase,
      "--label",
      cli.label,
    ];
    if (cli.token) {
      syncArgs.push("--token", cli.token);
    }
    if (cli.prune) {
      syncArgs.push("--prune");
    }
    await runStep("knowledge-sync", syncArgs);
  }

  await runStep("knowledge-sft-build", [
    process.execPath,
    "--import",
    "tsx",
    resolve("scripts/autonomy/build-knowledge-sft-dataset.ts"),
    cli.knowledgeRoot,
    "--out-dir",
    cli.outDir,
    "--label",
    cli.label,
    "--seed",
    cli.seed,
  ]);

  await runStep("knowledge-sft-validate", [
    process.execPath,
    "--import",
    "tsx",
    resolve("scripts/autonomy/validate-knowledge-sft-dataset.ts"),
    "--manifest",
    manifestPath,
    "--report-dir",
    cli.outDir,
  ]);

  console.log("[knowledge-pipeline] completed");
  console.log(`  label: ${cli.label}`);
  console.log(`  manifest: ${manifestPath}`);
  console.log(
    `  gate report: ${resolve(cli.outDir, `${cli.label}.gate-report.md`)}`,
  );
}

void main().catch((error) => {
  console.error(
    `[knowledge-pipeline] ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
