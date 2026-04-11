/**
 * Shopify backend route stub.
 *
 * `server.ts:139` imports `handleShopifyRoute` from this file. That
 * import was added by commit c15213577 ("milady: unified inbox actions,
 * shopify/vincent apps, i18n sync, and test fixes") but the
 * accompanying `shopify-routes.ts` implementation was never committed
 * alongside it, leaving every develop checkout with a broken
 * `bun run verify:typecheck` and every CI run that reaches that step
 * red. This stub restores a compilable module so the server builds and
 * the rest of CI can run.
 *
 * Hitting `/api/shopify/*` returns 503 with a clear
 * `shopify_routes_not_implemented` error so it's obvious — to both the
 * milady runtime logs and any caller — that the real backend still
 * needs to land. When the actual implementation is restored (either by
 * cherry-picking from wherever it was authored or by writing a fresh
 * one), this file should be replaced wholesale.
 */

import type http from "node:http";
import { logger } from "@elizaos/core";

export async function handleShopifyRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  if (!pathname.startsWith("/api/shopify")) return false;
  logger.warn(
    `[shopify-routes][stub] ${method} ${pathname} — backend not implemented (shopify-routes.ts was never committed alongside c15213577)`,
  );
  res.statusCode = 503;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      error: "shopify_routes_not_implemented",
      message:
        "Shopify backend routes were declared in server.ts but never shipped. Replace packages/app-core/src/api/shopify-routes.ts with the real implementation before relying on these endpoints.",
      method,
      pathname,
    }),
  );
  return true;
}
