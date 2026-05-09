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
const appCoreApiServerRelativePath = "packages/app-core/src/api/server.ts";
const appCoreCompatStateRelativePath =
  "packages/app-core/src/api/compat-route-shared.ts";
const appCoreKubeHealthRelativePath = "packages/app-core/src/api/kube-health.ts";
const appCoreTrustedLocalRequestRelativePath =
  "packages/app-core/src/api/trusted-local-request.ts";
const coreBasicCapabilitiesRelativePath =
  "packages/core/src/features/basic-capabilities/index.ts";
const agentRuntimeRelativePath = "packages/agent/src/runtime/eliza.ts";
const agentPluginResolverRelativePath =
  "packages/agent/src/runtime/plugin-resolver.ts";
const pluginSqlPgliteManagerRelativePath =
  "plugins/plugin-sql/typescript/pglite/manager.ts";
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

const kubeHealthSource = `export interface KubeHealthResponse {
  statusCode: number;
  payload: {
    ok: boolean;
    ready: boolean;
    agentState: "running" | "starting";
    uptime: number;
  };
}

export function buildKubeHealthResponse(
  pathname: "/health" | "/health/live" | "/health/ready",
  hasRuntime: boolean,
  uptimeSeconds: number,
): KubeHealthResponse {
  const isLiveRoute = pathname === "/health/live";
  const statusCode = isLiveRoute || hasRuntime ? 200 : 503;

  return {
    statusCode,
    payload: {
      ok: isLiveRoute ? true : hasRuntime,
      ready: hasRuntime,
      agentState: hasRuntime ? "running" : "starting",
      uptime: uptimeSeconds,
    },
  };
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
  const updateRuntimeIndex = serverOnlyBranch.indexOf(
    "apiServerHandle.updateRuntime(currentRuntime);",
  );
  const doneMarkerIndex = serverOnlyBranch.indexOf(
    'startupInfo("start-eliza:done"',
  );
  const updateStartupRunningIndex = serverOnlyBranch.indexOf(
    'apiServerHandle.updateStartup({\n        state: "running"',
  );

  return (
    apiBindIndex >= 0 &&
    runtimeBootIndex >= 0 &&
    apiBindIndex < runtimeBootIndex &&
    updateRuntimeIndex >= 0 &&
    doneMarkerIndex > updateRuntimeIndex &&
    updateStartupRunningIndex > doneMarkerIndex &&
    serverOnlyBranch.includes('initialAgentState: "starting"') &&
    source.includes("[milady][startup]")
  );
}

export function isAliceKubeHealthReadinessPatched(serverSource, compatSource) {
  const updateRuntimeBlock =
    serverSource.match(/server\.updateRuntime = \(runtime:[\s\S]*?\n    \};/)?.[0] ??
    "";
  const updateStartupBlock =
    serverSource.match(/server\.updateStartup = \(update\) => \{[\s\S]*?\n    \};/)?.[0] ??
    "";

  return (
    compatSource.includes("kubeReady: boolean") &&
    serverSource.includes('import { buildKubeHealthResponse } from "./kube-health"') &&
    serverSource.includes('pathname === "/health"') &&
    serverSource.includes('pathname === "/health/live"') &&
    serverSource.includes('pathname === "/health/ready"') &&
    serverSource.includes("Boolean(state?.kubeReady)") &&
    serverSource.includes("kubeReady: Boolean(args[0]?.runtime)") &&
    updateRuntimeBlock.includes("compatState.current = runtime") &&
    !updateRuntimeBlock.includes("kubeReady") &&
    updateStartupBlock.includes('nextState === "running"') &&
    updateStartupBlock.includes("compatState.kubeReady = true;") &&
    updateStartupBlock.includes("compatState.kubeReady = false;")
  );
}

export function isAliceAppCoreCodingAgentsFallbackPatched(source) {
  return (
    source.includes('url.pathname === "/api/coding-agents"') &&
    source.includes("sendJsonResponse(res, 200, []);")
  );
}

export function isAliceAppCoreCompanionStagePatched(source) {
  return (
    source.includes("const ALICE_COMPANION_STAGE_DEFAULT") &&
    source.includes('url.pathname === "/api/companion/stage"') &&
    source.includes("/^\\/api\\/broadcast\\/([a-zA-Z0-9-]+)\\/stage$/") &&
    source.includes("aliceReadCompanionStageState()") &&
    source.includes("aliceWriteCompanionStageState(merged)")
  );
}

export function isAliceBundledKnowledgeStartupDeferralPatched(source) {
  return (
    source.includes("const BUNDLED_KNOWLEDGE_SEED_DELAY_MS = 30_000;") &&
    source.includes("function scheduleBundledKnowledgeSeed(") &&
    source.includes(
      "bundled knowledge seeding disabled by default during server startup",
    ) &&
    source.includes("Bundled knowledge seeding scheduled after") &&
    source.includes("bundled knowledge seeding deferred until API server startup") &&
    source.includes('scheduleBundledKnowledgeSeed(runtime, "api-server-listen");') &&
    source.includes('scheduleBundledKnowledgeSeed(runtime, "headless-runtime-init");') &&
    !source.includes("await seedBundledKnowledge(runtime);")
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

export function isAliceLifeOpsCalendarActionPatched(source) {
  return (
    source.includes("calendarAction as googleCalendarAction") &&
    source.includes("googleCalendarAction.handler") &&
    source.includes("googleCalendarAction,\n    proposeMeetingTimesAction") &&
    !source.includes(
      'import { calendarAction } from "./lib/calendar-handler.js";',
    ) &&
    !source.includes(
      "subActions: [\n    calendarAction,\n    proposeMeetingTimesAction",
    )
  );
}

export function isAlicePgliteContainerLockPatchPatched(source) {
  return (
    source.includes("type PgliteLockFile = {") &&
    source.includes("private getCurrentProcessStartedAtMs(): number") &&
    source.includes("private isLockFileFromPreviousProcess(") &&
    source.includes("const previousProcessLock = this.isLockFileFromPreviousProcess(") &&
    source.includes("pid && this.isPidRunning(pid) && !previousProcessLock") &&
    source.includes("Removed stale PGlite postmaster.pid from prior container process")
  );
}

function patchAlicePgliteContainerLockSource(source) {
  if (isAlicePgliteContainerLockPatchPatched(source)) {
    return source;
  }

  let next = source;
  const importAnchor = `  openSync,
  readFileSync,
  unlinkSync,
`;
  if (!next.includes(importAnchor)) {
    throw new Error("plugin-sql PGlite manager fs import anchor drifted");
  }
  next = next.replace(
    importAnchor,
    `  openSync,
  readFileSync,
  statSync,
  unlinkSync,
`,
  );

  const typeAnchor = `type PglitePidFileStatus =
  | "missing"
  | "active"
  | "active-unconfirmed"
  | "cleared-stale"
  | "cleared-malformed"
  | "check-failed";

`;
  if (!next.includes(typeAnchor)) {
    throw new Error("plugin-sql PGlite manager pid status anchor drifted");
  }
  next = next.replace(
    typeAnchor,
    `${typeAnchor}type PgliteLockFile = {
  pid?: unknown;
  createdAt?: unknown;
};

`,
  );

  const lockPidAnchor = `  private getLockPid(lockPath: string): number | null {
    try {
      const raw = readFileSync(lockPath, "utf-8");
      const parsed = JSON.parse(raw) as { pid?: unknown };
      return typeof parsed.pid === "number" && parsed.pid > 0 ? parsed.pid : null;
    } catch {
      return null;
    }
  }

`;
  if (!next.includes(lockPidAnchor)) {
    throw new Error("plugin-sql PGlite manager lock pid anchor drifted");
  }
  next = next.replace(
    lockPidAnchor,
    `  private getLockInfo(lockPath: string): PgliteLockFile | null {
    try {
      const raw = readFileSync(lockPath, "utf-8");
      const parsed = JSON.parse(raw) as PgliteLockFile;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  private getLockPid(lockInfo: PgliteLockFile | null): number | null {
    const pid = lockInfo?.pid;
    return typeof pid === "number" && pid > 0 ? pid : null;
  }

  private getCurrentProcessStartedAtMs(): number {
    return Date.now() - process.uptime() * 1000;
  }

  private isTimestampFromPreviousProcess(timestampMs: number): boolean {
    return timestampMs + 1000 < this.getCurrentProcessStartedAtMs();
  }

  private isLockFileFromPreviousProcess(lockPath: string, lockInfo: PgliteLockFile | null): boolean {
    const createdAt = lockInfo?.createdAt;
    if (typeof createdAt === "string") {
      const createdAtMs = Date.parse(createdAt);
      if (Number.isFinite(createdAtMs) && this.isTimestampFromPreviousProcess(createdAtMs)) {
        return true;
      }
    }

    try {
      return this.isTimestampFromPreviousProcess(statSync(lockPath).mtimeMs);
    } catch {
      return false;
    }
  }

  private isPidFileFromPreviousProcess(pidPath: string): boolean {
    try {
      return this.isTimestampFromPreviousProcess(statSync(pidPath).mtimeMs);
    } catch {
      return false;
    }
  }

`,
  );

  const lockCheckAnchor = `        const pid = this.getLockPid(lockPath);
        if (pid && this.isPidRunning(pid)) {
`;
  if (!next.includes(lockCheckAnchor)) {
    throw new Error("plugin-sql PGlite manager active lock anchor drifted");
  }
  next = next.replace(
    lockCheckAnchor,
    `        const lockInfo = this.getLockInfo(lockPath);
        const pid = this.getLockPid(lockInfo);
        const previousProcessLock = this.isLockFileFromPreviousProcess(lockPath, lockInfo);
        if (pid && this.isPidRunning(pid) && !previousProcessLock) {
`,
  );

  const lockLogAnchor = `{ src: "plugin:sql", dataDir, lockPath, pid },`;
  if (!next.includes(lockLogAnchor)) {
    throw new Error("plugin-sql PGlite manager lock log anchor drifted");
  }
  next = next.replace(
    lockLogAnchor,
    `{ src: "plugin:sql", dataDir, lockPath, pid, previousProcessLock },`,
  );

  const pidFileAnchor = `      try {
        process.kill(pid, 0);
`;
  if (!next.includes(pidFileAnchor)) {
    throw new Error("plugin-sql PGlite manager postmaster pid anchor drifted");
  }
  next = next.replace(
    pidFileAnchor,
    `      if (this.isPidFileFromPreviousProcess(pidPath)) {
        unlinkSync(pidPath);
        logger.info(
          { src: "plugin:sql", dataDir, pid },
          "Removed stale PGlite postmaster.pid from prior container process"
        );
        return "cleared-stale";
      }

${pidFileAnchor}`,
  );

  if (!isAlicePgliteContainerLockPatchPatched(next)) {
    throw new Error("plugin-sql PGlite manager patch applied but contract is absent");
  }
  return next;
}

export function applyAlicePgliteContainerLockPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const managerPath = path.join(elizaRoot, pluginSqlPgliteManagerRelativePath);
  if (!existsSync(managerPath)) {
    log(
      "[alice-eliza-runtime-patches] plugin-sql PGlite manager source absent; skipping",
    );
    return "skipped";
  }

  const before = readFileSync(managerPath, "utf8");
  const after = patchAlicePgliteContainerLockSource(before);
  if (after === before) {
    log(
      "[alice-eliza-runtime-patches] plugin-sql PGlite container lock patch already applied",
    );
    return "already-applied";
  }

  writeFileSync(managerPath, after);
  log("[alice-eliza-runtime-patches] patched plugin-sql PGlite container lock recovery");
  return "applied";
}

function patchAliceLifeOpsCalendarActionSource(source) {
  if (isAliceLifeOpsCalendarActionPatched(source)) {
    return source;
  }

  const importAnchor =
    'import { calendarAction } from "./lib/calendar-handler.js";';
  if (!source.includes(importAnchor)) {
    throw new Error("app-lifeops calendar action import anchor drifted");
  }
  let next = source.replace(
    importAnchor,
    'import { calendarAction as googleCalendarAction } from "./lib/calendar-handler.js";',
  );

  const handlerAnchor = "return (await calendarAction.handler?.(";
  if (!next.includes(handlerAnchor)) {
    throw new Error("app-lifeops calendar action handler anchor drifted");
  }
  next = next.replace(
    handlerAnchor,
    "return (await googleCalendarAction.handler?.(",
  );

  const subActionsAnchor =
    "subActions: [\n    calendarAction,\n    proposeMeetingTimesAction";
  if (!next.includes(subActionsAnchor)) {
    throw new Error("app-lifeops calendar action subActions anchor drifted");
  }
  next = next.replace(
    subActionsAnchor,
    "subActions: [\n    googleCalendarAction,\n    proposeMeetingTimesAction",
  );

  if (!isAliceLifeOpsCalendarActionPatched(next)) {
    throw new Error("app-lifeops calendar action patch applied but contract is absent");
  }
  return next;
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

export function applyAliceLifeOpsCalendarActionPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  let patchedFiles = 0;
  let inspectedFiles = 0;

  for (const relativePath of lifeOpsSourceRelativePaths) {
    const calendarActionPath = path.join(
      elizaRoot,
      relativePath,
      "actions",
      "calendar.ts",
    );
    if (!existsSync(calendarActionPath)) {
      continue;
    }

    inspectedFiles += 1;
    const before = readFileSync(calendarActionPath, "utf8");
    const after = patchAliceLifeOpsCalendarActionSource(before);
    if (after === before) {
      continue;
    }
    writeFileSync(calendarActionPath, after);
    patchedFiles += 1;
  }

  if (inspectedFiles === 0) {
    log("[alice-eliza-runtime-patches] app-lifeops calendar action source absent; skipping");
    return "skipped";
  }

  if (patchedFiles === 0) {
    log(
      "[alice-eliza-runtime-patches] app-lifeops calendar action already avoids self-reference",
    );
    return "already-applied";
  }

  log(
    `[alice-eliza-runtime-patches] patched app-lifeops calendar action in ${patchedFiles} file(s)`,
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

function patchAliceKubeHealthCompatStateSource(source) {
  if (source.includes("kubeReady: boolean")) {
    return source;
  }

  const anchor = "  current: AgentRuntime | null;\n";
  if (!source.includes(anchor)) {
    throw new Error("app-core compat state current-runtime anchor drifted");
  }

  return source.replace(anchor, `${anchor}  kubeReady: boolean;\n`);
}

function patchAliceKubeHealthServerSource(source) {
  if (
    source.includes('import { buildKubeHealthResponse } from "./kube-health"') &&
    source.includes("Boolean(state?.kubeReady)") &&
    source.includes("compatState.kubeReady = true;") &&
    source.includes("compatState.kubeReady = false;")
  ) {
    return source;
  }

  let next = source;

  const importAnchor = 'import { sendJson as sendJsonResponse } from "./response";\n';
  if (!next.includes(importAnchor)) {
    throw new Error("app-core server response import anchor drifted");
  }
  next = next.replace(
    importAnchor,
    `${importAnchor}import { buildKubeHealthResponse } from "./kube-health";\n`,
  );

  const requestStateAnchor = `      if (state) {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (
`;
  const requestStatePatch = `      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (
        req.method === "GET" &&
        (pathname === "/health" ||
          pathname === "/health/live" ||
          pathname === "/health/ready")
      ) {
        const health = buildKubeHealthResponse(
          pathname,
          Boolean(state?.kubeReady),
          Math.floor(process.uptime()),
        );
        sendJsonResponse(res, health.statusCode, health.payload);
        return;
      }

      if (state) {
        if (
`;
  if (!next.includes(requestStateAnchor)) {
    throw new Error("app-core server request state anchor drifted");
  }
  next = next.replace(requestStateAnchor, requestStatePatch);

  const compatStateAnchor = `  const compatState: CompatRuntimeState = {
    current: (args[0]?.runtime as AgentRuntime | null) ?? null,
    pendingAgentName: null,
    pendingRestartReasons: [],
  };
`;
  const compatStatePatch = `  const compatState: CompatRuntimeState = {
    current: (args[0]?.runtime as AgentRuntime | null) ?? null,
    kubeReady: Boolean(args[0]?.runtime),
    pendingAgentName: null,
    pendingRestartReasons: [],
  };
`;
  if (!next.includes(compatStateAnchor)) {
    throw new Error("app-core server compat state initializer anchor drifted");
  }
  next = next.replace(compatStateAnchor, compatStatePatch);

  const updateRuntimeAnchor = `    const originalUpdateRuntime = server.updateRuntime as (
      runtime: AgentRuntime,
    ) => void;

    server.updateRuntime = (runtime: AgentRuntime) => {
`;
  const updateRuntimePatch = `    const originalUpdateRuntime = server.updateRuntime as (
      runtime: AgentRuntime,
    ) => void;
    const originalUpdateStartup = server.updateStartup;

    server.updateRuntime = (runtime: AgentRuntime) => {
`;
  if (!next.includes(updateRuntimeAnchor)) {
    throw new Error("app-core server updateRuntime anchor drifted");
  }
  next = next.replace(updateRuntimeAnchor, updateRuntimePatch);

  const updateRuntimeEndAnchor = `      })();
    };

    syncElizaEnvAliases();
`;
  const updateRuntimeEndPatch = `      })();
    };

    server.updateStartup = (update) => {
      const nextState = update.state;
      if (nextState === "running") {
        compatState.kubeReady = true;
      } else if (nextState) {
        compatState.kubeReady = false;
      }

      originalUpdateStartup(update);
    };

    syncElizaEnvAliases();
`;
  if (!next.includes(updateRuntimeEndAnchor)) {
    throw new Error("app-core server updateStartup insertion anchor drifted");
  }
  next = next.replace(updateRuntimeEndAnchor, updateRuntimeEndPatch);

  return next;
}

export function applyAliceKubeHealthReadinessPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const serverPath = path.join(elizaRoot, appCoreApiServerRelativePath);
  const compatPath = path.join(elizaRoot, appCoreCompatStateRelativePath);
  const kubeHealthPath = path.join(elizaRoot, appCoreKubeHealthRelativePath);

  if (!existsSync(serverPath) || !existsSync(compatPath)) {
    log(
      "[alice-eliza-runtime-patches] app-core kube health source absent; skipping",
    );
    return "skipped";
  }

  const beforeServer = readFileSync(serverPath, "utf8");
  const beforeCompat = readFileSync(compatPath, "utf8");
  const afterCompat = patchAliceKubeHealthCompatStateSource(beforeCompat);
  const afterServer = patchAliceKubeHealthServerSource(beforeServer);
  const existingKubeHealth = existsSync(kubeHealthPath)
    ? readFileSync(kubeHealthPath, "utf8")
    : null;

  if (
    afterServer === beforeServer &&
    afterCompat === beforeCompat &&
    existingKubeHealth === kubeHealthSource &&
    isAliceKubeHealthReadinessPatched(afterServer, afterCompat)
  ) {
    log(
      "[alice-eliza-runtime-patches] app-core kube /health readiness gate already applied",
    );
    return "already-applied";
  }

  mkdirSync(path.dirname(kubeHealthPath), { recursive: true });
  writeFileSync(serverPath, afterServer);
  writeFileSync(compatPath, afterCompat);
  writeFileSync(kubeHealthPath, kubeHealthSource);

  if (!isAliceKubeHealthReadinessPatched(afterServer, afterCompat)) {
    throw new Error("app-core kube health patch applied but contract is absent");
  }

  log(
    "[alice-eliza-runtime-patches] patched app-core kube /health readiness gate",
  );
  return "applied";
}

function patchAliceAppCoreCodingAgentsFallbackSource(source) {
  if (isAliceAppCoreCodingAgentsFallbackPatched(source)) {
    return source;
  }

  const anchor = `  // GET /api/agents — return the running agent's info.
`;
  const patch = `  if (method === "GET" && url.pathname === "/api/coding-agents") {
    if (!(await ensureRouteAuthorized(req, res, state))) {
      return true;
    }
    sendJsonResponse(res, 200, []);
    return true;
  }

${anchor}`;
  if (!source.includes(anchor)) {
    throw new Error("app-core coding agents fallback anchor drifted");
  }

  const next = source.replace(anchor, patch);
  if (!isAliceAppCoreCodingAgentsFallbackPatched(next)) {
    throw new Error(
      "app-core coding agents fallback patch applied but contract is absent",
    );
  }
  return next;
}

export function applyAliceAppCoreCodingAgentsFallbackPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const serverPath = path.join(elizaRoot, appCoreApiServerRelativePath);
  if (!existsSync(serverPath)) {
    log(
      "[alice-eliza-runtime-patches] app-core server source absent; skipping coding agents fallback",
    );
    return "skipped";
  }

  const before = readFileSync(serverPath, "utf8");
  const after = patchAliceAppCoreCodingAgentsFallbackSource(before);
  if (after === before) {
    log(
      "[alice-eliza-runtime-patches] app-core coding agents fallback already applied",
    );
    return "already-applied";
  }

  writeFileSync(serverPath, after);
  log("[alice-eliza-runtime-patches] patched app-core coding agents fallback");
  return "applied";
}

function patchAliceAppCoreCompanionStageSource(source) {
  if (isAliceAppCoreCompanionStagePatched(source)) {
    return source;
  }

  let next = source;

  const compatImportAnchor = `  getConfiguredCompatAgentName,
} from "./compat-route-shared";
`;
  const compatImportPatch = `  getConfiguredCompatAgentName,
  readCompatJsonBody,
} from "./compat-route-shared";
`;
  if (!next.includes("readCompatJsonBody,\n} from \"./compat-route-shared\"")) {
    if (!next.includes(compatImportAnchor)) {
      throw new Error("app-core companion stage compat import anchor drifted");
    }
    next = next.replace(compatImportAnchor, compatImportPatch);
  }

  const helperAnchor = `async function handleCompatRoute(
`;
  const helperPatch = `const ALICE_COMPANION_STAGE_DEFAULT = {
  camera: {
    zoom: 0.95,
    yaw: 0,
    pitch: 0,
    pan: 0,
  },
};

function aliceClamp01(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function aliceClampFinite(value, fallback, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function aliceSanitizeCompanionStageState(raw) {
  const candidate =
    raw && typeof raw === "object" ? raw : {};
  const rawCamera =
    candidate.camera && typeof candidate.camera === "object"
      ? candidate.camera
      : {};
  return {
    camera: {
      zoom: aliceClamp01(
        rawCamera.zoom,
        ALICE_COMPANION_STAGE_DEFAULT.camera.zoom,
      ),
      yaw: aliceClampFinite(rawCamera.yaw, 0, -Math.PI, Math.PI),
      pitch: aliceClampFinite(rawCamera.pitch, 0, -Math.PI / 2, Math.PI / 2),
      pan: aliceClampFinite(rawCamera.pan, 0, -5, 5),
    },
  };
}

function aliceCompanionStageFile() {
  const root =
    process.env.MILAIDY_HOME ||
    process.env.ELIZA_DATA_DIR ||
    path.join(process.cwd(), "data");
  return path.join(root, "companion", "stage.json");
}

function aliceReadCompanionStageState() {
  const stageFile = aliceCompanionStageFile();
  try {
    if (fs.existsSync(stageFile)) {
      return aliceSanitizeCompanionStageState(
        JSON.parse(fs.readFileSync(stageFile, "utf-8")),
      );
    }
  } catch (err) {
    logger.warn(
      \`[companion-stage] Failed to read \${stageFile}: \${
        err instanceof Error ? err.message : String(err)
      }\`,
    );
  }
  return aliceSanitizeCompanionStageState(ALICE_COMPANION_STAGE_DEFAULT);
}

function aliceWriteCompanionStageState(nextState) {
  const stageFile = aliceCompanionStageFile();
  try {
    fs.mkdirSync(path.dirname(stageFile), { recursive: true });
    fs.writeFileSync(stageFile, JSON.stringify(nextState, null, 2), "utf-8");
  } catch (err) {
    logger.warn(
      \`[companion-stage] Failed to persist \${stageFile}: \${
        err instanceof Error ? err.message : String(err)
      }\`,
    );
  }
}

function aliceMergeCompanionStagePatch(base, patch) {
  return {
    camera: {
      ...base.camera,
      ...(patch?.camera ?? {}),
    },
  };
}

${helperAnchor}`;
  if (!next.includes("const ALICE_COMPANION_STAGE_DEFAULT")) {
    if (!next.includes(helperAnchor)) {
      throw new Error("app-core companion stage helper anchor drifted");
    }
    next = next.replace(helperAnchor, helperPatch);
  }

  const routeAnchor = `  if (method === "GET" && url.pathname === "/api/coding-agents") {
`;
  const routePatch = `  if (method === "GET" && url.pathname === "/api/companion/stage") {
    if (!(await ensureRouteAuthorized(req, res, state))) {
      return true;
    }
    sendJsonResponse(res, 200, {
      ok: true,
      state: aliceReadCompanionStageState(),
    });
    return true;
  }

  const aliceBroadcastStageMatch = url.pathname.match(
    /^\\/api\\/broadcast\\/([a-zA-Z0-9-]+)\\/stage$/,
  );
  if (method === "GET" && aliceBroadcastStageMatch) {
    const channel = aliceBroadcastStageMatch[1];
    if (channel !== "alice-cam") {
      sendJsonResponse(res, 404, { error: "Unknown broadcast channel" });
      return true;
    }
    sendJsonResponse(res, 200, {
      ok: true,
      channel,
      state: aliceReadCompanionStageState(),
    });
    return true;
  }

  if (method === "POST" && url.pathname === "/api/companion/stage") {
    if (!(await ensureRouteAuthorized(req, res, state))) {
      return true;
    }
    const body = await readCompatJsonBody(req, res);
    if (!body) return true;
    if (!body.patch || typeof body.patch !== "object") {
      sendJsonResponse(res, 400, { error: "Missing 'patch' field" });
      return true;
    }
    const current = aliceReadCompanionStageState();
    const merged = aliceSanitizeCompanionStageState(
      aliceMergeCompanionStagePatch(current, body.patch),
    );
    aliceWriteCompanionStageState(merged);
    sendJsonResponse(res, 200, { ok: true, state: merged });
    return true;
  }

${routeAnchor}`;
  if (!next.includes('url.pathname === "/api/companion/stage"')) {
    if (!next.includes(routeAnchor)) {
      throw new Error("app-core companion stage route anchor drifted");
    }
    next = next.replace(routeAnchor, routePatch);
  }

  if (!isAliceAppCoreCompanionStagePatched(next)) {
    throw new Error(
      "app-core companion stage patch applied but contract is absent",
    );
  }
  return next;
}

export function applyAliceAppCoreCompanionStagePatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const serverPath = path.join(elizaRoot, appCoreApiServerRelativePath);
  if (!existsSync(serverPath)) {
    log(
      "[alice-eliza-runtime-patches] app-core server source absent; skipping companion stage routes",
    );
    return "skipped";
  }

  const before = readFileSync(serverPath, "utf8");
  const after = patchAliceAppCoreCompanionStageSource(before);
  if (after === before) {
    log(
      "[alice-eliza-runtime-patches] app-core companion stage routes already applied",
    );
    return "already-applied";
  }

  writeFileSync(serverPath, after);
  log("[alice-eliza-runtime-patches] patched app-core companion stage routes");
  return "applied";
}

function patchAliceAppCoreOpenAccessSource(source) {
  if (source.includes("MILADY_OPEN_ACCESS")) {
    return source;
  }

  const anchor = `export function isTrustedLocalRequest(
  req: Pick<http.IncomingMessage, "headers" | "socket">,
): boolean {
  if (isCloudProvisionedByEnv()) return false;`;

  if (!source.includes(anchor)) {
    throw new Error(
      "trusted-local-request isTrustedLocalRequest anchor drifted",
    );
  }

  const replacement = `export function isTrustedLocalRequest(
  req: Pick<http.IncomingMessage, "headers" | "socket">,
): boolean {
  // [milaidy:open-access] Staging-only escape hatch. When MILADY_OPEN_ACCESS=1
  // every request is treated as locally trusted; the cascade lets the SPA
  // boot into the chat shell without the pairing/login flow. Set ONLY on the
  // staging bot deploy where reviewer access is the goal — production must
  // never set this, since production relies on Cloudflare Access as the gate
  // and this bypass would render that gate moot.
  if (process.env.MILADY_OPEN_ACCESS === "1") return true;
  if (isCloudProvisionedByEnv()) return false;`;

  return source.replace(anchor, replacement);
}

export function applyAliceAppCoreOpenAccessPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const filePath = path.join(elizaRoot, appCoreTrustedLocalRequestRelativePath);
  if (!existsSync(filePath)) {
    log(
      "[alice-eliza-runtime-patches] app-core trusted-local-request source absent; skipping open-access patch",
    );
    return "skipped";
  }

  const before = readFileSync(filePath, "utf8");
  const after = patchAliceAppCoreOpenAccessSource(before);
  if (after === before) {
    log(
      "[alice-eliza-runtime-patches] app-core open-access patch already applied",
    );
    return "already-applied";
  }

  writeFileSync(filePath, after);
  log(
    "[alice-eliza-runtime-patches] patched app-core open-access (MILADY_OPEN_ACCESS env-gated)",
  );
  return "applied";
}

function patchAliceCoreBasicCapabilitiesBrowserSafeSource(source) {
  const safeMarker = '} from "../plugin-manager/security.ts";';
  if (source.includes(safeMarker)) {
    return source;
  }

  const anchor = `// Re-export plugin-manager security helpers (used by other plugins like
// plugin-app-control to gate owner/admin-only actions without taking a dep
// on @elizaos/agent, which would create a layer cycle).
export {
\tcreatePluginAction,
\thasAdminAccess,
\thasOwnerAccess,
\ttype PluginMode,
\tpluginAction,
\ttype SecurityDeps,
} from "../plugin-manager/index.ts";`;

  if (!source.includes(anchor)) {
    throw new Error(
      "core/features/basic-capabilities/index.ts plugin-manager re-export anchor drifted",
    );
  }

  // Re-route the re-export to the leaf source file so the browser bundle
  // never evaluates the plugin-manager barrel. The barrel statically pulls
  // PluginManagerService and pluginAction → plugin-handlers/create.ts which
  // does `import fs from "fs-extra"` at the top; fs-extra wraps graceful-fs,
  // graceful-fs reads `fs.realpath.native` at module init, and in a browser
  // where fs is stubbed empty that lookup throws TypeError synchronously,
  // killing SPA boot before React mounts.
  //
  // createPluginAction / pluginAction / PluginMode were never reachable from
  // a browser consumer (the only references were in the agent runtime barrel
  // features/index.ts which the browser entry never imports), so dropping
  // them here is a pure dead-export prune.
  const replacement = `// Re-export plugin-manager security helpers (used by other plugins like
// plugin-app-control to gate owner/admin-only actions without taking a dep
// on @elizaos/agent, which would create a layer cycle).
//
// Direct import from ../plugin-manager/security.ts (NOT the barrel) so the
// browser bundle never evaluates plugin-manager/index.ts, whose static
// imports drag PluginManagerService and pluginAction → plugin-handlers/
// create.ts → fs-extra → graceful-fs into the SPA. graceful-fs reads
// fs.realpath.native at module init; in a browser where fs is stubbed
// empty, that lookup throws TypeError and kills SPA boot before React
// mounts. createPluginAction / pluginAction / PluginMode are server-only
// and have no browser-reachable consumer; dropping them from this re-export
// is a pure dead-export prune.
export {
\thasAdminAccess,
\thasOwnerAccess,
\ttype SecurityDeps,
} from "../plugin-manager/security.ts";`;

  return source.replace(anchor, replacement);
}

export function applyAliceCoreBasicCapabilitiesBrowserSafePatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const filePath = path.join(elizaRoot, coreBasicCapabilitiesRelativePath);
  if (!existsSync(filePath)) {
    log(
      "[alice-eliza-runtime-patches] core basic-capabilities source absent; skipping browser-safe patch",
    );
    return "skipped";
  }

  const before = readFileSync(filePath, "utf8");
  const after = patchAliceCoreBasicCapabilitiesBrowserSafeSource(before);
  if (after === before) {
    log(
      "[alice-eliza-runtime-patches] core basic-capabilities browser-safe patch already applied",
    );
    return "already-applied";
  }

  writeFileSync(filePath, after);
  log(
    "[alice-eliza-runtime-patches] patched core basic-capabilities to bypass plugin-manager barrel for browser safety",
  );
  return "applied";
}

function patchAliceBundledKnowledgeStartupDeferralSource(source) {
  if (isAliceBundledKnowledgeStartupDeferralPatched(source)) {
    return source;
  }

  let next = source;

  const helperAnchor = `function trimEnvString(value: unknown): string | undefined {
`;
  const schedulerSource = `const BUNDLED_KNOWLEDGE_SEED_DELAY_MS = 30_000;

function scheduleBundledKnowledgeSeed(
  runtime: AgentRuntime,
  reason: string,
): void {
  if (!runtimeKnowledgeEnabled(runtime)) {
    logger.info(
      "[eliza] Native knowledge disabled; skipping bundled knowledge seeding",
    );
    return;
  }
  const enabledRaw =
    process.env.ALICE_ENABLE_BUNDLED_KNOWLEDGE_SEED ??
    process.env.ELIZA_ENABLE_BUNDLED_KNOWLEDGE_SEED ??
    "";
  if (!["1", "true", "yes"].includes(enabledRaw.trim().toLowerCase())) {
    logger.info(
      "[eliza] Native knowledge enabled; bundled knowledge seeding disabled by default during server startup",
    );
    return;
  }

  logger.info(
    \`[eliza] Bundled knowledge seeding scheduled after \${reason} delayMs=\${BUNDLED_KNOWLEDGE_SEED_DELAY_MS}\`,
  );
  setTimeout(() => {
    void seedBundledKnowledge(runtime).catch((err) => {
      logger.warn(
        \`[eliza] Failed to seed bundled knowledge: \${formatError(err)}\`,
      );
    });
  }, BUNDLED_KNOWLEDGE_SEED_DELAY_MS);
}

`;
  if (!next.includes("function scheduleBundledKnowledgeSeed(")) {
    if (!next.includes(helperAnchor)) {
      throw new Error("agent runtime helper anchor drifted");
    }
    next = next.replace(helperAnchor, `${schedulerSource}${helperAnchor}`);
  }

  const enableGuardAnchor = `  logger.info(
    \`[eliza] Bundled knowledge seeding scheduled after \${reason} delayMs=\${BUNDLED_KNOWLEDGE_SEED_DELAY_MS}\`,
  );
`;
  const enableGuardPatch = `  const enabledRaw =
    process.env.ALICE_ENABLE_BUNDLED_KNOWLEDGE_SEED ??
    process.env.ELIZA_ENABLE_BUNDLED_KNOWLEDGE_SEED ??
    "";
  if (!["1", "true", "yes"].includes(enabledRaw.trim().toLowerCase())) {
    logger.info(
      "[eliza] Native knowledge enabled; bundled knowledge seeding disabled by default during server startup",
    );
    return;
  }

${enableGuardAnchor}`;
  if (
    !next.includes(
      "bundled knowledge seeding disabled by default during server startup",
    )
  ) {
    if (!next.includes(enableGuardAnchor)) {
      throw new Error("agent runtime bundled knowledge schedule anchor drifted");
    }
    next = next.replace(enableGuardAnchor, enableGuardPatch);
  }

  const blockingSeedAnchor = `    try {
      if (runtimeKnowledgeEnabled(runtime)) {
        await seedBundledKnowledge(runtime);
      } else {
        logger.info(
          "[eliza] Native knowledge disabled; skipping bundled knowledge seeding",
        );
      }
    } catch (err) {
      logger.warn(
        \`[eliza] Failed to seed bundled knowledge: \${formatError(err)}\`,
      );
    }
`;
  const deferredSeedPatch = `    if (runtimeKnowledgeEnabled(runtime)) {
      logger.info(
        "[eliza] Native knowledge enabled; bundled knowledge seeding deferred until API server startup",
      );
    } else {
      logger.info(
        "[eliza] Native knowledge disabled; skipping bundled knowledge seeding",
      );
    }
`;
  if (next.includes(blockingSeedAnchor)) {
    next = next.replace(blockingSeedAnchor, deferredSeedPatch);
  }

  const apiListenAnchor = `    logger.info(\`[eliza] API server listening on \${dashboardUrl}\`);
`;
  const apiListenPatch = `    logger.info(\`[eliza] API server listening on \${dashboardUrl}\`);
    scheduleBundledKnowledgeSeed(runtime, "api-server-listen");
`;
  if (!next.includes('scheduleBundledKnowledgeSeed(runtime, "api-server-listen");')) {
    if (!next.includes(apiListenAnchor)) {
      throw new Error("agent runtime API listen anchor drifted");
    }
    next = next.replace(apiListenAnchor, apiListenPatch);
  }

  const headlessAnchor = `  if (opts?.headless) {
    void loadHooksSystem().catch((err) => {
      logger.warn(\`[eliza] Hooks system load failed: \${formatError(err)}\`);
    });
    logger.info(
      "[eliza] Runtime initialised in headless mode (autonomy enabled)",
    );
    return runtime;
  }
`;
  const headlessPatch = `  if (opts?.headless) {
    void loadHooksSystem().catch((err) => {
      logger.warn(\`[eliza] Hooks system load failed: \${formatError(err)}\`);
    });
    scheduleBundledKnowledgeSeed(runtime, "headless-runtime-init");
    logger.info(
      "[eliza] Runtime initialised in headless mode (autonomy enabled)",
    );
    return runtime;
  }
`;
  if (!next.includes('scheduleBundledKnowledgeSeed(runtime, "headless-runtime-init");')) {
    if (!next.includes(headlessAnchor)) {
      throw new Error("agent runtime headless return anchor drifted");
    }
    next = next.replace(headlessAnchor, headlessPatch);
  }

  if (!isAliceBundledKnowledgeStartupDeferralPatched(next)) {
    throw new Error(
      "agent runtime bundled knowledge deferral patch applied but contract is absent",
    );
  }
  return next;
}

export function applyAliceBundledKnowledgeStartupDeferralPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const runtimePath = path.join(elizaRoot, agentRuntimeRelativePath);
  if (!existsSync(runtimePath)) {
    log(
      "[alice-eliza-runtime-patches] agent runtime source absent; skipping bundled knowledge deferral",
    );
    return "skipped";
  }

  const before = readFileSync(runtimePath, "utf8");
  const after = patchAliceBundledKnowledgeStartupDeferralSource(before);
  if (after === before) {
    log(
      "[alice-eliza-runtime-patches] agent bundled knowledge startup deferral already applied",
    );
    return "already-applied";
  }

  writeFileSync(runtimePath, after);
  log(
    "[alice-eliza-runtime-patches] patched agent bundled knowledge startup deferral",
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
    applyAliceKubeHealthReadinessPatch({ elizaRoot, log }),
    applyAliceCoreBasicCapabilitiesBrowserSafePatch({ elizaRoot, log }),
    applyAliceAppCoreCodingAgentsFallbackPatch({ elizaRoot, log }),
    applyAliceAppCoreCompanionStagePatch({ elizaRoot, log }),
    applyAliceAppCoreOpenAccessPatch({ elizaRoot, log }),
    applyAliceBundledKnowledgeStartupDeferralPatch({ elizaRoot, log }),
    applyAliceTelegramAccountAuthResolverPatch({ elizaRoot, log }),
    applyAlicePgliteContainerLockPatch({ elizaRoot, log }),
    applyAliceLifeOpsCalendarActionPatch({ elizaRoot, log }),
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
