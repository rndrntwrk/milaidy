#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {
    workspace: "",
    apiDir: "apps/api",
    mode: "cold",
    venvDir: ".benchmark-venv",
    shellExport: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--workspace") args.workspace = argv[++i] ?? "";
    else if (token === "--api-dir") args.apiDir = argv[++i] ?? "apps/api";
    else if (token === "--mode") args.mode = argv[++i] ?? "cold";
    else if (token === "--venv-dir") args.venvDir = argv[++i] ?? ".benchmark-venv";
    else if (token === "--shell-export") args.shellExport = true;
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--help" || token === "-h") args.help = true;
  }
  return args;
}

function fail(message) {
  console.error(`[benchmark-preflight] ${message}`);
  process.exit(1);
}

function runCommand(command, commandArgs, cwd, dryRun = false) {
  const rendered = [command, ...commandArgs].join(" ");
  if (dryRun) {
    console.log(`[dry-run] ${rendered}`);
    return;
  }

  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(`command failed: ${rendered}`);
  }
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function printHelp() {
  console.log(`Usage:
  node scripts/benchmark-preflight.mjs --workspace <path> [options]

Options:
  --mode <cold|warm>      cold resets venv before install (default: cold)
  --api-dir <path>        app directory containing requirements.txt (default: apps/api)
  --venv-dir <name>       venv directory name under workspace (default: .benchmark-venv)
  --shell-export          print shell exports for PATH/VIRTUAL_ENV
  --dry-run               print planned actions without modifying files
  --help, -h              show this help
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.workspace) {
    fail("missing --workspace");
  }
  if (args.mode !== "cold" && args.mode !== "warm") {
    fail(`invalid --mode '${args.mode}', expected 'cold' or 'warm'`);
  }

  const workspace = path.resolve(args.workspace);
  const apiDir = path.resolve(workspace, args.apiDir);
  const requirementsPath = path.resolve(apiDir, "requirements.txt");
  const venvPath = path.resolve(workspace, args.venvDir);
  const pythonInVenv = path.resolve(
    venvPath,
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );

  if (!existsSync(workspace)) {
    fail(`workspace does not exist: ${workspace}`);
  }
  if (!existsSync(apiDir)) {
    fail(`api dir does not exist: ${apiDir}`);
  }
  if (!existsSync(requirementsPath)) {
    fail(`requirements.txt not found: ${requirementsPath}`);
  }

  if (args.mode === "cold" && existsSync(venvPath)) {
    if (args.dryRun) {
      console.log(`[dry-run] rm -rf ${venvPath}`);
    } else {
      await rm(venvPath, { recursive: true, force: true });
    }
  }

  if (!existsSync(venvPath)) {
    await mkdir(path.dirname(venvPath), { recursive: true });
    runCommand("python3", ["-m", "venv", venvPath], workspace, args.dryRun);
  }

  runCommand(pythonInVenv, ["-m", "pip", "install", "--upgrade", "pip"], workspace, args.dryRun);
  runCommand(pythonInVenv, ["-m", "pip", "install", "-r", requirementsPath], workspace, args.dryRun);

  const summary = {
    workspace,
    mode: args.mode,
    requirements: requirementsPath,
    venv: venvPath,
    python: pythonInVenv,
  };
  console.log(`[benchmark-preflight] ready ${JSON.stringify(summary)}`);

  if (args.shellExport) {
    const binDir = path.dirname(pythonInVenv);
    console.log(`export VIRTUAL_ENV=${shellQuote(venvPath)}`);
    console.log(`export PATH=${shellQuote(`${binDir}:$PATH`)}`);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
