import path from "node:path";
import type http from "node:http";
import { resolveStateDir } from "../config/paths.js";
import type { ElizaConfig } from "../config/types.eliza.js";
import type { ReadJsonBodyOptions } from "./http-helpers.js";
import {
  type CrossChannelCommentInput,
  type CrossChannelCommentSource,
  createCrossChannelIngestStore,
  type SourcePayloadInput,
} from "./cross-channel-ingest.js";

const SUPPORTED_SOURCES = new Set<CrossChannelCommentSource>([
  "github",
  "discord",
  "telegram",
  "slack",
  "gmail",
  "ops",
  "stream555",
]);

export interface CrossChannelIngestRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  stateDir?: string;
  config?: Pick<ElizaConfig, "alice">;
  json: (res: http.ServerResponse, data: unknown, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    options?: ReadJsonBodyOptions,
  ) => Promise<T | null>;
}

type RawIngestBody = Partial<CrossChannelCommentInput & SourcePayloadInput>;

function resolveIngestRoot(
  stateDir?: string,
  config?: Pick<ElizaConfig, "alice">,
): string {
  const configuredStoreDir = config?.alice?.ingest?.storeDir;
  const baseStateDir = stateDir ?? resolveStateDir();
  if (configuredStoreDir) {
    return path.isAbsolute(configuredStoreDir)
      ? configuredStoreDir
      : path.join(baseStateDir, configuredStoreDir);
  }
  return path.join(baseStateDir, "ingest", "comments");
}

function parseSource(value: unknown): CrossChannelCommentSource | null {
  return typeof value === "string" && SUPPORTED_SOURCES.has(value as CrossChannelCommentSource)
    ? (value as CrossChannelCommentSource)
    : null;
}

function isSourceEnabled(
  source: CrossChannelCommentSource,
  config?: Pick<ElizaConfig, "alice">,
): boolean {
  const ingestConfig = config?.alice?.ingest;
  if (ingestConfig?.enabled === false) return false;
  const configuredSources = ingestConfig?.sources;
  if (!Array.isArray(configuredSources) || configuredSources.length === 0) {
    return true;
  }
  return configuredSources.includes(source);
}

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export async function handleCrossChannelIngestRoutes(
  ctx: CrossChannelIngestRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, url, json, error, readJsonBody } = ctx;

  if (
    pathname !== "/api/ingest/comments" &&
    pathname !== "/api/ingest/comments/status" &&
    pathname !== "/api/ingest/comments/replay"
  ) {
    return false;
  }

  const store = createCrossChannelIngestStore({
    rootDir: resolveIngestRoot(ctx.stateDir, ctx.config),
  });

  if (method === "GET" && pathname === "/api/ingest/comments/status") {
    json(res, { ok: true, status: store.status() });
    return true;
  }

  if (method === "GET" && pathname === "/api/ingest/comments") {
    const sourceParam = url.searchParams.get("source");
    const source = sourceParam ? parseSource(sourceParam) : undefined;
    if (sourceParam && !source) {
      error(res, "Unsupported cross-channel source", 400);
      return true;
    }
    const result = store.list({
      source,
      limit: parseLimit(url.searchParams.get("limit")),
      since: url.searchParams.get("since") ?? undefined,
    });
    json(res, { ok: true, ...result });
    return true;
  }

  if (method === "POST" && pathname === "/api/ingest/comments") {
    const body = await readJsonBody<RawIngestBody>(req, res, {
      maxBytes: 4 * 1024 * 1024,
    });
    if (!body) return true;

    const source = parseSource(body.source);
    if (!source) {
      error(res, "Unsupported cross-channel source", 400);
      return true;
    }
    if (!isSourceEnabled(source, ctx.config)) {
      error(res, "Cross-channel source is disabled", 403);
      return true;
    }

    const result =
      body.payload && typeof body.payload === "object"
        ? store.ingest({
            source,
            payload: body.payload as Record<string, unknown>,
          })
        : store.ingest({ ...(body as CrossChannelCommentInput), source });
    json(res, { ok: true, ...result });
    return true;
  }

  if (method === "POST" && pathname === "/api/ingest/comments/replay") {
    const result = store.list({
      limit: parseLimit(url.searchParams.get("limit")) ?? 100,
      since: url.searchParams.get("since") ?? undefined,
    });
    json(res, { ok: true, replayed: result.items.length, items: result.items });
    return true;
  }

  error(res, "Method not allowed", 405);
  return true;
}
