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
const agentPluginResolverRelativePath =
  "packages/agent/src/runtime/plugin-resolver.ts";
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

export function isAliceTelegramAccountAuthResolverPatched(source) {
  return (
    source.includes("const TELEGRAM_ACCOUNT_AUTH_EXPORT") &&
    source.includes("function ensureTelegramAccountAuthExportCompat(") &&
    source.includes(
      "await ensureTelegramAccountAuthExportCompat(stagedInstallRoot);",
    ) &&
    source.includes(
      "await ensureTelegramAccountAuthExportCompat(process.cwd());",
    )
  );
}

function patchAliceTelegramAccountAuthResolverSource(source) {
  if (isAliceTelegramAccountAuthResolverPatched(source)) {
    return source;
  }

  const constantsAnchor = `type GlobalWithLastFailedPluginNames = typeof globalThis & {
  [LAST_FAILED_PLUGIN_NAMES]?: string[];
};

`;
  const constantsPatch = `${constantsAnchor}const TELEGRAM_ACCOUNT_AUTH_EXPORT = "./account-auth-service";
const TELEGRAM_ACCOUNT_AUTH_TARGET = "./dist/account-auth-service.js";

const TELEGRAM_ACCOUNT_AUTH_FALLBACK = \`export const defaultTelegramAccountDeviceModel = "Milady Cloud";
export const defaultTelegramAccountSystemVersion = "Linux";
export function loadTelegramAccountSessionString() { return ""; }
export class TelegramAccountAuthSession {
  constructor() {}
  snapshot() { return { state: "idle", error: null, identity: null }; }
  async begin() { return this.snapshot(); }
  async submitCode() { return this.snapshot(); }
  async submitPassword() { return this.snapshot(); }
  async cancel() { return undefined; }
}
export default { TelegramAccountAuthSession, loadTelegramAccountSessionString, defaultTelegramAccountDeviceModel, defaultTelegramAccountSystemVersion };
\`;

`;
  if (!source.includes(constantsAnchor)) {
    throw new Error("plugin-resolver global failed-plugin anchor drifted");
  }
  let next = source.replace(constantsAnchor, constantsPatch);

  const helperAnchor = `// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

`;
  const helperPatch = `${helperAnchor}async function ensureTelegramAccountAuthExportCompat(
  installRoot: string,
): Promise<void> {
  const packageJsonPath = path.join(
    installRoot,
    "node_modules",
    "@elizaos",
    "plugin-telegram",
    "package.json",
  );
  if (!existsSync(packageJsonPath)) {
    return;
  }

  const packageDir = path.dirname(packageJsonPath);
  const accountAuthPath = path.join(
    packageDir,
    "dist",
    "account-auth-service.js",
  );

  await fs.mkdir(path.dirname(accountAuthPath), { recursive: true });
  if (!existsSync(accountAuthPath)) {
    await fs.writeFile(accountAuthPath, TELEGRAM_ACCOUNT_AUTH_FALLBACK);
  }

  const packageJson = JSON.parse(
    await fs.readFile(packageJsonPath, "utf8"),
  ) as {
    main?: string;
    exports?: unknown;
  };

  if (!packageJson.exports || typeof packageJson.exports !== "object") {
    packageJson.exports = { ".": packageJson.main ?? "./dist/index.js" };
  }

  const exportsMap = packageJson.exports as Record<string, unknown>;
  if (exportsMap[TELEGRAM_ACCOUNT_AUTH_EXPORT] !== TELEGRAM_ACCOUNT_AUTH_TARGET) {
    exportsMap[TELEGRAM_ACCOUNT_AUTH_EXPORT] = TELEGRAM_ACCOUNT_AUTH_TARGET;
    await fs.writeFile(
      packageJsonPath,
      \`\${JSON.stringify(packageJson, null, 2)}\\n\`,
    );
  }
}

`;
  if (!next.includes(helperAnchor)) {
    throw new Error("plugin-resolver helper anchor drifted");
  }
  next = next.replace(helperAnchor, helperPatch);

  const stagedImportAnchor = `  await ensureStagedPackageDependencies({
    installRoot: params.installRoot,
    packageName: params.packageName,
    packageRoot: params.packageRoot,
    stagedPackageRoot,
  });

  return stagedPackageRoot;
`;
  const stagedImportPatch = `  await ensureStagedPackageDependencies({
    installRoot: params.installRoot,
    packageName: params.packageName,
    packageRoot: params.packageRoot,
    stagedPackageRoot,
  });
  await ensureTelegramAccountAuthExportCompat(stagedInstallRoot);

  return stagedPackageRoot;
`;
  if (!next.includes(stagedImportAnchor)) {
    throw new Error("plugin-resolver staged import anchor drifted");
  }
  next = next.replace(stagedImportAnchor, stagedImportPatch);

  const resolvePluginsAnchor = `  const plugins: ResolvedPlugin[] = [];
  const failedPlugins: Array<{ name: string; error: string }> = [];
  const repairedInstallRecords = new Set<string>();

`;
  const resolvePluginsPatch = `${resolvePluginsAnchor}  await ensureTelegramAccountAuthExportCompat(process.cwd());

`;
  if (!next.includes(resolvePluginsAnchor)) {
    throw new Error("plugin-resolver resolvePlugins anchor drifted");
  }
  next = next.replace(resolvePluginsAnchor, resolvePluginsPatch);

  return next;
}

export function applyAliceTelegramAccountAuthResolverPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const resolverPath = path.join(elizaRoot, agentPluginResolverRelativePath);
  if (!existsSync(resolverPath)) {
    log(
      "[alice-eliza-runtime-patches] agent plugin resolver source absent; skipping telegram account-auth resolver patch",
    );
    return "skipped";
  }

  const before = readFileSync(resolverPath, "utf8");
  if (isAliceTelegramAccountAuthResolverPatched(before)) {
    log(
      "[alice-eliza-runtime-patches] telegram account-auth resolver patch already applied",
    );
    return "already-applied";
  }

  const after = patchAliceTelegramAccountAuthResolverSource(before);
  writeFileSync(resolverPath, after);
  log(
    "[alice-eliza-runtime-patches] patched telegram account-auth resolver compatibility",
  );
  return "applied";
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
    applyAliceTelegramAccountAuthResolverPatch({ elizaRoot, log }),
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
