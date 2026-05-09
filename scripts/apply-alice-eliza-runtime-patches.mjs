#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

export const aliceElizaRuntimePatchRelativePath =
  "scripts/alice-eliza-runtime-patches/app-core-server-only-api-bind.patch";

const runtimeRelativePath = "packages/app-core/src/runtime/eliza.ts";
const lifeOpsSourceRelativePaths = [
  "plugins/app-lifeops/src",
  "apps/app-lifeops/src",
];
const nativeActivityTrackerHelperRelativePath =
  "activity-profile/native-activity-tracker.ts";
const nativeActivityTrackerHelperSource = `export type ActivityEventKind = "activate" | "deactivate";

export interface ActivityCollectorEvent {
  ts: number;
  event: ActivityEventKind;
  bundleId: string;
  appName: string;
  windowTitle?: string;
}

export interface ActivityCollectorIdleSample {
  ts: number;
  event: "hid_idle";
  idleSeconds: number;
}

export interface ActivityCollectorExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  clean: boolean;
  reason: string;
}

export interface ActivityCollectorHandle {
  stop(): Promise<void>;
  readonly pid: number | null;
}

export interface ActivityCollectorOptions {
  binaryPath?: string;
  onEvent: (event: ActivityCollectorEvent) => void;
  onIdleSample?: (sample: ActivityCollectorIdleSample) => void;
  onExit?: (exit: ActivityCollectorExit) => void;
  onFatal?: (reason: string) => void;
}

export interface NativeActivityTrackerModule {
  isSupportedPlatform(): boolean;
  startActivityCollector(
    options: ActivityCollectorOptions,
  ): ActivityCollectorHandle;
}

type NativeActivityTrackerImporter =
  () => Promise<NativeActivityTrackerModule>;

export function isSupportedPlatform(): boolean {
  return process.platform === "darwin";
}

export async function loadNativeActivityTracker({
  importer = () => import("@elizaos/native-activity-tracker"),
  log = (message: string, error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(\`\${message} \${detail}\`);
  },
}: {
  importer?: NativeActivityTrackerImporter;
  log?: (message: string, error: unknown) => void;
} = {}): Promise<NativeActivityTrackerModule | null> {
  try {
    return await importer();
  } catch (error) {
    log(
      "[activity-tracker] Native activity tracker package unavailable; macOS focus reports are disabled.",
      error,
    );
    return null;
  }
}
`;

function runGitApply(args, { cwd, allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (!allowFailure && result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(detail || `git ${args.join(" ")} exited ${result.status}`);
  }

  return result;
}

export function isAliceRuntimeApiBindPatched(source) {
  const serverOnlyBranch =
    source.match(/if \(options\?\.serverOnly\) \{[\s\S]*?const keepAlive/m)?.[0] ??
    "";
  const apiBindIndex = serverOnlyBranch.indexOf(
    'const apiServerHandle = await withStartupPhase(\n        "api-bind"',
  );
  const runtimeBootIndex = serverOnlyBranch.indexOf(
    "upstreamStartElizaWithPgliteCompat({",
  );

  return (
    apiBindIndex >= 0 &&
    runtimeBootIndex >= 0 &&
    apiBindIndex < runtimeBootIndex &&
    serverOnlyBranch.includes('initialAgentState: "starting"') &&
    serverOnlyBranch.includes("apiServerHandle.updateRuntime(currentRuntime);") &&
    serverOnlyBranch.includes("apiServerHandle.updateStartup({") &&
    source.includes("[milady][startup]")
  );
}

export function rewriteRelativeTsRuntimeSpecifiers(source) {
  return source
    .replace(
      /(\bfrom\s*["'])(\.{1,2}\/[^"']+)\.(?:ts|tsx)(["'])/g,
      "$1$2.js$3",
    )
    .replace(
      /(\bimport\s*["'])(\.{1,2}\/[^"']+)\.(?:ts|tsx)(["'])/g,
      "$1$2.js$3",
    )
    .replace(
      /(\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+)\.(?:ts|tsx)(["']\s*\))/g,
      "$1$2.js$3",
    );
}

function listLifeOpsSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listLifeOpsSourceFiles(entryPath));
      continue;
    }
    if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(entryPath);
    }
  }
  return files;
}

export function applyAliceLifeOpsRuntimeImportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  let patchedFiles = 0;
  let inspectedDirs = 0;

  for (const relativePath of lifeOpsSourceRelativePaths) {
    const sourceDir = path.join(elizaRoot, relativePath);
    if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
      continue;
    }

    inspectedDirs += 1;
    for (const file of listLifeOpsSourceFiles(sourceDir)) {
      const before = readFileSync(file, "utf8");
      const after = rewriteRelativeTsRuntimeSpecifiers(before);
      if (after === before) {
        continue;
      }
      writeFileSync(file, after);
      patchedFiles += 1;
    }
  }

  if (inspectedDirs === 0) {
    log("[alice-eliza-runtime-patches] app-lifeops source absent; skipping");
    return "skipped";
  }

  if (patchedFiles === 0) {
    log(
      "[alice-eliza-runtime-patches] app-lifeops runtime imports already use JS specifiers",
    );
    return "already-applied";
  }

  log(
    `[alice-eliza-runtime-patches] patched app-lifeops runtime imports in ${patchedFiles} file(s)`,
  );
  return "applied";
}

function patchLifeOpsFile(filePath, patch) {
  const before = readFileSync(filePath, "utf8");
  const after = patch(before);
  if (after === before) {
    return false;
  }
  writeFileSync(filePath, after);
  return true;
}

function patchNativeActivityTrackerScreenTimeImport(source) {
  const directImport =
    'import { isSupportedPlatform } from "@elizaos/native-activity-tracker";';
  const optionalImport =
    'import { isSupportedPlatform } from "../activity-profile/native-activity-tracker.js";';

  if (source.includes(optionalImport)) {
    return source;
  }
  if (!source.includes(directImport)) {
    throw new Error(
      "app-lifeops screen-time native activity tracker import drifted",
    );
  }
  return source.replace(directImport, optionalImport);
}

function patchNativeActivityTrackerServiceImport(source) {
  const directImport = `import {
  type ActivityCollectorEvent,
  type ActivityCollectorHandle,
  type ActivityCollectorIdleSample,
  isSupportedPlatform,
  startActivityCollector,
} from "@elizaos/native-activity-tracker";`;
  const optionalImport = `import {
  type ActivityCollectorEvent,
  type ActivityCollectorHandle,
  type ActivityCollectorIdleSample,
  isSupportedPlatform,
  loadNativeActivityTracker,
} from "./native-activity-tracker.js";`;

  if (source.includes(optionalImport)) {
    return source;
  }
  if (!source.includes(directImport)) {
    throw new Error(
      "app-lifeops activity tracker service native import drifted",
    );
  }
  return source.replace(directImport, optionalImport);
}

function patchNativeActivityTrackerServiceStartup(source) {
  const directStartup = `    try {
      await LifeOpsRepository.bootstrapSchema(this.runtime);
      this.handle = startActivityCollector({`;
  const optionalStartup = `    try {
      const tracker = await loadNativeActivityTracker({
        log: (message, error) => {
          logger.warn(
            { err: error instanceof Error ? error.message : String(error) },
            message,
          );
        },
      });
      if (!tracker) {
        this.mode = "failed";
        return;
      }

      await LifeOpsRepository.bootstrapSchema(this.runtime);
      this.handle = tracker.startActivityCollector({`;

  if (source.includes(optionalStartup)) {
    return source;
  }
  if (!source.includes(directStartup)) {
    throw new Error(
      "app-lifeops activity tracker service startup block drifted",
    );
  }
  return source.replace(directStartup, optionalStartup);
}

export function applyAliceLifeOpsNativeActivityTrackerPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  let patchedFiles = 0;
  let inspectedDirs = 0;

  for (const relativePath of lifeOpsSourceRelativePaths) {
    const sourceDir = path.join(elizaRoot, relativePath);
    if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
      continue;
    }

    inspectedDirs += 1;

    const helperPath = path.join(
      sourceDir,
      nativeActivityTrackerHelperRelativePath,
    );
    mkdirSync(path.dirname(helperPath), { recursive: true });
    if (
      !existsSync(helperPath) ||
      readFileSync(helperPath, "utf8") !== nativeActivityTrackerHelperSource
    ) {
      writeFileSync(helperPath, nativeActivityTrackerHelperSource);
      patchedFiles += 1;
    }

    const screenTimePath = path.join(sourceDir, "actions", "screen-time.ts");
    if (existsSync(screenTimePath)) {
      if (
        patchLifeOpsFile(
          screenTimePath,
          patchNativeActivityTrackerScreenTimeImport,
        )
      ) {
        patchedFiles += 1;
      }
    }

    const servicePath = path.join(
      sourceDir,
      "activity-profile",
      "activity-tracker-service.ts",
    );
    if (existsSync(servicePath)) {
      if (
        patchLifeOpsFile(
          servicePath,
          (source) =>
            patchNativeActivityTrackerServiceStartup(
              patchNativeActivityTrackerServiceImport(source),
            ),
        )
      ) {
        patchedFiles += 1;
      }
    }
  }

  if (inspectedDirs === 0) {
    log(
      "[alice-eliza-runtime-patches] app-lifeops native activity tracker source absent; skipping",
    );
    return "skipped";
  }

  if (patchedFiles === 0) {
    log(
      "[alice-eliza-runtime-patches] app-lifeops native activity tracker imports already optional",
    );
    return "already-applied";
  }

  log(
    `[alice-eliza-runtime-patches] patched app-lifeops native activity tracker imports in ${patchedFiles} file(s)`,
  );
  return "applied";
}

function applyAliceRuntimeApiBindPatch({
  rootDir,
  elizaRoot,
  runtimePath,
  log,
}) {
  if (!existsSync(runtimePath)) {
    log(
      "[alice-eliza-runtime-patches] eliza runtime source absent; skipping patch",
    );
    return "skipped";
  }

  if (isAliceRuntimeApiBindPatched(readFileSync(runtimePath, "utf8"))) {
    log("[alice-eliza-runtime-patches] app-core API bind patch already applied");
    return "already-applied";
  }

  const patchPath = path.join(rootDir, aliceElizaRuntimePatchRelativePath);
  if (!existsSync(patchPath)) {
    throw new Error(`missing Alice Eliza runtime patch: ${patchPath}`);
  }

  const reverseCheck = runGitApply(
    ["apply", "--reverse", "--check", patchPath],
    { cwd: elizaRoot, allowFailure: true },
  );
  if (reverseCheck.status === 0) {
    log("[alice-eliza-runtime-patches] app-core API bind patch already applied");
    return "already-applied";
  }

  const forwardCheck = runGitApply(["apply", "--check", patchPath], {
    cwd: elizaRoot,
    allowFailure: true,
  });
  if (forwardCheck.status !== 0) {
    throw new Error(
      `Alice Eliza runtime patch drifted from ${runtimeRelativePath}: ${
        forwardCheck.stderr.trim() || forwardCheck.stdout.trim()
      }`,
    );
  }

  runGitApply(["apply", patchPath], { cwd: elizaRoot });

  const patched = readFileSync(runtimePath, "utf8");
  if (!isAliceRuntimeApiBindPatched(patched)) {
    throw new Error("Alice Eliza runtime patch applied but contract is absent");
  }

  log("[alice-eliza-runtime-patches] applied app-core API bind patch");
  return "applied";
}

export function applyAliceElizaRuntimePatches({
  rootDir = repoRoot,
  log = console.log,
} = {}) {
  const elizaRoot = path.join(rootDir, "eliza");
  const runtimePath = path.join(elizaRoot, runtimeRelativePath);

  const results = [
    applyAliceRuntimeApiBindPatch({ rootDir, elizaRoot, runtimePath, log }),
    applyAliceLifeOpsRuntimeImportPatch({ elizaRoot, log }),
    applyAliceLifeOpsNativeActivityTrackerPatch({ elizaRoot, log }),
  ];

  return results.includes("applied")
    ? "applied"
    : results.includes("already-applied")
      ? "already-applied"
      : "skipped";
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath);

if (isDirectRun) {
  try {
    applyAliceElizaRuntimePatches();
  } catch (error) {
    console.error(
      `[alice-eliza-runtime-patches] ERROR: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}
