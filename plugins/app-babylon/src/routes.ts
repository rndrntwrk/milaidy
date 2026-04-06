import type { IAgentRuntime } from "@elizaos/core";
import type {
  AppLaunchResult,
  AppSessionState,
} from "@miladyai/shared/contracts/apps";
import {
  asRuntimeLike,
  proxyBabylonRequest,
  resolveBabylonConfig,
  resolveSettingLike,
  type BabylonConfig,
} from "./babylon-auth";

const APP_NAME = "@elizaos/app-babylon";
const APP_DISPLAY_NAME = "Babylon";

/** Inlined from packages/agent — keeps this plugin free of circular deps. */
interface AppLaunchSessionContext {
  appName: string;
  launchUrl: string | null;
  runtime: IAgentRuntime | null;
  viewer: AppLaunchResult["viewer"] | null;
}

// ---------------------------------------------------------------------------
// Route context type (mirrors AppPackageRouteContext)
// ---------------------------------------------------------------------------

interface RouteContext {
  method: string;
  pathname: string;
  url: URL;
  runtime: unknown | null;
  res: unknown;
  error: (response: unknown, message: string, status?: number) => void;
  json: (response: unknown, data: unknown, status?: number) => void;
  readJsonBody: () => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRuntime(ctx: RouteContext): IAgentRuntime | null {
  return (asRuntimeLike(ctx.runtime) as IAgentRuntime | null) ?? null;
}

function getConfig(ctx: RouteContext): BabylonConfig {
  return resolveBabylonConfig(getRuntime(ctx));
}

function getAgentId(config: BabylonConfig): string | undefined {
  return config.agentId;
}

/** Strip the `/api/apps/babylon` prefix to get the sub-path. */
function subpath(pathname: string): string {
  const match = pathname.match(/^\/api\/apps\/babylon(\/.*)?$/);
  return match?.[1] ?? "";
}

async function proxyGet(
  config: BabylonConfig,
  apiPath: string,
  ctx: RouteContext,
): Promise<boolean> {
  try {
    const response = await proxyBabylonRequest(config, "GET", apiPath);
    const data = await response.json();
    ctx.json(ctx.res, data, response.ok ? 200 : response.status);
  } catch (err) {
    ctx.error(
      ctx.res,
      err instanceof Error ? err.message : "Babylon API request failed.",
      502,
    );
  }
  return true;
}

async function proxyPost(
  config: BabylonConfig,
  apiPath: string,
  body: unknown,
  ctx: RouteContext,
): Promise<boolean> {
  try {
    const response = await proxyBabylonRequest(config, "POST", apiPath, body);
    const data = await response.json();
    ctx.json(ctx.res, data, response.ok ? 200 : response.status);
  } catch (err) {
    ctx.error(
      ctx.res,
      err instanceof Error ? err.message : "Babylon API request failed.",
      502,
    );
  }
  return true;
}

// ---------------------------------------------------------------------------
// SSE proxy — streams Babylon's SSE endpoint through to the client
// ---------------------------------------------------------------------------

async function handleSSEProxy(
  config: BabylonConfig,
  ctx: RouteContext,
): Promise<boolean> {
  const agentId = getAgentId(config);
  const channels = agentId
    ? `agent:${agentId},feed,markets`
    : "feed,markets";

  const sseUrl = new URL("/api/sse/events", config.apiBaseUrl);
  sseUrl.searchParams.set("channels", channels);

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };

  const apiKey = resolveSettingLike(config.runtime, "BABYLON_A2A_API_KEY");
  if (apiKey) {
    headers["X-Babylon-Api-Key"] = apiKey;
  }

  try {
    const upstream = await fetch(sseUrl, {
      headers,
      signal: AbortSignal.timeout(60_000),
    });

    if (!upstream.ok || !upstream.body) {
      ctx.error(ctx.res, `Babylon SSE failed (${upstream.status})`, 502);
      return true;
    }

    const res = ctx.res as {
      writeHead: (status: number, headers: Record<string, string>) => void;
      write: (chunk: string) => boolean;
      end: () => void;
      on: (event: string, cb: () => void) => void;
    };

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let closed = false;

    res.on("close", () => {
      closed = true;
      reader.cancel().catch(() => {});
    });

    const pump = async () => {
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        res.write(text);
      }
      if (!closed) res.end();
    };

    pump().catch(() => {
      if (!closed) res.end();
    });
  } catch (err) {
    ctx.error(
      ctx.res,
      err instanceof Error ? err.message : "Babylon SSE connection failed.",
      502,
    );
  }
  return true;
}

// ---------------------------------------------------------------------------
// Session state (for GameView session polling)
// ---------------------------------------------------------------------------

function buildSessionState(
  config: BabylonConfig,
  agentData?: Record<string, unknown>,
): AppSessionState {
  const agentId = getAgentId(config);
  const name =
    (agentData?.displayName as string) ??
    (agentData?.name as string) ??
    "Babylon Agent";
  const balance = (agentData?.balance as number) ?? 0;
  const pnl = (agentData?.lifetimePnL as number) ?? 0;

  return {
    sessionId: agentId ?? "babylon",
    appName: APP_NAME,
    mode: "spectate-and-steer",
    status: agentData ? "connected" : "connecting",
    displayName: APP_DISPLAY_NAME,
    agentId: agentId ?? undefined,
    canSendCommands: true,
    controls: ["pause", "resume"],
    summary: agentData
      ? `${name} | $${balance.toFixed(2)} | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`
      : "Connecting to Babylon...",
    goalLabel: null,
    suggestedPrompts: [
      "What markets are trending?",
      "Show my positions",
      "Post an update",
      "Check my portfolio",
    ],
    telemetry: agentData
      ? {
          balance,
          lifetimePnL: pnl,
          winRate: agentData.winRate ?? null,
          reputation: agentData.reputationScore ?? null,
          totalTrades: agentData.totalTrades ?? null,
        }
      : null,
  };
}

async function readSessionState(
  config: BabylonConfig,
): Promise<AppSessionState> {
  const agentId = getAgentId(config);
  if (!agentId) {
    return buildSessionState(config);
  }

  try {
    const response = await proxyBabylonRequest(
      config,
      "GET",
      `/api/agents/${encodeURIComponent(agentId)}`,
    );
    if (response.ok) {
      const data = (await response.json()) as Record<string, unknown>;
      return buildSessionState(config, data);
    }
  } catch {
    // Fall through to disconnected state
  }
  return buildSessionState(config);
}

// ---------------------------------------------------------------------------
// Session sub-routes (message + control for GameView integration)
// ---------------------------------------------------------------------------

function parseSessionId(pathname: string): string | null {
  const match = pathname.match(/\/session\/([^/]+)(?:\/|$)/);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]);
}

function parseSessionSubroute(pathname: string): "message" | "control" | null {
  if (pathname.endsWith("/message")) return "message";
  if (pathname.endsWith("/control")) return "control";
  return null;
}

// ---------------------------------------------------------------------------
// Launch session resolver
// ---------------------------------------------------------------------------

export async function resolveLaunchSession(
  ctx: AppLaunchSessionContext,
): Promise<AppLaunchResult["session"]> {
  const config = resolveBabylonConfig(ctx.runtime);
  return readSessionState(config);
}

// ---------------------------------------------------------------------------
// Main route handler
// ---------------------------------------------------------------------------

export async function handleAppRoutes(ctx: RouteContext): Promise<boolean> {
  const path = subpath(ctx.pathname);
  const config = getConfig(ctx);
  const agentId = getAgentId(config);

  // --- Agent status ---
  if (ctx.method === "GET" && path === "/agent/status") {
    if (!agentId) {
      ctx.json(ctx.res, { error: "No BABYLON_AGENT_ID configured" }, 400);
      return true;
    }
    return proxyGet(
      config,
      `/api/agents/${encodeURIComponent(agentId)}`,
      ctx,
    );
  }

  // --- Agent activity feed ---
  if (ctx.method === "GET" && path === "/agent/activity") {
    if (!agentId) {
      ctx.json(ctx.res, { items: [], total: 0 }, 200);
      return true;
    }
    const limit = ctx.url.searchParams.get("limit") ?? "50";
    const type = ctx.url.searchParams.get("type") ?? "all";
    return proxyGet(
      config,
      `/api/agents/${encodeURIComponent(agentId)}/activity?limit=${limit}&type=${type}`,
      ctx,
    );
  }

  // --- Agent logs ---
  if (ctx.method === "GET" && path === "/agent/logs") {
    if (!agentId) {
      ctx.json(ctx.res, [], 200);
      return true;
    }
    const params = new URLSearchParams();
    const type = ctx.url.searchParams.get("type");
    const level = ctx.url.searchParams.get("level");
    if (type) params.set("type", type);
    if (level) params.set("level", level);
    const qs = params.toString();
    return proxyGet(
      config,
      `/api/agents/${encodeURIComponent(agentId)}/logs${qs ? `?${qs}` : ""}`,
      ctx,
    );
  }

  // --- Agent wallet ---
  if (ctx.method === "GET" && path === "/agent/wallet") {
    if (!agentId) {
      ctx.json(ctx.res, { balance: 0, transactions: [] }, 200);
      return true;
    }
    return proxyGet(
      config,
      `/api/agents/${encodeURIComponent(agentId)}/wallet`,
      ctx,
    );
  }

  // --- Granular autonomy control ---
  if (ctx.method === "POST" && path === "/agent/autonomy") {
    if (!agentId) {
      ctx.error(ctx.res, "No BABYLON_AGENT_ID configured.", 400);
      return true;
    }
    const body = (await ctx.readJsonBody()) as Record<string, boolean> | null;
    return proxyPost(
      config,
      `/api/admin/agents/${encodeURIComponent(agentId)}/autonomy`,
      body ?? {},
      ctx,
    );
  }

  // --- Team (all agents) ---
  if (ctx.method === "GET" && path === "/team") {
    return proxyGet(config, "/api/admin/agents", ctx);
  }

  // --- Team info (get/create team chat) ---
  if (ctx.method === "GET" && path === "/team/info") {
    return proxyGet(config, "/api/agents/team-chat", ctx);
  }

  // --- Team chat ---
  if (ctx.method === "POST" && path === "/team/chat") {
    const body = (await ctx.readJsonBody()) as {
      content?: string;
      mentions?: string[];
    } | null;
    if (!body?.content?.trim()) {
      ctx.error(ctx.res, "Chat content is required.", 400);
      return true;
    }
    return proxyPost(
      config,
      "/api/agents/team-chat/message",
      {
        content: body.content.trim(),
        mentions: body.mentions ?? [],
      },
      ctx,
    );
  }

  // --- Agent toggle (pause/resume) ---
  if (ctx.method === "POST" && path === "/agent/toggle") {
    if (!agentId) {
      ctx.error(ctx.res, "No BABYLON_AGENT_ID configured.", 400);
      return true;
    }
    const body = (await ctx.readJsonBody()) as {
      action?: string;
    } | null;
    return proxyPost(
      config,
      `/api/admin/agents/${encodeURIComponent(agentId)}/toggle`,
      { action: body?.action ?? "toggle" },
      ctx,
    );
  }

  // --- SSE stream proxy ---
  if (ctx.method === "GET" && path === "/sse") {
    return handleSSEProxy(config, ctx);
  }

  // --- Session state (for GameView polling) ---
  const sessionId = parseSessionId(path);
  if (sessionId) {
    const subroute = parseSessionSubroute(path);

    if (ctx.method === "GET" && !subroute) {
      const state = await readSessionState(config);
      ctx.json(ctx.res, state);
      return true;
    }

    if (ctx.method === "POST" && subroute === "message") {
      const body = (await ctx.readJsonBody()) as {
        content?: string;
      } | null;
      if (!body?.content?.trim()) {
        ctx.error(ctx.res, "Message content is required.", 400);
        return true;
      }
      return proxyPost(
        config,
        "/api/agents/team-chat/message",
        { content: body.content.trim() },
        ctx,
      );
    }

    if (ctx.method === "POST" && subroute === "control") {
      const body = (await ctx.readJsonBody()) as {
        action?: string;
      } | null;
      if (!agentId) {
        ctx.error(ctx.res, "No BABYLON_AGENT_ID configured.", 400);
        return true;
      }
      return proxyPost(
        config,
        `/api/admin/agents/${encodeURIComponent(agentId)}/toggle`,
        { action: body?.action ?? "toggle" },
        ctx,
      );
    }
  }

  return false;
}
