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
export const aliceCompanionOperatorPatchRelativePath =
  "scripts/alice-eliza-runtime-patches/alice-companion-operator.patch";

const runtimeRelativePath = "packages/app-core/src/runtime/eliza.ts";
const appCoreApiServerRelativePath = "packages/app-core/src/api/server.ts";
const appCoreApiAuthRelativePath = "packages/app-core/src/api/auth.ts";
const appCoreCompatStateRelativePath =
  "packages/app-core/src/api/compat-route-shared.ts";
const appCoreKubeHealthRelativePath =
  "packages/app-core/src/api/kube-health.ts";
const appCoreAgentStatusAuthBridgeRelativePath =
  "packages/app-core/src/api/agent-status-auth-bridge.ts";
const appCoreUpstreamAuthBridgeRelativePath =
  "packages/app-core/src/api/server-upstream-auth-bridge.ts";
const appCoreDashboardFallbackRoutesRelativePath =
  "packages/app-core/src/api/dashboard-fallback-routes.ts";
const appCoreRuntimeErrorHandlersRelativePath =
  "packages/app-core/src/runtime/error-handlers.ts";
const appCoreRuntimeDevServerRelativePath =
  "packages/app-core/src/runtime/dev-server.ts";
const appCoreCliRunMainRelativePath = "packages/app-core/src/cli/run-main.ts";
const appCoreTrustedLocalRequestRelativePath =
  "packages/app-core/src/api/trusted-local-request.ts";
const coreBasicCapabilitiesRelativePath =
  "packages/core/src/features/basic-capabilities/index.ts";
const coreBuildRelativePath = "packages/core/build.ts";
const appViteNativeStubRelativePath =
  "packages/app/vite/native-module-stub-plugin.ts";
const uiAppRelativePath = "packages/ui/src/App.tsx";
const uiHooksIndexRelativePath = "packages/ui/src/hooks/index.ts";
const uiStartupShellRelativePath =
  "packages/ui/src/components/shell/StartupShell.tsx";
const uiStartupPhasePollRelativePath =
  "packages/ui/src/state/startup-phase-poll.ts";
const uiStartupPhaseRuntimeRelativePath =
  "packages/ui/src/state/startup-phase-runtime.ts";
const uiOnboardingBootstrapRelativePath =
  "packages/ui/src/state/onboarding-bootstrap.ts";
const uiAppShellStateRelativePath = "packages/ui/src/state/useAppShellState.ts";
const uiClientAgentRelativePath = "packages/ui/src/api/client-agent.ts";
const appVincentStateRelativePath =
  "plugins/app-vincent/src/useVincentState.ts";
const agentRuntimeRelativePath = "packages/agent/src/runtime/eliza.ts";
const agentPluginResolverRelativePath =
  "packages/agent/src/runtime/plugin-resolver.ts";
const pluginSqlSchemaIndexRelativePath =
  "plugins/plugin-sql/src/schema/index.ts";
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

const agentStatusAuthBridgeSource = `import crypto from "node:crypto";
import type http from "node:http";
import { isAuthorized as isAgentApiAuthorized } from "@miladyai/agent/api/server";
import {
  ensureRouteAuthorized,
  getCompatApiToken,
  getProvidedApiToken,
} from "./auth.ts";
import type { CompatRuntimeState } from "./compat-route-shared";

const UPSTREAM_SESSION_AUTH_BRIDGE_PREFIXES = [
  "/api/agent/autonomy",
  "/api/agent/events",
  "/api/agents",
  "/api/alice",
  "/api/apps",
  "/api/browser-workspace",
  "/api/broadcast",
  "/api/catalog",
  "/api/cloud",
  "/api/coding-agents",
  "/api/companion",
  "/api/connectors",
  "/api/conversations",
  "/api/inbox",
  "/api/lifeops",
  "/api/logs",
  "/api/onboarding",
  "/api/plugins",
  "/api/security/audit",
  "/api/status",
  "/api/stream",
  "/api/streaming",
  "/api/triggers",
  "/api/wallet",
  "/v1",
] as const;

function tokenMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function shouldBridgeAgentFallbackAuth(method: string, pathname: string): boolean {
  if (UPSTREAM_SESSION_AUTH_BRIDGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(\`\${prefix}/\`))) {
    return true;
  }

  if (method === "GET" && pathname === "/api/status") return true;

  if (pathname === "/api/apps/favorites") {
    return method === "GET" || method === "PUT";
  }
  if (
    method === "POST" &&
    (pathname === "/api/apps/favorites/replace" ||
      pathname === "/api/apps/overlay-presence")
  ) {
    return true;
  }
  if (
    method === "GET" &&
    (pathname === "/api/apps/search" ||
      pathname === "/api/apps/installed" ||
      pathname === "/api/apps/runs" ||
      pathname.startsWith("/api/apps/hero/"))
  ) {
    return true;
  }
  if (pathname.startsWith("/api/apps/runs/")) return true;

  if (pathname.startsWith("/api/vincent/")) return true;

  if (
    pathname === "/api/computer-use/approvals" ||
    pathname === "/api/computer-use/approvals/stream"
  ) {
    return method === "GET";
  }
  if (pathname === "/api/computer-use/approval-mode") {
    return method === "POST";
  }
  if (method === "POST" && /^\\/api\\/computer-use\\/approvals\\/[^/]+$/.test(pathname)) {
    return true;
  }

  return false;
}

export async function authorizeAgentStatusFallback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (!shouldBridgeAgentFallbackAuth(method, pathname)) return true;

  const token = getCompatApiToken();
  const provided = getProvidedApiToken(req);
  if (token && provided && tokenMatches(token, provided)) return true;

  if (isAgentApiAuthorized(req)) return true;

  if (!(await ensureRouteAuthorized(req, res, state))) return false;

  return true;
}
`;

const aliceUpstreamAuthBridgePrefixes = [
  "/api/agent/autonomy",
  "/api/agent/events",
  "/api/agents",
  "/api/alice",
  "/api/apps",
  "/api/browser-workspace",
  "/api/broadcast",
  "/api/catalog",
  "/api/cloud",
  "/api/coding-agents",
  "/api/companion",
  "/api/computer-use",
  "/api/connectors",
  "/api/conversations",
  "/api/inbox",
  "/api/lifeops",
  "/api/logs",
  "/api/onboarding",
  "/api/plugins",
  "/api/security/audit",
  "/api/status",
  "/api/stream",
  "/api/streaming",
  "/api/triggers",
  "/api/vincent",
  "/api/wallet",
  "/v1",
];

const appCoreUpstreamAuthBridgeSource = `import crypto from "node:crypto";
import type http from "node:http";
import { resolveApiToken } from "@elizaos/shared";
import { ensureRouteAuthorized, getProvidedApiToken } from "./auth";
import type { CompatRuntimeState } from "./compat-route-shared";

const UPSTREAM_SESSION_AUTH_BRIDGE_PREFIXES = [
${aliceUpstreamAuthBridgePrefixes.map((prefix) => `  "${prefix}",`).join("\n")}
] as const;

function tokenMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function shouldBridgeSessionAuthToUpstream(
  method: string | undefined,
  pathname: string,
): boolean {
  if ((method ?? "GET").toUpperCase() === "OPTIONS") return false;
  return UPSTREAM_SESSION_AUTH_BRIDGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(\`\${prefix}/\`),
  );
}

export async function bridgeSessionAuthToUpstream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
  pathname: string,
): Promise<boolean> {
  if (!shouldBridgeSessionAuthToUpstream(req.method, pathname)) return true;

  const upstreamToken = resolveApiToken(process.env);
  if (!upstreamToken) return true;

  const provided = getProvidedApiToken(req);
  if (provided && tokenMatches(upstreamToken, provided)) return true;

  if (!(await ensureRouteAuthorized(req, res, state))) {
    return false;
  }

  req.headers.authorization = \`Bearer \${upstreamToken}\`;
  req.headers["x-api-key"] = upstreamToken;
  return true;
}
`;

const dashboardFallbackRoutesSource = `import type http from "node:http";
import { loadElizaConfig, saveElizaConfig } from "@elizaos/agent";
import { ensureRouteAuthorized } from "./auth.ts";
import {
  readCompatJsonBody,
  type CompatRuntimeState,
} from "./compat-route-shared";
import {
  sendJsonError as sendJsonErrorResponse,
  sendJson as sendJsonResponse,
} from "./response";

const EMPTY_APPROVAL_SNAPSHOT = {
  mode: "full_control",
  pendingCount: 0,
  pendingApprovals: [],
} as const;

function sanitizeFavoriteApps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const apps: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    apps.push(trimmed);
  }
  return apps;
}

function readFavoriteApps(): string[] {
  const config = loadElizaConfig();
  const ui = (config.ui ?? {}) as Record<string, unknown>;
  return sanitizeFavoriteApps(ui.favoriteApps);
}

function writeFavoriteApps(apps: string[]): string[] {
  const config = loadElizaConfig();
  const ui = (config.ui ?? {}) as Record<string, unknown>;
  const sanitized = sanitizeFavoriteApps(apps);
  ui.favoriteApps = sanitized;
  config.ui = ui as typeof config.ui;
  saveElizaConfig(config);
  return sanitized;
}

type RuntimeRouteLike = {
  type?: string;
  path?: string;
};

function routePathMatches(routePath: string, pathname: string): boolean {
  if (routePath === pathname) return true;
  const routeParts = routePath.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (routeParts.length !== pathParts.length) return false;
  return routeParts.every((part, index) => {
    if (part.startsWith(":")) return true;
    return part === pathParts[index];
  });
}

function runtimeHasRoute(
  state: CompatRuntimeState,
  method: string,
  pathname: string,
): boolean {
  const routes = (state.current as { routes?: unknown } | null)?.routes;
  if (!Array.isArray(routes)) return false;
  return routes.some((candidate) => {
    const route = candidate as RuntimeRouteLike;
    if (typeof route.path !== "string") return false;
    const routeMethod = String(route.type ?? "GET").toUpperCase();
    return routeMethod === method && routePathMatches(route.path, pathname);
  });
}

async function handleFavoriteAppsRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  state: CompatRuntimeState,
): Promise<boolean> {
  if (!(await ensureRouteAuthorized(req, res, state))) return true;

  if (method === "GET") {
    sendJsonResponse(res, 200, { favoriteApps: readFavoriteApps() });
    return true;
  }

  if (method === "PUT") {
    const body = await readCompatJsonBody(req, res);
    if (!body) return true;
    const appName = typeof body.appName === "string" ? body.appName.trim() : "";
    const isFavorite = body.isFavorite === true;
    if (!appName || typeof body.isFavorite !== "boolean") {
      sendJsonErrorResponse(res, 400, "appName and isFavorite are required");
      return true;
    }
    const current = readFavoriteApps().filter((entry) => entry !== appName);
    const next = isFavorite ? [...current, appName] : current;
    sendJsonResponse(res, 200, { favoriteApps: writeFavoriteApps(next) });
    return true;
  }

  return false;
}

async function handleReplaceFavoritesRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): Promise<boolean> {
  if (!(await ensureRouteAuthorized(req, res, state))) return true;
  const body = await readCompatJsonBody(req, res);
  if (!body) return true;
  const favoriteAppNames = sanitizeFavoriteApps(body.favoriteAppNames);
  sendJsonResponse(res, 200, {
    favoriteApps: writeFavoriteApps(favoriteAppNames),
  });
  return true;
}

async function handleOverlayPresenceRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): Promise<boolean> {
  if (!(await ensureRouteAuthorized(req, res, state))) return true;
  const body = await readCompatJsonBody(req, res);
  if (!body) return true;
  const rawAppName = body.appName;
  if (rawAppName !== null && rawAppName !== undefined && typeof rawAppName !== "string") {
    sendJsonErrorResponse(res, 400, "appName must be a string or null");
    return true;
  }
  const appName =
    typeof rawAppName === "string" && rawAppName.trim()
      ? rawAppName.trim()
      : null;
  sendJsonResponse(res, 200, { ok: true, appName });
  return true;
}

async function handleComputerUseFallbackRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  pathname: string,
  state: CompatRuntimeState,
): Promise<boolean> {
  if (runtimeHasRoute(state, method, pathname)) return false;
  if (!(await ensureRouteAuthorized(req, res, state))) return true;

  if (method === "GET" && pathname === "/api/computer-use/approvals") {
    sendJsonResponse(res, 200, EMPTY_APPROVAL_SNAPSHOT);
    return true;
  }

  if (method === "GET" && pathname === "/api/computer-use/approvals/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(
      \`data: \${JSON.stringify({ type: "snapshot", snapshot: EMPTY_APPROVAL_SNAPSHOT })}\\n\\n\`,
    );
    res.end();
    return true;
  }

  if (method === "POST" && pathname === "/api/computer-use/approval-mode") {
    sendJsonResponse(res, 200, { mode: EMPTY_APPROVAL_SNAPSHOT.mode });
    return true;
  }

  if (method === "POST" && /^\\/api\\/computer-use\\/approvals\\/[^/]+$/.test(pathname)) {
    sendJsonErrorResponse(res, 404, "Computer-use approval is not pending.");
    return true;
  }

  return false;
}

export async function handleAliceDashboardFallbackRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

  if (pathname === "/api/apps/favorites") {
    return handleFavoriteAppsRoute(req, res, method, state);
  }

  if (method === "POST" && pathname === "/api/apps/favorites/replace") {
    return handleReplaceFavoritesRoute(req, res, state);
  }

  if (method === "POST" && pathname === "/api/apps/overlay-presence") {
    return handleOverlayPresenceRoute(req, res, state);
  }

  if (method === "GET" && pathname === "/api/vincent/status") {
    if (runtimeHasRoute(state, method, pathname)) return false;
    if (!(await ensureRouteAuthorized(req, res, state))) return true;
    sendJsonResponse(res, 200, { connected: false, connectedAt: null });
    return true;
  }

  if (pathname.startsWith("/api/computer-use/")) {
    return handleComputerUseFallbackRoute(req, res, method, pathname, state);
  }

  return false;
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
    source.match(
      /if \(options\?\.serverOnly\) \{[\s\S]*?const keepAlive/m,
    )?.[0] ?? "";
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
    serverSource.match(
      /server\.updateRuntime = \(runtime:[\s\S]*?\n {4}\};/,
    )?.[0] ?? "";
  const updateStartupBlock =
    serverSource.match(
      /server\.updateStartup = \(update\) => \{[\s\S]*?\n {4}\};/,
    )?.[0] ?? "";

  return (
    compatSource.includes("kubeReady: boolean") &&
    serverSource.includes(
      'import { buildKubeHealthResponse } from "./kube-health"',
    ) &&
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

export function isAliceAppCoreAgentStatusAuthBridgePatched(
  serverSource,
  bridgeSource,
) {
  return (
    serverSource.includes(
      'import { authorizeAgentStatusFallback } from "./agent-status-auth-bridge";',
    ) &&
    serverSource.includes(
      "if (!(await authorizeAgentStatusFallback(req, res, state)))",
    ) &&
    bridgeSource === agentStatusAuthBridgeSource
  );
}

export function isAliceAppCoreUpstreamAuthBridgePatched(
  source,
  serverSource = "",
) {
  return (
    source.includes("const UPSTREAM_SESSION_AUTH_BRIDGE_PREFIXES = [") &&
    aliceUpstreamAuthBridgePrefixes.every((prefix) =>
      source.includes(`  "${prefix}",`),
    ) &&
    source.includes("req.headers.authorization = `Bearer ${upstreamToken}`") &&
    source.includes('req.headers["x-api-key"] = upstreamToken') &&
    (!serverSource ||
      (serverSource.includes(
        'import { bridgeSessionAuthToUpstream } from "./server-upstream-auth-bridge";',
      ) &&
        serverSource.includes(
          "if (\n            !(await bridgeSessionAuthToUpstream(req, res, state, pathname))\n          )",
        )))
  );
}

export function isAliceAppCoreDashboardFallbackRoutesPatched(
  serverSource,
  fallbackSource,
) {
  return (
    serverSource.includes(
      'import { handleAliceDashboardFallbackRoutes } from "./dashboard-fallback-routes";',
    ) &&
    serverSource.includes(
      "if (await handleAliceDashboardFallbackRoutes(req, res, state)) return true;",
    ) &&
    fallbackSource === dashboardFallbackRoutesSource
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
    source.includes(
      "bundled knowledge seeding deferred until API server startup",
    ) &&
    source.includes(
      'scheduleBundledKnowledgeSeed(runtime, "api-server-listen");',
    ) &&
    source.includes(
      'scheduleBundledKnowledgeSeed(runtime, "headless-runtime-init");',
    ) &&
    !source.includes("await seedBundledKnowledge(runtime);")
  );
}

export function rewriteRelativeTsRuntimeSpecifiers(source) {
  return source
    .replace(/(\bfrom\s*["'])(\.{1,2}\/[^"']+)\.(?:ts|tsx)(["'])/g, "$1$2.js$3")
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
    source.includes(
      "const previousProcessLock = this.isLockFileFromPreviousProcess(",
    ) &&
    source.includes("pid && this.isPidRunning(pid) && !previousProcessLock") &&
    source.includes(
      "Removed stale PGlite postmaster.pid from prior container process",
    )
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
    throw new Error(
      "plugin-sql PGlite manager patch applied but contract is absent",
    );
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
  log(
    "[alice-eliza-runtime-patches] patched plugin-sql PGlite container lock recovery",
  );
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
    throw new Error(
      "app-lifeops calendar action patch applied but contract is absent",
    );
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

const coreBrowserIndexRelativePath = "packages/core/src/index.browser.ts";
const coreBrowserRuntimeEnvReexportSentinel =
  "// [milaidy:core-browser-runtime-env-reexport]";
const coreBrowserRuntimeEnvReexport = `${coreBrowserRuntimeEnvReexportSentinel}
// eliza/packages/core/src/runtime-env.ts exports ~30 pure-JS helpers
// (resolveApiSecurityConfig, resolveAllowedOrigins, resolveApiBindHost,
// DEFAULT_DESKTOP_API_PORT, etc.) used by plugins that bundle into the SPA
// (notably plugin-elizacloud/src/services/cloud-auth.ts which statically
// imports resolveApiSecurityConfig). Upstream's index.node.ts re-exports
// runtime-env wholesale (line ~203: \`export * from "./runtime-env"\`),
// but index.browser.ts does not — even though runtime-env.ts has zero
// node-specific imports (only "./env-utils.js" sibling + pure regex/string).
// Rollup fails the static bind in the SPA build when the missing names are
// referenced. Re-exporting runtime-env from the browser entry resolves the
// entire family of names in one shot, mirroring upstream's node-entry
// surface for these browser-safe utilities.
export * from "./runtime-env";
`;

export function isAliceCoreBrowserRuntimeEnvReexportPatched(source) {
  return source.includes(coreBrowserRuntimeEnvReexportSentinel);
}

export function applyAliceCoreBrowserRuntimeEnvReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser runtime-env reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserRuntimeEnvReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser runtime-env reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserRuntimeEnvReexport}`
    : `${source}\n\n${coreBrowserRuntimeEnvReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts to re-export runtime-env (resolveApiSecurityConfig + ~29 sibling browser-safe helpers)",
  );
  return "applied";
}

const appCoreIndexRelativePath = "packages/app-core/src/index.ts";
const appCoreUiFullReexportSentinel = "// [milaidy:app-core-ui-full-reexport]";
const appCoreUiFullReexport = `${appCoreUiFullReexportSentinel}
// Bridge the full @elizaos/ui surface through @elizaos/app-core, mirroring
// upstream-milady's eliza/packages/app-core/src/browser.ts line 1
// (\`export * from "@elizaos/ui"\`).
//
// Why: alice's main.tsx has 11 import blocks of the form
// \`import { ... } from "@elizaos/app-core"\` covering ~50 value+type names
// (App, ErrorBoundary, client, AppBootConfig, getBootConfig, dispatchAppEvent,
// AGENT_READY_EVENT, applyForceFreshOnboardingReset, isAppWindowRoute,
// resolveWindowShellRoute, DESKTOP_TRAY_MENU_ITEMS, DesktopTrayRuntime,
// DetachedShellRoot, AppProvider, applyUiTheme, loadUiTheme, AppWindowRenderer,
// BrandingConfig type, etc.). Almost all of these names live in
// \`@elizaos/ui\`, not \`@elizaos/app-core\`. Upstream-milady's main.tsx
// works because its package.json exports map \`@elizaos/app-core\` to
// \`browser.ts\` for browser builds, which re-exports the whole ui surface.
//
// Alice's pinned eliza (30c595e10ea5) has the older package.json export
// map that resolves \`@elizaos/app-core\` to \`src/index.ts\` directly,
// bypassing browser.ts. The result: every one of those 11 import blocks
// fails the Rollup static bind on the SPA build, surfacing one missing
// name per deploy iteration.
//
// Append the same wildcard re-export to alice's pinned app-core/src/index.ts
// to bridge the gap. PR #180's \`applyAliceAppCoreUiCompatReexportPatch\`
// (\`export * from "./ui-compat"\`) is a narrow subset of this surface
// (~30 names); this patch is the comprehensive companion. Duplicates with
// ui-compat are harmless at runtime (both routes resolve to the same
// @elizaos/ui source).
//
// Browser safety: \`@elizaos/ui\` is the UI package — fully browser-safe by
// design. No node:* imports flow into the SPA via this re-export.
export * from "@elizaos/ui";

// Disambiguation: \`./registry\` and \`@elizaos/ui\` both export \`ConfigField\`
// and \`getPlugins\` with DIFFERENT declarations. \`./registry\` has the
// Zod-inferred type for plugin config schema fields and a registry loader
// helper; \`@elizaos/ui\` has a React component and a bridge helper.
// Wildcard \`export *\` from two sources with the same names → TS2308
// "Module has already exported a member named ..." build error. Mirror the
// disambiguation pattern from upstream-milady's eliza/packages/app-core/
// src/browser.ts line ~51 which pins the registry side explicitly.
export { type ConfigField, getPlugins } from "./registry";

// DesktopOnboardingRuntime is consumed by alice's apps/app/src/main.tsx
// block 8 alongside DESKTOP_TRAY_MENU_ITEMS / DesktopSurfaceNavigationRuntime
// / DesktopTrayRuntime / DetachedShellRoot. The latter four flow through
// the \`export * from "@elizaos/ui"\` above (they live in
// eliza/packages/ui/src/desktop-runtime/). DesktopOnboardingRuntime does
// NOT exist in @elizaos/ui — upstream's eliza/packages/app-core/src/
// browser.ts line ~62 emits it as a no-op stub. Mirror that here so the
// SPA bind for alice's main.tsx block 8 resolves without throwing.
// Runtime impact: nothing — alice's actual desktop onboarding runtime
// lives in its local packages/app-core/src/shell/DesktopOnboardingRuntime.tsx
// and is referenced through the desktop runtime mount path, not through
// this barrel export. The barrel-bound value is only reached if a SPA
// code path constructs the imported reference directly.
export const DesktopOnboardingRuntime = (): null => null;
`;

export function isAliceAppCoreUiFullReexportPatched(source) {
  return source.includes(appCoreUiFullReexportSentinel);
}

export function applyAliceAppCoreUiFullReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, appCoreIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza app-core source absent; skipping app-core ui-full reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceAppCoreUiFullReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] app-core ui-full reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${appCoreUiFullReexport}`
    : `${source}\n\n${appCoreUiFullReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched eliza app-core/src/index.ts to re-export the full @elizaos/ui surface (mirrors upstream's browser.ts pattern; bridges ~50 names main.tsx imports from @elizaos/app-core)",
  );
  return "applied";
}

const appCoreUiCompatReexportRelativePath = "packages/app-core/src/index.ts";
const appCoreUiCompatReexportSentinel =
  "// [milaidy:app-core-ui-compat-reexport]";
const appCoreUiCompatReexport = `${appCoreUiCompatReexportSentinel}
// eliza/packages/app-core/src/ui-compat.ts is a thin compatibility module
// that re-exports UI helpers from @elizaos/ui under the @elizaos/app-core
// surface — useApp, SurfaceCard, SurfaceBadge, GameOperatorShell,
// selectLatestRunForApp, toneForHealthState, etc. plus the matching type
// surface (BabylonChatMessage, AppOperatorSurfaceProps, etc.).
//
// Upstream's app-core/src/index.ts does NOT re-export ui-compat — it only
// exports server-side runtime + api modules. But downstream plugins (like
// eliza/plugins/app-babylon/src/ui/BabylonOperatorSurface.tsx) statically
// import \`useApp\` and other ui-compat names from "@elizaos/app-core"
// expecting them to be available, and Rollup fails the bind in the SPA build.
//
// Adding the re-export here surfaces every name in ui-compat without
// modifying upstream — ui-compat itself just re-exports from @elizaos/ui
// which is fully browser-safe (it's the UI package).
export * from "./ui-compat";
`;

export function isAliceAppCoreUiCompatReexportPatched(source) {
  return source.includes(appCoreUiCompatReexportSentinel);
}

export function applyAliceAppCoreUiCompatReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, appCoreUiCompatReexportRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza app-core source absent; skipping app-core ui-compat reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceAppCoreUiCompatReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] app-core ui-compat reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${appCoreUiCompatReexport}`
    : `${source}\n\n${appCoreUiCompatReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched eliza app-core/src/index.ts to re-export ui-compat (useApp, SurfaceCard, GameOperatorShell, selectLatestRunForApp + ~30 sibling UI helper names)",
  );
  return "applied";
}

const coreBrowserSpokenTextReexportSentinel =
  "// [milaidy:core-browser-spoken-text-reexport]";
const coreBrowserSpokenTextReexport = `${coreBrowserSpokenTextReexportSentinel}
// eliza/packages/core/src/spoken-text.ts exports sanitizeSpeechText
// (and ~3 sibling helpers — collapseWhitespace, stripUrls, etc., though
// only sanitizeSpeechText is exported by name from index.node.ts).
// The file is 65 lines, has ZERO imports (pure regex/string functions),
// and is trivially browser-safe. plugin-elizacloud/src/lib/server-cloud-tts.ts
// statically imports sanitizeSpeechText from @elizaos/core and Rollup
// fails the bind. index.node.ts re-exports it via a named-export block
// (line ~252: \`export { sanitizeSpeechText } from "./spoken-text"\`).
// Wholesale wildcard re-export pulls in any additional public helpers
// if they get added upstream.
export * from "./spoken-text";
`;

export function isAliceCoreBrowserSpokenTextReexportPatched(source) {
  return source.includes(coreBrowserSpokenTextReexportSentinel);
}

export function applyAliceCoreBrowserSpokenTextReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser spoken-text reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserSpokenTextReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser spoken-text reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserSpokenTextReexport}`
    : `${source}\n\n${coreBrowserSpokenTextReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts to re-export spoken-text (sanitizeSpeechText)",
  );
  return "applied";
}

const coreBrowserValidationReexportSentinel =
  "// [milaidy:core-browser-validation-reexport]";
const coreBrowserValidationReexport = `${coreBrowserValidationReexportSentinel}
// eliza/packages/core/src/validation exports validateActionKeywords,
// validateActionRegex, and pure secret-format validators. index.node.ts and
// index.edge.ts re-export this module, but index.browser.ts omits it. Browser
// Vite builds can still statically bind plugins through @elizaos/core, and
// plugin-shell/plugin-social-alpha/plugin-mysticism import these helpers.
// The validation module has no node:* imports, so mirroring the edge/node
// surface is browser-safe and fixes Rollup missing-export failures.
export * from "./validation";
`;

export function isAliceCoreBrowserValidationReexportPatched(source) {
  return source.includes(coreBrowserValidationReexportSentinel);
}

export function applyAliceCoreBrowserValidationReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser validation reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserValidationReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser validation reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserValidationReexport}`
    : `${source}\n\n${coreBrowserValidationReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts to re-export validation (validateActionKeywords, validateActionRegex, secret validators)",
  );
  return "applied";
}

const coreBrowserCloudTopologyReexportSentinel =
  "// [milaidy:core-browser-cloud-topology-reexport]";
const coreBrowserCloudTopologyReexport = `${coreBrowserCloudTopologyReexportSentinel}
// eliza/packages/core/src/contracts/cloud-topology.ts exports the
// ElizaCloud config-introspection helpers used by plugin-elizacloud:
//   isElizaCloudLinkedInConfig, resolveElizaCloudTopology,
//   isElizaCloudServiceSelectedInConfig, shouldLoadElizaCloudPluginInConfig.
// Upstream's index.node.ts has \`export { isElizaCloudServiceSelectedInConfig
// } from "./contracts/cloud-topology"\` (line ~45) and the file itself is
// fully browser-safe: imports only "./onboarding.js" (sibling, now
// browser-safe via PR #173) and pure type/function definitions. No
// node:* / fs / path / os / crypto imports anywhere. Plugin-elizacloud's
// cloud-status-routes.ts statically imports
// isElizaCloudServiceSelectedInConfig and Rollup fails the bind.
export * from "./contracts/cloud-topology";
`;

export function isAliceCoreBrowserCloudTopologyReexportPatched(source) {
  return source.includes(coreBrowserCloudTopologyReexportSentinel);
}

export function applyAliceCoreBrowserCloudTopologyReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser cloud-topology reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserCloudTopologyReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser cloud-topology reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserCloudTopologyReexport}`
    : `${source}\n\n${coreBrowserCloudTopologyReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts to re-export contracts/cloud-topology (isElizaCloudServiceSelectedInConfig + 3 sibling browser-safe helpers)",
  );
  return "applied";
}

const coreBrowserSettingsDebugReexportSentinel =
  "// [milaidy:core-browser-settings-debug-reexport]";
const coreBrowserSettingsDebugReexport = `${coreBrowserSettingsDebugReexportSentinel}
// eliza/packages/core/src/settings-debug.ts exports isElizaSettingsDebugEnabled,
// sanitizeForSettingsDebug, and settingsDebugCloudSummary. Upstream's
// index.node.ts re-exports the first two via a named-export block (line ~248).
// index.browser.ts omits the module entirely — even though settings-debug.ts
// is fully browser-safe: imports only "./env-utils.js" (pure), uses
// typeof process !== "undefined" defensively, and reads import.meta.env for
// Vite/browser environments. plugin-elizacloud/src/lib/cloud-connection.ts
// statically imports isElizaSettingsDebugEnabled AND settingsDebugCloudSummary
// from @elizaos/core, and Rollup fails the bind. Wholesale re-export surfaces
// both names plus sanitizeForSettingsDebug (which the node entry oddly omits).
export * from "./settings-debug";
`;

export function isAliceCoreBrowserSettingsDebugReexportPatched(source) {
  return source.includes(coreBrowserSettingsDebugReexportSentinel);
}

export function applyAliceCoreBrowserSettingsDebugReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser settings-debug reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserSettingsDebugReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser settings-debug reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserSettingsDebugReexport}`
    : `${source}\n\n${coreBrowserSettingsDebugReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts to re-export settings-debug (isElizaSettingsDebugEnabled, settingsDebugCloudSummary, sanitizeForSettingsDebug)",
  );
  return "applied";
}

const coreBrowserOnboardingTypesDisambiguateSentinel =
  "// [milaidy:core-browser-onboarding-types-disambiguate]";
const coreBrowserOnboardingTypesDisambiguate = `${coreBrowserOnboardingTypesDisambiguateSentinel}
// Pin MessageExample to types/agent to resolve TS2308 ambiguity.
//
// Two different MessageExample interfaces exist in @elizaos/core and
// both reach this barrel:
//   types/agent           { name: string;  content: Content }
//   contracts/onboarding  { user: string;  content: MessageExampleContent }
// Different field names, different content type. types/agent is the
// canonical agent surface consumed by the Character + Agent types and
// by downstream eliza-cli / app-core / runtime-boot. The onboarding
// MessageExample is a narrower shape used only inside the onboarding
// flow definitions.
//
// Explicit named export wins over wildcard re-exports for TS resolution,
// so this pin selects the agent-canonical interface regardless of
// wildcard ordering.
export type { MessageExample } from "./types/agent";
`;

export function isAliceCoreBrowserOnboardingTypesDisambiguatePatched(source) {
  return source.includes(coreBrowserOnboardingTypesDisambiguateSentinel);
}

export function applyAliceCoreBrowserOnboardingTypesDisambiguatePatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser onboarding/types disambiguate patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserOnboardingTypesDisambiguatePatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser onboarding/types disambiguate already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserOnboardingTypesDisambiguate}`
    : `${source}\n\n${coreBrowserOnboardingTypesDisambiguate}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts with onboarding/types MessageExample disambiguation epilogue",
  );
  return "applied";
}

const coreBrowserOnboardingReexportSentinel =
  "// [milaidy:core-browser-onboarding-reexport]";
const coreBrowserOnboardingReexport = `${coreBrowserOnboardingReexportSentinel}
// eliza/packages/core/src/contracts/onboarding.ts defines ~50 names —
// migrateLegacyRuntimeConfig, isCloudInferenceSelectedInConfig,
// isSubscriptionProviderSelectionId, normalizeOnboardingProviderId,
// the full ONBOARDING_PROVIDER_CATALOG and SUBSCRIPTION_PROVIDER_SELECTIONS
// constants, ProviderOption / CloudProviderOption / ModelOption / etc.
// types. Upstream's index.node.ts re-exports them via "./contracts/onboarding".
// index.browser.ts omits it even though onboarding.ts is fully browser-safe
// (imports only "../env-utils.js" + sibling "./service-routing.js" types/
// normalizers, all pure JS — no node:* / fs / path / os / process anywhere).
// plugin-elizacloud/src/routes/cloud-routes-autonomous.ts statically imports
// migrateLegacyRuntimeConfig from @elizaos/core, and Rollup fails the bind.
// Re-exporting wholesale surfaces the entire onboarding contract family
// (the canonical implementations — also lets the existing missingExports
// vite-stub for OnboardingStateMachine / isOnboardingComplete fall through
// to the real implementations if onboarding.ts exports them).
export * from "./contracts/onboarding";
`;

export function isAliceCoreBrowserOnboardingReexportPatched(source) {
  return source.includes(coreBrowserOnboardingReexportSentinel);
}

export function applyAliceCoreBrowserOnboardingReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser onboarding reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserOnboardingReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser onboarding reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserOnboardingReexport}`
    : `${source}\n\n${coreBrowserOnboardingReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts to re-export contracts/onboarding (migrateLegacyRuntimeConfig + ~49 sibling browser-safe names)",
  );
  return "applied";
}

const coreBrowserStateDirStubsSentinel =
  "// [milaidy:core-browser-state-dir-stubs]";
const coreBrowserStateDirStubs = `${coreBrowserStateDirStubsSentinel}
// eliza/packages/core/src/utils/state-dir.ts exports resolveStateDir,
// resolveUserPath, getElizaNamespace, resolveOAuthDir, migrateStateDir.
// The module itself imports node:fs/promises, node:os, node:path so it
// CANNOT be re-exported wholesale into the browser entry (would pull
// node built-ins into the SPA bundle). index.browser.ts already provides
// an inline stub for resolveStateDir (returns "/.eliza"). The remaining
// four names are imported by plugin-elizacloud SPA-bundled files —
// notably plugin-elizacloud/src/lib/state-paths.ts statically imports
// resolveUserPath and getElizaNamespace from @elizaos/core — and Rollup
// fails the bind without them. Provide signature-compatible no-op
// stubs that return safe defaults. None of these are reached at runtime
// in the browser (plugin-elizacloud's state-paths is gated behind
// isNode() at call sites).
export function resolveUserPath(input: string): string {
\treturn typeof input === "string" ? input.trim() : "";
}
export function getElizaNamespace(): string {
\treturn "eliza";
}
export function resolveOAuthDir(): string {
\treturn "/.eliza/credentials";
}
export async function migrateStateDir(): Promise<{ migrated: boolean }> {
\treturn { migrated: false };
}
`;

export function isAliceCoreBrowserStateDirStubsPatched(source) {
  return source.includes(coreBrowserStateDirStubsSentinel);
}

export function applyAliceCoreBrowserStateDirStubsPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser state-dir stubs patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserStateDirStubsPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser state-dir stubs already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserStateDirStubs}`
    : `${source}\n\n${coreBrowserStateDirStubs}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts with state-dir no-op stubs (resolveUserPath, getElizaNamespace, resolveOAuthDir, migrateStateDir)",
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

  if (
    !packageJson.exports ||
    typeof packageJson.exports !== "object" ||
    Array.isArray(packageJson.exports)
  ) {
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

// ── app-lifeops directory-style subpath exports ─────────────────────────
// Upstream eliza's eliza/plugins/app-lifeops/package.json declares
// only `"./*": "./dist/*.js"` for subpath exports. The Node subpath-exports
// wildcard substitutes literally — so an import of
// `@elizaos/app-lifeops/platform` resolves to `./dist/platform.js`, not
// to `./dist/platform/index.js`. tsup builds `src/platform/index.ts` to
// `dist/platform/index.js`, leaving the literal `dist/platform.js` path
// non-existent. Vite's SPA build fails with:
//
//   [vite]: Rollup failed to resolve import "@elizaos/app-lifeops/platform"
//   from "/src/milaidy/apps/app/src/main.tsx"
//
// Upstream milady-ai/milady's main.tsx uses identical imports — they ship
// against published npm bundles where the exports field has been authored
// to surface these dir-style subpaths explicitly. In our local-mode build
// against the eliza submodule, the package metadata is whatever upstream
// eliza committed, so we patch the local copy to add explicit subpath
// exports pointing at the source-mode `src/<dir>/index.ts` entries.
//
// The subpaths covered here are exactly the ones milaidy's apps/app
// main.tsx imports today. If a new dir-style subpath import is added to
// alice or upstream-merged into milaidy, add it to this list.
const aliceAppLifeOpsDirSubpathPaths = ["platform", "widgets"];

function aliceAppLifeOpsDirSubpathEntry(srcRelative) {
  return {
    types: srcRelative,
    bun: srcRelative,
    import: srcRelative,
    default: srcRelative,
  };
}

export function isAliceAppLifeOpsDirSubpathExportsPatched(packageJson) {
  if (!packageJson || typeof packageJson !== "object") return false;
  const exp = packageJson.exports;
  if (!exp || typeof exp !== "object" || Array.isArray(exp)) return false;
  return aliceAppLifeOpsDirSubpathPaths.every(
    (subpath) => exp[`./${subpath}`] !== undefined,
  );
}

export function applyAliceAppLifeOpsDirSubpathExportsPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const packageJsonPath = path.join(
    elizaRoot,
    "plugins/app-lifeops/package.json",
  );
  if (!existsSync(packageJsonPath)) {
    log(
      "[alice-eliza-runtime-patches] app-lifeops package absent; skipping dir-subpath exports patch",
    );
    return "skipped";
  }

  const sourceText = readFileSync(packageJsonPath, "utf8");
  const packageJson = JSON.parse(sourceText);

  if (isAliceAppLifeOpsDirSubpathExportsPatched(packageJson)) {
    log(
      "[alice-eliza-runtime-patches] app-lifeops dir-subpath exports already patched",
    );
    return "already-applied";
  }

  if (
    !packageJson.exports ||
    typeof packageJson.exports !== "object" ||
    Array.isArray(packageJson.exports)
  ) {
    packageJson.exports = {};
  }

  // Build the new explicit subpath entries first, then rebuild the
  // exports object so they appear BEFORE the `./*` / `./*.css` wildcards.
  // Node's subpath-exports resolver spec is "longest specific match wins",
  // but rollup-plugin-commonjs (used by vite) walks the exports object in
  // declaration order and short-circuits on the first match — which means
  // `./*` -> `./dist/*.js` claims `./platform` before our `./platform`
  // entry is ever considered. Inserting the explicit entries above the
  // wildcards in declaration order gets us the rollup resolver behaviour
  // we need without breaking Node-spec consumers.
  const newDirSubpathEntries = {};
  let addedCount = 0;
  for (const subpath of aliceAppLifeOpsDirSubpathPaths) {
    const dirIndexPath = path.join(
      elizaRoot,
      "plugins/app-lifeops",
      "src",
      subpath,
      "index.ts",
    );
    if (!existsSync(dirIndexPath)) {
      // Upstream may have restructured the directory away (e.g. file moved
      // up a level). The subpath import in main.tsx will still fail, but
      // adding a stale export pointing at a missing file would be worse.
      continue;
    }
    const exportTarget = `./src/${subpath}/index.ts`;
    newDirSubpathEntries[`./${subpath}`] =
      aliceAppLifeOpsDirSubpathEntry(exportTarget);
    addedCount += 1;
  }

  // Rebuild exports: keep `.` and `./package.json` first (they're the
  // canonical anchors), then the new explicit dir subpaths, then any
  // existing non-wildcard entries (e.g. `./plugin`), then the wildcards
  // (`./*.css`, `./*`). This order satisfies both the Node spec (which
  // doesn't care) and the rollup-plugin-commonjs first-match walker
  // (which does).
  const isWildcardKey = (key) => typeof key === "string" && key.includes("*");
  const existingEntries = Object.entries(packageJson.exports);
  const anchorEntries = existingEntries.filter(
    ([key]) => key === "." || key === "./package.json",
  );
  const otherSpecificEntries = existingEntries.filter(
    ([key]) =>
      key !== "." &&
      key !== "./package.json" &&
      !isWildcardKey(key) &&
      !(key in newDirSubpathEntries),
  );
  const wildcardEntries = existingEntries.filter(([key]) => isWildcardKey(key));
  packageJson.exports = Object.fromEntries([
    ...anchorEntries,
    ...Object.entries(newDirSubpathEntries),
    ...otherSpecificEntries,
    ...wildcardEntries,
  ]);

  if (addedCount === 0) {
    log(
      "[alice-eliza-runtime-patches] app-lifeops no dir-subpath targets present; skipping",
    );
    return "skipped";
  }

  const trailingNewline = sourceText.endsWith("\n") ? "\n" : "";
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}${trailingNewline}`,
  );
  log(
    `[alice-eliza-runtime-patches] added ${addedCount} explicit dir-subpath export(s) on app-lifeops (${aliceAppLifeOpsDirSubpathPaths.join(", ")})`,
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

  if (
    existsSync(packageJsonPath) &&
    !isAliceBrowserBridgeWorkspaceStubPatched(elizaRoot)
  ) {
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
  writeFileSync(path.join(distDir, "schema.js"), browserBridgeStubSchemaSource);
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
    log(
      "[alice-eliza-runtime-patches] app-lifeops calendar action source absent; skipping",
    );
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
        patchLifeOpsFile(servicePath, (source) =>
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
    source.includes(
      'import { buildKubeHealthResponse } from "./kube-health"',
    ) &&
    source.includes("Boolean(state?.kubeReady)") &&
    source.includes("compatState.kubeReady = true;") &&
    source.includes("compatState.kubeReady = false;")
  ) {
    return source;
  }

  let next = source;

  const importAnchor =
    'import { sendJson as sendJsonResponse } from "./response";\n';
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
    throw new Error(
      "app-core kube health patch applied but contract is absent",
    );
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

function patchAliceAppCoreAgentStatusAuthBridgeServerSource(source) {
  if (
    source.includes(
      'import { authorizeAgentStatusFallback } from "./agent-status-auth-bridge";',
    ) &&
    source.includes(
      "if (!(await authorizeAgentStatusFallback(req, res, state)))",
    )
  ) {
    return source;
  }

  let next = source;

  const importAnchor =
    'import { applyRouteModeGuard } from "../runtime/mode/route-mode-guard";\n';
  if (!next.includes(importAnchor)) {
    throw new Error("app-core status auth bridge import anchor drifted");
  }
  next = next.replace(
    importAnchor,
    `${importAnchor}import { authorizeAgentStatusFallback } from "./agent-status-auth-bridge";\n`,
  );

  const requestAuthAnchor = `        if (
          pathname.startsWith("/api/database") ||
          pathname.startsWith("/api/trajectories")
        ) {
          await ensureRuntimeSqlCompatibility(state.current);
        }

        try {
`;
  const requestAuthPatch = `        if (
          pathname.startsWith("/api/database") ||
          pathname.startsWith("/api/trajectories")
        ) {
          await ensureRuntimeSqlCompatibility(state.current);
        }
        if (!(await authorizeAgentStatusFallback(req, res, state))) {
          return;
        }

        try {
`;
  if (!next.includes(requestAuthAnchor)) {
    throw new Error("app-core status auth bridge request anchor drifted");
  }
  next = next.replace(requestAuthAnchor, requestAuthPatch);
  return next;
}

export function applyAliceAppCoreAgentStatusAuthBridgePatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const serverPath = path.join(elizaRoot, appCoreApiServerRelativePath);
  const bridgePath = path.join(
    elizaRoot,
    appCoreAgentStatusAuthBridgeRelativePath,
  );
  if (!existsSync(serverPath)) {
    log(
      "[alice-eliza-runtime-patches] app-core server source absent; skipping status auth bridge",
    );
    return "skipped";
  }

  const beforeServer = readFileSync(serverPath, "utf8");
  const beforeBridge = existsSync(bridgePath)
    ? readFileSync(bridgePath, "utf8")
    : null;
  const afterServer =
    patchAliceAppCoreAgentStatusAuthBridgeServerSource(beforeServer);

  if (
    afterServer === beforeServer &&
    beforeBridge === agentStatusAuthBridgeSource &&
    isAliceAppCoreAgentStatusAuthBridgePatched(afterServer, beforeBridge)
  ) {
    log(
      "[alice-eliza-runtime-patches] app-core status auth bridge already applied",
    );
    return "already-applied";
  }

  mkdirSync(path.dirname(bridgePath), { recursive: true });
  writeFileSync(serverPath, afterServer);
  writeFileSync(bridgePath, agentStatusAuthBridgeSource);

  if (
    !isAliceAppCoreAgentStatusAuthBridgePatched(
      afterServer,
      agentStatusAuthBridgeSource,
    )
  ) {
    throw new Error("app-core status auth bridge patch contract is absent");
  }

  log("[alice-eliza-runtime-patches] patched app-core status auth bridge");
  return "applied";
}

function patchAliceAppCoreUpstreamAuthBridgeSource(source) {
  const start = "const UPSTREAM_SESSION_AUTH_BRIDGE_PREFIXES = [";
  const end = "] as const;";
  const startIndex = source.indexOf(start);
  if (startIndex < 0) {
    throw new Error("app-core upstream auth bridge prefix anchor drifted");
  }
  const endIndex = source.indexOf(end, startIndex);
  if (endIndex < 0) {
    throw new Error("app-core upstream auth bridge prefix end anchor drifted");
  }

  const prefixBlock = `${start}
${aliceUpstreamAuthBridgePrefixes.map((prefix) => `  "${prefix}",`).join("\n")}
${end}`;
  const next =
    source.slice(0, startIndex) +
    prefixBlock +
    source.slice(endIndex + end.length);

  if (!isAliceAppCoreUpstreamAuthBridgePatched(next)) {
    throw new Error(
      "app-core upstream auth bridge patch applied but contract is absent",
    );
  }
  return next;
}

function patchAliceAppCoreUpstreamAuthBridgeServerSource(source) {
  if (
    source.includes(
      'import { bridgeSessionAuthToUpstream } from "./server-upstream-auth-bridge";',
    ) &&
    source.includes(
      "if (\n            !(await bridgeSessionAuthToUpstream(req, res, state, pathname))\n          )",
    )
  ) {
    return source;
  }

  let next = source;

  const importAnchor =
    'import { handleTrainingBenchmarksRoute } from "./training-benchmarks";\n';
  if (!next.includes(importAnchor)) {
    throw new Error(
      "app-core upstream auth bridge server import anchor drifted",
    );
  }
  next = next.replace(
    importAnchor,
    `${importAnchor}import { bridgeSessionAuthToUpstream } from "./server-upstream-auth-bridge";\n`,
  );

  const routeAnchor = `          if (await handleCompatRoute(req, res, state)) {
            return;
          }
`;
  const routePatch = `          if (await handleCompatRoute(req, res, state)) {
            return;
          }
          if (
            !(await bridgeSessionAuthToUpstream(req, res, state, pathname))
          ) {
            return;
          }
`;
  if (!next.includes(routeAnchor)) {
    throw new Error(
      "app-core upstream auth bridge server route anchor drifted",
    );
  }
  next = next.replace(routeAnchor, routePatch);
  return next;
}

export function applyAliceAppCoreUpstreamAuthBridgePatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const serverPath = path.join(elizaRoot, appCoreApiServerRelativePath);
  const bridgePath = path.join(
    elizaRoot,
    appCoreUpstreamAuthBridgeRelativePath,
  );
  if (!existsSync(serverPath)) {
    log(
      "[alice-eliza-runtime-patches] app-core server source absent; skipping upstream auth bridge",
    );
    return "skipped";
  }

  const beforeServer = readFileSync(serverPath, "utf8");
  const beforeBridge = existsSync(bridgePath)
    ? readFileSync(bridgePath, "utf8")
    : null;
  const afterServer =
    patchAliceAppCoreUpstreamAuthBridgeServerSource(beforeServer);
  const afterBridge = beforeBridge
    ? patchAliceAppCoreUpstreamAuthBridgeSource(beforeBridge)
    : appCoreUpstreamAuthBridgeSource;

  if (
    afterServer === beforeServer &&
    beforeBridge === afterBridge &&
    isAliceAppCoreUpstreamAuthBridgePatched(afterBridge, afterServer)
  ) {
    log(
      "[alice-eliza-runtime-patches] app-core upstream auth bridge already applied",
    );
    return "already-applied";
  }

  mkdirSync(path.dirname(bridgePath), { recursive: true });
  writeFileSync(serverPath, afterServer);
  writeFileSync(bridgePath, afterBridge);

  if (!isAliceAppCoreUpstreamAuthBridgePatched(afterBridge, afterServer)) {
    throw new Error(
      "app-core upstream auth bridge patch applied but contract is absent",
    );
  }

  log("[alice-eliza-runtime-patches] patched app-core upstream auth bridge");
  return "applied";
}

export function isAliceProviderFailureNonfatalPatched(
  errorHandlersSource,
  devServerSource,
  runMainSource,
) {
  return (
    errorHandlersSource.includes("function hasProviderNoOutputSignal") &&
    errorHandlersSource.includes(
      "Provider request failed without output; request should fail closed without restarting.",
    ) &&
    errorHandlersSource.includes("return true;") &&
    devServerSource.includes("describeNonFatalUnhandledRejection") &&
    runMainSource.includes("describeNonFatalUnhandledRejection")
  );
}

export function isAliceAuthRateLimitAfterValidSessionPatched(source) {
  return (
    source.includes(
      "Alice: validate good static bearer tokens before applying failed-auth throttling.",
    ) &&
    source.includes(
      "Alice: valid local, cookie, and bearer sessions bypass the failed-auth throttle.",
    )
  );
}

function patchAliceAuthRateLimitSource(source) {
  if (isAliceAuthRateLimitAfterValidSessionPatched(source)) {
    return source;
  }

  let next = source;
  const syncOld = `  const ip = req.socket?.remoteAddress ?? null;
  if (isAuthRateLimited(ip)) {
    sendJsonError(res, 429, "Too many authentication attempts");
    return false;
  }

  const providedToken = getProvidedApiToken(req);
  if (providedToken && tokenMatches(expectedToken, providedToken)) return true;

  recordFailedAuth(ip);
  sendJsonError(res, 401, "Unauthorized");
  return false;`;
  const syncNew = `  const providedToken = getProvidedApiToken(req);
  if (providedToken && tokenMatches(expectedToken, providedToken)) return true;

  // Alice: validate good static bearer tokens before applying failed-auth throttling.
  const ip = req.socket?.remoteAddress ?? null;
  if (isAuthRateLimited(ip)) {
    sendJsonError(res, 429, "Too many authentication attempts");
    return false;
  }

  recordFailedAuth(ip);
  sendJsonError(res, 401, "Unauthorized");
  return false;`;
  if (!next.includes(syncOld)) {
    throw new Error("app-core auth sync rate-limit anchor drifted");
  }
  next = next.replace(syncOld, syncNew);

  const asyncStartOld = `  const ip = req.socket?.remoteAddress ?? null;
  if (isAuthRateLimited(ip)) {
    sendJsonError(res, 429, "Too many authentication attempts");
    return false;
  }

  if (isTrustedLocalRequest(req)) return true;

  const method = (req.method ?? "GET").toUpperCase();`;
  const asyncStartNew = `  if (isTrustedLocalRequest(req)) return true;

  const method = (req.method ?? "GET").toUpperCase();`;
  if (!next.includes(asyncStartOld)) {
    throw new Error("app-core auth async rate-limit entry anchor drifted");
  }
  next = next.replace(asyncStartOld, asyncStartNew);

  const asyncFailureOld = `  recordFailedAuth(ip);
  sendJsonError(res, 401, "Unauthorized");
  return false;`;
  const asyncFailureNew = `  // Alice: valid local, cookie, and bearer sessions bypass the failed-auth throttle.
  const ip = req.socket?.remoteAddress ?? null;
  if (isAuthRateLimited(ip)) {
    sendJsonError(res, 429, "Too many authentication attempts");
    return false;
  }

  recordFailedAuth(ip);
  sendJsonError(res, 401, "Unauthorized");
  return false;`;
  const asyncFailureIndex = next.lastIndexOf(asyncFailureOld);
  if (asyncFailureIndex === -1) {
    throw new Error("app-core auth async rate-limit failure anchor drifted");
  }
  next =
    next.slice(0, asyncFailureIndex) +
    asyncFailureNew +
    next.slice(asyncFailureIndex + asyncFailureOld.length);

  return next;
}

export function applyAliceAuthRateLimitAfterValidSessionPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const authPath = path.join(elizaRoot, appCoreApiAuthRelativePath);
  if (!existsSync(authPath)) {
    log("[alice-eliza-runtime-patches] app-core auth source absent; skipping");
    return "skipped";
  }

  const before = readFileSync(authPath, "utf8");
  const after = patchAliceAuthRateLimitSource(before);
  if (
    after === before &&
    isAliceAuthRateLimitAfterValidSessionPatched(before)
  ) {
    log(
      "[alice-eliza-runtime-patches] app-core auth rate-limit session ordering already applied",
    );
    return "already-applied";
  }

  writeFileSync(authPath, after);
  if (!isAliceAuthRateLimitAfterValidSessionPatched(after)) {
    throw new Error(
      "app-core auth rate-limit session ordering patch contract is absent",
    );
  }

  log(
    "[alice-eliza-runtime-patches] patched app-core auth to validate sessions before failed-auth throttling",
  );
  return "applied";
}

function patchAliceProviderFailureErrorHandlersSource(source) {
  if (
    source.includes("function hasProviderNoOutputSignal") &&
    source.includes("describeNonFatalUnhandledRejection")
  ) {
    return source;
  }

  let next = source;
  const helperAnchor =
    /function hasInsufficientCreditsSignal\(input: string\): boolean \{[\s\S]*?\n\}\n/;
  if (!helperAnchor.test(next)) {
    throw new Error("app-core error-handlers helper anchor drifted");
  }
  next = next.replace(
    helperAnchor,
    (match) => `${match}
function hasProviderNoOutputSignal(input: string): boolean {
  return /AI_NoOutputGeneratedError|No output generated|AI_APICallError|AI_RetryError|AI_InvalidPromptError|Invalid prompt/i.test(
    input,
  );
}

export function describeNonFatalUnhandledRejection(
  reason: unknown,
): string | null {
  const formatted = formatUncaughtError(reason);
  if (!hasProviderNoOutputSignal(formatted)) {
    return null;
  }

  if (hasInsufficientCreditsSignal(formatted)) {
    return "Provider credits appear exhausted; request failed without output. Top up credits and retry.";
  }

  return "Provider request failed without output; request should fail closed without restarting.";
}
`,
  );

  next = next.replace(
    `/**
 * Returns \`true\` when the rejection looks like an AI provider credit-exhaustion
 * error — these are noisy but not fatal, so callers should warn instead of crash.
 */`,
    `/**
 * Returns \`true\` when the rejection looks like an AI provider stream/generation
 * failure. These are request-scoped failures, so callers should warn instead
 * of restarting the host process.
 */`,
  );

  const oldSignalCheck = `  if (
    !/AI_NoOutputGeneratedError|No output generated|AI_APICallError|AI_RetryError/i.test(
      formatted,
    )
  ) {
    return false;
  }`;
  if (!next.includes(oldSignalCheck)) {
    throw new Error("app-core error-handlers provider signal anchor drifted");
  }
  next = next.replace(
    oldSignalCheck,
    `  if (!hasProviderNoOutputSignal(formatted)) {
    return false;
  }`,
  );

  const oldTail = `    current = (current as { cause?: unknown }).cause;
  }

  return false;
}`;
  if (!next.includes(oldTail)) {
    throw new Error("app-core error-handlers tail anchor drifted");
  }
  next = next.replace(
    oldTail,
    `    current = (current as { cause?: unknown }).cause;
  }

  return true;
}`,
  );

  return next;
}

function patchAliceProviderFailureEntrypointSource(source, importPath) {
  if (source.includes("describeNonFatalUnhandledRejection")) {
    return source;
  }

  let next = source;
  const importAnchor = `import {
  formatUncaughtError,
  shouldIgnoreUnhandledRejection,
} from "${importPath}";`;
  if (!next.includes(importAnchor)) {
    throw new Error(
      `app-core unhandled rejection import anchor drifted for ${importPath}`,
    );
  }
  next = next.replace(
    importAnchor,
    `import {
  describeNonFatalUnhandledRejection,
  formatUncaughtError,
  shouldIgnoreUnhandledRejection,
} from "${importPath}";`,
  );

  const warningAnchor =
    "Provider credits appear exhausted; request failed without output. Top up credits and retry.";
  if (!next.includes(warningAnchor)) {
    throw new Error(
      `app-core unhandled rejection warning anchor drifted for ${importPath}`,
    );
  }
  next = next.replace(
    `\`${"${getLogPrefix()}"} ${warningAnchor}\``,
    `\`${"${getLogPrefix()}"} ${"${describeNonFatalUnhandledRejection(reason)}"}\``,
  );
  return next;
}

export function applyAliceProviderFailureNonfatalPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const errorHandlersPath = path.join(
    elizaRoot,
    appCoreRuntimeErrorHandlersRelativePath,
  );
  const devServerPath = path.join(
    elizaRoot,
    appCoreRuntimeDevServerRelativePath,
  );
  const runMainPath = path.join(elizaRoot, appCoreCliRunMainRelativePath);
  if (
    !existsSync(errorHandlersPath) ||
    !existsSync(devServerPath) ||
    !existsSync(runMainPath)
  ) {
    log(
      "[alice-eliza-runtime-patches] app-core unhandled rejection sources absent; skipping",
    );
    return "skipped";
  }

  const beforeErrorHandlers = readFileSync(errorHandlersPath, "utf8");
  const beforeDevServer = readFileSync(devServerPath, "utf8");
  const beforeRunMain = readFileSync(runMainPath, "utf8");

  const afterErrorHandlers =
    patchAliceProviderFailureErrorHandlersSource(beforeErrorHandlers);
  const afterDevServer = patchAliceProviderFailureEntrypointSource(
    beforeDevServer,
    "./error-handlers.js",
  );
  const afterRunMain = patchAliceProviderFailureEntrypointSource(
    beforeRunMain,
    "../runtime/error-handlers",
  );

  if (
    afterErrorHandlers === beforeErrorHandlers &&
    afterDevServer === beforeDevServer &&
    afterRunMain === beforeRunMain &&
    isAliceProviderFailureNonfatalPatched(
      beforeErrorHandlers,
      beforeDevServer,
      beforeRunMain,
    )
  ) {
    log(
      "[alice-eliza-runtime-patches] app-core provider failure nonfatal handler already applied",
    );
    return "already-applied";
  }

  writeFileSync(errorHandlersPath, afterErrorHandlers);
  writeFileSync(devServerPath, afterDevServer);
  writeFileSync(runMainPath, afterRunMain);

  if (
    !isAliceProviderFailureNonfatalPatched(
      afterErrorHandlers,
      afterDevServer,
      afterRunMain,
    )
  ) {
    throw new Error(
      "app-core provider failure nonfatal patch contract is absent",
    );
  }

  log(
    "[alice-eliza-runtime-patches] patched app-core provider stream failures to stay nonfatal",
  );
  return "applied";
}

function patchAliceAppCoreDashboardFallbackRoutesServerSource(source) {
  if (
    source.includes(
      'import { handleAliceDashboardFallbackRoutes } from "./dashboard-fallback-routes";',
    ) &&
    source.includes(
      "if (await handleAliceDashboardFallbackRoutes(req, res, state)) return true;",
    )
  ) {
    return source;
  }

  let next = source;

  const importAnchor =
    'import { applyRouteModeGuard } from "../runtime/mode/route-mode-guard";\n';
  if (!next.includes(importAnchor)) {
    throw new Error("app-core dashboard fallback routes import anchor drifted");
  }
  next = next.replace(
    importAnchor,
    `${importAnchor}import { handleAliceDashboardFallbackRoutes } from "./dashboard-fallback-routes";\n`,
  );

  const routeAnchor = `  return handleDatabaseRowsCompatRoute(req, res, state);
}`;
  const routePatch = `  if (await handleAliceDashboardFallbackRoutes(req, res, state)) return true;

  return handleDatabaseRowsCompatRoute(req, res, state);
}`;
  if (!next.includes(routeAnchor)) {
    throw new Error(
      "app-core dashboard fallback routes insertion anchor drifted",
    );
  }
  next = next.replace(routeAnchor, routePatch);
  return next;
}

export function applyAliceAppCoreDashboardFallbackRoutesPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const serverPath = path.join(elizaRoot, appCoreApiServerRelativePath);
  const fallbackPath = path.join(
    elizaRoot,
    appCoreDashboardFallbackRoutesRelativePath,
  );
  if (!existsSync(serverPath)) {
    log(
      "[alice-eliza-runtime-patches] app-core server source absent; skipping dashboard fallback routes",
    );
    return "skipped";
  }

  const beforeServer = readFileSync(serverPath, "utf8");
  const beforeFallback = existsSync(fallbackPath)
    ? readFileSync(fallbackPath, "utf8")
    : null;
  const afterServer =
    patchAliceAppCoreDashboardFallbackRoutesServerSource(beforeServer);

  if (
    afterServer === beforeServer &&
    beforeFallback === dashboardFallbackRoutesSource &&
    isAliceAppCoreDashboardFallbackRoutesPatched(afterServer, beforeFallback)
  ) {
    log(
      "[alice-eliza-runtime-patches] app-core dashboard fallback routes already applied",
    );
    return "already-applied";
  }

  mkdirSync(path.dirname(fallbackPath), { recursive: true });
  writeFileSync(serverPath, afterServer);
  writeFileSync(fallbackPath, dashboardFallbackRoutesSource);

  if (
    !isAliceAppCoreDashboardFallbackRoutesPatched(
      afterServer,
      dashboardFallbackRoutesSource,
    )
  ) {
    throw new Error(
      "app-core dashboard fallback routes patch contract is absent",
    );
  }

  log(
    "[alice-eliza-runtime-patches] patched app-core dashboard fallback routes",
  );
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
  if (!next.includes('readCompatJsonBody,\n} from "./compat-route-shared"')) {
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
    throw new Error("core/build.ts browserExternals anchor drifted");
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
  const packageMarker = '"mammoth", // [milaidy:vite-stub-mammoth]';
  const loaderMarker = "// [milaidy:vite-stub-mammoth-loader]";
  const modNameMarker = "const modName = strippedId.split(/[/?\\0]/)[0];";
  let next = source;

  if (!next.includes(packageMarker)) {
    const anchor = `    "node-llama-cpp",
    "fs-extra",`;

    if (!next.includes(anchor)) {
      throw new Error(
        "app/vite/native-module-stub-plugin.ts nativePackages anchor drifted",
      );
    }

    const replacement = `    "node-llama-cpp",
    "fs-extra",
    "mammoth", // [milaidy:vite-stub-mammoth]`;

    next = next.replace(anchor, replacement);
  }

  if (!next.includes(modNameMarker)) {
    const anchor = 'const modName = strippedId.split("/")[0];';

    if (!next.includes(anchor)) {
      throw new Error(
        "app/vite/native-module-stub-plugin.ts native module id normalization anchor drifted",
      );
    }

    next = next.replace(anchor, modNameMarker);
  }

  const mammothLoader = `      ${loaderMarker}
      if (modName === "mammoth") {
        return [
          "const emptyResult = Object.freeze({ value: '', messages: [] });",
          "export async function extractRawText() { return emptyResult; }",
          "const mammoth = Object.freeze({ extractRawText });",
          "export { mammoth };",
          "export default mammoth;",
        ].join("\\n");
      }`;

  if (!next.includes(loaderMarker)) {
    const anchor = `      // fs-extra: CJS module with default + named exports
      if (modName === "fs-extra") {`;

    if (!next.includes(anchor)) {
      throw new Error(
        "app/vite/native-module-stub-plugin.ts mammoth loader anchor drifted",
      );
    }

    /* @elizaos/core imports `mammoth.extractRawText` from the browser dist.
     * A generic default-only native stub lets Vite resolve the module, but
     * Rollup still fails static analysis because the named export is absent.
     * Return a browser-safe named async function with Mammoth's result shape. */
    const replacement = `${mammothLoader}

${anchor}`;

    next = next.replace(anchor, replacement);
  } else if (!next.includes("export default mammoth;")) {
    const oldLoader = `      ${loaderMarker}
      if (modName === "mammoth") {
        return [
          "const emptyResult = Object.freeze({ value: '', messages: [] });",
          "export async function extractRawText() { return emptyResult; }",
          "export default { extractRawText };",
        ].join("\\n");
      }`;

    if (!next.includes(oldLoader)) {
      throw new Error(
        "app/vite/native-module-stub-plugin.ts existing mammoth loader anchor drifted",
      );
    }

    next = next.replace(oldLoader, mammothLoader);
  }

  return next;
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

const pluginSqlSchemaPgliteErrorsReexportSentinel =
  "// [milaidy:plugin-sql-schema-pglite-errors-reexport]";
const pluginSqlSchemaPgliteErrorsReexport = `${pluginSqlSchemaPgliteErrorsReexportSentinel}
// packages/agent/src/runtime/eliza.ts imports plugin-sql through the schema
// barrel during the browser Vite build. The PGlite error helpers live in
// ../pglite/errors, so re-export them here for static named-import binding.
export * from "../pglite/errors";
`;

export function isAlicePluginSqlSchemaPgliteErrorsReexportPatched(source) {
  return source.includes(pluginSqlSchemaPgliteErrorsReexportSentinel);
}

export function applyAlicePluginSqlSchemaPgliteErrorsReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const filePath = path.join(elizaRoot, pluginSqlSchemaIndexRelativePath);
  if (!existsSync(filePath)) {
    log(
      "[alice-eliza-runtime-patches] plugin-sql schema index absent; skipping PGlite errors reexport patch",
    );
    return "skipped";
  }

  const before = readFileSync(filePath, "utf8");
  if (isAlicePluginSqlSchemaPgliteErrorsReexportPatched(before)) {
    log(
      "[alice-eliza-runtime-patches] plugin-sql schema PGlite errors reexport already applied",
    );
    return "already-applied";
  }

  const after = before.endsWith("\n")
    ? `${before}\n${pluginSqlSchemaPgliteErrorsReexport}`
    : `${before}\n\n${pluginSqlSchemaPgliteErrorsReexport}`;
  writeFileSync(filePath, after);
  log(
    "[alice-eliza-runtime-patches] patched plugin-sql schema index to re-export PGlite errors",
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
      throw new Error(
        "agent runtime bundled knowledge schedule anchor drifted",
      );
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
  if (
    !next.includes(
      'scheduleBundledKnowledgeSeed(runtime, "api-server-listen");',
    )
  ) {
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
  if (
    !next.includes(
      'scheduleBundledKnowledgeSeed(runtime, "headless-runtime-init");',
    )
  ) {
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

function patchAliceStartupPhaseRuntimeAuthGateSource(source) {
  if (
    source.includes(
      "Remote password/session auth stays behind the startup auth gate",
    )
  ) {
    return source;
  }

  const anchor = `      if ((ae?.status === 401 || ae?.status === 429) && client.hasToken()) {
        // 401/429 with a token. Two flavors to distinguish:
        //   1. Genuine port race / pre-bearer endpoint window — /api/auth/status
        //      itself isn't reachable yet. Keep retrying.
        //   2. Bearer-only token (paired but no password session). Server says
        //      /api/auth/status is fine (authenticated:true) but app endpoints
        //      like /api/agent/status still 401, or 429 from the auth rate
        //      limiter on those endpoints. /api/auth/me returns
        //      reason="remote_auth_required". Advance to ready so the auth gate
        //      can render LoginView. Hydrating tolerates 401s.
        try {
          const auth = await client.getAuthStatus();
          const remotePasswordMissing =
            auth.required &&
            auth.loginRequired &&
            auth.passwordConfigured === false;
          if (auth.authenticated || remotePasswordMissing) {
            deps.setOnboardingLoading(false);
            dispatch({ type: "AGENT_RUNNING" });
            return;
          }
        } catch {
          // /api/auth/status itself unreachable — keep retrying.
        }
      }
`;
  const patch = `      if ((ae?.status === 401 || ae?.status === 429) && client.hasToken()) {
        // Remote password/session auth stays behind the startup auth gate.
        // /api/auth/status is intentionally public and may report a valid bearer
        // token while protected app endpoints still require the browser password
        // session. Do not advance into hydrating/ready here: that mounts the full
        // shell and fans out protected calls before LoginView can run.
        try {
          const auth = await client.getAuthStatus();
          const remotePasswordMissing =
            auth.required &&
            auth.loginRequired &&
            auth.passwordConfigured === false;
          if (auth.authenticated || remotePasswordMissing) {
            deps.setAuthRequired(true);
            deps.setPairingEnabled(auth.pairingEnabled);
            deps.setPairingExpiresAt(auth.expiresAt);
            deps.setOnboardingLoading(false);
            dispatch({ type: "BACKEND_AUTH_REQUIRED" });
            return;
          }
        } catch {
          // /api/auth/status itself unreachable — keep retrying.
        }
      }
`;
  if (!source.includes(anchor)) {
    throw new Error("ui startup runtime bearer-auth gate anchor drifted");
  }
  return source.replace(anchor, patch);
}

function patchAliceOnboardingBootstrapAuthProbeSource(source) {
  if (
    source.includes(
      "Auth-gated origins must not run protected onboarding probes before a browser session exists",
    )
  ) {
    return source;
  }

  let next = source;
  const interfaceAnchor = `export interface ExistingOnboardingProbeClient {
  apiAvailable: boolean;
  getOnboardingStatus: () => Promise<{ complete: boolean }>;
  getConfig: () => Promise<Record<string, unknown> | null | undefined>;
}
`;
  const interfacePatch = `export interface ExistingOnboardingProbeClient {
  apiAvailable: boolean;
  getAuthStatus?: () => Promise<{
    required?: boolean;
    authenticated?: boolean;
    localAccess?: boolean;
    passwordConfigured?: boolean;
  }>;
  hasToken?: () => boolean;
  getOnboardingStatus: () => Promise<{ complete: boolean }>;
  getConfig: () => Promise<Record<string, unknown> | null | undefined>;
}
`;
  if (!next.includes(interfaceAnchor)) {
    throw new Error("ui onboarding bootstrap auth interface anchor drifted");
  }
  next = next.replace(interfaceAnchor, interfacePatch);

  const probeAnchor = `  if (!args.client.apiAvailable) {
    return null;
  }

  const timeoutToken = Symbol("onboarding-bootstrap-timeout");
`;
  const probePatch = `  if (!args.client.apiAvailable) {
    return null;
  }

  const auth = await args.client.getAuthStatus?.().catch(() => null);
  const protectedSessionPending =
    auth &&
    auth.localAccess !== true &&
    ((auth.required === true && auth.authenticated !== true) ||
      (auth.passwordConfigured === true && args.client.hasToken?.() === true));
  if (protectedSessionPending) {
    // Auth-gated origins must not run protected onboarding probes before a browser session exists.
    // /api/onboarding/status and /api/config are intentionally protected, so
    // probing them here only creates noisy 401s and can trip auth rate limits.
    return null;
  }

  const timeoutToken = Symbol("onboarding-bootstrap-timeout");
`;
  if (!next.includes(probeAnchor)) {
    throw new Error("ui onboarding bootstrap protected-probe anchor drifted");
  }
  return next.replace(probeAnchor, probePatch);
}

function patchAliceStartupPhasePollAuthGateSource(source) {
  if (
    source.includes(
      "Token holders with password/session auth still pending stay behind the startup auth gate",
    ) &&
    source.includes("Keep startup in the auth gate; do not enter ready.")
  ) {
    return source;
  }

  const tokenRequiredAnchor = `      // Token holder, but the server still says auth is required (e.g. the
      // remote owner password has not been set yet, so /api/auth/me will
      // return 401 with reason="remote_password_not_configured"). Don't
      // loop polling forever — advance the coordinator to "ready" so the
      // top-level auth gate can render LoginView with an actionable
      // "Remote access blocked" message. Without this, the phone is stuck
      // on the splash because every onboarding/runtime endpoint returns 401.
      if (auth.required && !auth.authenticated && client.hasToken()) {
        deps.setAuthRequired(false);
        deps.setOnboardingComplete(true);
        deps.setOnboardingLoading(false);
        dispatch({ type: "BACKEND_REACHED", onboardingComplete: true });
        return;
      }
`;
  const tokenRequiredPatch = `      // Token holders with password/session auth still pending stay behind the startup auth gate.
      // LoginView can now render directly from the auth-required startup phase,
      // so advancing to ready here would only mount hydrating/dashboard effects
      // that call protected endpoints before the user signs in.
      if (auth.required && !auth.authenticated && client.hasToken()) {
        deps.setAuthRequired(true);
        deps.setPairingEnabled(auth.pairingEnabled);
        deps.setPairingExpiresAt(auth.expiresAt);
        deps.setOnboardingLoading(false);
        dispatch({ type: "BACKEND_AUTH_REQUIRED" });
        return;
      }
`;
  if (!source.includes(tokenRequiredAnchor)) {
    throw new Error("ui startup poll token-required auth gate anchor drifted");
  }
  let next = source.replace(tokenRequiredAnchor, tokenRequiredPatch);

  const downstreamAuthAnchor = `      if (
        (ae?.status === 401 || ae?.status === 429) &&
        client.hasToken() &&
        latestAuth.authenticated
      ) {
        // Bearer-only token (paired but no password session). /api/auth/status
        // returned authenticated:true but a downstream endpoint
        // (onboarding-status, etc.) still 401s, or the server's auth rate
        // limiter starts returning 429 ("Too many authentication attempts")
        // because every poll re-checks bearer-vs-session. /api/auth/me responds
        // with reason="remote_auth_required" in this state. Don't loop forever
        // — advance to ready so the top-level auth gate can render LoginView
        // with an actionable "Sign in" / "Remote access blocked" prompt.
        deps.setAuthRequired(false);
        deps.setOnboardingComplete(true);
        deps.setOnboardingLoading(false);
        dispatch({ type: "BACKEND_REACHED", onboardingComplete: true });
        return;
      }
`;
  const downstreamAuthPatch = `      if (
        (ae?.status === 401 || ae?.status === 429) &&
        client.hasToken() &&
        latestAuth.authenticated
      ) {
        // Bearer-only token (paired but no password session), or auth-rate 429
        // caused by protected endpoint polling before the browser password
        // session exists. Keep startup in the auth gate; do not enter ready.
        deps.setAuthRequired(true);
        deps.setPairingEnabled(latestAuth.pairingEnabled);
        deps.setPairingExpiresAt(latestAuth.expiresAt);
        deps.setOnboardingLoading(false);
        dispatch({ type: "BACKEND_AUTH_REQUIRED" });
        return;
      }
`;
  if (!next.includes(downstreamAuthAnchor)) {
    throw new Error("ui startup poll downstream-auth gate anchor drifted");
  }
  next = next.replace(downstreamAuthAnchor, downstreamAuthPatch);
  return next;
}

function patchAliceStartupShellAuthGateSource(source) {
  if (
    source.includes("handleStartupLoginSuccess") &&
    source.includes("usePasswordLoginGate") &&
    source.includes('from "../auth/LoginView"')
  ) {
    return source;
  }

  let next = source;
  const importAnchor = `import { BootstrapStep } from "../onboarding/BootstrapStep";
import { PairingView } from "./PairingView";
`;
  if (!next.includes(importAnchor)) {
    throw new Error("ui StartupShell auth import anchor drifted");
  }
  next = next.replace(
    importAnchor,
    `import { LoginView, type LoginViewProps } from "../auth/LoginView";
import { BootstrapStep } from "../onboarding/BootstrapStep";
import { PairingView } from "./PairingView";
`,
  );

  const refAnchor = `  const coordinatorStateRef = useRef(startupCoordinator.state);
  coordinatorStateRef.current = startupCoordinator.state;

`;
  const loginGateStatePatch = `${refAnchor}  const [usePasswordLoginGate, setUsePasswordLoginGate] = useState(() =>
    client.hasToken(),
  );
  const [startupLoginReason, setStartupLoginReason] =
    useState<LoginViewProps["reason"]>();

  useEffect(() => {
    if (phase !== "pairing-required") {
      setUsePasswordLoginGate(client.hasToken());
      setStartupLoginReason(undefined);
      return;
    }

    setUsePasswordLoginGate(client.hasToken());
    let cancelled = false;
    void client
      .getAuthStatus()
      .then((auth) => {
        if (cancelled) return;
        const shouldUsePasswordLogin =
          client.hasToken() ||
          auth.loginRequired === true ||
          auth.passwordConfigured === false;
        setUsePasswordLoginGate(shouldUsePasswordLogin);
        setStartupLoginReason(
          auth.required &&
            auth.loginRequired &&
            auth.passwordConfigured === false
            ? "remote_password_not_configured"
            : "remote_auth_required",
        );
      })
      .catch(() => {
        if (cancelled) return;
        setUsePasswordLoginGate(client.hasToken());
        setStartupLoginReason("remote_auth_required");
      });

    return () => {
      cancelled = true;
    };
  }, [phase]);

  const handleStartupLoginSuccess = useCallback(() => {
    coordinatorDispatchRef.current({ type: "PAIRING_SUCCESS" });
  }, []);

`;
  if (!next.includes(refAnchor)) {
    throw new Error("ui StartupShell coordinator ref anchor drifted");
  }
  next = next.replace(refAnchor, loginGateStatePatch);

  const pairingAnchor = `  // Pairing — delegate
  if (phase === "pairing-required") {
    return <PairingView />;
  }
`;
  const pairingPatch = `  // Auth-required startup — token holders need password login, tokenless clients still pair.
  if (phase === "pairing-required") {
    if (usePasswordLoginGate) {
      return (
        <LoginView
          onLoginSuccess={handleStartupLoginSuccess}
          reason={startupLoginReason}
        />
      );
    }
    return <PairingView />;
  }
`;
  if (!next.includes(pairingAnchor)) {
    throw new Error("ui StartupShell pairing render anchor drifted");
  }
  return next.replace(pairingAnchor, pairingPatch);
}

function patchAliceUiAppAuthGateSource(source) {
  if (
    source.includes('data-testid="auth-loading-gate"') &&
    source.includes('authState.phase !== "authenticated"')
  ) {
    return source;
  }

  let next = source;
  const overlayAnchor = `  useEffect(() => {
    if (startupCoordinator.phase !== "ready") return;
    if (backendConnection?.state !== "connected") return;

`;
  const overlayPatch = `  useEffect(() => {
    if (startupCoordinator.phase !== "ready") return;
    if (backendConnection?.state !== "connected") return;
    if (!isPopout && authState.phase !== "authenticated") return;

`;
  if (!next.includes(overlayAnchor)) {
    throw new Error("ui App overlay presence auth guard anchor drifted");
  }
  next = next.replace(overlayAnchor, overlayPatch);

  const overlayDepsAnchor = `  }, [activeOverlayApp, backendConnection?.state, startupCoordinator.phase]);
`;
  const overlayDepsPatch = `  }, [
    activeOverlayApp,
    authState.phase,
    backendConnection?.state,
    isPopout,
    startupCoordinator.phase,
  ]);
`;
  if (!next.includes(overlayDepsAnchor)) {
    throw new Error("ui App overlay presence deps anchor drifted");
  }
  next = next.replace(overlayDepsAnchor, overlayDepsPatch);

  const authLoadingAnchor = `    if (authState.phase === "unauthenticated") {
      return (
        <BugReportProvider value={bugReport}>
          <LoginView onLoginSuccess={refetchAuth} reason={authState.reason} />
          <BugReportModal />
        </BugReportProvider>
      );
    }
    // While loading the auth state we allow the main shell to continue
    // rendering (avoids a flash of login screen on refresh when cookies are valid).
`;
  const authLoadingPatch = `    if (authState.phase === "loading") {
      return (
        <BugReportProvider value={bugReport}>
          <div
            data-testid="auth-loading-gate"
            className="flex h-[100dvh] w-full items-center justify-center bg-bg text-sm text-muted-foreground"
            aria-live="polite"
          >
            Loading...
          </div>
          <BugReportModal />
        </BugReportProvider>
      );
    }
    if (authState.phase === "unauthenticated") {
      return (
        <BugReportProvider value={bugReport}>
          <LoginView onLoginSuccess={refetchAuth} reason={authState.reason} />
          <BugReportModal />
        </BugReportProvider>
      );
    }
`;
  if (!next.includes(authLoadingAnchor)) {
    throw new Error("ui App auth loading gate anchor drifted");
  }
  return next.replace(authLoadingAnchor, authLoadingPatch);
}

function patchAliceUseAppShellStateAuthGateSource(source) {
  if (
    source.includes("useAuthStatus({ observeOnly: true })") &&
    source.includes('authState.phase !== "authenticated"')
  ) {
    return source;
  }

  let next = source;
  const importAnchor = `import { useCallback, useEffect, useState } from "react";
`;
  if (!next.includes(importAnchor)) {
    throw new Error("ui useAppShellState react import anchor drifted");
  }
  next = next.replace(
    importAnchor,
    `${importAnchor}import { useAuthStatus } from "../hooks/useAuthStatus";
`,
  );

  const stateAnchor = `  const [configRaw, setConfigRaw] = useState<Record<string, unknown>>({});
  const [configText, setConfigText] = useState("");

`;
  if (!next.includes(stateAnchor)) {
    throw new Error("ui useAppShellState state anchor drifted");
  }
  next = next.replace(
    stateAnchor,
    `${stateAnchor}  const { state: authState } = useAuthStatus({ observeOnly: true });

`,
  );

  const effectAnchor = `  useEffect(() => {
    let cancelled = false;
    void fetchServerFavoriteApps().then((serverApps) => {
      if (cancelled || serverApps == null) return;
      setFavoriteAppsRaw((current) => {
        if (
          current.length === serverApps.length &&
          current.every((entry, idx) => entry === serverApps[idx])
        ) {
          return current;
        }
        return serverApps;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
`;
  const effectPatch = `  useEffect(() => {
    if (authState.phase !== "authenticated") return;

    let cancelled = false;
    void fetchServerFavoriteApps().then((serverApps) => {
      if (cancelled || serverApps == null) return;
      setFavoriteAppsRaw((current) => {
        if (
          current.length === serverApps.length &&
          current.every((entry, idx) => entry === serverApps[idx])
        ) {
          return current;
        }
        return serverApps;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [authState.phase]);
`;
  if (!next.includes(effectAnchor)) {
    throw new Error("ui useAppShellState favorites effect anchor drifted");
  }
  return next.replace(effectAnchor, effectPatch);
}

function patchAliceUiClientAgentConfigAuthGateSource(source) {
  if (source.includes("GET /api/config → skipped auth-gated browser")) {
    return source;
  }

  const anchor = `ElizaClient.prototype.getConfig = async function (this: ElizaClient) {
  logSettingsClient("GET /api/config → start", {
    baseUrl: this.getBaseUrl(),
  });
  const r = (await this.fetch("/api/config")) as Record<string, unknown>;
  const cloud = r.cloud as Record<string, unknown> | undefined;
  logSettingsClient("GET /api/config ← ok", {
    baseUrl: this.getBaseUrl(),
    topKeys: Object.keys(r).sort(),
    cloud: settingsDebugCloudSummary(cloud),
  });
  return r;
};
`;
  const patch = `ElizaClient.prototype.getConfig = async function (this: ElizaClient) {
  logSettingsClient("GET /api/config → start", {
    baseUrl: this.getBaseUrl(),
  });
  const auth = await this.getAuthStatus().catch(() => null);
  if (
    auth?.required === true &&
    auth.authenticated === false &&
    auth.localAccess !== true
  ) {
    logSettingsClient("GET /api/config → skipped auth-gated browser", {
      baseUrl: this.getBaseUrl(),
    });
    return {};
  }
  const r = (await this.fetch("/api/config")) as Record<string, unknown>;
  const cloud = r.cloud as Record<string, unknown> | undefined;
  logSettingsClient("GET /api/config ← ok", {
    baseUrl: this.getBaseUrl(),
    topKeys: Object.keys(r).sort(),
    cloud: settingsDebugCloudSummary(cloud),
  });
  return r;
};
`;
  if (!source.includes(anchor)) {
    throw new Error("ui client-agent config auth gate anchor drifted");
  }
  return source.replace(anchor, patch);
}

function patchAliceUiHooksIndexAuthStatusExportSource(source) {
  if (source.includes('export * from "./useAuthStatus";')) {
    return source;
  }
  const anchor = `export * from "./useAutomationDeepLink";
`;
  if (!source.includes(anchor)) {
    throw new Error("ui hooks index auth export anchor drifted");
  }
  return source.replace(
    anchor,
    `${anchor}export * from "./useAuthStatus";
`,
  );
}

function patchAliceVincentStateAuthGateSource(source) {
  if (
    source.includes("useAuthStatus") &&
    source.includes('const authReady = authState.phase === "authenticated";')
  ) {
    return source;
  }

  let next = source;
  const importAnchor = `import { openExternalUrl } from "@elizaos/ui";
`;
  if (!next.includes(importAnchor)) {
    throw new Error("app-vincent auth import anchor drifted");
  }
  next = next.replace(
    importAnchor,
    `import { openExternalUrl, useAuthStatus } from "@elizaos/ui";
`,
  );

  const refsAnchor = `  const busyRef = useRef(false);
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

`;
  if (!next.includes(refsAnchor)) {
    throw new Error("app-vincent auth state anchor drifted");
  }
  next = next.replace(
    refsAnchor,
    `${refsAnchor}  const { state: authState } = useAuthStatus({ observeOnly: true });
  const authReady = authState.phase === "authenticated";

`,
  );

  const pollAnchor = `  const pollVincentStatus = useCallback(async () => {
    try {
      const status = await vincentClient.vincentStatus();
      setVincentConnected(status.connected);
      setVincentConnectedAt(status.connectedAt);
      return status.connected;
    } catch {
      return false;
    }
  }, []);
`;
  const pollPatch = `  const pollVincentStatus = useCallback(async () => {
    if (!authReady) return false;

    try {
      const status = await vincentClient.vincentStatus();
      setVincentConnected(status.connected);
      setVincentConnectedAt(status.connectedAt);
      return status.connected;
    } catch {
      return false;
    }
  }, [authReady]);
`;
  if (!next.includes(pollAnchor)) {
    throw new Error("app-vincent status poll anchor drifted");
  }
  next = next.replace(pollAnchor, pollPatch);

  const effectAnchor = `  useEffect(() => {
    void pollVincentStatus();
    return () => {
      if (loginPollRef.current) {
        clearInterval(loginPollRef.current);
        loginPollRef.current = null;
      }
    };
  }, [pollVincentStatus]);
`;
  const effectPatch = `  useEffect(() => {
    if (authReady) void pollVincentStatus();
    return () => {
      if (loginPollRef.current) {
        clearInterval(loginPollRef.current);
        loginPollRef.current = null;
      }
    };
  }, [authReady, pollVincentStatus]);
`;
  if (!next.includes(effectAnchor)) {
    throw new Error("app-vincent auth effect anchor drifted");
  }
  next = next.replace(effectAnchor, effectPatch);

  const loginAnchor = `  const handleVincentLogin = useCallback(async () => {
    if (vincentConnected || busyRef.current || vincentLoginBusy) return;
`;
  const loginPatch = `  const handleVincentLogin = useCallback(async () => {
    if (!authReady || vincentConnected || busyRef.current || vincentLoginBusy) return;
`;
  if (!next.includes(loginAnchor)) {
    throw new Error("app-vincent login guard anchor drifted");
  }
  next = next.replace(loginAnchor, loginPatch);

  const depsAnchor = `  }, [
    pollVincentStatus,
    setActionNotice,
    t,
    vincentConnected,
    vincentLoginBusy,
  ]);
`;
  const depsPatch = `  }, [
    authReady,
    pollVincentStatus,
    setActionNotice,
    t,
    vincentConnected,
    vincentLoginBusy,
  ]);
`;
  if (!next.includes(depsAnchor)) {
    throw new Error("app-vincent login deps anchor drifted");
  }
  return next.replace(depsAnchor, depsPatch);
}

export function isAliceUiAuthGatedStartupPatched({
  appSource = "",
  hooksIndexSource = "",
  onboardingBootstrapSource = "",
  startupShellSource = "",
  startupPhasePollSource = "",
  startupPhaseRuntimeSource = "",
  appShellStateSource = "",
  clientAgentSource = "",
  vincentStateSource = "",
} = {}) {
  return (
    startupPhaseRuntimeSource.includes(
      "Remote password/session auth stays behind the startup auth gate",
    ) &&
    startupPhaseRuntimeSource.includes(
      'dispatch({ type: "BACKEND_AUTH_REQUIRED" });',
    ) &&
    onboardingBootstrapSource.includes(
      "Auth-gated origins must not run protected onboarding probes before a browser session exists",
    ) &&
    startupPhasePollSource.includes(
      "Token holders with password/session auth still pending stay behind the startup auth gate",
    ) &&
    startupPhasePollSource.includes("deps.setAuthRequired(true);") &&
    startupShellSource.includes('from "../auth/LoginView"') &&
    startupShellSource.includes("usePasswordLoginGate") &&
    startupShellSource.includes("handleStartupLoginSuccess") &&
    appSource.includes('data-testid="auth-loading-gate"') &&
    appSource.includes('authState.phase !== "authenticated"') &&
    appShellStateSource.includes("useAuthStatus({ observeOnly: true })") &&
    appShellStateSource.includes('authState.phase !== "authenticated"') &&
    clientAgentSource.includes(
      "GET /api/config → skipped auth-gated browser",
    ) &&
    clientAgentSource.includes("this.getAuthStatus().catch") &&
    hooksIndexSource.includes('export * from "./useAuthStatus";') &&
    vincentStateSource.includes("useAuthStatus") &&
    vincentStateSource.includes(
      'const authReady = authState.phase === "authenticated";',
    )
  );
}

export function applyAliceUiAuthGatedStartupPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const paths = {
    appPath: path.join(elizaRoot, uiAppRelativePath),
    hooksIndexPath: path.join(elizaRoot, uiHooksIndexRelativePath),
    onboardingBootstrapPath: path.join(
      elizaRoot,
      uiOnboardingBootstrapRelativePath,
    ),
    startupShellPath: path.join(elizaRoot, uiStartupShellRelativePath),
    startupPhasePollPath: path.join(elizaRoot, uiStartupPhasePollRelativePath),
    startupPhaseRuntimePath: path.join(
      elizaRoot,
      uiStartupPhaseRuntimeRelativePath,
    ),
    appShellStatePath: path.join(elizaRoot, uiAppShellStateRelativePath),
    clientAgentPath: path.join(elizaRoot, uiClientAgentRelativePath),
    vincentStatePath: path.join(elizaRoot, appVincentStateRelativePath),
  };

  for (const [label, targetPath] of Object.entries(paths)) {
    if (!existsSync(targetPath)) {
      throw new Error(`Alice UI auth-gated startup target missing: ${label}`);
    }
  }

  const before = {
    appSource: readFileSync(paths.appPath, "utf8"),
    hooksIndexSource: readFileSync(paths.hooksIndexPath, "utf8"),
    onboardingBootstrapSource: readFileSync(
      paths.onboardingBootstrapPath,
      "utf8",
    ),
    startupShellSource: readFileSync(paths.startupShellPath, "utf8"),
    startupPhasePollSource: readFileSync(paths.startupPhasePollPath, "utf8"),
    startupPhaseRuntimeSource: readFileSync(
      paths.startupPhaseRuntimePath,
      "utf8",
    ),
    appShellStateSource: readFileSync(paths.appShellStatePath, "utf8"),
    clientAgentSource: readFileSync(paths.clientAgentPath, "utf8"),
    vincentStateSource: readFileSync(paths.vincentStatePath, "utf8"),
  };

  if (isAliceUiAuthGatedStartupPatched(before)) {
    log(
      "[alice-eliza-runtime-patches] UI auth-gated startup patch already applied",
    );
    return "already-applied";
  }

  const after = {
    appSource: patchAliceUiAppAuthGateSource(before.appSource),
    hooksIndexSource: patchAliceUiHooksIndexAuthStatusExportSource(
      before.hooksIndexSource,
    ),
    onboardingBootstrapSource: patchAliceOnboardingBootstrapAuthProbeSource(
      before.onboardingBootstrapSource,
    ),
    startupShellSource: patchAliceStartupShellAuthGateSource(
      before.startupShellSource,
    ),
    startupPhasePollSource: patchAliceStartupPhasePollAuthGateSource(
      before.startupPhasePollSource,
    ),
    startupPhaseRuntimeSource: patchAliceStartupPhaseRuntimeAuthGateSource(
      before.startupPhaseRuntimeSource,
    ),
    appShellStateSource: patchAliceUseAppShellStateAuthGateSource(
      before.appShellStateSource,
    ),
    clientAgentSource: patchAliceUiClientAgentConfigAuthGateSource(
      before.clientAgentSource,
    ),
    vincentStateSource: patchAliceVincentStateAuthGateSource(
      before.vincentStateSource,
    ),
  };

  if (!isAliceUiAuthGatedStartupPatched(after)) {
    throw new Error(
      "Alice UI auth-gated startup patch applied but contract is absent",
    );
  }

  const writes = [
    [paths.appPath, before.appSource, after.appSource],
    [paths.hooksIndexPath, before.hooksIndexSource, after.hooksIndexSource],
    [
      paths.onboardingBootstrapPath,
      before.onboardingBootstrapSource,
      after.onboardingBootstrapSource,
    ],
    [
      paths.startupShellPath,
      before.startupShellSource,
      after.startupShellSource,
    ],
    [
      paths.startupPhasePollPath,
      before.startupPhasePollSource,
      after.startupPhasePollSource,
    ],
    [
      paths.startupPhaseRuntimePath,
      before.startupPhaseRuntimeSource,
      after.startupPhaseRuntimeSource,
    ],
    [
      paths.appShellStatePath,
      before.appShellStateSource,
      after.appShellStateSource,
    ],
    [paths.clientAgentPath, before.clientAgentSource, after.clientAgentSource],
    [
      paths.vincentStatePath,
      before.vincentStateSource,
      after.vincentStateSource,
    ],
  ];
  let patchedFiles = 0;
  for (const [targetPath, previous, next] of writes) {
    if (previous === next) continue;
    writeFileSync(targetPath, next);
    patchedFiles++;
  }

  log(
    `[alice-eliza-runtime-patches] patched UI auth-gated startup (${patchedFiles} files)`,
  );
  return patchedFiles > 0 ? "applied" : "already-applied";
}

export function isAliceCompanionOperatorPatchPatched(elizaRoot) {
  const requiredFiles = [
    "packages/ui/src/api/client-types-alice.ts",
    "plugins/app-companion/src/components/operator/useCompanionStageOperator.ts",
    "plugins/app-companion/src/components/operator/CompanionGoLiveModal.tsx",
    "plugins/app-companion/src/components/operator/CompanionStageOperatorOverlay.tsx",
    "plugins/app-companion/src/utils/app-emote-runtime.ts",
  ].map((relativePath) => path.join(elizaRoot, relativePath));

  if (requiredFiles.some((filePath) => !existsSync(filePath))) {
    return false;
  }

  const companionViewPath = path.join(
    elizaRoot,
    "plugins/app-companion/src/components/companion/CompanionView.tsx",
  );
  const companionHeaderPath = path.join(
    elizaRoot,
    "plugins/app-companion/src/components/companion/CompanionHeader.tsx",
  );
  const companionAppViewPath = path.join(
    elizaRoot,
    "plugins/app-companion/src/components/companion/CompanionAppView.tsx",
  );
  const clientAgentPath = path.join(
    elizaRoot,
    "packages/ui/src/api/client-agent.ts",
  );
  const clientChatPath = path.join(
    elizaRoot,
    "packages/ui/src/api/client-chat.ts",
  );
  const messageContentPath = path.join(
    elizaRoot,
    "packages/ui/src/components/chat/MessageContent.tsx",
  );

  if (
    [
      companionViewPath,
      companionHeaderPath,
      companionAppViewPath,
      clientAgentPath,
      clientChatPath,
      messageContentPath,
    ].some((filePath) => !existsSync(filePath))
  ) {
    return false;
  }

  const companionViewSource = readFileSync(companionViewPath, "utf8");
  const companionHeaderSource = readFileSync(companionHeaderPath, "utf8");
  const companionAppViewSource = readFileSync(companionAppViewPath, "utf8");
  const clientAgentSource = readFileSync(clientAgentPath, "utf8");
  const clientChatSource = readFileSync(clientChatPath, "utf8");
  const messageContentSource = readFileSync(messageContentPath, "utf8");

  return (
    companionViewSource.includes("companion-header-go-live") &&
    companionViewSource.includes("CompanionStageOperatorOverlay") &&
    companionHeaderSource.includes("companionControlsExtras") &&
    companionAppViewSource.includes(
      'import { CompanionView } from "./CompanionView"',
    ) &&
    companionAppViewSource.includes("<CompanionView />") &&
    clientAgentSource.includes("executeAliceOperatorPlan") &&
    clientAgentSource.includes("getEmotes") &&
    clientChatSource.includes("logConversationOperatorAction") &&
    messageContentSource.includes("action-pill")
  );
}

export function applyAliceCompanionOperatorPatch({
  rootDir,
  elizaRoot,
  log = console.log,
} = {}) {
  if (isAliceCompanionOperatorPatchPatched(elizaRoot)) {
    log(
      "[alice-eliza-runtime-patches] Alice companion operator already applied",
    );
    return "already-applied";
  }

  const patchPath = path.join(rootDir, aliceCompanionOperatorPatchRelativePath);
  if (!existsSync(patchPath)) {
    throw new Error(`missing Alice companion operator patch: ${patchPath}`);
  }

  const reverseCheck = runGitApply(
    ["apply", "--reverse", "--check", patchPath],
    { cwd: elizaRoot, allowFailure: true },
  );
  if (reverseCheck.status === 0) {
    log(
      "[alice-eliza-runtime-patches] Alice companion operator already applied",
    );
    return "already-applied";
  }

  const forwardCheck = runGitApply(["apply", "--check", patchPath], {
    cwd: elizaRoot,
    allowFailure: true,
  });
  if (forwardCheck.status !== 0) {
    throw new Error(
      `Alice companion operator patch drifted: ${
        forwardCheck.stderr.trim() || forwardCheck.stdout.trim()
      }`,
    );
  }

  runGitApply(["apply", patchPath], { cwd: elizaRoot });

  if (!isAliceCompanionOperatorPatchPatched(elizaRoot)) {
    throw new Error(
      "Alice companion operator patch applied but contract is absent",
    );
  }

  log(
    "[alice-eliza-runtime-patches] restored Alice companion operator controls",
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
    log(
      "[alice-eliza-runtime-patches] app-core API bind patch already applied",
    );
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
    log(
      "[alice-eliza-runtime-patches] app-core API bind patch already applied",
    );
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
    applyAliceCoreBrowserRuntimeEnvReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserStateDirStubsPatch({ elizaRoot, log }),
    applyAliceCoreBrowserOnboardingReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserSettingsDebugReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserCloudTopologyReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserSpokenTextReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserValidationReexportPatch({ elizaRoot, log }),
    // Must run AFTER all the core-browser wildcard re-exports above so the
    // disambiguation appears last in the file and wins for TS resolution.
    applyAliceCoreBrowserOnboardingTypesDisambiguatePatch({ elizaRoot, log }),
    applyAliceAppCoreUiCompatReexportPatch({ elizaRoot, log }),
    applyAliceAppCoreUiFullReexportPatch({ elizaRoot, log }),
    applyAliceCoreBuildBrowserExternalsPatch({ elizaRoot, log }),
    applyAliceCoreBuildBrowserExternalsMammothPatch({ elizaRoot, log }),
    applyAliceAppViteStubMammothPatch({ elizaRoot, log }),
    applyAlicePluginSqlSchemaPgliteErrorsReexportPatch({ elizaRoot, log }),
    applyAliceAppCoreAgentStatusAuthBridgePatch({ elizaRoot, log }),
    applyAliceAppCoreUpstreamAuthBridgePatch({ elizaRoot, log }),
    applyAliceAuthRateLimitAfterValidSessionPatch({ elizaRoot, log }),
    applyAliceProviderFailureNonfatalPatch({ elizaRoot, log }),
    applyAliceAppCoreDashboardFallbackRoutesPatch({ elizaRoot, log }),
    applyAliceAppCoreCodingAgentsFallbackPatch({ elizaRoot, log }),
    applyAliceAppCoreCompanionStagePatch({ elizaRoot, log }),
    applyAliceAppCoreOpenAccessPatch({ elizaRoot, log }),
    applyAliceUiAuthGatedStartupPatch({ elizaRoot, log }),
    applyAliceCompanionOperatorPatch({ rootDir, elizaRoot, log }),
    applyAliceUpstreamPackageSourceMainPatch({ elizaRoot, log }),
    applyAliceAppLifeOpsDirSubpathExportsPatch({ elizaRoot, log }),
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
