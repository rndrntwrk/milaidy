/**
 * Shopify route handler — stub.
 *
 * Upstream commit c15213577 ("milady: unified inbox actions, shopify/vincent
 * apps, i18n sync, and test fixes") added
 *
 *     import { handleShopifyRoute } from "./shopify-routes";
 *
 * and a matching `/api/shopify` dispatch block to
 * `packages/app-core/src/api/server.ts`, but never committed the route
 * handler module itself. As a result `develop` cannot resolve its own
 * import and the API server fails to boot with:
 *
 *     Cannot find module './shopify-routes' from
 *     '.../packages/app-core/src/api/server.ts'
 *
 * This stub makes the import resolve so the server boots again. The handler
 * returns `false` for every request, which tells the dispatcher the route
 * was not handled and lets it fall through to the default 404 path — the
 * same behavior the frontend already sees for any other unimplemented API.
 *
 * Replace this file with the real implementation (products / orders /
 * inventory / customers endpoints backed by `@elizaos/plugin-shopify`'s
 * `ShopifyService`) once it lands upstream.
 */

import type http from "node:http";

export async function handleShopifyRoute(
  _req: http.IncomingMessage,
  _res: http.ServerResponse,
  _pathname: string,
  _method: string,
): Promise<boolean> {
  return false;
}
