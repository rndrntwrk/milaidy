import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "@elizaos/core";
import { getPluginInfo } from "../services/registry-client.js";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export interface AppPackageRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "error" | "json" | "readJsonBody"> {
  url: URL;
  runtime: unknown | null;
}

type AppRouteModule = {
  handleAppRoutes?: (ctx: AppPackageRouteContext) => Promise<boolean>;
  [key: string]: unknown;
};

const RESERVED_APP_ROUTE_SLUGS = new Set([
  "",
  "info",
  "installed",
  "launch",
  "plugins",
  "refresh",
  "search",
  "stop",
]);

function extractAppSlug(pathname: string): string | null {
  const match = pathname.match(/^\/api\/apps\/([^/]+)(?:\/|$)/);
  if (!match?.[1]) return null;
  const slug = decodeURIComponent(match[1]).trim();
  if (!slug || RESERVED_APP_ROUTE_SLUGS.has(slug)) {
    return null;
  }
  return slug;
}

function toLegacyHandlerName(slug: string): string {
  const normalized = slug
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `handleApps${normalized}Routes`;
}

async function importLocalAppRouteModule(
  packageName: string,
): Promise<AppRouteModule | null> {
  const localInfo = await getPluginInfo(packageName);
  const localPath = localInfo?.localPath;
  if (!localPath) return null;

  const candidatePaths = [
    path.join(localPath, "src", "routes.ts"),
    path.join(localPath, "src", "routes.js"),
    path.join(localPath, "dist", "routes.js"),
  ];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) continue;
    return (await import(pathToFileURL(candidatePath).href)) as AppRouteModule;
  }

  return null;
}

async function importAppRouteModule(slug: string): Promise<AppRouteModule | null> {
  const packageName = `@elizaos/app-${slug}`;

  try {
    const localModule = await importLocalAppRouteModule(packageName);
    if (localModule) {
      return localModule;
    }
  } catch (err) {
    logger.warn(
      `[app-package-routes] Failed to import local routes for ${packageName}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  try {
    return (await import(
      /* webpackIgnore: true */ `${packageName}/routes`
    )) as AppRouteModule;
  } catch {
    return null;
  }
}

function resolveAppRouteHandler(
  routeModule: AppRouteModule,
  slug: string,
): ((ctx: AppPackageRouteContext) => Promise<boolean>) | null {
  if (typeof routeModule.handleAppRoutes === "function") {
    return routeModule.handleAppRoutes;
  }

  const legacyHandler = routeModule[toLegacyHandlerName(slug)];
  if (typeof legacyHandler === "function") {
    return legacyHandler as (ctx: AppPackageRouteContext) => Promise<boolean>;
  }

  return null;
}

export async function handleAppPackageRoutes(
  ctx: AppPackageRouteContext,
): Promise<boolean> {
  const slug = extractAppSlug(ctx.pathname);
  if (!slug) return false;

  const routeModule = await importAppRouteModule(slug);
  if (!routeModule) return false;

  const handler = resolveAppRouteHandler(routeModule, slug);
  if (!handler) return false;

  return handler(ctx);
}
