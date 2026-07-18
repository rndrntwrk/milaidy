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
export const aliceCompanionUiCompatPatchRelativePath =
  "scripts/alice-eliza-runtime-patches/alice-companion-ui-compat.patch";

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
const sharedGenerateKeywordsRelativePath =
  "packages/shared/scripts/generate-keywords.mjs";
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
const uiVrmRelativePath = "packages/ui/src/state/vrm.ts";
const uiPersistenceRelativePath = "packages/ui/src/state/persistence.ts";
const uiClientBaseRelativePath = "packages/ui/src/api/client-base.ts";
const uiClientAgentRelativePath = "packages/ui/src/api/client-agent.ts";
const uiInternalToolAppsRelativePath =
  "packages/ui/src/components/apps/internal-tool-apps.ts";
const appVincentStateRelativePath =
  "plugins/app-vincent/src/useVincentState.ts";
const agentRuntimeRelativePath = "packages/agent/src/runtime/eliza.ts";
const agentPluginCollectorRelativePath =
  "packages/agent/src/runtime/plugin-collector.ts";
const agentPluginResolverRelativePath =
  "packages/agent/src/runtime/plugin-resolver.ts";
const agentAppsRoutesRelativePath = "packages/agent/src/api/apps-routes.ts";
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
  "/api/character",
  "/api/cloud",
  "/api/coding-agents",
  "/api/companion",
  "/api/config",
  "/api/connectors",
  "/api/conversations",
  "/api/emote",
  "/api/emotes",
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
  "/api/workbench",
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

function isPublicAppHeroRoute(method: string, pathname: string): boolean {
  return method === "GET" && pathname.startsWith("/api/apps/hero/");
}

function getComputerUseApprovalsStreamToken(
  req: http.IncomingMessage,
  method: string,
  pathname: string,
): string | null {
  if (method !== "GET" || pathname !== "/api/computer-use/approvals/stream") {
    return null;
  }
  return new URL(req.url ?? "/", "http://localhost").searchParams.get("token")?.trim() || null;
}

function restoreAuthorizationHeader(
  req: http.IncomingMessage,
  previousAuthorization: http.IncomingHttpHeaders["authorization"],
): void {
  if (previousAuthorization === undefined) {
    delete req.headers.authorization;
    return;
  }
  req.headers.authorization = previousAuthorization;
}

export async function authorizeAgentStatusFallback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (!shouldBridgeAgentFallbackAuth(method, pathname)) return true;
  if (isPublicAppHeroRoute(method, pathname)) return true;

  const token = getCompatApiToken();
  const providedHeader = getProvidedApiToken(req);
  const streamToken = getComputerUseApprovalsStreamToken(req, method, pathname);
  const shouldPromoteStreamToken = Boolean(streamToken && !providedHeader);
  const previousAuthorization = req.headers.authorization;
  if (shouldPromoteStreamToken && streamToken) {
    // EventSource cannot send headers. Promote the query token through the
    // normal bearer path so paired staging auth and the legacy stream guard agree.
    req.headers.authorization = \`Bearer \${streamToken}\`;
  }

  const provided = providedHeader ?? streamToken;
  if (token && provided && tokenMatches(token, provided)) return true;

  if (isAgentApiAuthorized(req)) return true;

  if (!(await ensureRouteAuthorized(req, res, state))) {
    if (shouldPromoteStreamToken) {
      restoreAuthorizationHeader(req, previousAuthorization);
    }
    return false;
  }

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
  "/api/character",
  "/api/cloud",
  "/api/coding-agents",
  "/api/companion",
  "/api/config",
  "/api/computer-use",
  "/api/connectors",
  "/api/conversations",
  "/api/emote",
  "/api/emotes",
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
  "/api/workbench",
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

function isPublicAppHeroRoute(method: string | undefined, pathname: string): boolean {
  return (method ?? "GET").toUpperCase() === "GET" && pathname.startsWith("/api/apps/hero/");
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

  if (isPublicAppHeroRoute(req.method, pathname)) {
    req.headers.authorization = \`Bearer \${upstreamToken}\`;
    req.headers["x-api-key"] = upstreamToken;
    return true;
  }

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

function runGitApply(args, { cwd, allowFailure = false, env } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : undefined,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (!allowFailure && result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(detail || `git ${args.join(" ")} exited ${result.status}`);
  }

  return result;
}

function gitApplyOutput(result) {
  return [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
}

function isBrokenGitMetadataResult(result) {
  const output = gitApplyOutput(result);
  return (
    /not a git repository/i.test(output) ||
    /not a git repo/i.test(output) ||
    /invalid gitfile format/i.test(output) ||
    /repository .* does not exist/i.test(output)
  );
}

function parsePatchFilePath(headerValue) {
  const value = headerValue.trim().split(/\t/)[0];
  if (value === "/dev/null") return null;
  return value.replace(/^[ab]\//, "");
}

function resolvePatchTargetPath(targetRoot, relativePath) {
  const absolutePath = path.resolve(targetRoot, relativePath);
  const rootWithSeparator = path.resolve(targetRoot) + path.sep;
  if (
    absolutePath !== path.resolve(targetRoot) &&
    !absolutePath.startsWith(rootWithSeparator)
  ) {
    throw new Error(`patch target escapes root: ${relativePath}`);
  }
  return absolutePath;
}

function splitPatchSource(source) {
  if (source.length === 0) return [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function findHunkIndex(lines, oldLines, expectedIndex) {
  if (oldLines.length === 0) {
    return Math.max(0, Math.min(expectedIndex, lines.length));
  }

  const matchesAt = (index) =>
    oldLines.every((line, offset) => lines[index + offset] === line);

  if (
    expectedIndex >= 0 &&
    expectedIndex + oldLines.length <= lines.length &&
    matchesAt(expectedIndex)
  ) {
    return expectedIndex;
  }

  for (let index = 0; index <= lines.length - oldLines.length; index += 1) {
    if (matchesAt(index)) return index;
  }

  return -1;
}

function parseUnifiedPatch(patchSource) {
  const patchLines = patchSource.replace(/\r\n/g, "\n").split("\n");
  const filePatches = [];
  let currentFile = null;
  let currentHunk = null;

  const finishHunk = () => {
    if (currentFile && currentHunk) {
      currentFile.hunks.push(currentHunk);
      currentHunk = null;
    }
  };

  const finishFile = () => {
    finishHunk();
    if (currentFile) {
      filePatches.push(currentFile);
      currentFile = null;
    }
  };

  for (const line of patchLines) {
    if (line.startsWith("diff --git ")) {
      finishFile();
      currentFile = { oldPath: null, newPath: null, hunks: [] };
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith("--- ")) {
      currentFile.oldPath = parsePatchFilePath(line.slice(4));
      continue;
    }

    if (line.startsWith("+++ ")) {
      currentFile.newPath = parsePatchFilePath(line.slice(4));
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      finishHunk();
      currentHunk = {
        oldStart: Number(hunkMatch[1]),
        newStart: Number(hunkMatch[2]),
        lines: [],
      };
      continue;
    }

    if (currentHunk) {
      if (line === "\\ No newline at end of file") continue;
      if (/^[ +\-]/.test(line)) {
        currentHunk.lines.push(line);
      }
    }
  }

  finishFile();
  return filePatches.filter((filePatch) => filePatch.hunks.length > 0);
}

export function applyUnifiedPatchFile({ patchPath, targetRoot }) {
  const patchSource = readFileSync(patchPath, "utf8");
  const filePatches = parseUnifiedPatch(patchSource);

  for (const filePatch of filePatches) {
    const relativePath = filePatch.newPath ?? filePatch.oldPath;
    if (!relativePath) continue;

    const targetPath = resolvePatchTargetPath(targetRoot, relativePath);
    const originalSource = existsSync(targetPath)
      ? readFileSync(targetPath, "utf8")
      : "";
    let lines = splitPatchSource(originalSource);

    for (const hunk of filePatch.hunks) {
      const oldLines = [];
      const newLines = [];

      for (const patchLine of hunk.lines) {
        const marker = patchLine[0];
        const text = patchLine.slice(1);
        if (marker === " ") {
          oldLines.push(text);
          newLines.push(text);
        } else if (marker === "-") {
          oldLines.push(text);
        } else if (marker === "+") {
          newLines.push(text);
        }
      }

      const expectedIndex = Math.max(0, hunk.oldStart - 1);
      const hunkIndex = findHunkIndex(lines, oldLines, expectedIndex);
      if (hunkIndex < 0) {
        throw new Error(
          `patch hunk did not match ${relativePath} near line ${hunk.oldStart}`,
        );
      }

      lines.splice(hunkIndex, oldLines.length, ...newLines);
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, `${lines.join("\n")}\n`);
  }
}

export function applyPatchWithGitFallback({
  patchPath,
  targetRoot,
  driftMessage,
  log,
}) {
  const forwardCheck = runGitApply(["apply", "--check", patchPath], {
    cwd: targetRoot,
    allowFailure: true,
  });

  if (forwardCheck.status === 0) {
    runGitApply(["apply", patchPath], { cwd: targetRoot });
    return "git";
  }

  if (isBrokenGitMetadataResult(forwardCheck)) {
    const parentRoot = path.dirname(targetRoot);
    const targetDirectory = path.relative(parentRoot, targetRoot) || ".";
    const parentCheck = runGitApply(
      ["apply", `--directory=${targetDirectory}`, "--check", patchPath],
      {
        cwd: parentRoot,
        env: { GIT_DIR: "", GIT_WORK_TREE: "" },
        allowFailure: true,
      },
    );
    if (parentCheck.status === 0) {
      runGitApply(["apply", `--directory=${targetDirectory}`, patchPath], {
        cwd: parentRoot,
        env: { GIT_DIR: "", GIT_WORK_TREE: "" },
      });
      return "git-directory";
    }

    if (!isBrokenGitMetadataResult(parentCheck)) {
      throw new Error(`${driftMessage}: ${gitApplyOutput(parentCheck)}`);
    }

    log?.(
      "[alice-eliza-runtime-patches] git metadata unavailable; applying patch directly",
    );
    applyUnifiedPatchFile({ patchPath, targetRoot });
    return "direct";
  }

  throw new Error(`${driftMessage}: ${gitApplyOutput(forwardCheck)}`);
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
    source.includes("function isPublicAppHeroRoute(") &&
    source.includes("if (isPublicAppHeroRoute(req.method, pathname))") &&
    (!serverSource ||
      (serverSource.includes(
        'import { bridgeSessionAuthToUpstream } from "./server-upstream-auth-bridge";',
      ) &&
        serverSource.includes(
          "if (\n            !(await bridgeSessionAuthToUpstream(req, res, state, pathname))\n          )",
        )))
  );
}

const aliceInternalToolHeroRoutes = new Map([
  ["plugin-viewer", "/api/apps/hero/plugin-viewer"],
  ["skills-viewer", "/api/apps/hero/skills-viewer"],
  ["trajectory-viewer", "/api/apps/hero/trajectory-viewer"],
  ["relationship-viewer", "/api/apps/hero/relationship-viewer"],
  ["memory-viewer", "/api/apps/hero/memory-viewer"],
  ["runtime-debugger", "/api/apps/hero/runtime-debugger"],
  ["database-viewer", "/api/apps/hero/database-viewer"],
  ["log-viewer", "/api/apps/hero/log-viewer"],
]);

export function isAliceUiInternalToolHeroRoutesPatched(source) {
  return [...aliceInternalToolHeroRoutes].every(([slug, route]) => {
    return (
      source.includes(`heroImage: "${route}"`) &&
      !source.includes(`heroImage: "/app-heroes/${slug}.png"`)
    );
  });
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
  const hasAliceStageRoutes =
    source.includes("const ALICE_COMPANION_STAGE_DEFAULT") &&
    source.includes('url.pathname === "/api/companion/stage"') &&
    source.includes("/^\\/api\\/broadcast\\/([a-zA-Z0-9-]+)\\/stage$/") &&
    source.includes("aliceReadCompanionStageState()") &&
    source.includes("aliceWriteCompanionStageState(merged)");
  const hasCompatStageRoutes =
    source.includes("const COMPAT_COMPANION_STAGE_DEFAULT") &&
    source.includes("COMPAT_BROADCAST_STAGE_CHANNELS") &&
    source.includes('url.pathname === "/api/companion/stage"') &&
    source.includes("/^\\/api\\/broadcast\\/([a-zA-Z0-9-]+)\\/stage$/") &&
    source.includes("compatReadCompanionStageState()") &&
    source.includes("compatWriteCompanionStageState(next)") &&
    source.includes("handleCompatCompanionStageRoutes(req, res, state)");
  return hasAliceStageRoutes || hasCompatStageRoutes;
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

export function isAliceStream555RuntimePluginAutoloadPatched(source = "") {
  return (
    source.includes('const STREAM555_PLUGIN_PACKAGE = "@rndrntwrk/plugin-555stream"') &&
    source.includes("function hasStream555RuntimeEnv") &&
    source.includes('"stream555-canonical": STREAM555_PLUGIN_PACKAGE') &&
    source.includes("env: STREAM555_BASE_URL + stream auth")
  );
}

function patchAliceStream555RuntimePluginAutoloadSource(source) {
  if (isAliceStream555RuntimePluginAutoloadPatched(source)) {
    return source;
  }

  let next = source;
  const constantsAnchor = `const STORE_BUILD_LOCAL_EXECUTION_PLUGINS = new Set<string>([
  "agent-orchestrator",
  "@elizaos/plugin-agent-orchestrator",
  "@elizaos/plugin-shell",
  "@elizaos/plugin-coding-tools",
]);
`;
  const constantsPatch = `${constantsAnchor}const STREAM555_PLUGIN_PACKAGE = "@rndrntwrk/plugin-555stream";

type ConfigEnvRecord = Record<string, unknown> & {
  vars?: Record<string, unknown>;
};
`;
  if (!next.includes(constantsAnchor)) {
    throw new Error("stream555 plugin collector constants anchor drifted");
  }
  next = next.replace(constantsAnchor, constantsPatch);

  const envHelperAnchor = `function isTruthyCloudEnvValue(raw: string | undefined): boolean {
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

`;
  const envHelperPatch = `${envHelperAnchor}function readStringConfigEnvValue(
  configEnv: ConfigEnvRecord | undefined,
  key: string,
): string | undefined {
  const fromVars =
    configEnv?.vars &&
    typeof configEnv.vars === "object" &&
    !Array.isArray(configEnv.vars)
      ? configEnv.vars[key]
      : undefined;
  const value = fromVars ?? configEnv?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasStream555RuntimeEnv(
  env: NodeJS.ProcessEnv = process.env,
  configEnv?: ConfigEnvRecord,
): boolean {
  const readValue = (key: string): string | undefined =>
    env[key]?.trim() || readStringConfigEnvValue(configEnv, key);
  const baseUrl = readValue("STREAM555_BASE_URL");
  const auth =
    readValue("STREAM555_AGENT_API_KEY") ||
    readValue("STREAM555_AGENT_TOKEN") ||
    readValue("STREAM_API_BEARER_TOKEN");
  return Boolean(baseUrl && auth);
}

`;
  if (!next.includes(envHelperAnchor)) {
    throw new Error("stream555 plugin collector env helper anchor drifted");
  }
  next = next.replace(envHelperAnchor, envHelperPatch);

  const optionalMapAnchor = `  streaming: "@elizaos/plugin-streaming",
  form: "@elizaos/plugin-form",
`;
  const optionalMapPatch = `  streaming: "@elizaos/plugin-streaming",
  "stream555-canonical": STREAM555_PLUGIN_PACKAGE,
  "555stream": STREAM555_PLUGIN_PACKAGE,
  form: "@elizaos/plugin-form",
`;
  if (!next.includes(optionalMapAnchor)) {
    throw new Error("stream555 plugin collector optional map anchor drifted");
  }
  next = next.replace(optionalMapAnchor, optionalMapPatch);

  const configEnvAnchor = `  const _configEnv = config.env as
    | (Record<string, unknown> & { vars?: Record<string, unknown> })
    | undefined;
`;
  const configEnvPatch = `  const configEnv = config.env as ConfigEnvRecord | undefined;
`;
  if (!next.includes(configEnvAnchor)) {
    throw new Error("stream555 plugin collector config env anchor drifted");
  }
  next = next.replace(configEnvAnchor, configEnvPatch);

  const disabledAnchor = `  const isPluginExplicitlyDisabled = (pluginPackageName: string): boolean => {
    const marker = "/plugin-";
    const markerIndex = pluginPackageName.lastIndexOf(marker);
    const pluginId =
      markerIndex >= 0
        ? pluginPackageName.slice(markerIndex + marker.length)
        : pluginPackageName;
    return pluginEntries?.[pluginId]?.enabled === false;
  };

`;
  const disabledPatch = `${disabledAnchor}  const isStream555ExplicitlyDisabled = (): boolean =>
    isPluginExplicitlyDisabled(STREAM555_PLUGIN_PACKAGE) ||
    pluginEntries?.["stream555-canonical"]?.enabled === false;

`;
  if (!next.includes(disabledAnchor)) {
    throw new Error("stream555 plugin collector disablement anchor drifted");
  }
  next = next.replace(disabledAnchor, disabledPatch);

  const autoloadAnchor = `  // Connector plugins — load when connector has config entries
`;
  const autoloadPatch = `  if (
    hasStream555RuntimeEnv(process.env, configEnv) &&
    !isStream555ExplicitlyDisabled()
  ) {
    pluginsToLoad.add(STREAM555_PLUGIN_PACKAGE);
    track(STREAM555_PLUGIN_PACKAGE, "env: STREAM555_BASE_URL + stream auth");
  }

${autoloadAnchor}`;
  if (!next.includes(autoloadAnchor)) {
    throw new Error("stream555 plugin collector autoload anchor drifted");
  }
  next = next.replace(autoloadAnchor, autoloadPatch);

  if (!isAliceStream555RuntimePluginAutoloadPatched(next)) {
    throw new Error(
      "stream555 plugin collector patch applied but contract is absent",
    );
  }
  return next;
}

export function applyAliceStream555RuntimePluginAutoloadPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const collectorPath = path.join(elizaRoot, agentPluginCollectorRelativePath);
  if (!existsSync(collectorPath)) {
    log(
      "[alice-eliza-runtime-patches] agent plugin collector source absent; skipping 555stream autoload patch",
    );
    return "skipped";
  }

  const before = readFileSync(collectorPath, "utf8");
  if (isAliceStream555RuntimePluginAutoloadPatched(before)) {
    log(
      "[alice-eliza-runtime-patches] 555stream runtime plugin autoload already applied",
    );
    return "already-applied";
  }

  const after = patchAliceStream555RuntimePluginAutoloadSource(before);
  writeFileSync(collectorPath, after);
  log(
    "[alice-eliza-runtime-patches] patched agent plugin collector with 555stream runtime autoload",
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

const elizacloudBrowserIndexRelativePath =
  "plugins/plugin-elizacloud/src/index.browser.ts";
const elizacloudBrowserTtsStubsSentinel =
  "// [milaidy:elizacloud-browser-tts-stubs]";
const elizacloudBrowserTtsStubs = `${elizacloudBrowserTtsStubsSentinel}
// app-core imports Cloud TTS helpers while Vite bundles the browser/runtime
// surface. The real implementations remain exported by index.node.ts; these
// browser stubs only keep static named imports resolvable.
type CloudTtsEnvLike = Record<string, string | undefined>;

export function __resetCloudBaseUrlCache(): void {}

export function ensureCloudTtsApiKeyAlias(_env?: CloudTtsEnvLike): boolean {
  return false;
}

export function resolveElevenLabsApiKeyForCloudMode(
  _env?: CloudTtsEnvLike,
): string | null {
  return null;
}

export function resolveCloudTtsBaseUrl(env?: CloudTtsEnvLike): string {
  const configured = env?.ELIZAOS_CLOUD_BASE_URL?.trim();
  return configured && configured.length > 0
    ? configured.replace(/\\/+$/, "")
    : "https://www.elizacloud.ai/api/v1";
}

export function normalizeCloudSiteUrl(rawUrl?: string): string {
  const candidate = rawUrl?.trim() || "https://www.elizacloud.ai";
  try {
    const parsed = new URL(candidate);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname
      .replace(/\\/+$/, "")
      .replace(/\\/api\\/v1$/, "");
    if (
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "::1" &&
      !parsed.hostname.startsWith("127.")
    ) {
      parsed.protocol = "https:";
      parsed.port = "";
    }
    if (
      parsed.hostname === "elizacloud.ai" ||
      parsed.hostname === "www.elizacloud.ai"
    ) {
      parsed.hostname = "www.elizacloud.ai";
      parsed.pathname = "";
    }
    return parsed.toString().replace(/\\/+$/, "");
  } catch {
    return candidate.replace(/\\/+$/, "");
  }
}

export async function handleCloudTtsPreviewRoute(
  _req: unknown,
  res?: {
    statusCode?: number;
    setHeader?: (name: string, value: string) => void;
    end?: (body?: string) => void;
  },
): Promise<boolean> {
  if (res) {
    res.statusCode = 501;
    res.setHeader?.("Content-Type", "application/json");
    res.end?.(
      JSON.stringify({
        error: "Cloud TTS preview is only available in the node runtime.",
      }),
    );
  }
  return true;
}

export function mirrorCompatHeaders(_req: {
  headers?: Record<string, unknown>;
}): void {}
`;

export function isAliceElizacloudBrowserTtsStubsPatched(source) {
  return (
    source.includes(elizacloudBrowserTtsStubsSentinel) &&
    source.includes("handleCloudTtsPreviewRoute(") &&
    source.includes("export function ensureCloudTtsApiKeyAlias(") &&
    source.includes("export function normalizeCloudSiteUrl(") &&
    source.includes("export function mirrorCompatHeaders(")
  );
}

export function applyAliceElizacloudBrowserTtsStubsPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, elizacloudBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] plugin-elizacloud browser source absent; skipping Cloud TTS stub patch",
    );
    return "skipped";
  }

  const source = readFileSync(indexPath, "utf8");
  if (isAliceElizacloudBrowserTtsStubsPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] plugin-elizacloud browser Cloud TTS stubs already applied",
    );
    return "already-applied";
  }

  const clearSecretsAnchor = "export function clearCloudSecrets(): void {}\n";
  const typesAnchor = '\nexport * from "./types";';
  let next;
  if (source.includes(clearSecretsAnchor)) {
    next = source.replace(
      clearSecretsAnchor,
      `${clearSecretsAnchor}\n${elizacloudBrowserTtsStubs}\n`,
    );
  } else if (source.includes(typesAnchor)) {
    next = source.replace(
      typesAnchor,
      `\n${elizacloudBrowserTtsStubs}\n${typesAnchor}`,
    );
  } else {
    next = source.endsWith("\n")
      ? `${source}\n${elizacloudBrowserTtsStubs}\n`
      : `${source}\n\n${elizacloudBrowserTtsStubs}\n`;
  }

  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched plugin-elizacloud/src/index.browser.ts with browser-safe Cloud TTS stubs",
  );
  return "applied";
}

const coreBrowserIndexRelativePath = "packages/core/src/index.browser.ts";
const coreNodeIndexRelativePath = "packages/core/src/index.node.ts";
const coreNodeSecretAliasReexportSentinel =
  "// [milaidy:core-node-secret-alias-reexport]";
const coreNodePromptFromStateReexportSentinel =
  "// [milaidy:core-node-compose-prompt-from-state-reexport]";
const coreNodePromptFromStateReexport = `${coreNodePromptFromStateReexportSentinel}
export { composePromptFromState } from "./utils";
`;
const coreNodeSecretAliasReexportNames = [
  "resolveSecretKeyAlias",
  "SECRET_KEY_ALIASES",
  "composePromptFromState",
];

export function isAliceCoreNodeSecretAliasReexportPatched(source) {
  return coreNodeSecretAliasReexportNames.every((name) =>
    source.includes(name),
  );
}

export function applyAliceCoreNodeSecretAliasReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreNodeIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-node secret alias reexport patch",
    );
    return "skipped";
  }

  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreNodeSecretAliasReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-node secret alias reexport already applied",
    );
    return "already-applied";
  }

  let next = source;
  if (
    !next.includes("resolveSecretKeyAlias") ||
    !next.includes("SECRET_KEY_ALIASES")
  ) {
    const anchor = "\tLOCAL_MODEL_PROVIDERS,\n} from \"./constants\";";
    if (!next.includes(anchor)) {
      throw new Error(
        "core-node secret alias reexport patch drifted: constants export block anchor not found",
      );
    }

    next = next.replace(
      anchor,
      `\tLOCAL_MODEL_PROVIDERS,\n\tresolveSecretKeyAlias,\n\tSECRET_KEY_ALIASES,\n} from "./constants";\n${coreNodeSecretAliasReexportSentinel}`,
    );
  }

  if (!next.includes("composePromptFromState")) {
    next = next.endsWith("\n")
      ? `${next}\n${coreNodePromptFromStateReexport}`
      : `${next}\n\n${coreNodePromptFromStateReexport}`;
  }

  if (!isAliceCoreNodeSecretAliasReexportPatched(next)) {
    throw new Error(
      "core-node secret alias reexport patch applied but contract is absent",
    );
  }

  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.node.ts to re-export secret alias helpers required by plugin-secrets-manager",
  );
  return "applied";
}

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

const coreBrowserSkillInvocationCaptureSentinel =
  "// [milaidy:core-browser-skill-invocation-capture]";
const coreBrowserSkillInvocationCapture = `${coreBrowserSkillInvocationCaptureSentinel}
// plugin-agent-skills imports captureSkillInvocationIO from @elizaos/core.
// The canonical node implementation lives in runtime/trajectory-recorder.ts,
// but that module imports node:fs/node:os/node:path, so browser builds cannot
// re-export it wholesale. Keep the public capture contract available with a
// browser-safe implementation that mirrors the persisted shape.
export interface SkillInvocationIOInput {
\targs?: unknown;
\tresult?: unknown;
\tcapBytes?: number;
}
export type SkillInvocationTruncationMarker = {
\tfield: "args" | "result";
\toriginalBytes: number;
\tcapBytes: number;
};
export interface SkillInvocationIOCapture {
\targs?: string;
\tresult?: string;
\ttruncated?: SkillInvocationTruncationMarker[];
}
function encodeBrowserSkillInvocationValue(value: unknown): string | undefined {
\tif (value === undefined) return undefined;
\tif (typeof value === "string") return value;
\ttry {
\t\tconst encoded = JSON.stringify(value);
\t\treturn encoded === undefined ? String(value) : encoded;
\t} catch {
\t\treturn String(value);
\t}
}
function byteLengthForBrowserSkillInvocation(value: string): number {
\tif (typeof TextEncoder !== "undefined") {
\t\treturn new TextEncoder().encode(value).byteLength;
\t}
\treturn value.length;
}
function capBrowserSkillInvocationField(
\tfield: "args" | "result",
\tvalue: string,
\tcapBytes: number,
): { value: string; marker?: SkillInvocationTruncationMarker } {
\tconst originalBytes = byteLengthForBrowserSkillInvocation(value);
\tif (originalBytes <= capBytes) return { value };
\treturn {
\t\tvalue: value.slice(0, capBytes),
\t\tmarker: { field, originalBytes, capBytes },
\t};
}
export function captureSkillInvocationIO(
\tinput: SkillInvocationIOInput,
): SkillInvocationIOCapture {
\tconst capBytes = input.capBytes ?? 64 * 1024;
\tconst out: SkillInvocationIOCapture = {};
\tconst truncated: SkillInvocationTruncationMarker[] = [];
\tconst args = encodeBrowserSkillInvocationValue(input.args);
\tif (args !== undefined) {
\t\tconst capped = capBrowserSkillInvocationField("args", args, capBytes);
\t\tout.args = capped.value;
\t\tif (capped.marker) truncated.push(capped.marker);
\t}
\tconst result = encodeBrowserSkillInvocationValue(input.result);
\tif (result !== undefined) {
\t\tconst capped = capBrowserSkillInvocationField("result", result, capBytes);
\t\tout.result = capped.value;
\t\tif (capped.marker) truncated.push(capped.marker);
\t}
\tif (truncated.length > 0) out.truncated = truncated;
\treturn out;
}
`;

export function isAliceCoreBrowserSkillInvocationCapturePatched(source) {
  return (
    source.includes(coreBrowserSkillInvocationCaptureSentinel) &&
    source.includes("export function captureSkillInvocationIO")
  );
}

export function applyAliceCoreBrowserSkillInvocationCapturePatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser skill invocation capture patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserSkillInvocationCapturePatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser skill invocation capture already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserSkillInvocationCapture}`
    : `${source}\n\n${coreBrowserSkillInvocationCapture}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts with browser-safe captureSkillInvocationIO",
  );
  return "applied";
}

const coreBrowserConfirmationReexportSentinel =
  "// [milaidy:core-browser-confirmation-reexport]";
const coreBrowserConfirmationReexport = `${coreBrowserConfirmationReexportSentinel}
// plugin-agent-skills imports requireConfirmation from @elizaos/core.
// utils/confirmation.ts is browser-safe at runtime: it imports only types
// and delegates persistence to the provided runtime cache API.
export type {
\tConfirmationDecision,
\tConfirmationStatus,
\tRequireConfirmationArgs,
} from "./utils/confirmation";
export {
\tclearPendingConfirmation,
\trequireConfirmation,
} from "./utils/confirmation";
`;

export function isAliceCoreBrowserConfirmationReexportPatched(source) {
  return (
    source.includes(coreBrowserConfirmationReexportSentinel) &&
    source.includes("requireConfirmation")
  );
}

export function applyAliceCoreBrowserConfirmationReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser confirmation reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserConfirmationReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser confirmation reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserConfirmationReexport}`
    : `${source}\n\n${coreBrowserConfirmationReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts to re-export confirmation helpers",
  );
  return "applied";
}

const coreBrowserEvaluatorPrioritiesReexportSentinel =
  "// [milaidy:core-browser-evaluator-priorities-reexport]";
const coreBrowserEvaluatorPrioritiesReexport = `${coreBrowserEvaluatorPrioritiesReexportSentinel}
// plugin-form imports EvaluatorPriority from @elizaos/core. The canonical
// priorities module is a pure constant/type module with no node dependencies,
// so the browser entry should mirror the node entry for this surface.
export * from "./services/evaluator-priorities";
`;

export function isAliceCoreBrowserEvaluatorPrioritiesReexportPatched(source) {
  return source.includes(coreBrowserEvaluatorPrioritiesReexportSentinel);
}

export function applyAliceCoreBrowserEvaluatorPrioritiesReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser evaluator priorities reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserEvaluatorPrioritiesReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser evaluator priorities reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserEvaluatorPrioritiesReexport}`
    : `${source}\n\n${coreBrowserEvaluatorPrioritiesReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts to re-export evaluator priorities",
  );
  return "applied";
}

const coreBrowserMiladyRuntimeBindingsSentinel =
  "// [milaidy:core-browser-milady-runtime-bindings]";
const coreBrowserMiladyRuntimeBindings = `${coreBrowserMiladyRuntimeBindingsSentinel}
// Parent Milady's browser build statically scans some server/runtime modules
// during dev and production Vite builds. The browser entry must expose the same
// public names those modules import from the node entry, without pulling
// node-only runtime capability graphs into the SPA.
export {
\tresolveSecretKeyAlias,
\tSECRET_KEY_ALIASES,
} from "./constants/secrets";
export {
\tDEFAULT_ELIZA_CLOUD_FREE_TEXT_MODEL,
\tDEFAULT_ELIZA_CLOUD_TEXT_MODEL,
} from "./contracts/service-routing";
export function createBasicCapabilitiesPlugin() {
\treturn { name: "stub" };
}
`;

export function isAliceCoreBrowserMiladyRuntimeBindingsPatched(source) {
  return source.includes(coreBrowserMiladyRuntimeBindingsSentinel);
}

export function applyAliceCoreBrowserMiladyRuntimeBindingsPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser milady runtime bindings patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserMiladyRuntimeBindingsPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser milady runtime bindings already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserMiladyRuntimeBindings}`
    : `${source}\n\n${coreBrowserMiladyRuntimeBindings}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts with browser-safe Milady runtime bindings (secret aliases, service defaults, basic capabilities shim)",
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

const coreBrowserOnboardingStateReexportSentinel =
  "// [milaidy:core-browser-onboarding-state-reexport]";
const coreBrowserOnboardingStateReexport = `${coreBrowserOnboardingStateReexportSentinel}
// eliza/packages/core/src/services/onboarding-state.ts exports the
// OnboardingStateMachine runtime, isOnboardingComplete, and related wizard
// helpers. index.node.ts and index.edge.ts both expose this module, but
// index.browser.ts omits it. The secrets-manager plugin statically imports
// OnboardingStateMachine from @elizaos/core during the SPA build, so mirror
// the edge/node public surface here instead of stubbing plugin code.
export * from "./services/onboarding-state";
`;

export function isAliceCoreBrowserOnboardingStateReexportPatched(source) {
  return source.includes(coreBrowserOnboardingStateReexportSentinel);
}

export function applyAliceCoreBrowserOnboardingStateReexportPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const indexPath = path.join(elizaRoot, coreBrowserIndexRelativePath);
  if (!existsSync(indexPath)) {
    log(
      "[alice-eliza-runtime-patches] eliza core source absent; skipping core-browser onboarding-state reexport patch",
    );
    return "skipped";
  }
  const source = readFileSync(indexPath, "utf8");
  if (isAliceCoreBrowserOnboardingStateReexportPatched(source)) {
    log(
      "[alice-eliza-runtime-patches] core-browser onboarding-state reexport already applied",
    );
    return "already-applied";
  }
  const next = source.endsWith("\n")
    ? `${source}\n${coreBrowserOnboardingStateReexport}`
    : `${source}\n\n${coreBrowserOnboardingStateReexport}`;
  writeFileSync(indexPath, next);
  log(
    "[alice-eliza-runtime-patches] patched core index.browser.ts to re-export services/onboarding-state (OnboardingStateMachine + completion helpers)",
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

  let patched = next;
  if (!patched.includes("function isPublicAppHeroRoute(")) {
    const functionAnchor = `export async function bridgeSessionAuthToUpstream(
`;
    if (!patched.includes(functionAnchor)) {
      throw new Error(
        "app-core upstream auth bridge public hero function anchor drifted",
      );
    }
    patched = patched.replace(
      functionAnchor,
      `function isPublicAppHeroRoute(method: string | undefined, pathname: string): boolean {
  return (method ?? "GET").toUpperCase() === "GET" && pathname.startsWith("/api/apps/hero/");
}

${functionAnchor}`,
    );
  }

  if (!patched.includes("if (isPublicAppHeroRoute(req.method, pathname))")) {
    const tokenAnchor = `  const upstreamToken = resolveApiToken(process.env);
  if (!upstreamToken) return true;

`;
    if (!patched.includes(tokenAnchor)) {
      throw new Error(
        "app-core upstream auth bridge public hero token anchor drifted",
      );
    }
    patched = patched.replace(
      tokenAnchor,
      `${tokenAnchor}  if (isPublicAppHeroRoute(req.method, pathname)) {
    req.headers.authorization = \`Bearer \${upstreamToken}\`;
    req.headers["x-api-key"] = upstreamToken;
    return true;
  }

`,
    );
  }

  if (!isAliceAppCoreUpstreamAuthBridgePatched(patched)) {
    throw new Error(
      "app-core upstream auth bridge patch applied but contract is absent",
    );
  }
  return patched;
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

function patchAliceUiInternalToolHeroRoutesSource(source) {
  let next = source;
  for (const [slug, route] of aliceInternalToolHeroRoutes) {
    next = next.replaceAll(
      `heroImage: "/app-heroes/${slug}.png"`,
      `heroImage: "${route}"`,
    );
  }
  if (!isAliceUiInternalToolHeroRoutesPatched(next)) {
    throw new Error(
      "ui internal tool hero routes patch applied but contract is absent",
    );
  }
  return next;
}

export function applyAliceUiInternalToolHeroRoutesPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const internalToolAppsPath = path.join(
    elizaRoot,
    uiInternalToolAppsRelativePath,
  );
  if (!existsSync(internalToolAppsPath)) {
    log(
      "[alice-eliza-runtime-patches] ui internal tool apps source absent; skipping hero route patch",
    );
    return "skipped";
  }

  const before = readFileSync(internalToolAppsPath, "utf8");
  const after = patchAliceUiInternalToolHeroRoutesSource(before);
  if (after === before) {
    log(
      "[alice-eliza-runtime-patches] ui internal tool hero routes already applied",
    );
    return "already-applied";
  }

  writeFileSync(internalToolAppsPath, after);
  log("[alice-eliza-runtime-patches] patched ui internal tool hero routes");
  return "applied";
}

function isAliceAgentAppsHeroFallbackPatched(source) {
  return (
    source.includes("function createGeneratedAppHeroFallback(") &&
    source.includes("return createGeneratedAppHeroFallback(slug);")
  );
}

function patchAliceAgentAppsHeroFallbackSource(source) {
  if (isAliceAgentAppsHeroFallbackPatched(source)) return source;

  const typeAnchor = `type ResolvedAppHero =
  | { kind: "file"; absolutePath: string; contentType: string }
  | { kind: "generated"; svg: string };
`;
  const typePatch = `${typeAnchor}
function createGeneratedAppHeroFallback(slug: string): ResolvedAppHero {
  return {
    kind: "generated",
    svg: createGeneratedAppHeroSvg({
      name: slug,
      displayName: packageNameToAppDisplayName(slug),
      category: "app",
      description: "",
    }),
  };
}
`;
  if (!source.includes(typeAnchor)) {
    throw new Error("agent apps hero fallback type anchor drifted");
  }

  let next = source.replace(typeAnchor, typePatch);
  const refreshAnchor = `  const registry = await pluginManager.refreshRegistry();
  for (const entry of registry.values()) {
`;
  const refreshPatch = `  let registry: Map<string, RegistryPluginInfo>;
  try {
    registry = await pluginManager.refreshRegistry();
  } catch {
    return createGeneratedAppHeroFallback(slug);
  }

  for (const entry of registry.values()) {
`;
  if (!next.includes(refreshAnchor)) {
    throw new Error("agent apps hero fallback refresh anchor drifted");
  }
  next = next.replace(refreshAnchor, refreshPatch);

  if (!isAliceAgentAppsHeroFallbackPatched(next)) {
    throw new Error("agent apps hero fallback patch contract is absent");
  }
  return next;
}

export function applyAliceAgentAppsHeroFallbackPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const appsRoutesPath = path.join(elizaRoot, agentAppsRoutesRelativePath);
  if (!existsSync(appsRoutesPath)) {
    log(
      "[alice-eliza-runtime-patches] agent apps routes source absent; skipping hero fallback",
    );
    return "skipped";
  }

  const before = readFileSync(appsRoutesPath, "utf8");
  const after = patchAliceAgentAppsHeroFallbackSource(before);
  if (after === before && isAliceAgentAppsHeroFallbackPatched(after)) {
    log(
      "[alice-eliza-runtime-patches] agent apps hero fallback already applied",
    );
    return "already-applied";
  }

  writeFileSync(appsRoutesPath, after);
  if (!isAliceAgentAppsHeroFallbackPatched(after)) {
    throw new Error(
      "agent apps hero fallback patch applied but contract is absent",
    );
  }

  log("[alice-eliza-runtime-patches] patched agent apps hero fallback");
  return "applied";
}

function isAliceRootAgentAppsHeroFallbackPatched(source) {
  return (
    source.includes("packageNameToAppDisplayName") &&
    source.includes("function sendGeneratedAppHeroFallback") &&
    source.includes('pathname.startsWith("/api/apps/hero/")')
  );
}

function patchAliceRootAgentAppsHeroFallbackSource(source) {
  if (isAliceRootAgentAppsHeroFallbackPatched(source)) {
    return source;
  }

  const importAnchor = `  hasAppInterface,
  packageNameToAppRouteSlug,
} from "../contracts/apps.js";
`;
  const importPatch = `  hasAppInterface,
  packageNameToAppDisplayName,
  packageNameToAppRouteSlug,
} from "../contracts/apps.js";
`;
  if (!source.includes(importAnchor)) {
    throw new Error("root agent apps hero fallback import anchor drifted");
  }

  const helperAnchor = `function isNonAppRegistryPlugin(plugin: RegistryPluginInfo): boolean {
  return !hasAppInterface(plugin);
}

`;
  const helperPatch = `${helperAnchor}function escapeAppHeroText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createGeneratedAppHeroSvgFallback(slug: string): string {
  const displayName = packageNameToAppDisplayName(slug) || slug;
  const initials = displayName
    .split(/\\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const title = escapeAppHeroText(displayName);
  const mark = escapeAppHeroText(initials || "A");

  return \`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="\${title} app artwork"><defs><linearGradient id="aliceHeroBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151515"/><stop offset="1" stop-color="#332806"/></linearGradient></defs><rect width="1200" height="675" fill="url(#aliceHeroBg)"/><circle cx="960" cy="150" r="190" fill="#8a6f14" opacity="0.2"/><circle cx="230" cy="560" r="230" fill="#d6a91d" opacity="0.14"/><rect x="92" y="86" width="1016" height="503" rx="28" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.14)"/><text x="144" y="192" fill="#d7b84a" font-family="Inter, Arial, sans-serif" font-size="28" letter-spacing="4">ALICE APP</text><text x="144" y="328" fill="#fff8db" font-family="Inter, Arial, sans-serif" font-size="82" font-weight="700">\${title}</text><text x="144" y="422" fill="#cabd8d" font-family="Inter, Arial, sans-serif" font-size="30">Generated staging artwork</text><circle cx="960" cy="426" r="96" fill="#d6a91d"/><text x="960" y="460" text-anchor="middle" fill="#171309" font-family="Inter, Arial, sans-serif" font-size="70" font-weight="800">\${mark}</text></svg>\`;
}

function sendGeneratedAppHeroFallback(res: unknown, slug: string): void {
  const svg = createGeneratedAppHeroSvgFallback(slug);
  const data = Buffer.from(svg, "utf8");
  const response = res as {
    writeHead?: (
      status: number,
      headers: Record<string, string | number>,
    ) => void;
    setHeader?: (name: string, value: string | number) => void;
    end?: (chunk?: unknown) => void;
  };
  if (typeof response.writeHead === "function") {
    response.writeHead(200, {
      "Content-Type": "image/svg+xml",
      "Content-Length": data.byteLength,
      "Cache-Control": "public, max-age=300",
    });
  } else if (typeof response.setHeader === "function") {
    response.setHeader("Content-Type", "image/svg+xml");
    response.setHeader("Content-Length", data.byteLength);
    response.setHeader("Cache-Control", "public, max-age=300");
  }
  response.end?.(data);
}

`;
  if (!source.includes(helperAnchor)) {
    throw new Error("root agent apps hero fallback helper anchor drifted");
  }

  const routeAnchor = `  } = ctx;

  if (method === "GET" && pathname === "/api/apps") {
`;
  const routePatch = `  } = ctx;

  if (method === "GET" && pathname.startsWith("/api/apps/hero/")) {
    const slug = decodeURIComponent(
      pathname.slice("/api/apps/hero/".length),
    ).trim();
    if (!slug) {
      error(res, "app slug is required");
      return true;
    }
    sendGeneratedAppHeroFallback(res, slug);
    return true;
  }

  if (method === "GET" && pathname === "/api/apps") {
`;
  if (!source.includes(routeAnchor)) {
    throw new Error("root agent apps hero fallback route anchor drifted");
  }

  const next = source
    .replace(importAnchor, importPatch)
    .replace(helperAnchor, helperPatch)
    .replace(routeAnchor, routePatch);

  if (!isAliceRootAgentAppsHeroFallbackPatched(next)) {
    throw new Error("root agent apps hero fallback patch contract is absent");
  }
  return next;
}

export function applyAliceRootAgentAppsHeroFallbackPatch({
  rootDir = repoRoot,
  log = console.log,
} = {}) {
  const appsRoutesPath = path.join(rootDir, agentAppsRoutesRelativePath);
  if (!existsSync(appsRoutesPath)) {
    log(
      "[alice-eliza-runtime-patches] root agent apps routes source absent; skipping hero fallback",
    );
    return "skipped";
  }

  const before = readFileSync(appsRoutesPath, "utf8");
  const after = patchAliceRootAgentAppsHeroFallbackSource(before);
  if (after === before && isAliceRootAgentAppsHeroFallbackPatched(after)) {
    log(
      "[alice-eliza-runtime-patches] root agent apps hero fallback already applied",
    );
    return "already-applied";
  }

  writeFileSync(appsRoutesPath, after);
  if (!isAliceRootAgentAppsHeroFallbackPatched(after)) {
    throw new Error(
      "root agent apps hero fallback patch applied but contract is absent",
    );
  }

  log("[alice-eliza-runtime-patches] patched root agent apps hero fallback");
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
    ) &&
    source.includes("Bearer path — configured API token or session id.") &&
    source.includes(
      "if (expectedToken && tokenMatches(expectedToken, provided)) return true;",
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
  if (next.includes(syncOld)) {
    next = next.replace(syncOld, syncNew);
  } else if (!next.includes(syncNew)) {
    throw new Error("app-core auth sync rate-limit anchor drifted");
  }

  const asyncStartOld = `  const ip = req.socket?.remoteAddress ?? null;
  if (isAuthRateLimited(ip)) {
    sendJsonError(res, 429, "Too many authentication attempts");
    return false;
  }

  if (isTrustedLocalRequest(req)) return true;

  const method = (req.method ?? "GET").toUpperCase();`;
  const asyncStartNew = `  if (isTrustedLocalRequest(req)) return true;

  const method = (req.method ?? "GET").toUpperCase();`;
  if (next.includes(asyncStartOld)) {
    next = next.replace(asyncStartOld, asyncStartNew);
  } else if (!next.includes(asyncStartNew)) {
    throw new Error("app-core auth async rate-limit entry anchor drifted");
  }

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
  if (asyncFailureIndex !== -1) {
    next =
      next.slice(0, asyncFailureIndex) +
      asyncFailureNew +
      next.slice(asyncFailureIndex + asyncFailureOld.length);
  } else if (!next.includes(asyncFailureNew)) {
    throw new Error("app-core auth async rate-limit failure anchor drifted");
  }

  const asyncBearerDocOld = ` *   1. valid \`eliza_session\` cookie → session in DB → authorised.
 *   2. session-id bearer header.`;
  const asyncBearerDocNew = ` *   1. valid \`eliza_session\` cookie → session in DB → authorised.
 *   2. configured API token bearer header.
 *   3. session-id bearer header.`;
  if (!next.includes(asyncBearerDocNew)) {
    if (!next.includes(asyncBearerDocOld)) {
      throw new Error("app-core auth async bearer doc anchor drifted");
    }
    next = next.replace(asyncBearerDocOld, asyncBearerDocNew);
  }

  const asyncBearerOld = `  // Bearer path — session id only.
  // Bearer-auth requests are exempt from CSRF (they're not cookie-bound).
  const provided = getProvidedApiToken(req);
  if (provided) {
    const sessionFromBearer = await findActiveSession(
      options.store,
      provided,
      options.now,
    ).catch(() => null);
    if (sessionFromBearer) return true;
  }`;
  const asyncBearerNew = `  // Bearer path — configured API token or session id.
  // Bearer-auth requests are exempt from CSRF (they're not cookie-bound).
  const provided = getProvidedApiToken(req);
  if (provided) {
    const expectedToken = getCompatApiToken();
    if (expectedToken && tokenMatches(expectedToken, provided)) return true;

    const sessionFromBearer = await findActiveSession(
      options.store,
      provided,
      options.now,
    ).catch(() => null);
    if (sessionFromBearer) return true;
  }`;
  if (!next.includes(asyncBearerNew)) {
    if (!next.includes(asyncBearerOld)) {
      throw new Error("app-core auth async bearer anchor drifted");
    }
    next = next.replace(asyncBearerOld, asyncBearerNew);
  }

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
  let next = source;

  const compatImportAnchor = `  getConfiguredCompatAgentName,
} from "./compat-route-shared";
`;
  const compatImportPatch = `  getConfiguredCompatAgentName,
  readCompatJsonBody,
} from "./compat-route-shared";
`;
  const compatImportMatch = next.match(
    /import \{[\s\S]*?\} from "\.\/compat-route-shared";/,
  )?.[0];
  if (!compatImportMatch?.includes("readCompatJsonBody")) {
    if (!next.includes(compatImportAnchor)) {
      throw new Error("app-core companion stage compat import anchor drifted");
    }
    next = next.replace(compatImportAnchor, compatImportPatch);
  }

  if (isAliceAppCoreCompanionStagePatched(next)) {
    return next;
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

export function isAliceUiSameOriginWebsocketPatched(source = "") {
  return (
    source.includes("Keep same-origin WS available for real web hosts.") &&
    source.includes("const normalizedHost = host.trim().toLowerCase();") &&
    source.includes("const isNativePlaceholderHost =") &&
    source.includes('normalizedHost === "-"') &&
    source.includes('normalizedHost === "[::1]"') &&
    source.includes("if (isNativePlaceholderHost && !hasPort) return;")
  );
}

function patchAliceUiClientBaseSameOriginWebsocketSource(source) {
  if (isAliceUiSameOriginWebsocketPatched(source)) {
    return source;
  }

  const anchor = `    // On Capacitor native (iosScheme/androidScheme = "https"), the origin host
    // is a dummy bundle host (e.g. "localhost" with no server behind it).
    // Skip WS if we have no explicit baseUrl and the host doesn't look like a
    // real backend (no port, not an IP, not a known API domain).
    if (!this.baseUrl && typeof host === "string") {
      const hasPort = host.includes(":");
      const isLoopback =
        host.startsWith("127.") || host.startsWith("localhost:");
      if (!hasPort && !isLoopback) return;
    }
`;
  const patch = `    // On Capacitor native (iosScheme/androidScheme = "https"), the origin host
    // can be a dummy bundle host (e.g. "localhost" with no server behind it).
    // Keep same-origin WS available for real web hosts.
    if (!this.baseUrl && typeof host === "string") {
      const normalizedHost = host.trim().toLowerCase();
      const hasPort = /(?::\\d+|\\]:\\d+)$/.test(normalizedHost);
      const isNativePlaceholderHost =
        normalizedHost === "-" ||
        normalizedHost === "localhost" ||
        normalizedHost === "127.0.0.1" ||
        normalizedHost === "[::1]";
      if (isNativePlaceholderHost && !hasPort) return;
    }
`;

  if (!source.includes(anchor)) {
    throw new Error("UI client-base same-origin websocket anchor drifted");
  }
  return source.replace(anchor, patch);
}

export function applyAliceUiSameOriginWebsocketPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const clientBasePath = path.join(elizaRoot, uiClientBaseRelativePath);
  if (!existsSync(clientBasePath)) {
    throw new Error("Alice UI client-base websocket target missing");
  }

  const before = readFileSync(clientBasePath, "utf8");
  if (isAliceUiSameOriginWebsocketPatched(before)) {
    log(
      "[alice-eliza-runtime-patches] UI same-origin websocket patch already applied",
    );
    return "already-applied";
  }

  const after = patchAliceUiClientBaseSameOriginWebsocketSource(before);
  if (!isAliceUiSameOriginWebsocketPatched(after)) {
    throw new Error(
      "Alice UI same-origin websocket patch applied but contract is absent",
    );
  }

  writeFileSync(clientBasePath, after);
  log("[alice-eliza-runtime-patches] patched UI same-origin websocket guard");
  return "applied";
}

const aliceUiVrmDefaultSource = [
  'import { type BundledVrmAsset, getBootConfig } from "../config/boot-config";',
  'import { resolveAppAssetUrl } from "../utils/asset-url";',
  'import type { UiTheme } from "./ui-preferences";',
  "",
  "const DEFAULT_VISUAL_AVATAR_INDEX = 9;",
  'const BUNDLED_VRM_FALLBACK_SLUG = "milady-1";',
  "const BUNDLED_AVATAR_IMAGE_VERSION_BY_SLUG: Record<string, string> = {",
  '  "milady-9": "20260413-alice-capture",',
  "};",
  "",
  "function resolveBundledAvatarImageUrl(assetPath: string, slug: string): string {",
  "  const version = BUNDLED_AVATAR_IMAGE_VERSION_BY_SLUG[slug];",
  "  const versionedPath = version ? `${assetPath}?v=${version}` : assetPath;",
  "  return resolveAppAssetUrl(versionedPath);",
  "}",
  "",
  "function getAssets(): BundledVrmAsset[] {",
  "  const assets = getBootConfig().vrmAssets;",
  "  if (Array.isArray(assets) && assets.length > 0) {",
  "    return assets;",
  "  }",
  "  return [];",
  "}",
  "",
  "export function getVrmCount(): number {",
  "  return getAssets().length;",
  "}",
  "",
  "export const DEFAULT_BUNDLED_VRM_INDEX = DEFAULT_VISUAL_AVATAR_INDEX;",
  "",
  "function findAliceBundledVrmIndex(assets: BundledVrmAsset[]): number | null {",
  "  return getBundledAssetForIndex(assets, DEFAULT_VISUAL_AVATAR_INDEX)",
  "    ? DEFAULT_VISUAL_AVATAR_INDEX",
  "    : null;",
  "}",
  "",
  "function rosterUsesIndexedSlugs(assets: BundledVrmAsset[]): boolean {",
  "  return assets.some((asset) => /-\\d+$/.test(asset.slug));",
  "}",
  "",
  "function getBundledAssetForIndex(",
  "  assets: BundledVrmAsset[],",
  "  index: number,",
  "): BundledVrmAsset | undefined {",
  "  if (index < 1) return undefined;",
  "  const indexed = assets.find((asset) => asset.slug.endsWith(`-${index}`));",
  "  if (indexed) return indexed;",
  "  if (rosterUsesIndexedSlugs(assets)) return undefined;",
  "  return assets[index - 1];",
  "}",
  "",
  "export function getDefaultBundledVrmIndex(): number {",
  "  const assets = getAssets();",
  "  const count = assets.length;",
  "  if (count <= 0) return 1;",
  "  return findAliceBundledVrmIndex(assets) ?? 1;",
  "}",
  "",
  "export const VRM_COUNT = DEFAULT_BUNDLED_VRM_INDEX;",
  "",
  "export function normalizeAvatarIndex(index: number): number {",
  "  if (!Number.isFinite(index)) return getDefaultBundledVrmIndex();",
  "  const n = Math.trunc(index);",
  "  if (n === 0) return 0;",
  "  const assets = getAssets();",
  "  if (assets.length <= 0) return 1;",
  "  if (!getBundledAssetForIndex(assets, n)) return getDefaultBundledVrmIndex();",
  "  return n;",
  "}",
  "",
  "export function isAliceBundledAvatarIndex(index: number): boolean {",
  "  if (!Number.isFinite(index)) return false;",
  "  return Math.trunc(index) === DEFAULT_VISUAL_AVATAR_INDEX;",
  "}",
  "",
  "export function getVrmUrl(index: number): string {",
  "  const assets = getAssets();",
  "  if (assets.length === 0) {",
  "    return resolveAppAssetUrl(`vrms/${BUNDLED_VRM_FALLBACK_SLUG}.vrm.gz`);",
  "  }",
  "  const n = normalizeAvatarIndex(index);",
  "  const safe = n > 0 ? n : getDefaultBundledVrmIndex();",
  "  const slug =",
  '    getBundledAssetForIndex(assets, safe)?.slug ?? assets[0]?.slug ?? "default";',
  "  return resolveAppAssetUrl(`vrms/${slug}.vrm.gz`);",
  "}",
  "",
  "export function getVrmPreviewUrl(index: number): string {",
  "  const assets = getAssets();",
  "  if (assets.length === 0) {",
  "    return resolveAppAssetUrl(`vrms/previews/${BUNDLED_VRM_FALLBACK_SLUG}.png`);",
  "  }",
  "  const n = normalizeAvatarIndex(index);",
  "  const safe = n > 0 ? n : getDefaultBundledVrmIndex();",
  "  const slug =",
  '    getBundledAssetForIndex(assets, safe)?.slug ?? assets[0]?.slug ?? "default";',
  "  return resolveBundledAvatarImageUrl(`vrms/previews/${slug}.png`, slug);",
  "}",
  "",
  "export function getVrmBackgroundUrl(index: number): string {",
  "  const assets = getAssets();",
  "  if (assets.length === 0) {",
  "    return resolveAppAssetUrl(",
  "      `vrms/backgrounds/${BUNDLED_VRM_FALLBACK_SLUG}.png`,",
  "    );",
  "  }",
  "  const n = normalizeAvatarIndex(index);",
  "  const safe = n > 0 ? n : getDefaultBundledVrmIndex();",
  "  const slug =",
  '    getBundledAssetForIndex(assets, safe)?.slug ?? assets[0]?.slug ?? "default";',
  "  return resolveBundledAvatarImageUrl(`vrms/backgrounds/${slug}.png`, slug);",
  "}",
  "",
  "const COMPANION_THEME_BACKGROUND_INDEX: Record<UiTheme, number> = {",
  "  light: 3,",
  "  dark: 4,",
  "};",
  "",
  "export function getCompanionBackgroundUrl(theme: UiTheme): string {",
  "  return getVrmBackgroundUrl(COMPANION_THEME_BACKGROUND_INDEX[theme]);",
  "}",
  "",
  "export function getVrmTitle(index: number): string {",
  "  const assets = getAssets();",
  '  if (assets.length === 0) return "Avatar";',
  "  const n = normalizeAvatarIndex(index);",
  "  const safe = n > 0 ? n : getDefaultBundledVrmIndex();",
  "  return (",
  '    getBundledAssetForIndex(assets, safe)?.title ?? assets[0]?.title ?? "Avatar"',
  "  );",
  "}",
  "",
].join("\n");

export function isAliceUiVrmDefaultPatched(source = "") {
  return (
    source.includes("const DEFAULT_VISUAL_AVATAR_INDEX = 9;") &&
    source.includes('const BUNDLED_VRM_FALLBACK_SLUG = "milady-1";') &&
    source.includes("BUNDLED_AVATAR_IMAGE_VERSION_BY_SLUG") &&
    source.includes("export function getDefaultBundledVrmIndex(): number") &&
    source.includes("export const VRM_COUNT = DEFAULT_BUNDLED_VRM_INDEX;")
  );
}

export function patchAliceUiVrmDefaultSource(source = "") {
  let next = source.replace(
    'import { DEFAULT_VISUAL_AVATAR_INDEX } from "@elizaos/shared/onboarding-presets";\n',
    "",
  );

  if (
    !next.includes("const DEFAULT_VISUAL_AVATAR_INDEX = 9;") &&
    next.includes('import type { UiTheme } from "./ui-preferences";')
  ) {
    next = next.replace(
      'import type { UiTheme } from "./ui-preferences";\n',
      'import type { UiTheme } from "./ui-preferences";\n\nconst DEFAULT_VISUAL_AVATAR_INDEX = 9;\n',
    );
  }

  if (isAliceUiVrmDefaultPatched(next)) return next;

  if (
    !source.includes('const BUNDLED_VRM_FALLBACK_SLUG = "bundled-1";') ||
    !source.includes("export const VRM_COUNT = 8;")
  ) {
    throw new Error("Alice UI VRM default patch drifted");
  }

  return aliceUiVrmDefaultSource;
}

export function applyAliceUiVrmDefaultPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const targetPath = path.join(elizaRoot, uiVrmRelativePath);
  if (!existsSync(targetPath)) {
    throw new Error("Alice UI VRM source missing");
  }

  const before = readFileSync(targetPath, "utf8");
  if (isAliceUiVrmDefaultPatched(before)) {
    log("[alice-eliza-runtime-patches] UI VRM default already applied");
    return "already-applied";
  }

  const after = patchAliceUiVrmDefaultSource(before);
  if (!isAliceUiVrmDefaultPatched(after)) {
    throw new Error("Alice UI VRM default patch applied but contract is absent");
  }

  writeFileSync(targetPath, after);
  log("[alice-eliza-runtime-patches] patched UI VRM default");
  return "applied";
}

export function isAliceSharedKeywordAppleDoublePatched(source = "") {
  return source.includes('!f.startsWith("._") && f.endsWith(".keywords.json")');
}

export function applyAliceSharedKeywordAppleDoublePatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const targetPath = path.join(elizaRoot, sharedGenerateKeywordsRelativePath);
  if (!existsSync(targetPath)) {
    log("[alice-eliza-runtime-patches] shared keyword generator absent; skipping AppleDouble patch");
    return "skipped";
  }

  const before = readFileSync(targetPath, "utf8");
  if (isAliceSharedKeywordAppleDoublePatched(before)) {
    log("[alice-eliza-runtime-patches] shared keyword AppleDouble filter already applied");
    return "already-applied";
  }

  const needle = `  const files = readdirSync(keywordsDir).filter((f) =>
    f.endsWith(".keywords.json"),
  );`;
  const replacement = `  const files = readdirSync(keywordsDir).filter(
    (f) => !f.startsWith("._") && f.endsWith(".keywords.json"),
  );`;
  if (!before.includes(needle)) {
    throw new Error("Alice shared keyword AppleDouble patch drifted");
  }

  const after = before.replace(needle, replacement);
  if (!isAliceSharedKeywordAppleDoublePatched(after)) {
    throw new Error(
      "Alice shared keyword AppleDouble patch applied but contract is absent",
    );
  }

  writeFileSync(targetPath, after);
  log("[alice-eliza-runtime-patches] patched shared keyword AppleDouble filter");
  return "applied";
}

export function isAliceUiAvatarDefaultMigrationPatched(source = "") {
  return (
    source.includes(
      'const AVATAR_DEFAULT_MARKER_KEY = "eliza_avatar_default_index"',
    ) &&
    source.includes("const defaultIndex = getDefaultBundledVrmIndex();") &&
    source.includes("localStorage.getItem(AVATAR_DEFAULT_MARKER_KEY)")
  );
}

export function patchAliceUiAvatarDefaultMigrationSource(source = "") {
  if (isAliceUiAvatarDefaultMigrationPatched(source)) return source;

  let next = source;
  next = next.replace(
    'import { normalizeAvatarIndex } from "./vrm";',
    'import { getDefaultBundledVrmIndex, normalizeAvatarIndex } from "./vrm";',
  );
  next = next.replace(
    'const AVATAR_INDEX_KEY = "eliza_avatar_index";\n',
    'const AVATAR_INDEX_KEY = "eliza_avatar_index";\nconst AVATAR_DEFAULT_MARKER_KEY = "eliza_avatar_default_index";\n',
  );
  next = next.replace(
    `export function loadAvatarIndex(): number {
  return tryLocalStorage(() => {
    const stored = localStorage.getItem(AVATAR_INDEX_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      return normalizeAvatarIndex(n);
    }
    return 1;
  }, 1);
}

export function saveAvatarIndex(index: number): void {
  tryLocalStorage(() => {
    localStorage.setItem(AVATAR_INDEX_KEY, String(normalizeAvatarIndex(index)));
  }, undefined);
}

export function clearAvatarIndex(): void {
  tryLocalStorage(() => {
    localStorage.removeItem(AVATAR_INDEX_KEY);
  }, undefined);
}`,
    `export function loadAvatarIndex(): number {
  return tryLocalStorage(() => {
    const defaultIndex = getDefaultBundledVrmIndex();
    const defaultMarker = localStorage.getItem(AVATAR_DEFAULT_MARKER_KEY);
    const stored = localStorage.getItem(AVATAR_INDEX_KEY);
    if (defaultMarker !== String(defaultIndex)) {
      localStorage.setItem(AVATAR_DEFAULT_MARKER_KEY, String(defaultIndex));
      if (stored) {
        localStorage.setItem(AVATAR_INDEX_KEY, String(defaultIndex));
      }
      return defaultIndex;
    }
    if (stored) {
      const n = parseInt(stored, 10);
      return normalizeAvatarIndex(n);
    }
    return defaultIndex;
  }, getDefaultBundledVrmIndex());
}

export function saveAvatarIndex(index: number): void {
  tryLocalStorage(() => {
    localStorage.setItem(
      AVATAR_DEFAULT_MARKER_KEY,
      String(getDefaultBundledVrmIndex()),
    );
    localStorage.setItem(AVATAR_INDEX_KEY, String(normalizeAvatarIndex(index)));
  }, undefined);
}

export function clearAvatarIndex(): void {
  tryLocalStorage(() => {
    localStorage.removeItem(AVATAR_INDEX_KEY);
    localStorage.removeItem(AVATAR_DEFAULT_MARKER_KEY);
  }, undefined);
}`,
  );

  if (!isAliceUiAvatarDefaultMigrationPatched(next)) {
    throw new Error("Alice UI avatar default migration patch drifted");
  }
  return next;
}

export function applyAliceUiAvatarDefaultMigrationPatch({
  elizaRoot,
  log = console.log,
} = {}) {
  const targetPath = path.join(elizaRoot, uiPersistenceRelativePath);
  if (!existsSync(targetPath)) {
    log(
      "[alice-eliza-runtime-patches] UI persistence source absent; skipping avatar default migration",
    );
    return "skipped";
  }

  const before = readFileSync(targetPath, "utf8");
  if (isAliceUiAvatarDefaultMigrationPatched(before)) {
    log(
      "[alice-eliza-runtime-patches] UI avatar default migration already applied",
    );
    return "already-applied";
  }

  const after = patchAliceUiAvatarDefaultMigrationSource(before);
  writeFileSync(targetPath, after);
  log("[alice-eliza-runtime-patches] patched UI avatar default migration");
  return "applied";
}

export function isAliceCompanionUiCompatPatched(elizaRoot) {
  const requiredFiles = [
    "packages/ui/src/api/client-types-alice.ts",
    "packages/ui/src/api/client-agent.ts",
    "packages/ui/src/api/client-chat.ts",
    "packages/ui/src/components/chat/MessageContent.tsx",
  ].map((relativePath) => path.join(elizaRoot, relativePath));

  if (requiredFiles.some((filePath) => !existsSync(filePath))) {
    return false;
  }

  const clientAgentSource = readFileSync(requiredFiles[1], "utf8");
  const clientChatSource = readFileSync(requiredFiles[2], "utf8");
  const messageContentSource = readFileSync(requiredFiles[3], "utf8");

  return (
    clientAgentSource.includes("executeAliceOperatorPlan") &&
    clientAgentSource.includes("getEmotes") &&
    clientChatSource.includes("logConversationOperatorAction") &&
    messageContentSource.includes("action-pill")
  );
}

export function applyAliceCompanionUiCompatPatch({
  rootDir,
  elizaRoot,
  log = console.log,
} = {}) {
  if (isAliceCompanionUiCompatPatched(elizaRoot)) {
    log(
      "[alice-eliza-runtime-patches] Alice companion UI compatibility already applied",
    );
    return "already-applied";
  }

  const patchPath = path.join(rootDir, aliceCompanionUiCompatPatchRelativePath);
  if (!existsSync(patchPath)) {
    throw new Error(`missing Alice companion UI compatibility patch: ${patchPath}`);
  }

  const reverseCheck = runGitApply(
    ["apply", "--reverse", "--check", patchPath],
    { cwd: elizaRoot, allowFailure: true },
  );
  if (reverseCheck.status === 0) {
    log(
      "[alice-eliza-runtime-patches] Alice companion UI compatibility already applied",
    );
    return "already-applied";
  }

  applyPatchWithGitFallback({
    patchPath,
    targetRoot: elizaRoot,
    driftMessage: "Alice companion UI compatibility patch drifted",
    log,
  });

  if (!isAliceCompanionUiCompatPatched(elizaRoot)) {
    throw new Error(
      "Alice companion UI compatibility patch applied but contract is absent",
    );
  }

  log(
    "[alice-eliza-runtime-patches] restored Alice companion UI compatibility",
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

  applyPatchWithGitFallback({
    patchPath,
    targetRoot: elizaRoot,
    driftMessage: `Alice Eliza runtime patch drifted from ${runtimeRelativePath}`,
    log,
  });

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

  // Strict mode (MILAIDY_PATCH_STRICT=1): a patch that skips because its
  // source file is absent (moved/renamed/deleted by an eliza bump) is a
  // silently-dropped Alice patch that resurfaces as a runtime regression.
  // Collect every skip logged by the patch functions and, in strict mode,
  // fail the whole run with the full list so an upstream fold is forced to
  // re-home each patch instead of silently losing it. The positive-condition
  // skip ("already present from upstream", i.e. the real source replaced our
  // stub) is intentionally exempt. Default behavior (no env) is unchanged.
  // Known-inapplicable at the CURRENT eliza pin (17930c97b9): the target
  // file does not exist at this pin at all, so the patch has always skipped
  // and Alice runs live with it inapplicable. Any eliza bump (WP6) MUST
  // re-evaluate each entry: if the target appears at the new pin, remove the
  // entry so strict mode enforces the patch again.
  const KNOWN_INAPPLICABLE_AT_PIN = [
    // trusted-local-request.ts is absent from app-core at this pin; the
    // open-access patch has never applied here (pre-existing, verified
    // 2026-07-09 against a fresh checkout + full patch run).
    "app-core trusted-local-request source absent",
  ];
  const strictSkips = [];
  const baseLog = log;
  log = (...args) => {
    const first = args[0];
    if (
      typeof first === "string" &&
      first.startsWith("[alice-eliza-runtime-patches]") &&
      first.includes("skipping") &&
      !first.includes("already present from upstream") &&
      !KNOWN_INAPPLICABLE_AT_PIN.some((k) => first.includes(k))
    ) {
      strictSkips.push(first);
    }
    baseLog(...args);
  };

  const results = [
    applyAliceRuntimeApiBindPatch({ rootDir, elizaRoot, runtimePath, log }),
    applyAliceKubeHealthReadinessPatch({ elizaRoot, log }),
    applyAliceCoreBasicCapabilitiesBrowserSafePatch({ elizaRoot, log }),
    applyAliceCoreNodeSecretAliasReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserRuntimeEnvReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserStateDirStubsPatch({ elizaRoot, log }),
    applyAliceCoreBrowserOnboardingReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserOnboardingStateReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserSettingsDebugReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserCloudTopologyReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserSpokenTextReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserValidationReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserSkillInvocationCapturePatch({ elizaRoot, log }),
    applyAliceCoreBrowserConfirmationReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserEvaluatorPrioritiesReexportPatch({ elizaRoot, log }),
    applyAliceCoreBrowserMiladyRuntimeBindingsPatch({ elizaRoot, log }),
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
    applyAliceUiInternalToolHeroRoutesPatch({ elizaRoot, log }),
    applyAliceAgentAppsHeroFallbackPatch({ elizaRoot, log }),
    applyAliceRootAgentAppsHeroFallbackPatch({ rootDir, log }),
    applyAliceAuthRateLimitAfterValidSessionPatch({ elizaRoot, log }),
    applyAliceProviderFailureNonfatalPatch({ elizaRoot, log }),
    applyAliceAppCoreDashboardFallbackRoutesPatch({ elizaRoot, log }),
    applyAliceAppCoreCodingAgentsFallbackPatch({ elizaRoot, log }),
    applyAliceAppCoreCompanionStagePatch({ elizaRoot, log }),
    applyAliceAppCoreOpenAccessPatch({ elizaRoot, log }),
    applyAliceUiAuthGatedStartupPatch({ elizaRoot, log }),
    applyAliceUiSameOriginWebsocketPatch({ elizaRoot, log }),
    applyAliceUiVrmDefaultPatch({ elizaRoot, log }),
    applyAliceSharedKeywordAppleDoublePatch({ elizaRoot, log }),
    applyAliceUiAvatarDefaultMigrationPatch({ elizaRoot, log }),
    applyAliceCompanionUiCompatPatch({ rootDir, elizaRoot, log }),
    applyAliceUpstreamPackageSourceMainPatch({ elizaRoot, log }),
    applyAliceAppLifeOpsDirSubpathExportsPatch({ elizaRoot, log }),
    applyAliceBrowserBridgeWorkspaceStubPatch({ elizaRoot, log }),
    applyAliceAppPluginRegisterExportPatch({ elizaRoot, log }),
    applyAliceTelegramSourcePackageJsonExportPatch({ elizaRoot, log }),
    applyAliceStream555RuntimePluginAutoloadPatch({ elizaRoot, log }),
    applyAliceTelegramAccountAuthResolverPatch({ elizaRoot, log }),
    applyAliceElizacloudReexportPatch({ elizaRoot, log }),
    applyAliceElizacloudBrowserTtsStubsPatch({ elizaRoot, log }),
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

  if (strictSkips.length > 0) {
    baseLog(
      `[alice-eliza-runtime-patches] ${strictSkips.length} patch(es) skipped (source absent or no targets)`,
    );
    if (process.env.MILAIDY_PATCH_STRICT === "1") {
      throw new Error(
        `MILAIDY_PATCH_STRICT: ${strictSkips.length} Alice patch(es) were skipped and would be silently lost:\n  - ${strictSkips.join("\n  - ")}`,
      );
    }
  }

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
