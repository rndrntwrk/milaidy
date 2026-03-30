import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AgentRuntime, logger } from "@elizaos/core";
import { handleCloudBillingRoute } from "@miladyai/agent/api/cloud-billing-routes";
import { handleCloudCompatRoute } from "@miladyai/agent/api/cloud-compat-routes";
// Override the wallet export rejection function with the hardened version
// that adds rate limiting, audit logging, and a forced confirmation delay.
import {
  AGENT_EVENT_ALLOWED_STREAMS,
  CONFIG_WRITE_ALLOWED_TOP_KEYS,
  type ConversationMeta,
  cloneWithoutBlockedObjectKeys,
  discoverInstalledPlugins,
  discoverPluginsFromManifest,
  extractAuthToken,
  fetchWithTimeoutGuard,
  isAllowedHost,
  isAuthorized,
  normalizeWsClientId,
  persistConversationRoomTitle,
  resolveMcpServersRejection,
  resolvePluginConfigMutationRejections,
  routeAutonomyTextToUser,
  streamResponseBodyWithByteLimit,
  startApiServer as upstreamStartApiServer,
  validateMcpServerConfig,
} from "@miladyai/agent/api/server";
import { type PolicyResult, StewardApiError } from "@stwd/sdk";
import {
  ensureCompatApiAuthorized,
  ensureCompatSensitiveRouteAuthorized,
  getCompatApiToken,
} from "./auth";
import {
  sendJsonError as sendJsonErrorResponse,
  sendJson as sendJsonResponse,
} from "./response";

export {
  __resetCloudBaseUrlCache,
  ensureCloudTtsApiKeyAlias,
  resolveCloudTtsBaseUrl,
  resolveElevenLabsApiKeyForCloudMode,
} from "./server-cloud-tts";
export {
  filterConfigEnvForResponse,
  SENSITIVE_ENV_RESPONSE_KEYS,
} from "./server-config-filter";
export { injectApiBaseIntoHtml } from "./server-html";
// Re-export helpers from split-out modules so tests can import from "./server"
export {
  ensureApiTokenForBindHost,
  resolveHyperscapeAuthorizationHeader,
  resolveMcpTerminalAuthorizationRejection,
  resolveTerminalRunClientId,
  resolveTerminalRunRejection,
  resolveWebSocketUpgradeRejection,
} from "./server-security";
export {
  findOwnPackageRoot,
  isSafeResetStateDir,
  resolveCorsOrigin,
} from "./server-startup";
export { resolveWalletExportRejection } from "./server-wallet-trade";
export {
  AGENT_EVENT_ALLOWED_STREAMS,
  CONFIG_WRITE_ALLOWED_TOP_KEYS,
  type ConversationMeta,
  cloneWithoutBlockedObjectKeys,
  discoverInstalledPlugins,
  discoverPluginsFromManifest,
  extractAuthToken,
  fetchWithTimeoutGuard,
  isAllowedHost,
  isAuthorized,
  normalizeWsClientId,
  persistConversationRoomTitle,
  resolveMcpServersRejection,
  resolvePluginConfigMutationRejections,
  routeAutonomyTextToUser,
  streamResponseBodyWithByteLimit,
  validateMcpServerConfig,
};

import {
  buildBscApproveUnsignedTx,
  buildBscBuyUnsignedTx,
  buildBscSellUnsignedTx,
  buildBscTradeQuote,
  resolveBscApprovalSpender,
  resolvePrimaryBscRpcUrl,
} from "@miladyai/agent/api/bsc-trade";
import {
  getWalletAddresses,
  initStewardWalletCache,
} from "@miladyai/agent/api/wallet";
import { fetchEvmNfts } from "@miladyai/agent/api/wallet-evm-balance";
import { resolveWalletRpcReadiness } from "@miladyai/agent/api/wallet-rpc";
import { recordWalletTradeLedgerEntry } from "@miladyai/agent/api/wallet-trading-profile";
import {
  type ElizaConfig,
  loadElizaConfig,
  saveElizaConfig,
} from "@miladyai/agent/config/config";
import { resolveUserPath } from "@miladyai/agent/config/paths";
import { resolveDefaultAgentWorkspaceDir } from "@miladyai/agent/providers/workspace";
import {
  isMiladySettingsDebugEnabled,
  sanitizeForSettingsDebug,
  settingsDebugCloudSummary,
} from "@miladyai/shared";
import { ethers } from "ethers";
import {
  ensureRuntimeSqlCompatibility,
  executeRawSql,
  quoteIdent,
  sanitizeIdentifier,
  sqlLiteral,
} from "../utils/sql-compat";
import { handleCloudRoute } from "./cloud-routes";
import { handleCloudStatusRoutes } from "./cloud-status-routes";
import {
  isAllowedDevConsoleLogPath,
  readDevConsoleLogTail,
} from "./dev-console-log";
import { handleAuthPairingCompatRoutes } from "./auth-pairing-compat-routes";
import { handleDevCompatRoutes } from "./dev-compat-routes";
import { handlePluginsCompatRoutes } from "./plugins-compat-routes";
import { resolveDevStackFromEnv } from "./dev-stack";
import {
  approveStewardTransaction,
  createStewardClient,
  denyStewardTransaction,
  ensureStewardAgent,
  getRecentWebhookEvents,
  getStewardBalance,
  getStewardBridgeStatus,
  getStewardHistory,
  getStewardPendingApprovals,
  getStewardTokenBalances,
  getStewardWalletAddresses,
  isStewardConfigured,
  pushWebhookEvent,
  resolveStewardAgentId,
  type StewardWebhookEventType,
  signTransactionWithOptionalSteward,
  signViaSteward,
} from "./steward-bridge";

const require = createRequire(import.meta.url);

import {
  getBootConfig,
  syncBrandEnvToEliza,
  syncElizaEnvToBrand,
} from "../config/boot-config.js";

function syncMiladyEnvToEliza(): void {
  const aliases = getBootConfig().envAliases;
  if (aliases) syncBrandEnvToEliza(aliases);
}

function syncElizaEnvToMilady(): void {
  const aliases = getBootConfig().envAliases;
  if (aliases) syncElizaEnvToBrand(aliases);
}

export function isLoopbackRemoteAddress(
  remoteAddress: string | null | undefined,
): boolean {
  if (!remoteAddress) return false;
  const normalized = remoteAddress.trim().toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized === "::ffff:0:127.0.0.1"
  );
}

function resolveWalletExecutionMode(
  canSign: boolean,
  canExecuteLocally: boolean,
  hasStewardSigner: boolean,
): "local-key" | "steward" | "user-sign" {
  if (!canSign || !canExecuteLocally) {
    return "user-sign";
  }

  return hasStewardSigner ? "steward" : "local-key";
}

// Lazy-imported to avoid circular dependency with runtime/eliza.ts
const lazyEnsureTTS = () =>
  import("../runtime/eliza.js").then((m) => m.ensureMiladyTextToSpeechHandler);

import { getMiladyStartupEmbeddingAugmentation } from "../runtime/milady-startup-overlay.js";
import { deriveAgentVaultId } from "../security/agent-vault-id";
import { hydrateWalletKeysFromNodePlatformSecureStore } from "../security/hydrate-wallet-keys-from-platform-store";
import {
  createNodePlatformSecureStore,
  isWalletOsStoreReadEnabled,
} from "../security/platform-secure-store-node";
import {
  deleteWalletSecretsFromOsStore,
  migrateWalletPrivateKeysToOsStore,
} from "../security/wallet-os-store-actions";
import { clearCloudSecrets, getCloudSecret } from "./cloud-secrets";
import {
  clearPersistedOnboardingConfig,
  resolveExistingOnboardingConnection,
} from "./provider-switch-config";
import { isOnboardingConnectionComplete } from "../contracts/onboarding";

// ---------------------------------------------------------------------------
// Import from extracted modules for use within this file
// ---------------------------------------------------------------------------

import {
  handleCloudTtsPreviewRoute as _handleCloudTtsPreviewRoute,
  ensureCloudTtsApiKeyAlias,
  mirrorCompatHeaders,
} from "./server-cloud-tts";
import { filterConfigEnvForResponse as _filterConfigEnvForResponse } from "./server-config-filter";
import {
  deriveCompatOnboardingReplayBody as _deriveCompatOnboardingReplayBody,
  extractAndPersistOnboardingApiKey as _extractAndPersistOnboardingApiKey,
  isCloudProvisioned as _isCloudProvisioned,
  persistCompatOnboardingDefaults as _persistCompatOnboardingDefaults,
} from "./server-onboarding-compat";
import {
  canUseLocalTradeExecution as _canUseLocalTradeExecution,
  resolveTradePermissionMode as _resolveTradePermissionMode,
} from "./server-wallet-trade";

// ---------------------------------------------------------------------------
// Module-level constants and types that stay in server.ts
// ---------------------------------------------------------------------------

const _PACKAGE_ROOT_NAMES = new Set(["eliza", "elizaai", "elizaos"]);

export interface CompatRuntimeState {
  current: AgentRuntime | null;
  pendingAgentName: string | null;
}

const DATABASE_UNAVAILABLE_MESSAGE =
  "Database not available. The agent may not be running or the database adapter is not initialized.";

// ---------------------------------------------------------------------------
// Internal helpers used by the monkey-patch handler (stay in server.ts)
// ---------------------------------------------------------------------------

// extractHeaderValue, getCompatApiToken — now imported from ./auth
// tokenMatches — now imported from ./auth
// Pairing infrastructure — now in ./auth-pairing-compat-routes
// getProvidedApiToken, ensureCompatApiAuthorized, isDevEnvironment,
// ensureCompatSensitiveRouteAuthorized — now imported from ./auth

const MAX_BODY_BYTES = 1_048_576;
export async function readCompatJsonBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        sendJsonErrorResponse(res, 413, "Request body too large");
        return null;
      }
      chunks.push(buf);
    }
  } catch {
    sendJsonErrorResponse(res, 400, "Invalid request body");
    return null;
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(
      Buffer.concat(chunks).toString("utf8"),
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      sendJsonErrorResponse(res, 400, "Invalid JSON body");
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    sendJsonErrorResponse(res, 400, "Invalid JSON body");
    return null;
  }
}

function resolveCompatConfigPaths(): {
  elizaConfigPath?: string;
  miladyConfigPath?: string;
} {
  const sharedStateDir =
    process.env.MILADY_STATE_DIR?.trim() || process.env.ELIZA_STATE_DIR?.trim();
  const miladyConfigPath =
    process.env.MILADY_CONFIG_PATH?.trim() ||
    (sharedStateDir ? path.join(sharedStateDir, "milady.json") : undefined);
  const elizaConfigPath =
    process.env.ELIZA_CONFIG_PATH?.trim() ||
    (sharedStateDir ? path.join(sharedStateDir, "eliza.json") : undefined);

  return { elizaConfigPath, miladyConfigPath };
}

export function syncCompatConfigFiles(): void {
  const { elizaConfigPath, miladyConfigPath } = resolveCompatConfigPaths();
  if (
    !elizaConfigPath ||
    !miladyConfigPath ||
    elizaConfigPath === miladyConfigPath
  ) {
    return;
  }

  const sourcePath = fs.existsSync(elizaConfigPath)
    ? elizaConfigPath
    : fs.existsSync(miladyConfigPath)
      ? miladyConfigPath
      : undefined;

  if (!sourcePath) {
    return;
  }

  const targetPath =
    sourcePath === elizaConfigPath ? miladyConfigPath : elizaConfigPath;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function resolveCompatPgliteDataDir(config: ElizaConfig): string {
  const explicitDataDir = process.env.PGLITE_DATA_DIR?.trim();
  if (explicitDataDir) {
    return resolveUserPath(explicitDataDir);
  }

  const configuredDataDir = config.database?.pglite?.dataDir?.trim();
  if (configuredDataDir) {
    return resolveUserPath(configuredDataDir);
  }

  const workspaceDir =
    config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();
  return path.join(resolveUserPath(workspaceDir), ".eliza", ".elizadb");
}

function resolveCompatLoopbackApiBase(
  req: Pick<http.IncomingMessage, "headers">,
): string {
  const host = req.headers.host?.trim() || "127.0.0.1:31337";
  return `http://${host}`;
}

function buildCompatLoopbackHeaders(
  req: Pick<http.IncomingMessage, "headers">,
  init?: RequestInit,
): Headers {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const apiToken = getCompatApiToken();
  if (apiToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${apiToken}`);
  }
  return headers;
}

async function compatLoopbackFetchJson<T>(
  req: Pick<http.IncomingMessage, "headers">,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    new URL(pathname, resolveCompatLoopbackApiBase(req)),
    {
      ...init,
      headers: buildCompatLoopbackHeaders(req, init),
    },
  );
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${pathname}`);
  }
  return (await response.json()) as T;
}

async function compatLoopbackRequest(
  req: Pick<http.IncomingMessage, "headers">,
  pathname: string,
  init?: RequestInit,
): Promise<void> {
  const response = await fetch(
    new URL(pathname, resolveCompatLoopbackApiBase(req)),
    {
      ...init,
      headers: buildCompatLoopbackHeaders(req, init),
    },
  );
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${pathname}`);
  }
}

async function clearCompatRuntimeStateViaApi(
  req: Pick<http.IncomingMessage, "headers">,
): Promise<void> {
  try {
    const conversations = await compatLoopbackFetchJson<{
      conversations?: Array<{ id: string }>;
    }>(req, "/api/conversations");
    for (const conversation of conversations.conversations ?? []) {
      if (!conversation?.id) continue;
      await compatLoopbackRequest(
        req,
        `/api/conversations/${encodeURIComponent(conversation.id)}`,
        { method: "DELETE" },
      );
    }
  } catch (err) {
    logger.warn(
      `[milady][reset] Failed to clear conversations before reset: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  try {
    const knowledge = await compatLoopbackFetchJson<{
      documents?: Array<{ id: string }>;
    }>(req, "/api/knowledge/documents");
    for (const document of knowledge.documents ?? []) {
      if (!document?.id) continue;
      await compatLoopbackRequest(
        req,
        `/api/knowledge/documents/${encodeURIComponent(document.id)}`,
        { method: "DELETE" },
      );
    }
  } catch (err) {
    logger.warn(
      `[milady][reset] Failed to clear knowledge documents before reset: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  try {
    await compatLoopbackRequest(req, "/api/trajectories", {
      method: "DELETE",
      body: JSON.stringify({ all: true }),
    });
  } catch (err) {
    logger.warn(
      `[milady][reset] Failed to clear trajectories before reset: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

async function clearCompatPgliteDataDir(
  runtime: AgentRuntime | null,
  config: ElizaConfig,
): Promise<void> {
  if (typeof runtime?.stop === "function") {
    await runtime.stop();
  }

  const dataDir = resolveCompatPgliteDataDir(config);
  if (path.basename(dataDir) !== ".elizadb") {
    logger.warn(
      `[milady][reset] Refusing to delete unexpected PGlite dir: ${dataDir}`,
    );
    return;
  }

  try {
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
      logger.info(
        `[milady][reset] Deleted PGlite data dir (GGUF models preserved): ${dataDir}`,
      );
    }
  } catch (err) {
    logger.warn(
      `[milady][reset] Failed to delete PGlite data dir: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function hasCompatPersistedOnboardingState(config: ElizaConfig): boolean {
  if ((config.meta as Record<string, unknown>)?.onboardingComplete === true) {
    return true;
  }

  const existingConnection = resolveExistingOnboardingConnection(
    config as Record<string, unknown>,
  );
  if (isOnboardingConnectionComplete(existingConnection)) {
    return true;
  }

  if (Array.isArray(config.agents?.list) && config.agents.list.length > 0) {
    return true;
  }

  return Boolean(
    config.agents?.defaults?.workspace?.trim() ||
      config.agents?.defaults?.adminEntityId?.trim(),
  );
}

// sendJsonResponse, sendJsonErrorResponse — now imported from ./response

function getStewardPolicyResults(error: StewardApiError): PolicyResult[] {
  if (
    error.data &&
    typeof error.data === "object" &&
    "results" in error.data &&
    Array.isArray(error.data.results)
  ) {
    return error.data.results as PolicyResult[];
  }

  return [];
}

function isStewardPolicyRejection(error: unknown): error is StewardApiError {
  return error instanceof StewardApiError && error.status === 403;
}

export function getConfiguredCompatAgentName(): string | null {
  const config = loadElizaConfig();
  const listAgent = config.agents?.list?.[0];
  const listAgentName =
    typeof listAgent?.name === "string" ? listAgent.name.trim() : "";
  if (listAgentName) {
    return listAgentName;
  }

  const assistantName =
    typeof config.ui?.assistant?.name === "string"
      ? config.ui.assistant.name.trim()
      : "";
  return assistantName || null;
}

function resolveCompatStatusAgentName(
  state: CompatRuntimeState,
): string | null {
  if (state.pendingAgentName) {
    return state.pendingAgentName;
  }

  if (state.current) {
    return null;
  }

  return getConfiguredCompatAgentName();
}

function mergeMiladyEmbeddingIntoStatusPayload(
  payload: Record<string, unknown>,
): void {
  const aug = getMiladyStartupEmbeddingAugmentation();
  if (!aug) return;

  const existing = payload.startup;
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : { phase: "embedding-warmup", attempt: 0 };

  payload.startup = { ...base, ...aug };
}

function rewriteCompatStatusBody(
  bodyText: string,
  state: CompatRuntimeState,
): string {
  const agentName = resolveCompatStatusAgentName(state);

  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return bodyText;
    }

    const payload = parsed as Record<string, unknown>;
    mergeMiladyEmbeddingIntoStatusPayload(payload);

    if (!agentName) {
      return JSON.stringify(payload);
    }

    if (payload.agentName === agentName) {
      return JSON.stringify(payload);
    }

    return JSON.stringify({
      ...payload,
      agentName,
    });
  } catch {
    return bodyText;
  }
}

function patchCompatStatusResponse(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): void {
  const method = (req.method ?? "GET").toUpperCase();
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (method !== "GET" || pathname !== "/api/status") {
    return;
  }

  const originalEnd = res.end.bind(res);

  res.end = ((
    chunk?: string | Uint8Array,
    encoding?: unknown,
    cb?: unknown,
  ) => {
    let resolvedEncoding: BufferEncoding | undefined;
    let resolvedCallback: (() => void) | undefined;

    if (typeof encoding === "function") {
      resolvedCallback = encoding as () => void;
    } else {
      resolvedEncoding = encoding as BufferEncoding | undefined;
      resolvedCallback = cb as (() => void) | undefined;
    }

    if (chunk == null) {
      return resolvedCallback ? originalEnd(resolvedCallback) : originalEnd();
    }

    const bodyText =
      typeof chunk === "string"
        ? chunk
        : Buffer.from(chunk).toString(resolvedEncoding ?? "utf8");

    return originalEnd(
      rewriteCompatStatusBody(bodyText, state),
      "utf8",
      resolvedCallback,
    );
  }) as typeof res.end;
}

const WORKBENCH_TODO_TAG = "workbench-todo";

type WorkbenchTodoResponse = {
  id: string;
  name: string;
  description: string;
  priority: number | null;
  isUrgent: boolean;
  isCompleted: boolean;
  type: string;
};

function asCompatObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readCompatTaskMetadata(
  task: Record<string, unknown>,
): Record<string, unknown> {
  return asCompatObject(task.metadata) ?? {};
}

function normalizeCompatStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseCompatNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function readCompatTaskCompleted(task: Record<string, unknown>): boolean {
  const metadata = readCompatTaskMetadata(task);

  if (typeof metadata.isCompleted === "boolean") {
    return metadata.isCompleted;
  }

  const todoMeta =
    asCompatObject(metadata.workbenchTodo) ?? asCompatObject(metadata.todo);
  if (todoMeta && typeof todoMeta.isCompleted === "boolean") {
    return todoMeta.isCompleted;
  }

  return false;
}

function normalizeCompatTodoTags(value: unknown, defaults: string[]): string[] {
  const tags = new Set(
    defaults.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
  );

  for (const tag of normalizeCompatStringArray(value)) {
    tags.add(tag);
  }

  return [...tags];
}

function toTaskBackedWorkbenchTodo(
  task: Record<string, unknown> | null | undefined,
): WorkbenchTodoResponse | null {
  if (!task) {
    return null;
  }

  const id =
    typeof task.id === "string" && task.id.trim().length > 0 ? task.id : null;
  if (!id) {
    return null;
  }

  const tags = new Set(normalizeCompatStringArray(task.tags));
  const metadata = readCompatTaskMetadata(task);
  const todoMeta =
    asCompatObject(metadata.workbenchTodo) ?? asCompatObject(metadata.todo);

  if (!tags.has(WORKBENCH_TODO_TAG) && !tags.has("todo") && !todoMeta) {
    return null;
  }

  const name =
    typeof task.name === "string" && task.name.trim().length > 0
      ? task.name
      : "Todo";

  return {
    id,
    name,
    description:
      typeof todoMeta?.description === "string"
        ? todoMeta.description
        : typeof task.description === "string"
          ? task.description
          : "",
    priority: parseCompatNullableNumber(todoMeta?.priority),
    isUrgent: todoMeta?.isUrgent === true,
    isCompleted: readCompatTaskCompleted(task),
    type:
      typeof todoMeta?.type === "string" && todoMeta.type.trim().length > 0
        ? todoMeta.type
        : "task",
  };
}

function runtimeHasTodoDatabase(runtime: AgentRuntime | null): boolean {
  const db = (runtime as { db?: unknown } | null)?.db;
  return !!db && typeof db === "object";
}

function decodeCompatTodoId(
  rawValue: string,
  res: http.ServerResponse,
): string | null {
  try {
    const decoded = decodeURIComponent(rawValue);
    if (decoded.trim().length === 0) {
      sendJsonErrorResponse(res, 400, "Invalid todo id");
      return null;
    }
    return decoded;
  } catch {
    sendJsonErrorResponse(res, 400, "Invalid todo id");
    return null;
  }
}

async function handleTaskBackedWorkbenchTodoRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime | null,
  pathname: string,
  method: string,
): Promise<boolean> {
  if (!runtime) {
    return false;
  }

  if (
    pathname !== "/api/workbench/todos" &&
    !pathname.startsWith("/api/workbench/todos/")
  ) {
    return false;
  }

  if (!ensureCompatApiAuthorized(req, res)) {
    return true;
  }

  let operation = "route";
  try {
    const getTaskList = async () =>
      (
        (await runtime.getTasks({})) as unknown as Array<
          Record<string, unknown>
        >
      ).map((task) => task as Record<string, unknown>);

    if (method === "GET" && pathname === "/api/workbench/todos") {
      operation = "list todos";
      const todos = (await getTaskList())
        .map((task) => toTaskBackedWorkbenchTodo(task))
        .filter((todo): todo is WorkbenchTodoResponse => todo !== null)
        .sort((left, right) => left.name.localeCompare(right.name));

      sendJsonResponse(res, 200, { todos });
      return true;
    }

    if (method === "POST" && pathname === "/api/workbench/todos") {
      const body = await readCompatJsonBody(req, res);
      if (body == null) {
        return true;
      }

      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        sendJsonErrorResponse(res, 400, "name is required");
        return true;
      }

      const description =
        typeof body.description === "string" ? body.description : "";
      const type =
        typeof body.type === "string" && body.type.trim().length > 0
          ? body.type.trim()
          : "task";

      operation = "create todo";
      const taskId = await runtime.createTask({
        name,
        description,
        tags: normalizeCompatTodoTags(body.tags, [WORKBENCH_TODO_TAG, "todo"]),
        metadata: {
          isCompleted: false,
          workbenchTodo: {
            description,
            priority: parseCompatNullableNumber(body.priority),
            isUrgent: body.isUrgent === true,
            isCompleted: false,
            type,
          },
        },
      });

      operation = "load created todo";
      const created = await runtime.getTask(taskId);
      const todo = toTaskBackedWorkbenchTodo(
        created as Record<string, unknown> | null,
      );
      if (!todo) {
        sendJsonErrorResponse(res, 500, "Todo created but unavailable");
        return true;
      }

      sendJsonResponse(res, 201, { todo });
      return true;
    }

    const todoCompleteMatch =
      /^\/api\/workbench\/todos\/([^/]+)\/complete$/.exec(pathname);
    if (method === "POST" && todoCompleteMatch) {
      const todoId = decodeCompatTodoId(todoCompleteMatch[1], res);
      if (!todoId) {
        return true;
      }

      const body = await readCompatJsonBody(req, res);
      if (body == null) {
        return true;
      }

      operation = "load todo for completion";
      const todoTask = (await runtime.getTask(todoId)) as Record<
        string,
        unknown
      > | null;
      const todo = toTaskBackedWorkbenchTodo(todoTask);
      if (!todoTask || !todo) {
        sendJsonErrorResponse(res, 404, "Todo not found");
        return true;
      }

      const metadata = readCompatTaskMetadata(todoTask);
      const todoMeta =
        asCompatObject(metadata.workbenchTodo) ?? asCompatObject(metadata.todo);
      const isCompleted = body.isCompleted === true;

      operation = "update todo completion";
      await runtime.updateTask(todoId, {
        metadata: {
          ...metadata,
          isCompleted,
          workbenchTodo: {
            ...(todoMeta ?? {}),
            isCompleted,
          },
        },
      });

      sendJsonResponse(res, 200, { ok: true });
      return true;
    }

    const todoItemMatch = /^\/api\/workbench\/todos\/([^/]+)$/.exec(pathname);
    if (!todoItemMatch) {
      return false;
    }

    const todoId = decodeCompatTodoId(todoItemMatch[1], res);
    if (!todoId) {
      return true;
    }

    if (method === "GET") {
      operation = "load todo";
      const todoTask = (await runtime.getTask(todoId)) as Record<
        string,
        unknown
      > | null;
      const todo = toTaskBackedWorkbenchTodo(todoTask);
      if (!todoTask || !todo) {
        sendJsonErrorResponse(res, 404, "Todo not found");
        return true;
      }

      sendJsonResponse(res, 200, { todo });
      return true;
    }

    if (method === "DELETE") {
      operation = "load todo for deletion";
      const todoTask = (await runtime.getTask(todoId)) as Record<
        string,
        unknown
      > | null;
      if (!todoTask || !toTaskBackedWorkbenchTodo(todoTask)) {
        sendJsonErrorResponse(res, 404, "Todo not found");
        return true;
      }

      operation = "delete todo";
      await runtime.deleteTask(todoId);
      sendJsonResponse(res, 200, { ok: true });
      return true;
    }

    if (method === "PUT") {
      const body = await readCompatJsonBody(req, res);
      if (body == null) {
        return true;
      }

      operation = "load todo for update";
      const todoTask = (await runtime.getTask(todoId)) as Record<
        string,
        unknown
      > | null;
      const existingTodo = toTaskBackedWorkbenchTodo(todoTask);
      if (!todoTask || !existingTodo) {
        sendJsonErrorResponse(res, 404, "Todo not found");
        return true;
      }

      if (typeof body.name === "string" && body.name.trim().length === 0) {
        sendJsonErrorResponse(res, 400, "name cannot be empty");
        return true;
      }

      const metadata = readCompatTaskMetadata(todoTask);
      const todoMeta =
        asCompatObject(metadata.workbenchTodo) ?? asCompatObject(metadata.todo);
      const nextTodoMeta: Record<string, unknown> = {
        ...(todoMeta ?? {}),
      };
      const update: Record<string, unknown> = {};

      if (typeof body.name === "string") {
        update.name = body.name.trim();
      }
      if (typeof body.description === "string") {
        update.description = body.description;
        nextTodoMeta.description = body.description;
      }
      if (body.priority !== undefined) {
        nextTodoMeta.priority = parseCompatNullableNumber(body.priority);
      }
      if (typeof body.isUrgent === "boolean") {
        nextTodoMeta.isUrgent = body.isUrgent;
      }
      if (typeof body.type === "string" && body.type.trim().length > 0) {
        nextTodoMeta.type = body.type.trim();
      }
      if (body.tags !== undefined) {
        update.tags = normalizeCompatTodoTags(body.tags, [
          WORKBENCH_TODO_TAG,
          "todo",
        ]);
      }

      const isCompleted =
        typeof body.isCompleted === "boolean"
          ? body.isCompleted
          : existingTodo.isCompleted;
      nextTodoMeta.isCompleted = isCompleted;

      update.metadata = {
        ...metadata,
        isCompleted,
        workbenchTodo: nextTodoMeta,
      };

      operation = "update todo";
      await runtime.updateTask(todoId, update);

      operation = "load updated todo";
      const refreshed = await runtime.getTask(todoId);
      const todo = toTaskBackedWorkbenchTodo(
        refreshed as Record<string, unknown> | null,
      );
      if (!todo) {
        sendJsonErrorResponse(res, 500, "Todo updated but unavailable");
        return true;
      }

      sendJsonResponse(res, 200, { todo });
      return true;
    }

    return false;
  } catch (err) {
    logger.error(
      `[workbench/todos] ${operation} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    sendJsonErrorResponse(res, 500, `Failed to ${operation}`);
    return true;
  }
}

async function _getTableColumnNames(
  runtime: AgentRuntime,
  tableName: string,
  schemaName = "public",
): Promise<Set<string>> {
  const columns = new Set<string>();

  try {
    const { rows } = await executeRawSql(
      runtime,
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = ${sqlLiteral(schemaName)}
          AND table_name = ${sqlLiteral(tableName)}
        ORDER BY ordinal_position`,
    );

    for (const row of rows) {
      const value = row.column_name;
      if (typeof value === "string" && value.length > 0) {
        columns.add(value);
      }
    }
  } catch {
    // Fall through to PRAGMA for PGlite/SQLite compatibility.
  }

  if (columns.size > 0) {
    return columns;
  }

  try {
    const { rows } = await executeRawSql(
      runtime,
      `PRAGMA table_info(${sanitizeIdentifier(tableName)})`,
    );
    for (const row of rows) {
      const value = row.name;
      if (typeof value === "string" && value.length > 0) {
        columns.add(value);
      }
    }
  } catch {
    // Ignore missing-table/missing-pragma support.
  }

  return columns;
}

// normalizePluginCategory, normalizePluginId, titleCasePluginId,
// buildPluginParamDefs, findNearestFile, resolvePluginManifestPath,
// resolveInstalledPackageVersion, resolveLoadedPluginNames, isPluginLoaded,
// buildPluginListResponse, validateCompatPluginConfig, persistCompatPluginMutation
// — extracted to ./plugins-compat-routes

async function handleDatabaseRowsCompatRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime | null,
  pathname: string,
): Promise<boolean> {
  const match = /^\/api\/database\/tables\/([^/]+)\/rows$/.exec(pathname);
  if ((req.method ?? "GET").toUpperCase() !== "GET" || !match) {
    return false;
  }

  if (!ensureCompatApiAuthorized(req, res)) {
    return true;
  }

  if (!runtime) {
    sendJsonErrorResponse(res, 503, DATABASE_UNAVAILABLE_MESSAGE);
    return true;
  }

  const tableName = sanitizeIdentifier(decodeURIComponent(match[1]));
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  const schemaName = sanitizeIdentifier(requestUrl.searchParams.get("schema"));

  if (!tableName) {
    sendJsonErrorResponse(res, 400, "Invalid table name");
    return true;
  }

  let resolvedSchema = schemaName;

  if (!resolvedSchema) {
    const { rows } = await executeRawSql(
      runtime,
      `SELECT table_schema AS schema
         FROM information_schema.tables
        WHERE table_name = ${sqlLiteral(tableName)}
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_type = 'BASE TABLE'
        ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END,
                 table_schema`,
    );

    const schemas = rows
      .map((row) => row.schema)
      .filter((value): value is string => typeof value === "string");

    if (schemas.length === 0) {
      sendJsonErrorResponse(res, 404, `Unknown table "${tableName}"`);
      return true;
    }

    if (schemas.length > 1 && !schemas.includes("public")) {
      sendJsonErrorResponse(
        res,
        409,
        `Table "${tableName}" exists in multiple schemas; specify ?schema=<name>.`,
      );
      return true;
    }

    resolvedSchema = schemas.includes("public") ? "public" : schemas[0];
  }

  const columnResult = await executeRawSql(
    runtime,
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_name = ${sqlLiteral(tableName)}
        AND table_schema = ${sqlLiteral(resolvedSchema)}
      ORDER BY ordinal_position`,
  );

  const columns = columnResult.rows
    .map((row) => row.column_name)
    .filter((value): value is string => typeof value === "string");

  if (columns.length === 0) {
    sendJsonErrorResponse(
      res,
      404,
      `No readable columns found for ${resolvedSchema}.${tableName}`,
    );
    return true;
  }

  const limit = Math.max(
    1,
    Math.min(
      500,
      Number.parseInt(requestUrl.searchParams.get("limit") ?? "", 10) || 50,
    ),
  );
  const offset = Math.max(
    0,
    Number.parseInt(requestUrl.searchParams.get("offset") ?? "", 10) || 0,
  );
  const sortColumn = sanitizeIdentifier(requestUrl.searchParams.get("sort"));
  const order =
    requestUrl.searchParams.get("order") === "desc" ? "DESC" : "ASC";
  const search = requestUrl.searchParams.get("search")?.trim();

  const filters: string[] = [];
  if (search) {
    const likeEscaped = search
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    const searchLiteral = sqlLiteral(`%${likeEscaped}%`);
    filters.push(
      `(${columns
        .map(
          (columnName) =>
            `CAST(${quoteIdent(columnName)} AS TEXT) ILIKE ${searchLiteral}`,
        )
        .join(" OR ")})`,
    );
  }
  const whereClause =
    filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const orderBy =
    sortColumn && columns.includes(sortColumn)
      ? `ORDER BY ${quoteIdent(sortColumn)} ${order}`
      : "";
  const qualifiedTable = `${quoteIdent(resolvedSchema)}.${quoteIdent(tableName)}`;

  const countResult = await executeRawSql(
    runtime,
    `SELECT count(*)::int AS total FROM ${qualifiedTable} ${whereClause}`,
  );
  const total =
    typeof countResult.rows[0]?.total === "number"
      ? countResult.rows[0].total
      : Number(countResult.rows[0]?.total ?? 0);

  const rowsResult = await executeRawSql(
    runtime,
    `SELECT * FROM ${qualifiedTable}
      ${whereClause}
      ${orderBy}
      LIMIT ${limit}
     OFFSET ${offset}`,
  );

  sendJsonResponse(res, 200, {
    table: tableName,
    schema: resolvedSchema,
    rows: rowsResult.rows,
    columns,
    total,
    offset,
    limit,
  });
  return true;
}

type TradePermissionMode = "user-sign-only" | "manual-local-key" | "agent-auto";

const AGENT_AUTOMATION_HEADER = "x-milady-agent-action";

/**
 * Build the set of localhost ports allowed for CORS.
 * Reads from env vars at call time so tests can override.
 */
export function buildCorsAllowedPorts(): Set<string> {
  return new Set([
    String(process.env.MILADY_API_PORT ?? process.env.ELIZA_PORT ?? "31337"),
    String(process.env.MILADY_PORT ?? "2138"),
    String(process.env.MILADY_GATEWAY_PORT ?? "18789"),
    String(process.env.MILADY_HOME_PORT ?? "2142"),
  ]);
}

/**
 * Check whether a URL string is an allowed localhost origin for CORS.
 */
export function isAllowedLocalOrigin(
  urlStr: string,
  allowedPorts?: Set<string>,
): boolean {
  const ports = allowedPorts ?? buildCorsAllowedPorts();
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    const isLocal =
      h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return isLocal && ports.has(port);
  } catch {
    return false;
  }
}

export function resolveTradePermissionMode(config: {
  features?: { tradePermissionMode?: unknown } | null;
}): TradePermissionMode {
  const raw = config.features?.tradePermissionMode;
  if (
    raw === "user-sign-only" ||
    raw === "manual-local-key" ||
    raw === "agent-auto"
  ) {
    return raw;
  }
  return "user-sign-only";
}

export function canUseLocalTradeExecution(
  mode: TradePermissionMode,
  isAgent: boolean,
): boolean {
  if (mode === "agent-auto") {
    return true;
  }
  if (mode === "manual-local-key") {
    return !isAgent;
  }
  return false;
}

function isAgentAutomationRequest(
  req: Pick<http.IncomingMessage, "headers">,
): boolean {
  const raw = req.headers[AGENT_AUTOMATION_HEADER];
  return typeof raw === "string" && /^(1|true|yes|agent)$/i.test(raw.trim());
}

interface LocalSignedTransactionResult {
  hash: string;
  nonce: number;
  gasLimit: string;
}

/** @deprecated Use signTransactionWithOptionalSteward() via steward-bridge instead. */
async function _sendLocalWalletTransaction(
  rpcUrl: string,
  tx: {
    to: string;
    data?: string;
    value: bigint;
    chainId: number;
    nonce?: number;
  },
): Promise<LocalSignedTransactionResult> {
  const evmKey = process.env.EVM_PRIVATE_KEY ?? "";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  try {
    const wallet = new ethers.Wallet(
      evmKey.startsWith("0x") ? evmKey : `0x${evmKey}`,
      provider,
    );
    const txResponse = await wallet.sendTransaction(tx);
    return {
      hash: txResponse.hash,
      nonce: txResponse.nonce,
      gasLimit: txResponse.gasLimit?.toString() ?? "0",
    };
  } finally {
    provider.destroy();
  }
}

function resolveBscExecutionNetwork(): {
  chainId: number;
  explorerBaseUrl: string;
} {
  if (process.env.MILADY_WALLET_NETWORK?.trim().toLowerCase() === "testnet") {
    const parsedChainId = Number.parseInt(
      process.env.BSC_TESTNET_CHAIN_ID?.trim() ?? "97",
      10,
    );
    return {
      chainId: Number.isNaN(parsedChainId) ? 97 : parsedChainId,
      explorerBaseUrl: "https://testnet.bscscan.com",
    };
  }

  return {
    chainId: 56,
    explorerBaseUrl: "https://bscscan.com",
  };
}

/**
 * Load config from disk and backfill cloud.apiKey from sealed secrets
 * if it's missing. This handles the case where the API key was persisted
 * to the sealed secret store (via login) but a subsequent config save
 * (e.g. onboarding) overwrote the file without the key.
 */
function resolveCloudConfig(runtime?: unknown): ElizaConfig {
  const config = loadElizaConfig();
  const cloudRec =
    config.cloud && typeof config.cloud === "object"
      ? (config.cloud as Record<string, unknown>)
      : undefined;
  if (isMiladySettingsDebugEnabled()) {
    logger.debug(
      `[milady][settings][compat] resolveCloudConfig disk cloud=${JSON.stringify(settingsDebugCloudSummary(cloudRec))} topKeys=${Object.keys(
        config as object,
      )
        .sort()
        .join(",")}`,
    );
  }
  if (cloudRec?.enabled === false) {
    // Respect explicit disconnect / BYOK: never backfill cloud.apiKey from env
    // or agent secrets into the file with enabled=true. WHY: that undoes
    // Settings → disconnect + OpenRouter and breaks the next cold start.
    if (isMiladySettingsDebugEnabled()) {
      logger.debug(
        "[milady][settings][compat] resolveCloudConfig skip backfill (cloud.enabled===false)",
      );
    }
    return config;
  }
  if (!config.cloud?.apiKey) {
    // Try multiple sources: sealed secrets → process.env → runtime character secrets
    const backfillKey =
      getCloudSecret("ELIZAOS_CLOUD_API_KEY") ||
      process.env.ELIZAOS_CLOUD_API_KEY ||
      (runtime as { character?: { secrets?: Record<string, string> } } | null)
        ?.character?.secrets?.ELIZAOS_CLOUD_API_KEY;
    if (backfillKey) {
      if (isMiladySettingsDebugEnabled()) {
        logger.debug(
          "[milady][settings][compat] resolveCloudConfig backfilling cloud.apiKey from env/secrets/runtime",
        );
      }
      if (!config.cloud) {
        (config as Record<string, unknown>).cloud = {};
      }
      (config.cloud as Record<string, unknown>).apiKey = backfillKey;
      (config.cloud as Record<string, unknown>).enabled = true;
      // Persist the backfilled key so future reads find it on disk
      try {
        saveElizaConfig(config);
        logger.info("[cloud] Backfilled missing cloud.apiKey to config file");
      } catch {
        // Non-fatal: the key is still available for this request
      }
    }
  }
  if (isMiladySettingsDebugEnabled()) {
    const outCloud = config.cloud as Record<string, unknown> | undefined;
    logger.debug(
      `[milady][settings][compat] resolveCloudConfig → return cloud=${JSON.stringify(settingsDebugCloudSummary(outCloud))}`,
    );
  }
  return config;
}

async function handleMiladyCompatRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://localhost");

  // Eliza Cloud thin-client proxy (compat agents, jobs, …) — was missing from the
  // compat wrapper, so the dashboard saw 404 on `/api/cloud/compat/agents`.
  if (url.pathname.startsWith("/api/cloud/compat/")) {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }
    return handleCloudCompatRoute(req, res, url.pathname, method, {
      config: resolveCloudConfig(state.current),
    });
  }

  // Cloud billing routes — handle with fresh config from disk so a cloud
  // API key persisted during login is always available, even if the
  // upstream's in-memory state.config hasn't been refreshed.
  if (url.pathname.startsWith("/api/cloud/billing/")) {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }
    return handleCloudBillingRoute(req, res, url.pathname, method, {
      config: resolveCloudConfig(state.current),
    });
  }

  // Dev observability routes — extracted to dev-compat-routes.ts
  if (await handleDevCompatRoutes(req, res, state)) return true;

  // Auth / pairing / onboarding status — extracted to auth-pairing-compat-routes.ts
  if (await handleAuthPairingCompatRoutes(req, res, state)) return true;

  if (method === "POST" && url.pathname === "/api/tts/cloud") {
    if (!ensureCompatApiAuthorized(req, res)) return true;
    return await _handleCloudTtsPreviewRoute(req, res);
  }

  if (method === "POST" && url.pathname === "/api/tts/elevenlabs") {
    // Intentional passthrough: ElevenLabs TTS is handled by the upstream
    // Eliza server handler, not by the Milady API layer. Returning false
    // lets the request fall through to the next handler in the chain.
    return false;
  }

  if (
    !runtimeHasTodoDatabase(state.current) &&
    url.pathname.startsWith("/api/workbench/todos") &&
    (await handleTaskBackedWorkbenchTodoRoute(
      req,
      res,
      state.current,
      url.pathname,
      method,
    ))
  ) {
    return true;
  }

  // Handle all /api/cloud/* routes (except compat and billing which have
  // their own handlers above) through Milady's handleCloudRoute. This is
  // critical for cloud login — persistCloudLoginStatus saves the API key
  // to disk and scrubs it from env. Without this, login/status falls
  // through to the upstream handler whose config save can be clobbered.
  const isCloudRoute =
    url.pathname.startsWith("/api/cloud/") &&
    !url.pathname.startsWith("/api/cloud/compat/") &&
    !url.pathname.startsWith("/api/cloud/billing/");

  if (isCloudRoute) {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const config = resolveCloudConfig(state.current);

    if (
      url.pathname === "/api/cloud/status" ||
      url.pathname === "/api/cloud/credits"
    ) {
      return handleCloudStatusRoutes({
        req,
        res,
        method,
        pathname: url.pathname,
        config,
        runtime: state.current,
        json: (_res, body, status = 200) => {
          sendJsonResponse(res, status, body);
        },
      });
    }

    const handled = await handleCloudRoute(req, res, url.pathname, method, {
      config,
      runtime: state.current,
      cloudManager: null,
    });

    // After disconnect, sync the cloud disable into the upstream's in-memory
    // state.config via a loopback PUT /api/config. Without this, the next
    // upstream saveElizaConfig(state.config) (e.g. saving OpenRouter) reverts
    // the disconnect because state.config still has cloud.enabled=true + apiKey.
    if (
      handled &&
      method === "POST" &&
      url.pathname === "/api/cloud/disconnect"
    ) {
      if (isMiladySettingsDebugEnabled()) {
        logger.debug(
          `[milady][settings][compat] POST /api/cloud/disconnect → loopback PUT /api/config patch=${JSON.stringify(sanitizeForSettingsDebug({ cloud: { enabled: false } }))}`,
        );
      }
      try {
        await compatLoopbackRequest(req, "/api/config", {
          method: "PUT",
          body: JSON.stringify({ cloud: { enabled: false } }),
        });
        if (isMiladySettingsDebugEnabled()) {
          logger.debug(
            "[milady][settings][compat] POST /api/cloud/disconnect loopback sync OK",
          );
        }
      } catch (err) {
        logger.warn(
          `[milady][cloud/disconnect] Failed to sync cloud disable to upstream state: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return handled;
  }

  if (method === "POST" && url.pathname === "/api/agent/reset") {
    if (!ensureCompatSensitiveRouteAuthorized(req, res)) {
      logger.warn(
        "[milady][reset] POST /api/agent/reset rejected (sensitive route not authorized)",
      );
      return true;
    }

    try {
      logger.info(
        "[milady][reset] POST /api/agent/reset: loading config, will clear onboarding state, persisted provider config, and cloud keys (GGUF / MODELS_DIR untouched)",
      );
      const config = loadElizaConfig();
      await clearCompatRuntimeStateViaApi(req);
      await clearCompatPgliteDataDir(state.current, config);
      state.current = null;
      clearPersistedOnboardingConfig(config);
      saveElizaConfig(config);
      clearCloudSecrets();
      try {
        await deleteWalletSecretsFromOsStore();
      } catch (osErr) {
        logger.warn(
          `[milady][reset] OS wallet store cleanup: ${osErr instanceof Error ? osErr.message : String(osErr)}`,
        );
      }
      logger.info(
        "[milady][reset] POST /api/agent/reset: eliza.json saved — renderer should restart API process if embedded/external dev",
      );
      sendJsonResponse(res, 200, { ok: true });
    } catch (err) {
      logger.warn(
        `[milady][reset] POST /api/agent/reset failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      sendJsonResponse(res, 500, {
        error: err instanceof Error ? err.message : "Reset failed",
      });
    }
    return true;
  }

  // ── GET/POST /api/wallet/os-store (Keychain / Secret Service) ───────
  if (method === "GET" && url.pathname === "/api/wallet/os-store") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    try {
      const store = createNodePlatformSecureStore();
      const available = await store.isAvailable();
      sendJsonResponse(res, 200, {
        backend: store.backend,
        available,
        readEnabled: isWalletOsStoreReadEnabled(),
        vaultId: deriveAgentVaultId(),
      });
    } catch (err) {
      logger.warn(
        `[wallet][os-store] GET status failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      sendJsonResponse(res, 500, { error: "os-store status failed" });
    }
    return true;
  }

  if (method === "POST" && url.pathname === "/api/wallet/os-store") {
    if (!ensureCompatSensitiveRouteAuthorized(req, res)) {
      return true;
    }

    const body = await readCompatJsonBody(req, res);
    if (!body) {
      return true;
    }

    const action = typeof body.action === "string" ? body.action.trim() : "";

    try {
      if (action === "migrate") {
        const result = await migrateWalletPrivateKeysToOsStore();
        if (result.unavailable) {
          sendJsonResponse(res, 503, {
            ok: false,
            error: "OS secret store unavailable on this host",
          });
          return true;
        }
        sendJsonResponse(res, 200, {
          ok: true,
          migrated: result.migrated,
          failed: result.failed,
        });
        return true;
      }
      if (action === "delete") {
        await deleteWalletSecretsFromOsStore();
        sendJsonResponse(res, 200, { ok: true });
        return true;
      }
    } catch (err) {
      logger.warn(
        `[wallet][os-store] POST failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      sendJsonResponse(res, 500, {
        error: err instanceof Error ? err.message : "os-store action failed",
      });
      return true;
    }

    sendJsonResponse(res, 400, { error: "Unknown action" });
    return true;
  }

  // ── GET /api/wallet/keys (onboarding only) ──────────────────────────
  // Security note: this compat route exists only for the embedded desktop
  // onboarding flow, where the renderer needs to display the keys already
  // generated inside the local runtime. Electrobun injects a loopback
  // `http://127.0.0.1:<port>` API base plus a generated API token before the
  // renderer mounts, and ensureCompatSensitiveRouteAuthorized fails closed if
  // that token is missing. The route is also permanently disabled once
  // onboardingComplete flips true so the backup screen cannot be reopened as a
  // general-purpose key export endpoint.

  if (method === "GET" && url.pathname === "/api/wallet/keys") {
    if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) {
      sendJsonErrorResponse(res, 403, "loopback only");
      return true;
    }

    if (!ensureCompatSensitiveRouteAuthorized(req, res)) {
      return true;
    }

    const config = loadElizaConfig();
    if (config.meta?.onboardingComplete === true) {
      sendJsonResponse(res, 403, {
        error: "Wallet keys are only available during onboarding",
      });
      return true;
    }

    // When Steward is configured, return masked keys with Steward status
    if (isStewardConfigured()) {
      try {
        const addresses = getWalletAddresses();
        const stewardStatus = await getStewardBridgeStatus({
          evmAddress: addresses.evmAddress,
        });
        sendJsonResponse(res, 200, {
          evmPrivateKey: "[managed-by-steward]",
          evmAddress: addresses.evmAddress ?? stewardStatus.evmAddress ?? "",
          solanaPrivateKey: "[managed-by-steward]",
          solanaAddress: addresses.solanaAddress ?? "",
          steward: {
            configured: true,
            connected: stewardStatus.connected,
            agentId: stewardStatus.agentId,
          },
        });
        return true;
      } catch {
        // fall through to legacy path
      }
    }

    const evmKey = process.env.EVM_PRIVATE_KEY ?? "";
    const solKey = process.env.SOLANA_PRIVATE_KEY ?? "";

    try {
      const addresses = getWalletAddresses();
      sendJsonResponse(res, 200, {
        evmPrivateKey: evmKey,
        evmAddress: addresses.evmAddress ?? "",
        solanaPrivateKey: solKey,
        solanaAddress: addresses.solanaAddress ?? "",
      });
    } catch {
      sendJsonResponse(res, 200, {
        evmPrivateKey: evmKey,
        evmAddress: "",
        solanaPrivateKey: solKey,
        solanaAddress: "",
      });
    }
    return true;
  }

  if (method === "GET" && url.pathname === "/api/wallet/nfts") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const config = loadElizaConfig();
    const addresses = getWalletAddresses();
    const rpcReadiness = resolveWalletRpcReadiness(config);
    const alchemyKey = process.env.ALCHEMY_API_KEY?.trim() || null;
    const ankrKey = process.env.ANKR_API_KEY?.trim() || null;
    const result: {
      evm: Array<{ chain: string; nfts: unknown[] }>;
      solana: { nfts: unknown[] } | null;
    } = {
      evm: [],
      solana: null,
    };

    if (addresses.evmAddress && rpcReadiness.evmBalanceReady) {
      try {
        result.evm = await fetchEvmNfts(addresses.evmAddress, {
          alchemyKey,
          ankrKey,
          cloudManagedAccess: rpcReadiness.cloudManagedAccess,
          bscRpcUrls: rpcReadiness.bscRpcUrls,
          ethereumRpcUrls: rpcReadiness.ethereumRpcUrls,
          baseRpcUrls: rpcReadiness.baseRpcUrls,
          avaxRpcUrls: rpcReadiness.avalancheRpcUrls,
          nodeRealBscRpcUrl: process.env.NODEREAL_BSC_RPC_URL,
          quickNodeBscRpcUrl: process.env.QUICKNODE_BSC_RPC_URL,
          bscRpcUrl: process.env.BSC_RPC_URL,
          ethereumRpcUrl: process.env.ETHEREUM_RPC_URL,
          baseRpcUrl: process.env.BASE_RPC_URL,
          avaxRpcUrl: process.env.AVALANCHE_RPC_URL,
        });
      } catch (err) {
        logger.warn(`[wallet] EVM NFT fetch failed: ${err}`);
      }
    }

    sendJsonResponse(res, 200, result);
    return true;
  }

  if (method === "GET" && url.pathname === "/api/wallet/steward-status") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const addresses = getWalletAddresses();

    // Lazy initialization: on first request, ensure the steward agent exists
    if (isStewardConfigured()) {
      const agentId = resolveStewardAgentId(process.env, addresses.evmAddress);
      const characterName = getConfiguredCompatAgentName();
      void ensureStewardAgent({
        agentId: agentId ?? undefined,
        agentName: characterName ?? undefined,
      }).catch(() => {
        /* non-fatal — logged internally */
      });
    }

    const status = await getStewardBridgeStatus({
      evmAddress: addresses.evmAddress,
    });
    sendJsonResponse(res, 200, status);
    return true;
  }

  /* ── Steward Policy CRUD ──────────────────────────────────────────── */

  if (method === "GET" && url.pathname === "/api/wallet/steward-policies") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const addresses = getWalletAddresses();
    const agentId = resolveStewardAgentId(process.env, addresses.evmAddress);
    const stewardClient = createStewardClient();

    if (!stewardClient || !agentId) {
      sendJsonResponse(res, 503, {
        error: "Steward not configured",
      });
      return true;
    }

    try {
      const policies = await stewardClient.getPolicies(agentId);
      sendJsonResponse(res, 200, policies);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch policies";
      sendJsonResponse(res, 500, { error: message });
    }
    return true;
  }

  if (method === "PUT" && url.pathname === "/api/wallet/steward-policies") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const body = await readCompatJsonBody(req, res);
    if (!body) return true;

    const { policies } = body as {
      policies: Array<{
        id: string;
        type: string;
        enabled: boolean;
        config: Record<string, unknown>;
      }>;
    };

    if (!Array.isArray(policies)) {
      sendJsonResponse(res, 400, {
        error: "policies must be an array",
      });
      return true;
    }

    const addresses = getWalletAddresses();
    const agentId = resolveStewardAgentId(process.env, addresses.evmAddress);
    const stewardClient = createStewardClient();

    if (!stewardClient || !agentId) {
      sendJsonResponse(res, 503, {
        error: "Steward not configured",
      });
      return true;
    }

    try {
      await stewardClient.setPolicies(
        agentId,
        policies as unknown as import("@stwd/sdk").PolicyRule[],
      );
      sendJsonResponse(res, 200, { ok: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save policies";
      sendJsonResponse(res, 500, { error: message });
    }
    return true;
  }

  /* ── Steward Transaction Records ──────────────────────────────────── */

  if (method === "GET" && url.pathname === "/api/wallet/steward-tx-records") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const addresses = getWalletAddresses();
    const agentId = resolveStewardAgentId(process.env, addresses.evmAddress);

    if (!agentId || !createStewardClient()) {
      sendJsonResponse(res, 503, {
        error: "Steward not configured",
      });
      return true;
    }

    try {
      const status = url.searchParams.get("status") || undefined;
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);
      const history = await getStewardHistory(agentId, {
        limit,
        offset,
      });
      const filtered = status
        ? history.filter((h: { status: string }) => h.status === status)
        : history;
      sendJsonResponse(res, 200, {
        records: filtered,
        total: filtered.length,
        offset,
        limit,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch tx records";
      sendJsonResponse(res, 500, { error: message });
    }
    return true;
  }

  /* ── Steward Pending Approvals ────────────────────────────────────── */

  if (
    method === "GET" &&
    url.pathname === "/api/wallet/steward-pending-approvals"
  ) {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const addresses = getWalletAddresses();
    const agentId = resolveStewardAgentId(process.env, addresses.evmAddress);

    if (!agentId || !createStewardClient()) {
      sendJsonResponse(res, 503, {
        error: "Steward not configured",
      });
      return true;
    }

    try {
      const pending = await getStewardPendingApprovals(agentId);
      sendJsonResponse(res, 200, pending);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to fetch pending approvals";
      sendJsonResponse(res, 500, { error: message });
    }
    return true;
  }

  /* ── Steward Approve/Deny Transaction ─────────────────────────────── */

  if (
    method === "POST" &&
    (url.pathname === "/api/wallet/steward-approve-tx" ||
      url.pathname === "/api/wallet/steward-deny-tx")
  ) {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const body = await readCompatJsonBody(req, res);
    if (!body) return true;

    const txId = typeof body.txId === "string" ? body.txId : "";
    if (!txId) {
      sendJsonResponse(res, 400, { error: "txId is required" });
      return true;
    }

    const addresses = getWalletAddresses();
    const agentId = resolveStewardAgentId(process.env, addresses.evmAddress);

    if (!agentId || !createStewardClient()) {
      sendJsonResponse(res, 503, {
        error: "Steward not configured",
      });
      return true;
    }

    const isApprove = url.pathname.includes("approve");
    const reason = typeof body.reason === "string" ? body.reason : undefined;

    try {
      const result = isApprove
        ? await approveStewardTransaction(agentId, txId)
        : await denyStewardTransaction(agentId, txId, reason);
      sendJsonResponse(res, 200, { ok: true, ...result });
    } catch (err) {
      const action = isApprove ? "approve" : "deny";
      const message =
        err instanceof Error ? err.message : `Failed to ${action} transaction`;
      sendJsonResponse(res, 500, { error: message });
    }
    return true;
  }

  /* ── Steward Webhook Receiver ───────────────────────────────────────── */

  if (method === "POST" && url.pathname === "/api/wallet/steward-webhook") {
    // Webhook endpoint — steward pushes tx lifecycle events here.
    // Only accept from loopback (steward runs on localhost).
    if (!isLoopbackRemoteAddress(req.socket?.remoteAddress)) {
      logger.warn(
        `[steward-webhook] Rejected non-loopback request from ${req.socket?.remoteAddress}`,
      );
      sendJsonErrorResponse(res, 403, "Webhook only accepted from localhost");
      return true;
    }

    const body = await readCompatJsonBody(req, res);
    if (!body) return true;

    const event = typeof body.event === "string" ? body.event : "";
    const VALID_EVENTS: StewardWebhookEventType[] = [
      "tx.pending",
      "tx.approved",
      "tx.denied",
      "tx.confirmed",
    ];

    if (!VALID_EVENTS.includes(event as StewardWebhookEventType)) {
      sendJsonResponse(res, 400, { error: `Unknown event type: ${event}` });
      return true;
    }

    const data =
      body.data && typeof body.data === "object" && !Array.isArray(body.data)
        ? (body.data as Record<string, unknown>)
        : {};

    pushWebhookEvent({
      event: event as StewardWebhookEventType,
      data,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[steward-webhook] Received ${event}`);
    sendJsonResponse(res, 200, { ok: true });
    return true;
  }

  /* ── Steward Webhook Events (poll) ────────────────────────────────── */

  if (
    method === "GET" &&
    url.pathname === "/api/wallet/steward-webhook-events"
  ) {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const eventType = url.searchParams.get(
      "event",
    ) as StewardWebhookEventType | null;
    const sinceIndex = Number.parseInt(
      url.searchParams.get("since") || "0",
      10,
    );

    const result = getRecentWebhookEvents(
      eventType || undefined,
      Number.isNaN(sinceIndex) ? 0 : sinceIndex,
    );
    sendJsonResponse(res, 200, result);
    return true;
  }

  /* ── Steward Vault Sign ────────────────────────────────────────────── */

  if (method === "POST" && url.pathname === "/api/wallet/steward-sign") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const body = await readCompatJsonBody(req, res);
    if (!body) return true;

    const to = typeof body.to === "string" ? body.to.trim() : "";
    const value = typeof body.value === "string" ? body.value.trim() : "";
    const chainId =
      typeof body.chainId === "number" ? body.chainId : Number(body.chainId);
    const data = typeof body.data === "string" ? body.data : undefined;
    const description =
      typeof body.description === "string" ? body.description : undefined;

    if (!to || !value || !Number.isFinite(chainId) || chainId <= 0) {
      sendJsonResponse(res, 400, {
        error: "to, value, and a valid chainId are required",
      });
      return true;
    }

    try {
      const result = await signViaSteward({
        to,
        value,
        chainId,
        data,
        broadcast: true,
        description,
      });

      if (result.approved) {
        sendJsonResponse(res, 200, result);
      } else if (result.pending) {
        sendJsonResponse(res, 202, result);
      } else if (result.denied) {
        sendJsonResponse(res, 403, result);
      } else {
        sendJsonResponse(res, 200, result);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Steward sign failed";
      sendJsonResponse(res, 500, { error: message });
    }
    return true;
  }

  /* ── Steward Wallet Addresses / Balances / Tokens ─────────────────── */

  if (method === "GET" && url.pathname === "/api/wallet/steward-addresses") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    try {
      const addresses = getWalletAddresses();
      const stewardAddresses = await getStewardWalletAddresses({
        evmAddress: addresses.evmAddress,
      });
      sendJsonResponse(res, 200, stewardAddresses);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to fetch steward addresses";
      sendJsonResponse(res, 500, { error: message });
    }
    return true;
  }

  if (method === "GET" && url.pathname === "/api/wallet/steward-balances") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const addresses = getWalletAddresses();
    const agentId = resolveStewardAgentId(process.env, addresses.evmAddress);

    if (!agentId || !createStewardClient()) {
      sendJsonResponse(res, 503, { error: "Steward not configured" });
      return true;
    }

    const chainId = url.searchParams.get("chainId");
    const parsedChainId = chainId ? Number.parseInt(chainId, 10) : undefined;

    try {
      const balance = await getStewardBalance(agentId, parsedChainId);
      sendJsonResponse(res, 200, balance);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch steward balance";
      sendJsonResponse(res, 500, { error: message });
    }
    return true;
  }

  if (method === "GET" && url.pathname === "/api/wallet/steward-tokens") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const addresses = getWalletAddresses();
    const agentId = resolveStewardAgentId(process.env, addresses.evmAddress);

    if (!agentId || !createStewardClient()) {
      sendJsonResponse(res, 503, { error: "Steward not configured" });
      return true;
    }

    const chainId = url.searchParams.get("chainId");
    const parsedChainId = chainId ? Number.parseInt(chainId, 10) : undefined;

    try {
      const tokens = await getStewardTokenBalances(agentId, parsedChainId);
      sendJsonResponse(res, 200, tokens);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch steward tokens";
      sendJsonResponse(res, 500, { error: message });
    }
    return true;
  }

  if (method === "POST" && url.pathname === "/api/wallet/trade/execute") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const body = await readCompatJsonBody(req, res);
    if (body == null) {
      return true;
    }

    const side = typeof body.side === "string" ? body.side : "";
    const tokenAddress =
      typeof body.tokenAddress === "string" ? body.tokenAddress : "";
    const amount = typeof body.amount === "string" ? body.amount : "";
    const routeProvider =
      body.routeProvider === "0x" ||
      body.routeProvider === "pancakeswap-v2" ||
      body.routeProvider === "auto"
        ? body.routeProvider
        : undefined;

    if (!side || !tokenAddress || !amount) {
      sendJsonErrorResponse(
        res,
        400,
        "side, tokenAddress, and amount are required",
      );
      return true;
    }

    if (side !== "buy" && side !== "sell") {
      sendJsonErrorResponse(res, 400, 'side must be "buy" or "sell"');
      return true;
    }

    const config = loadElizaConfig();
    const tradePermissionMode = _resolveTradePermissionMode(config);
    const canExecuteLocally = _canUseLocalTradeExecution(
      tradePermissionMode,
      isAgentAutomationRequest(req),
    );
    const addresses = getWalletAddresses();
    const walletAddress = addresses.evmAddress ?? null;
    const hasLocalKey = Boolean(process.env.EVM_PRIVATE_KEY?.trim());
    const hasStewardSigner = isStewardConfigured();
    const canSign = hasLocalKey || hasStewardSigner;
    const rpcReadiness = resolveWalletRpcReadiness(config);
    const bscExecutionNetwork = resolveBscExecutionNetwork();

    try {
      const quote = await buildBscTradeQuote({
        walletAddress,
        rpcUrls: rpcReadiness.bscRpcUrls,
        cloudManagedAccess: rpcReadiness.cloudManagedAccess,
        request: {
          side,
          tokenAddress,
          amount,
          slippageBps:
            typeof body.slippageBps === "number" ? body.slippageBps : undefined,
          routeProvider,
        },
      });

      const unsignedTx =
        quote.side === "buy"
          ? buildBscBuyUnsignedTx(
              quote,
              walletAddress,
              typeof body.deadlineSeconds === "number"
                ? body.deadlineSeconds
                : undefined,
            )
          : buildBscSellUnsignedTx(
              quote,
              walletAddress,
              typeof body.deadlineSeconds === "number"
                ? body.deadlineSeconds
                : undefined,
            );

      let unsignedApprovalTx:
        | ReturnType<typeof buildBscApproveUnsignedTx>
        | undefined;
      let requiresApproval = false;
      if (quote.side === "sell" && walletAddress) {
        unsignedApprovalTx = buildBscApproveUnsignedTx(
          quote.tokenAddress,
          walletAddress,
          resolveBscApprovalSpender(quote),
          quote.quoteIn.amountWei,
        );
        requiresApproval = true;
      }

      if (!canSign || !canExecuteLocally || body.confirm !== true) {
        sendJsonResponse(res, 200, {
          ok: true,
          side: quote.side,
          mode: resolveWalletExecutionMode(
            canSign,
            canExecuteLocally,
            hasStewardSigner,
          ),
          quote,
          executed: false,
          requiresUserSignature: true,
          unsignedTx,
          unsignedApprovalTx,
          requiresApproval,
        });
        return true;
      }

      const rpcUrl = resolvePrimaryBscRpcUrl({
        rpcUrls: rpcReadiness.bscRpcUrls,
        cloudManagedAccess: rpcReadiness.cloudManagedAccess,
      });

      let approvalHash: string | undefined;
      let finalHash = "";
      let finalNonce: number | null = null;
      let finalGasLimit = "0";
      let finalMode: "local-key" | "steward" = hasLocalKey
        ? "local-key"
        : "steward";

      if (hasLocalKey && canExecuteLocally) {
        if (!rpcUrl) {
          sendJsonErrorResponse(
            res,
            503,
            "BSC RPC not configured for local execution",
          );
          return true;
        }

        if (requiresApproval && unsignedApprovalTx) {
          const approvalResult = await _sendLocalWalletTransaction(rpcUrl, {
            to: unsignedApprovalTx.to,
            data: unsignedApprovalTx.data,
            value: BigInt(unsignedApprovalTx.valueWei),
            chainId: unsignedApprovalTx.chainId,
          });
          approvalHash = approvalResult.hash;
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          try {
            await provider.waitForTransaction(approvalHash, 1);
          } finally {
            provider.destroy();
          }
        }

        const localExecution = await _sendLocalWalletTransaction(rpcUrl, {
          to: unsignedTx.to,
          data: unsignedTx.data,
          value: BigInt(unsignedTx.valueWei),
          chainId: unsignedTx.chainId,
        });
        finalHash = localExecution.hash;
        finalNonce = localExecution.nonce;
        finalGasLimit = localExecution.gasLimit;
      } else {
        finalMode = "steward";
        if (requiresApproval && unsignedApprovalTx) {
          const approvalResult = await signTransactionWithOptionalSteward({
            evmAddress: walletAddress,
            tx: {
              to: unsignedApprovalTx.to,
              data: unsignedApprovalTx.data,
              value: unsignedApprovalTx.valueWei,
              chainId: unsignedApprovalTx.chainId,
              broadcast: true,
            },
          });

          if (
            approvalResult.mode === "steward" &&
            approvalResult.pendingApproval
          ) {
            sendJsonResponse(res, 200, {
              ok: true,
              side: quote.side,
              mode: "steward",
              quote,
              executed: false,
              requiresUserSignature: false,
              unsignedTx,
              unsignedApprovalTx,
              requiresApproval,
              approval: {
                status: "pending_approval",
                policyResults: approvalResult.policyResults,
              },
            });
            return true;
          }

          approvalHash =
            "txHash" in approvalResult ? approvalResult.txHash : "";

          if (approvalResult.mode === "steward" && rpcUrl) {
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            try {
              await provider.waitForTransaction(approvalHash, 1);
            } finally {
              provider.destroy();
            }
          }
        }

        const executionResult = await signTransactionWithOptionalSteward({
          evmAddress: walletAddress,
          tx: {
            to: unsignedTx.to,
            data: unsignedTx.data,
            value: unsignedTx.valueWei,
            chainId: unsignedTx.chainId,
            broadcast: true,
          },
        });

        if (
          executionResult.mode === "steward" &&
          executionResult.pendingApproval
        ) {
          sendJsonResponse(res, 200, {
            ok: true,
            side: quote.side,
            mode: "steward",
            quote,
            executed: false,
            requiresUserSignature: false,
            unsignedTx,
            unsignedApprovalTx,
            requiresApproval,
            approvalHash,
            execution: {
              status: "pending_approval",
              policyResults: executionResult.policyResults,
            },
          });
          return true;
        }

        finalHash = "txHash" in executionResult ? executionResult.txHash : "";
      }

      try {
        const tradeSource =
          body.source === "agent" || body.source === "manual"
            ? body.source
            : "manual";

        recordWalletTradeLedgerEntry({
          hash: finalHash,
          source: tradeSource,
          side: quote.side,
          tokenAddress: quote.tokenAddress,
          slippageBps: quote.slippageBps,
          route: quote.route,
          quoteIn: {
            symbol: quote.quoteIn.symbol,
            amount: quote.quoteIn.amount,
            amountWei: quote.quoteIn.amountWei,
          },
          quoteOut: {
            symbol: quote.quoteOut.symbol,
            amount: quote.quoteOut.amount,
            amountWei: quote.quoteOut.amountWei,
          },
          status: "pending",
          confirmations: 0,
          nonce: finalNonce,
          blockNumber: null,
          gasUsed: null,
          effectiveGasPriceWei: null,
          explorerUrl: `${bscExecutionNetwork.explorerBaseUrl}/tx/${finalHash}`,
        });
      } catch (ledgerErr) {
        logger.warn(
          `[api] Failed to record trade ledger entry: ${ledgerErr instanceof Error ? ledgerErr.message : ledgerErr}`,
        );
      }

      sendJsonResponse(res, 200, {
        ok: true,
        side: quote.side,
        mode: finalMode,
        quote,
        executed: true,
        requiresUserSignature: false,
        unsignedTx,
        unsignedApprovalTx,
        requiresApproval,
        execution: {
          hash: finalHash,
          nonce: finalNonce,
          gasLimit: finalGasLimit,
          valueWei: unsignedTx.valueWei,
          explorerUrl: `${bscExecutionNetwork.explorerBaseUrl}/tx/${finalHash}`,
          blockNumber: null,
          status: "pending",
          approvalHash,
        },
      });
    } catch (err) {
      if (isStewardPolicyRejection(err)) {
        sendJsonResponse(res, 403, {
          ok: false,
          mode: "steward",
          executed: false,
          requiresUserSignature: false,
          error: err.message,
          execution: {
            status: "rejected",
            policyResults: getStewardPolicyResults(err),
          },
        });
        return true;
      }

      sendJsonErrorResponse(
        res,
        500,
        `Trade execution failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
    return true;
  }

  if (method === "POST" && url.pathname === "/api/wallet/transfer/execute") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const body = await readCompatJsonBody(req, res);
    if (body == null) {
      return true;
    }

    const toAddressRaw =
      typeof body.toAddress === "string" ? body.toAddress.trim() : "";
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    const assetSymbol =
      typeof body.assetSymbol === "string" ? body.assetSymbol.trim() : "";

    if (!toAddressRaw || !amount || !assetSymbol) {
      sendJsonErrorResponse(
        res,
        400,
        "toAddress, amount, and assetSymbol are required",
      );
      return true;
    }

    const config = loadElizaConfig();
    const tradePermissionMode = _resolveTradePermissionMode(config);
    const canExecuteLocally = _canUseLocalTradeExecution(
      tradePermissionMode,
      isAgentAutomationRequest(req),
    );
    const hasLocalKey = Boolean(process.env.EVM_PRIVATE_KEY?.trim());
    const hasStewardSigner = isStewardConfigured();
    const canSign = hasLocalKey || hasStewardSigner;
    const addresses = getWalletAddresses();
    const rpcReadiness = resolveWalletRpcReadiness(config);
    const bscExecutionNetwork = resolveBscExecutionNetwork();

    let toAddress: string;
    try {
      toAddress = ethers.getAddress(toAddressRaw);
    } catch {
      sendJsonErrorResponse(
        res,
        400,
        "Invalid toAddress — must be a valid EVM address",
      );
      return true;
    }

    const isBnb = assetSymbol.toUpperCase() === "BNB";
    let decimals = 18;
    if (typeof body.tokenAddress === "string" && body.tokenAddress.trim()) {
      const provider = new ethers.JsonRpcProvider(
        resolvePrimaryBscRpcUrl({
          rpcUrls: rpcReadiness.bscRpcUrls,
          cloudManagedAccess: rpcReadiness.cloudManagedAccess,
        }) ?? "https://bsc-dataseed1.binance.org/",
      );
      try {
        const tokenContract = new ethers.Contract(
          body.tokenAddress,
          ["function decimals() view returns (uint8)"],
          provider,
        );
        decimals = Number(await tokenContract.decimals());
      } finally {
        provider.destroy();
      }
    }

    const unsignedTx = {
      chainId: bscExecutionNetwork.chainId,
      from: addresses.evmAddress ?? null,
      to:
        isBnb || typeof body.tokenAddress !== "string"
          ? toAddress
          : body.tokenAddress,
      data: isBnb
        ? "0x"
        : new ethers.Interface([
            "function transfer(address to, uint256 amount) returns (bool)",
          ]).encodeFunctionData("transfer", [
            toAddress,
            ethers.parseUnits(amount, decimals),
          ]),
      valueWei: isBnb ? ethers.parseEther(amount).toString() : "0",
      explorerUrl: bscExecutionNetwork.explorerBaseUrl,
      assetSymbol,
      amount,
      tokenAddress:
        typeof body.tokenAddress === "string" ? body.tokenAddress : undefined,
    };

    if (!canSign || !canExecuteLocally || body.confirm !== true) {
      sendJsonResponse(res, 200, {
        ok: true,
        mode: resolveWalletExecutionMode(
          canSign,
          canExecuteLocally,
          hasStewardSigner,
        ),
        executed: false,
        requiresUserSignature: true,
        toAddress,
        amount,
        assetSymbol,
        tokenAddress: unsignedTx.tokenAddress,
        unsignedTx,
      });
      return true;
    }

    const _rpcUrl = resolvePrimaryBscRpcUrl({
      rpcUrls: rpcReadiness.bscRpcUrls,
      cloudManagedAccess: rpcReadiness.cloudManagedAccess,
    });

    try {
      let finalHash = "";
      let finalNonce: number | null = null;
      let finalGasLimit = "0";
      let finalMode: "local-key" | "steward" = hasLocalKey
        ? "local-key"
        : "steward";

      if (hasLocalKey && canExecuteLocally) {
        if (!_rpcUrl) {
          sendJsonErrorResponse(
            res,
            503,
            "BSC RPC not configured for local execution",
          );
          return true;
        }

        const localExecution = await _sendLocalWalletTransaction(_rpcUrl, {
          to: unsignedTx.to,
          data: unsignedTx.data,
          value: BigInt(unsignedTx.valueWei),
          chainId: unsignedTx.chainId,
        });
        finalHash = localExecution.hash;
        finalNonce = localExecution.nonce;
        finalGasLimit = localExecution.gasLimit;
      } else {
        finalMode = "steward";
        const executionResult = await signTransactionWithOptionalSteward({
          evmAddress: addresses.evmAddress,
          tx: {
            to: unsignedTx.to,
            data: unsignedTx.data,
            value: unsignedTx.valueWei,
            chainId: unsignedTx.chainId,
            broadcast: true,
          },
        });

        if (
          executionResult.mode === "steward" &&
          executionResult.pendingApproval
        ) {
          sendJsonResponse(res, 200, {
            ok: true,
            mode: "steward",
            executed: false,
            requiresUserSignature: false,
            toAddress,
            amount,
            assetSymbol,
            tokenAddress: unsignedTx.tokenAddress,
            unsignedTx,
            execution: {
              status: "pending_approval",
              policyResults: executionResult.policyResults,
            },
          });
          return true;
        }

        finalHash = "txHash" in executionResult ? executionResult.txHash : "";
      }

      sendJsonResponse(res, 200, {
        ok: true,
        mode: finalMode,
        executed: true,
        requiresUserSignature: false,
        toAddress,
        amount,
        assetSymbol,
        tokenAddress: unsignedTx.tokenAddress,
        unsignedTx,
        execution: {
          hash: finalHash,
          nonce: finalNonce,
          gasLimit: finalGasLimit,
          valueWei: unsignedTx.valueWei,
          explorerUrl: `${bscExecutionNetwork.explorerBaseUrl}/tx/${finalHash}`,
          blockNumber: null,
          status: "pending",
        },
      });
    } catch (err) {
      if (isStewardPolicyRejection(err)) {
        sendJsonResponse(res, 403, {
          ok: false,
          mode: "steward",
          executed: false,
          requiresUserSignature: false,
          error: err.message,
          execution: {
            status: "rejected",
            policyResults: getStewardPolicyResults(err),
          },
        });
        return true;
      }

      sendJsonErrorResponse(
        res,
        500,
        `Transfer failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
    return true;
  }

  // Plugin routes — extracted to plugins-compat-routes.ts
  if (await handlePluginsCompatRoutes(req, res, state)) return true;

  if (method === "POST" && url.pathname === "/api/onboarding") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const chunks: Buffer[] = [];
    try {
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
    } catch {
      req.push(null);
      return false;
    }
    const rawBody = Buffer.concat(chunks);

    let replayBody = rawBody;
    let capturedCloudApiKey: string | undefined;

    try {
      const body = JSON.parse(rawBody.toString("utf8")) as Record<
        string,
        unknown
      >;
      await _extractAndPersistOnboardingApiKey(body);
      _persistCompatOnboardingDefaults(body);
      if (typeof body.name === "string" && body.name.trim()) {
        state.pendingAgentName = body.name.trim();
      }

      const { isCloudMode, replayBody: replayBodyRecord } =
        _deriveCompatOnboardingReplayBody(body);

      // Resolve the cloud API key so the upstream handler can write it
      // into state.config before saving. Without this, the upstream uses
      // its stale in-memory config (loaded at startup, before OAuth) and
      // clobbers the apiKey that persistCloudLoginStatus wrote to disk.
      let resolvedCloudApiKey: string | undefined;

      try {
        const config = loadElizaConfig();
        if (!config.meta) {
          (config as Record<string, unknown>).meta = {};
        }
        (config.meta as Record<string, unknown>).onboardingComplete = true;

        if (isCloudMode) {
          if (!config.cloud) {
            (config as Record<string, unknown>).cloud = {};
          }
          (config.cloud as Record<string, unknown>).enabled = true;

          resolvedCloudApiKey = (config.cloud as Record<string, unknown>)
            .apiKey as string | undefined;

          if (!resolvedCloudApiKey) {
            const { getCloudSecret: getSecret } = await import(
              "./cloud-secrets"
            );
            resolvedCloudApiKey =
              getSecret("ELIZAOS_CLOUD_API_KEY") ?? undefined;
            if (resolvedCloudApiKey) {
              (config.cloud as Record<string, unknown>).apiKey =
                resolvedCloudApiKey;
            }
          }

          // Last resort: check process.env directly (key may not have been
          // scrubbed yet if persistCloudLoginStatus is still running).
          if (!resolvedCloudApiKey) {
            resolvedCloudApiKey = process.env.ELIZAOS_CLOUD_API_KEY;
            if (resolvedCloudApiKey) {
              (config.cloud as Record<string, unknown>).apiKey =
                resolvedCloudApiKey;
            }
          }

          if (!resolvedCloudApiKey) {
            logger.warn(
              "[milady-api] Cloud onboarding but no API key found on disk, in sealed secrets, or in env. " +
                "The upstream handler will save config WITHOUT cloud.apiKey.",
            );
          } else {
            logger.info(
              "[milady-api] Cloud onboarding: resolved API key, injecting into replay body",
            );
          }

          // Capture for deferred re-save after upstream clobbers config
          capturedCloudApiKey = resolvedCloudApiKey;

          if (body.smallModel) {
            if (!config.models) {
              (config as Record<string, unknown>).models = {};
            }
            (config.models as Record<string, string>).small =
              body.smallModel as string;
            (config.models as Record<string, string>).large =
              (body.largeModel as string) || "";
          }
        }
        saveElizaConfig(config);
      } catch (err) {
        logger.warn(
          `[milady-api] Failed to persist onboarding state: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Inject the cloud API key into the replay body so the upstream
      // handler writes it into state.config. The upstream uses
      // state.config (stale), not loadElizaConfig(), so without this
      // the key is lost when it calls saveElizaConfig(state.config).
      if (isCloudMode) {
        const enriched = {
          ...replayBodyRecord,
          runMode: "cloud" as const,
          ...(resolvedCloudApiKey
            ? { providerApiKey: resolvedCloudApiKey }
            : {}),
        };
        replayBody = Buffer.from(JSON.stringify(enriched), "utf8");
      } else if (body.runMode !== "cloud") {
        // Non-cloud: only rewrite if deriveCompat changed something
        if (replayBodyRecord !== body) {
          replayBody = Buffer.from(JSON.stringify(replayBodyRecord), "utf8");
        }
      }
    } catch {
      // JSON parse failed — let upstream handle the error
    }

    sendJsonResponse(res, 200, { ok: true });

    // Schedule a deferred re-save AFTER the upstream handler has had a chance
    // to clobber the config. The upstream uses state.config (stale, loaded at
    // startup before OAuth) and calls saveElizaConfig which overwrites our
    // apiKey on disk. We wait, then re-read and re-inject.
    if (capturedCloudApiKey) {
      const keyToRestore = capturedCloudApiKey;
      setTimeout(() => {
        try {
          const freshConfig = loadElizaConfig();
          if (!freshConfig.cloud?.apiKey) {
            if (!freshConfig.cloud) {
              (freshConfig as Record<string, unknown>).cloud = {};
            }
            (freshConfig.cloud as Record<string, unknown>).apiKey =
              keyToRestore;
            (freshConfig.cloud as Record<string, unknown>).enabled = true;
            saveElizaConfig(freshConfig);
            logger.info(
              "[milady-api] Re-saved cloud.apiKey after upstream handler clobbered it",
            );
          }
        } catch {
          // Non-fatal
        }
      }, 3000);
    }

    req.push(replayBody);
    req.push(null);
    return false;
  }

  if (method === "GET" && url.pathname === "/api/config") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    sendJsonResponse(
      res,
      200,
      _filterConfigEnvForResponse(loadElizaConfig() as Record<string, unknown>),
    );
    return true;
  }

  if (!ensureCompatApiAuthorized(req, res)) return true;
  return handleDatabaseRowsCompatRoute(req, res, state.current, url.pathname);
}

export function patchHttpCreateServerForMiladyCompat(
  state?: CompatRuntimeState,
): () => void {
  const originalCreateServer = http.createServer.bind(http);

  http.createServer = ((...args: Parameters<typeof originalCreateServer>) => {
    const [firstArg, secondArg] = args;
    const listener =
      typeof firstArg === "function"
        ? firstArg
        : typeof secondArg === "function"
          ? secondArg
          : undefined;

    if (!listener) {
      return originalCreateServer(...args);
    }

    const wrappedListener: http.RequestListener = async (req, res) => {
      syncMiladyEnvToEliza();
      syncElizaEnvToMilady();
      // Re-check cloud TTS key alias on each request so sign-in mid-session
      // is picked up without a restart.
      ensureCloudTtsApiKeyAlias();
      mirrorCompatHeaders(req);
      if (state) {
        patchCompatStatusResponse(req, res, state);
      }

      // CORS: allow local renderer servers (Vite, static loopback, WKWebView).
      // WKWebView sometimes omits `Origin` on cross-port fetches; allow Referer
      // only when Origin is absent so we never reflect an arbitrary Origin.
      const originHeader = req.headers.origin ?? "";
      // Build allowed origins from configured ports (API, UI, gateway, home)
      const corsAllowedPorts = buildCorsAllowedPorts();
      const allowOrigin = (() => {
        if (originHeader !== "") {
          return isAllowedLocalOrigin(originHeader, corsAllowedPorts)
            ? originHeader
            : null;
        }
        const ref = req.headers.referer;
        if (!ref) return null;
        try {
          const u = new URL(ref);
          return isAllowedLocalOrigin(ref, corsAllowedPorts) ? u.origin : null;
        } catch {
          return null;
        }
      })();

      if (allowOrigin) {
        res.setHeader("Access-Control-Allow-Origin", allowOrigin);
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-API-Token, X-Api-Key, X-Milady-Client-Id, X-Milady-UI-Language, X-Milady-Token, X-Milady-Export-Token, X-Milady-Terminal-Token",
        );
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      res.on("finish", () => {
        syncElizaEnvToMilady();
        syncCompatConfigFiles();
      });

      if (state) {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (
          pathname.startsWith("/api/database") ||
          pathname.startsWith("/api/trajectories")
        ) {
          await ensureRuntimeSqlCompatibility(state.current);
        }

        try {
          if (await handleMiladyCompatRoute(req, res, state)) {
            return;
          }
        } catch (err) {
          console.error(
            "[milady-compat] unhandled error in route handler",
            err,
          );
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Internal server error" }));
          }
          return;
        }
      }

      Promise.resolve(listener(req, res)).catch((err) => {
        console.error("[milady-compat] upstream listener error", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
    };

    if (typeof firstArg === "function") {
      return originalCreateServer(wrappedListener);
    }

    return originalCreateServer(firstArg, wrappedListener);
  }) as typeof http.createServer;

  return () => {
    http.createServer = originalCreateServer as typeof http.createServer;
  };
}

export async function startApiServer(
  ...args: Parameters<typeof upstreamStartApiServer>
): Promise<Awaited<ReturnType<typeof upstreamStartApiServer>>> {
  syncMiladyEnvToEliza();
  syncElizaEnvToMilady();
  // Ensure cloud-backed ElevenLabs key is available as ELEVENLABS_API_KEY so
  // the upstream Eliza TTS handler can use it (the `/api/tts/elevenlabs` route
  // passes through to upstream which checks this env var).
  ensureCloudTtsApiKeyAlias();
  await hydrateWalletKeysFromNodePlatformSecureStore();

  // Pre-load steward wallet addresses so getWalletAddresses() has them
  // available synchronously from the start.
  await initStewardWalletCache();
  const compatState: CompatRuntimeState = {
    current: (args[0]?.runtime as AgentRuntime | null) ?? null,
    pendingAgentName: null,
  };
  const restoreCreateServer = patchHttpCreateServerForMiladyCompat(compatState);

  try {
    if (compatState.current) {
      await ensureRuntimeSqlCompatibility(compatState.current);
      await (await lazyEnsureTTS())(compatState.current);
    }

    const server = await upstreamStartApiServer(...args);
    const originalUpdateRuntime = server.updateRuntime as (
      runtime: AgentRuntime,
    ) => void;

    server.updateRuntime = (runtime: AgentRuntime) => {
      compatState.current = runtime;
      // Make the runtime immediately visible to upstream routes so hot swaps do
      // not briefly return 503s while compat setup finishes in the background.
      originalUpdateRuntime(runtime);

      // Continue repairing SQL compatibility + Edge TTS registration
      // asynchronously. These are important, but they should not block the
      // runtime from becoming available to non-TTS routes.
      void (async () => {
        try {
          await ensureRuntimeSqlCompatibility(runtime);
        } catch (err) {
          logger.error(
            `[milady][runtime] SQL compatibility init failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }

        try {
          await (await lazyEnsureTTS())(runtime);
        } catch (err) {
          logger.warn(
            `[milady][runtime] TTS init failed (non-critical): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      })();
    };

    syncElizaEnvToMilady();
    syncCompatConfigFiles();
    return server;
  } finally {
    restoreCreateServer();
  }
}
