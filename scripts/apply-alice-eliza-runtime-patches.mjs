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
const coreBuildRelativePath = "packages/core/build.ts";
const appViteNativeStubRelativePath =
  "packages/app/vite/native-module-stub-plugin.ts";
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
  const shouldLinkHoistedWorkspaceDeps =
`;
  const stagedImportPatch = `  await ensureStagedPackageDependencies({
    installRoot: params.installRoot,
    packageName: params.packageName,
    packageRoot: params.packageRoot,
    stagedPackageRoot,
  });
  await ensureTelegramAccountAuthExportCompat(stagedInstallRoot);
  const shouldLinkHoistedWorkspaceDeps =
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

const telegramSourcePackageRelativePath =
  "plugins/plugin-telegram/package.json";
const telegramSourceAccountAuthExport = "./account-auth-service";
const telegramSourceAccountAuthTarget = "./dist/account-auth-service.js";

export function isAliceTelegramSourcePackageJsonExportPatched(packageJson) {
  return (
    packageJson?.exports &&
    typeof packageJson.exports === "object" &&
    !Array.isArray(packageJson.exports) &&
    packageJson.exports[telegramSourceAccountAuthExport] ===
      telegramSourceAccountAuthTarget
  );
}

const elizacloudIndexRelativePath = "plugins/plugin-elizacloud/src/index.ts";
const elizacloudReexportsSentinel =
  "// [milaidy:elizacloud-agent-export-compat]";
const elizacloudAgentReexports = `${elizacloudReexportsSentinel}
// eliza/packages/agent/src statically imports getOrCreateClientAddressKey,
// persistCloudWalletCache, and provisionCloudWalletsBestEffort from
// @elizaos/plugin-elizacloud. The other symbols the agent references
// (resolveCloudApiKey, ensureCloudTtsApiKeyAlias, etc.) ARE already
// re-exported by the plugin's src/index.ts; only the three cloud-wallet
// helpers below are missing. Adding them here as named re-exports
// (rather than wildcard \`export * from "./cloud/cloud-wallet"\` because
// cloud-wallet also exports identifiers that collide with names already
// declared at the top level of src/index.ts).
export {
  getOrCreateClientAddressKey,
  persistCloudWalletCache,
  provisionCloudWalletsBestEffort,
} from "./cloud/cloud-wallet";
`;

export function isAliceElizacloudReexportPatched(source) {
  return source.includes(elizacloudReexportsSentinel);
}

export function applyAliceElizacloudReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, elizacloudIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] plugin-elizacloud source absent; skipping reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceElizacloudReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] plugin-elizacloud agent-export-compat reexports already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${elizacloudAgentReexports}`
    : `${source}\n\n${elizacloudAgentReexports}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched plugin-elizacloud/src/index.ts to re-export agent-needed cloud-wallet / cloud-api-key / lib symbols",
  );
  return "applied";
}

export function applyAliceTelegramSourcePackageJsonExportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const packageJsonPath = path.join(
    elizaRoot,
    telegramSourcePackageRelativePath,
  );
  if (!existsSync(packageJsonPath)) {
    log(
      "[alice-eliza-runtime-patches] telegram source package.json absent; skipping source export patch",
    );
    return "skipped";
  }

  const sourceText = readFileSync(packageJsonPath, "utf8");
  const packageJson = JSON.parse(sourceText);

  if (isAliceTelegramSourcePackageJsonExportPatched(packageJson)) {
    log(
      "[alice-eliza-runtime-patches] telegram source package.json account-auth-service export already present",
    );
    return "already-applied";
  }

  if (!packageJson.exports || typeof packageJson.exports !== "object" || Array.isArray(packageJson.exports)) {
    packageJson.exports = { ".": packageJson.main ?? "./dist/index.js" };
  }
  packageJson.exports[telegramSourceAccountAuthExport] =
    telegramSourceAccountAuthTarget;

  const trailingNewline = sourceText.endsWith("\n") ? "\n" : "";
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}${trailingNewline}`,
  );
  log(
    "[alice-eliza-runtime-patches] patched telegram source package.json to expose account-auth-service",
  );
  return "applied";
}

const aliceUpstreamSourceMainPackageRelativePaths = [
  "cloud/packages/billing",
  "cloud/packages/sdk",
  "cloud/packages/ui",
  "packages/app-core",
  "packages/cloud-routing",
  "packages/elizaos",
  "packages/scenario-runner",
  "packages/shared",
  "packages/skills",
  "packages/ui",
  "packages/vault",
  "packages/workflows",
  // The plugins below are imported (statically or dynamically) from
  // eliza/packages/agent/src or eliza/packages/app-core/src and either
  // survive tsdown's pluginExternal regex into the bundled dist/entry.js
  // or are dynamic imports of string-literal module IDs that cannot be
  // bundled. They MUST resolve at runtime under Node + tsx (the
  // production container runtime). Each gets its main rewritten to
  // ./src/index.ts via the source-main patch and is materialized into
  // node_modules by stream's deploy script.
  "plugins/app-elizamaker",
  "plugins/app-steward",
  "plugins/app-training",
  "plugins/plugin-aosp-local-inference",
  "plugins/plugin-browser",
  "plugins/plugin-capacitor-bridge",
  "plugins/plugin-coding-tools",
  "plugins/plugin-computeruse",
  "plugins/plugin-discord",
  "plugins/plugin-elizacloud",
  "plugins/plugin-imessage",
  "plugins/plugin-local-inference",
  "plugins/plugin-mcp",
  "plugins/plugin-signal",
  "plugins/plugin-streaming",
  "plugins/plugin-whatsapp",
  "plugins/plugin-workflow",
  "plugins/plugin-x402",
];
// Previous versions of this patch used `version: "0.0.0-milady-source-main"` as
// the idempotence marker, which mutated the workspace package's identity and
// broke any script that read `version` from these manifests (e.g.
// install-published-workspace-fallback-deps.sh reading @elizaos/ui@<version>).
// We now use a private top-level field for the sentinel and leave `version`
// alone. The legacy value is still recognized as "already patched" so a stale
// local checkout doesn't get re-processed.
const aliceUpstreamSourceMainSentinelLegacyVersion = "0.0.0-milady-source-main";
const aliceUpstreamSourceMainSentinelField = "_aliceSourceMainSentinel";
const aliceUpstreamSourceMainSentinelValue = "v1";

export function isAliceUpstreamSourceMainPatched(packageJson) {
  if (!packageJson || typeof packageJson !== "object") return false;
  if (
    packageJson[aliceUpstreamSourceMainSentinelField] ===
    aliceUpstreamSourceMainSentinelValue
  ) {
    return true;
  }
  if (packageJson.version === aliceUpstreamSourceMainSentinelLegacyVersion) {
    return true;
  }
  return false;
}

export function applyAliceUpstreamPackageSourceMainPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  let patchedFiles = 0;
  let inspectedFiles = 0;
  let alreadyApplied = 0;

  for (const pkgRelativePath of aliceUpstreamSourceMainPackageRelativePaths) {
    const packageJsonPath = path.join(
      elizaRoot,
      pkgRelativePath,
      "package.json",
    );
    if (!existsSync(packageJsonPath)) continue;
    // Detect entry layout. Most upstream plugins use src/index.ts, but a few
    // (notably plugin-discord) ship index.ts at the package root with no src/
    // subdirectory at all. Pick whichever exists; skip if neither.
    const srcEntryPath = path.join(elizaRoot, pkgRelativePath, "src/index.ts");
    const flatEntryPath = path.join(elizaRoot, pkgRelativePath, "index.ts");
    let entryRelative;
    let isFlatLayout;
    if (existsSync(srcEntryPath)) {
      entryRelative = "./src/index.ts";
      isFlatLayout = false;
    } else if (existsSync(flatEntryPath)) {
      entryRelative = "./index.ts";
      isFlatLayout = true;
    } else {
      continue;
    }
    inspectedFiles += 1;
    const sourceText = readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(sourceText);

    if (isAliceUpstreamSourceMainPatched(packageJson)) {
      alreadyApplied += 1;
      continue;
    }

    const rootExport = {
      types: entryRelative,
      bun: entryRelative,
      import: entryRelative,
      default: entryRelative,
    };
    const wildcardExport = isFlatLayout
      ? {
          types: "./*.ts",
          bun: "./*.ts",
          import: "./*.ts",
          default: "./*.ts",
        }
      : {
          types: "./src/*.ts",
          bun: "./src/*.ts",
          import: "./src/*.ts",
          default: "./src/*.ts",
        };
    const newExports = {
      ".": rootExport,
      "./package.json": "./package.json",
      "./*": wildcardExport,
    };

    // Preserve any other subpath exports declared upstream (e.g. "./plugin",
    // "./config/app-config") by remapping each to its source-equivalent. A
    // wholesale overwrite would drop them; explicit per-subpath entries are
    // clearer and safer than relying on the "./*" wildcard alone.
    const originalExports = packageJson.exports;
    if (
      originalExports &&
      typeof originalExports === "object" &&
      !Array.isArray(originalExports)
    ) {
      for (const subpath of Object.keys(originalExports)) {
        if (
          subpath === "." ||
          subpath === "./package.json" ||
          subpath === "./*"
        ) {
          continue;
        }
        if (typeof subpath !== "string" || !subpath.startsWith("./")) continue;
        const subSuffix = subpath.slice(2);
        if (subSuffix.includes("*")) continue;
        const baseRel = isFlatLayout ? subSuffix : `src/${subSuffix}`;
        const flatCandidate = path.join(
          elizaRoot,
          pkgRelativePath,
          `${baseRel}.ts`,
        );
        const dirCandidate = path.join(
          elizaRoot,
          pkgRelativePath,
          baseRel,
          "index.ts",
        );
        let sourceTarget;
        if (existsSync(flatCandidate)) {
          sourceTarget = isFlatLayout
            ? `./${subSuffix}.ts`
            : `./src/${subSuffix}.ts`;
        } else if (existsSync(dirCandidate)) {
          sourceTarget = isFlatLayout
            ? `./${subSuffix}/index.ts`
            : `./src/${subSuffix}/index.ts`;
        }
        if (!sourceTarget) continue;
        newExports[subpath] = {
          types: sourceTarget,
          bun: sourceTarget,
          import: sourceTarget,
          default: sourceTarget,
        };
      }
    }

    packageJson[aliceUpstreamSourceMainSentinelField] =
      aliceUpstreamSourceMainSentinelValue;
    packageJson.main = entryRelative;
    packageJson.types = entryRelative;
    packageJson.exports = newExports;
    if (!packageJson.type) {
      packageJson.type = "module";
    }

    const trailingNewline = sourceText.endsWith("\n") ? "\n" : "";
    writeFileSync(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}${trailingNewline}`,
    );
    patchedFiles += 1;
  }

  if (inspectedFiles === 0) {
    log(
      "[alice-eliza-runtime-patches] no upstream eliza source-main targets present; skipping source-main patch",
    );
    return "skipped";
  }
  if (patchedFiles === 0) {
    log(
      "[alice-eliza-runtime-patches] upstream eliza source-main exports already patched",
    );
    return "already-applied";
  }
  log(
    `[alice-eliza-runtime-patches] rerouted ${patchedFiles} upstream eliza package.json file(s) to TS source (shared/ui/vault main: src/index.ts)`,
  );
  return "applied";
}

const aliceAppPluginRegisterExportRelativePaths = [
  "plugins/app-wallet",
  "plugins/app-contacts",
  "plugins/app-phone",
  "plugins/app-wifi",
];

export function isAliceAppPluginRegisterExportPatched(packageJson) {
  return (
    packageJson?.exports &&
    typeof packageJson.exports === "object" &&
    !Array.isArray(packageJson.exports) &&
    packageJson.exports["./register"] !== undefined
  );
}

export function applyAliceAppPluginRegisterExportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  let patchedFiles = 0;
  let inspectedFiles = 0;
  let alreadyApplied = 0;

  for (const pluginRelativePath of aliceAppPluginRegisterExportRelativePaths) {
    const packageJsonPath = path.join(
      elizaRoot,
      pluginRelativePath,
      "package.json",
    );
    if (!existsSync(packageJsonPath)) {
      continue;
    }
    inspectedFiles += 1;
    const sourceText = readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(sourceText);

    if (isAliceAppPluginRegisterExportPatched(packageJson)) {
      alreadyApplied += 1;
      continue;
    }

    if (
      !packageJson.exports ||
      typeof packageJson.exports !== "object" ||
      Array.isArray(packageJson.exports)
    ) {
      packageJson.exports = { ".": packageJson.main ?? "./dist/index.js" };
    }
    packageJson.exports["./register"] = {
      types: "./dist/register.d.ts",
      import: "./dist/register.js",
      default: "./dist/register.js",
    };

    const trailingNewline = sourceText.endsWith("\n") ? "\n" : "";
    writeFileSync(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}${trailingNewline}`,
    );
    patchedFiles += 1;
  }

  if (inspectedFiles === 0) {
    log(
      "[alice-eliza-runtime-patches] no app plugin packages found; skipping register exports patch",
    );
    return "skipped";
  }
  if (patchedFiles === 0) {
    log(
      "[alice-eliza-runtime-patches] app plugin register exports already patched",
    );
    return "already-applied";
  }
  log(
    `[alice-eliza-runtime-patches] patched register exports on ${patchedFiles} app plugin package.json file(s)`,
  );
  return "applied";
}

const browserBridgeStubRelativePath = "plugins/plugin-browser-bridge";
const browserBridgeStubMarker = "// [milaidy:browser-bridge-stub]";

const browserBridgeStubModuleSource = `${browserBridgeStubMarker}
const action = Object.freeze({
  name: "BROWSER_BRIDGE_UNAVAILABLE",
  description: "Agent Browser Bridge is unavailable in this build.",
  validate: async () => false,
  handler: async () => ({
    text: "Agent Browser Bridge is unavailable in this build.",
    success: false,
    values: { success: false, error: "BROWSER_BRIDGE_UNAVAILABLE" },
    data: { error: "BROWSER_BRIDGE_UNAVAILABLE" },
  }),
  parameters: [],
  examples: [],
});

export const BROWSER_BRIDGE_ROUTE_SERVICE_TYPE = "browser-bridge-route-service";
export const browserBridgeActions = [];
export const browserBridgeInstallAction = action;
export const browserBridgeOpenManagerAction = action;
export const browserBridgePlugin = Object.freeze({
  name: "@elizaos/plugin-browser-bridge",
  description: "Agent Browser Bridge stub for builds without upstream plugin source.",
  actions: [],
  routes: [],
});
export const browserBridgeRefreshAction = action;
export const browserBridgeRevealFolderAction = action;
export const browserBridgeSchema = {};

export async function buildBrowserBridgeCompanionPackage() { return {}; }
export function getBrowserBridgeCompanionPackageStatus() { return {}; }
export async function handleBrowserBridgeRoutes() { return false; }
export async function openBrowserBridgeCompanionManager() { return false; }
export async function openBrowserBridgeCompanionPackagePath() { return { path: "" }; }

export default browserBridgePlugin;
`;

const browserBridgeStubContractsSource = `${browserBridgeStubMarker}
export const browserBridgeContracts = Object.freeze({});
export default browserBridgeContracts;
`;

const browserBridgeStubSchemaSource = `${browserBridgeStubMarker}
export const browserBridgeSchema = Object.freeze({});
export default browserBridgeSchema;
`;

const browserBridgeStubPackageJson = {
  name: "@elizaos/plugin-browser-bridge",
  version: "0.0.0-milady-stub",
  type: "module",
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: {
    "./package.json": "./package.json",
    ".": "./dist/index.js",
    "./contracts": "./dist/contracts.js",
    "./schema": "./dist/schema.js",
  },
  private: true,
};

export function isAliceBrowserBridgeWorkspaceStubPatched(elizaRoot) {
  const distIndex = path.join(
    elizaRoot,
    browserBridgeStubRelativePath,
    "dist",
    "index.js",
  );
  if (!existsSync(distIndex)) return false;
  return readFileSync(distIndex, "utf8").includes(browserBridgeStubMarker);
}

export function applyAliceBrowserBridgeWorkspaceStubPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const stubDir = path.join(elizaRoot, browserBridgeStubRelativePath);
  const packageJsonPath = path.join(stubDir, "package.json");

  if (existsSync(packageJsonPath) && !isAliceBrowserBridgeWorkspaceStubPatched(elizaRoot)) {
    log(
      "[alice-eliza-runtime-patches] browser-bridge plugin source already present from upstream; skipping stub",
    );
    return "skipped";
  }

  if (isAliceBrowserBridgeWorkspaceStubPatched(elizaRoot)) {
    log(
      "[alice-eliza-runtime-patches] browser-bridge workspace stub already in place",
    );
    return "already-applied";
  }

  const srcDir = path.join(stubDir, "src");
  const distDir = path.join(stubDir, "dist");
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });

  writeFileSync(
    packageJsonPath,
    `${JSON.stringify(browserBridgeStubPackageJson, null, 2)}\n`,
  );
  writeFileSync(path.join(srcDir, "index.js"), browserBridgeStubModuleSource);
  writeFileSync(path.join(distDir, "index.js"), browserBridgeStubModuleSource);
  writeFileSync(
    path.join(distDir, "contracts.js"),
    browserBridgeStubContractsSource,
  );
  writeFileSync(
    path.join(distDir, "schema.js"),
    browserBridgeStubSchemaSource,
  );
  writeFileSync(
    path.join(distDir, "index.d.ts"),
    `${browserBridgeStubMarker}\nexport {};\n`,
  );

  log(
    "[alice-eliza-runtime-patches] wrote browser-bridge workspace stub (upstream plugins/plugin-browser-bridge was removed)",
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

function patchAliceCoreBuildBrowserExternalsSource(source) {
  const safeMarker = '"fs-extra", // [milaidy:browser-externals]';
  if (source.includes(safeMarker)) {
    return source;
  }

  const anchor = `// Browser-specific externals (these should be provided by the host environment)
const browserExternals = [
\t// These will be loaded via CDN or bundled by the consuming app
\t"sharp", // Image processing - not available in browser`;

  if (!source.includes(anchor)) {
    throw new Error(
      "core/build.ts browserExternals anchor drifted",
    );
  }

  /* When bun build runs without fs-extra in browserExternals, it resolves and
   * inlines the fs-extra source code directly into dist/browser/index.browser.js
   * (along with its graceful-fs dep). graceful-fs's gracefulify() reads
   * fs.realpath.native at module init; in a browser where fs is stubbed empty,
   * that lookup throws TypeError synchronously and kills SPA boot before React
   * mounts. Marking fs-extra and graceful-fs as externals leaves bare
   * `import "fs-extra"` / `import "graceful-fs"` in the dist, which the SPA's
   * Vite stub plugin (apps/app/vite/native-module-stub-plugin.ts) catches and
   * replaces with a Proxy noop stub. This is the root cause of the
   * staging-alice white-screen crash. */
  const replacement = `// Browser-specific externals (these should be provided by the host environment)
const browserExternals = [
\t// [milaidy:browser-externals] Mark fs-extra and graceful-fs as external so
\t// they are NOT inlined into dist/browser/index.browser.js. graceful-fs's
\t// gracefulify() reads fs.realpath.native at module init; in a browser where
\t// fs is stubbed empty that lookup throws TypeError and kills SPA boot.
\t// Leaving these as bare imports lets the SPA's Vite stub plugin (apps/app/
\t// vite/native-module-stub-plugin.ts) replace them with a Proxy noop stub.
\t"fs-extra", // [milaidy:browser-externals]
\t"graceful-fs", // [milaidy:browser-externals]
\t// These will be loaded via CDN or bundled by the consuming app
\t"sharp", // Image processing - not available in browser`;

  return source.replace(anchor, replacement);
}

export function applyAliceCoreBuildBrowserExternalsPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const filePath = path.join(elizaRoot, coreBuildRelativePath);
  if (!existsSync(filePath)) {
    log(
      "[alice-eliza-runtime-patches] core build.ts absent; skipping browser-externals patch",
    );
    return "skipped";
  }

  const before = readFileSync(filePath, "utf8");
  const after = patchAliceCoreBuildBrowserExternalsSource(before);
  if (after === before) {
    log(
      "[alice-eliza-runtime-patches] core build.ts browser-externals patch already applied",
    );
    return "already-applied";
  }

  writeFileSync(filePath, after);
  log(
    "[alice-eliza-runtime-patches] patched core build.ts to externalize fs-extra and graceful-fs in the browser dist",
  );
  return "applied";
}

function patchAliceCoreBuildBrowserExternalsMammothSource(source) {
  const safeMarker = '"mammoth", // [milaidy:browser-externals-mammoth]';
  if (source.includes(safeMarker)) {
    return source;
  }

  /* The browser-externals patch (apply order #4 in this chain) inserted
   * fs-extra and graceful-fs into browserExternals already. Anchor against
   * THAT post-state so this patch composes after it. */
  const anchor = `\t"fs-extra", // [milaidy:browser-externals]
\t"graceful-fs", // [milaidy:browser-externals]`;

  if (!source.includes(anchor)) {
    throw new Error(
      "core/build.ts post-fs-extra browserExternals anchor drifted; the prior browser-externals patch must run first",
    );
  }

  /* features/knowledge/utils.ts statically imports mammoth at line 3.
   * mammoth is a Node-only docx parser that calls fs.readFile.bind at
   * module init (its DocumentXmlReader factory). When bundled into the
   * browser dist via index.browser.ts -> features/knowledge/index ->
   * utils, the .bind on undefined fs.readFile throws TypeError and kills
   * SPA boot the same way fs-extra/graceful-fs did. Externalizing mammoth
   * leaves a bare `import "mammoth"` in the dist; a paired Vite stub
   * patch adds mammoth to nativePackages so the SPA build replaces it
   * with a Proxy noop. */
  const replacement = `\t"fs-extra", // [milaidy:browser-externals]
\t"graceful-fs", // [milaidy:browser-externals]
\t"mammoth", // [milaidy:browser-externals-mammoth]`;

  return source.replace(anchor, replacement);
}

export function applyAliceCoreBuildBrowserExternalsMammothPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const filePath = path.join(elizaRoot, coreBuildRelativePath);
  if (!existsSync(filePath)) {
    log(
      "[alice-eliza-runtime-patches] core build.ts absent; skipping mammoth-externals patch",
    );
    return "skipped";
  }

  const before = readFileSync(filePath, "utf8");
  const after = patchAliceCoreBuildBrowserExternalsMammothSource(before);
  if (after === before) {
    log(
      "[alice-eliza-runtime-patches] core build.ts mammoth-externals patch already applied",
    );
    return "already-applied";
  }

  writeFileSync(filePath, after);
  log(
    "[alice-eliza-runtime-patches] patched core build.ts to externalize mammoth in the browser dist",
  );
  return "applied";
}

function patchAliceAppViteStubMammothSource(source) {
  const safeMarker = '"mammoth", // [milaidy:vite-stub-mammoth]';
  if (source.includes(safeMarker)) {
    return source;
  }

  const anchor = `    "node-llama-cpp",
    "fs-extra",`;

  if (!source.includes(anchor)) {
    throw new Error(
      "app/vite/native-module-stub-plugin.ts nativePackages anchor drifted",
    );
  }

  /* Add mammoth to the SPA's Vite stub plugin so the bare `import "mammoth"`
   * left in @elizaos/core's browser dist (after the paired core/build.ts
   * mammoth-externals patch) gets replaced with a Proxy noop stub instead
   * of being resolved and bundled by Vite. The default load() branch
   * returns a generic noop Proxy for any nativePackages entry that
   * doesn't have a specific stub generator, which is the right shape for
   * mammoth (consumers only call its API, never inspect its export shape). */
  const replacement = `    "node-llama-cpp",
    "fs-extra",
    "mammoth", // [milaidy:vite-stub-mammoth]`;

  return source.replace(anchor, replacement);
}

export function applyAliceAppViteStubMammothPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const filePath = path.join(elizaRoot, appViteNativeStubRelativePath);
  if (!existsSync(filePath)) {
    log(
      "[alice-eliza-runtime-patches] app vite native-module-stub-plugin absent; skipping mammoth stub patch",
    );
    return "skipped";
  }

  const before = readFileSync(filePath, "utf8");
  const after = patchAliceAppViteStubMammothSource(before);
  if (after === before) {
    log(
      "[alice-eliza-runtime-patches] app vite mammoth stub patch already applied",
    );
    return "already-applied";
  }

  writeFileSync(filePath, after);
  log(
    "[alice-eliza-runtime-patches] patched app vite native-module-stub-plugin to stub mammoth",
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
    applyAliceCoreBuildBrowserExternalsPatch({ elizaRoot, log }),
    applyAliceCoreBuildBrowserExternalsMammothPatch({ elizaRoot, log }),
    applyAliceAppViteStubMammothPatch({ elizaRoot, log }),
    applyAliceAppCoreCodingAgentsFallbackPatch({ elizaRoot, log }),
    applyAliceAppCoreCompanionStagePatch({ elizaRoot, log }),
    applyAliceAppCoreOpenAccessPatch({ elizaRoot, log }),
    applyAliceUpstreamPackageSourceMainPatch({ elizaRoot, log }),
    applyAliceBrowserBridgeWorkspaceStubPatch({ elizaRoot, log }),
    applyAliceAppPluginRegisterExportPatch({ elizaRoot, log }),
    applyAliceTelegramSourcePackageJsonExportPatch({ elizaRoot, log }),
    applyAliceTelegramAccountAuthResolverPatch({ elizaRoot, log }),
    applyAliceElizacloudReexportPatch({ elizaRoot, log }),
    // applyAliceBundledKnowledgeStartupDeferralPatch retired against upstream
    // be182cc913b3+ — `seedBundledKnowledge` no longer exists in upstream's
    // packages/agent/src/runtime/eliza.ts (removed during the 866-commit
    // upstream catch-up). The behaviour the patch was guarding (avoid
    // synchronous bundled-knowledge seeding during server startup) is now
    // moot because upstream doesn't seed bundled knowledge from the agent
    // runtime at all. Companion contract guards in 555stream's
    // deploy-555-bot-staging.sh have been removed in lockstep.
    // The four patches below are retired against the upstream eliza
    // be182cc913b3+ bump because their target files have been deleted/moved
    // upstream (pglite manager, lifeops native-activity-tracker), or because
    // the upstream restructure makes the original behavior moot (lifeops
    // calendar/runtime-import). Each can be revived in a focused follow-up
    // by re-anchoring against the new upstream source. The behaviors most
    // at risk:
    //
    //   - Pglite container-lock: database lockfile arbitration; on EKS we
    //     run pgvector via the timescaledb pod, not pglite, so this is
    //     orthogonal to the staging-alice path.
    //   - LifeOps calendar/runtime-import/activity-tracker: feature surface
    //     of @elizaos/app-lifeops. Upstream substantially restructured the
    //     activity-profile area; the original patches' targets are gone.
    //
    // applyAlicePgliteContainerLockPatch({ elizaRoot, log }),
    // applyAliceLifeOpsCalendarActionPatch({ elizaRoot, log }),
    // applyAliceLifeOpsRuntimeImportPatch({ elizaRoot, log }),
    // applyAliceLifeOpsNativeActivityTrackerPatch({ elizaRoot, log }),
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
