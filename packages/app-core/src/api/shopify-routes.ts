/**
 * Shopify dashboard API routes.
 *
 * GET  /api/shopify/status
 * GET  /api/shopify/products?page=N&limit=N&q=Q
 * POST /api/shopify/products                         body: { title, vendor?, productType?, price? }
 * GET  /api/shopify/orders?status=S&limit=N
 * GET  /api/shopify/inventory
 * POST /api/shopify/inventory/:itemId/adjust          body: { delta }
 * GET  /api/shopify/customers?q=Q&limit=N
 *
 * Credentials are read from process.env:
 *   SHOPIFY_STORE_DOMAIN  — e.g. mystore.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN  — Shopify Admin API access token
 *
 * The handler does NOT need the agent runtime — it talks to the Shopify
 * GraphQL API directly, which is why server.ts passes no `state` argument.
 */

import type http from "node:http";
import { logger } from "@elizaos/core";
import { sendJson, sendJsonError } from "./response";

// ── Shopify client helpers ────────────────────────────────────────────────

const SHOPIFY_API_VERSION = "2025-04";

interface ShopifyClientConfig {
  baseUrl: string;
  token: string;
  domain: string;
}

function getConfig(): ShopifyClientConfig | null {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (!domain || !token) return null;
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return {
    domain: clean,
    token,
    baseUrl: `https://${clean}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
  };
}

async function shopifyGql<T>(
  cfg: ShopifyClientConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const resp = await fetch(cfg.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": cfg.token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Shopify API ${resp.status} ${resp.statusText}: ${text.slice(0, 300)}`,
    );
  }

  const json = (await resp.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }

  return json.data as T;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ── Route: GET /api/shopify/status ────────────────────────────────────────

async function handleStatus(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const cfg = getConfig();
  if (!cfg) {
    sendJson(res, 200, { connected: false, shop: null });
    return;
  }

  try {
    const data = await shopifyGql<{
      shop: {
        name: string;
        myshopifyDomain: string;
        email: string;
        currencyCode: string;
        plan: { displayName: string };
        primaryDomain: { url: string };
      };
    }>(
      cfg,
      `{
        shop {
          name
          myshopifyDomain
          email
          currencyCode
          plan { displayName }
          primaryDomain { url }
        }
      }`,
    );

    sendJson(res, 200, {
      connected: true,
      shop: {
        name: data.shop.name,
        domain: data.shop.myshopifyDomain,
        plan: data.shop.plan.displayName,
        email: data.shop.email,
        currencyCode: data.shop.currencyCode,
      },
    });
  } catch (err) {
    logger.warn(
      `[shopify] status check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    sendJson(res, 200, { connected: false, shop: null });
  }
}

// ── Route: GET /api/shopify/products ─────────────────────────────────────

async function handleListProducts(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cfg: ShopifyClientConfig,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
  const q = url.searchParams.get("q")?.trim() || null;

  // Shopify uses cursor-based pagination. We fetch up to page*limit items
  // and slice the last page. This is fine for typical store sizes (< 1000
  // products). For very large catalogs a cursor cache would be needed.
  const fetchCount = Math.min(page * limit, 250);

  type ProductNode = {
    id: string;
    title: string;
    status: string;
    productType: string;
    vendor: string;
    totalInventory: number;
    updatedAt: string;
    featuredImage: { url: string } | null;
    priceRangeV2: {
      minVariantPrice: { amount: string };
      maxVariantPrice: { amount: string };
    };
  };

  const data = await shopifyGql<{
    products: { edges: { node: ProductNode }[]; pageInfo: { hasNextPage: boolean } };
    productsCount: { count: number };
  }>(
    cfg,
    `query ListProducts($first: Int!, $query: String) {
      products(first: $first, query: $query, sortKey: TITLE) {
        edges {
          node {
            id title status productType vendor totalInventory updatedAt
            featuredImage { url }
            priceRangeV2 {
              minVariantPrice { amount }
              maxVariantPrice { amount }
            }
          }
        }
        pageInfo { hasNextPage }
      }
      productsCount { count }
    }`,
    { first: fetchCount, query: q },
  );

  const allProducts = data.products.edges.map((e) => ({
    id: e.node.id,
    title: e.node.title,
    status: e.node.status as "ACTIVE" | "DRAFT" | "ARCHIVED",
    productType: e.node.productType,
    vendor: e.node.vendor,
    totalInventory: e.node.totalInventory,
    updatedAt: e.node.updatedAt,
    imageUrl: e.node.featuredImage?.url ?? null,
    priceRange: {
      min: e.node.priceRangeV2.minVariantPrice.amount,
      max: e.node.priceRangeV2.maxVariantPrice.amount,
    },
  }));

  const start = (page - 1) * limit;
  const pageProducts = allProducts.slice(start, start + limit);

  sendJson(res, 200, {
    products: pageProducts,
    total: data.productsCount.count,
    page,
    pageSize: limit,
  });
}

// ── Route: POST /api/shopify/products ─────────────────────────────────────

async function handleCreateProduct(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cfg: ShopifyClientConfig,
): Promise<void> {
  const raw = await readBody(req).catch(() => "");
  let body: { title?: string; vendor?: string; productType?: string; price?: string } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    sendJsonError(res, 400, "Invalid JSON body");
    return;
  }

  if (!body.title?.trim()) {
    sendJsonError(res, 400, "title is required");
    return;
  }

  type CreatedProduct = {
    id: string;
    title: string;
    status: string;
    productType: string;
    vendor: string;
    totalInventory: number;
    updatedAt: string;
    featuredImage: { url: string } | null;
  };

  const data = await shopifyGql<{
    productCreate: {
      product: CreatedProduct | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    cfg,
    `mutation CreateProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product { id title status productType vendor totalInventory updatedAt featuredImage { url } }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: body.title.trim(),
        vendor: body.vendor?.trim() ?? "",
        productType: body.productType?.trim() ?? "",
        status: "DRAFT",
      },
    },
  );

  if (data.productCreate.userErrors.length > 0) {
    const msg = data.productCreate.userErrors
      .map((e) => `${e.field.join(".")}: ${e.message}`)
      .join("; ");
    sendJsonError(res, 422, msg);
    return;
  }

  const p = data.productCreate.product;
  if (!p) {
    sendJsonError(res, 500, "Product create returned no product");
    return;
  }

  sendJson(res, 201, {
    id: p.id,
    title: p.title,
    status: p.status,
    productType: p.productType,
    vendor: p.vendor,
    totalInventory: p.totalInventory,
    updatedAt: p.updatedAt,
    imageUrl: p.featuredImage?.url ?? null,
    priceRange: { min: body.price ?? "0.00", max: body.price ?? "0.00" },
  });
}

// ── Route: GET /api/shopify/orders ────────────────────────────────────────

async function handleListOrders(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cfg: ShopifyClientConfig,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const status = url.searchParams.get("status") ?? "any";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));

  // Build Shopify query string for financial/fulfillment status filters
  let queryParts: string[] = [];
  if (status && status !== "any") {
    // status may be a financial status like PAID, PENDING, etc.
    queryParts.push(`financial_status:${status.toLowerCase()}`);
  }
  const query = queryParts.join(" AND ") || null;

  type OrderNode = {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    displayFinancialStatus: string;
    displayFulfillmentStatus: string | null;
    totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
    lineItems: { edges: unknown[] };
  };

  const data = await shopifyGql<{
    orders: { edges: { node: OrderNode }[] };
    ordersCount: { count: number };
  }>(
    cfg,
    `query ListOrders($first: Int!, $query: String) {
      orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id name email createdAt
            displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 1) { edges { node { id } } }
          }
        }
      }
      ordersCount { count }
    }`,
    { first: limit, query },
  );

  const orders = data.orders.edges.map((e) => ({
    id: e.node.id,
    name: e.node.name,
    email: e.node.email ?? "",
    totalPrice: e.node.totalPriceSet.shopMoney.amount,
    currencyCode: e.node.totalPriceSet.shopMoney.currencyCode,
    fulfillmentStatus: (e.node.displayFulfillmentStatus ?? null) as
      | "FULFILLED"
      | "UNFULFILLED"
      | "PARTIALLY_FULFILLED"
      | null,
    financialStatus: e.node.displayFinancialStatus as
      | "PAID"
      | "PENDING"
      | "REFUNDED"
      | "PARTIALLY_REFUNDED",
    createdAt: e.node.createdAt,
    lineItemCount: (e.node.lineItems as { edges: unknown[] }).edges.length,
  }));

  sendJson(res, 200, { orders, total: data.ordersCount.count });
}

// ── Route: GET /api/shopify/inventory ─────────────────────────────────────

async function handleListInventory(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  cfg: ShopifyClientConfig,
): Promise<void> {
  type InventoryLevel = {
    available: number;
    location: { name: string };
  };
  type VariantNode = {
    id: string;
    title: string;
    sku: string;
    inventoryItem: {
      id: string;
      inventoryLevels: { edges: { node: InventoryLevel }[] };
    };
  };
  type ProductNode = {
    title: string;
    variants: { edges: { node: VariantNode }[] };
  };

  // Fetch up to 50 products, 10 variants each, with inventory levels
  const data = await shopifyGql<{
    products: { edges: { node: ProductNode }[] };
    locations: { edges: { node: { name: string; isActive: boolean } }[] };
  }>(
    cfg,
    `{
      products(first: 50) {
        edges {
          node {
            title
            variants(first: 10) {
              edges {
                node {
                  id title sku
                  inventoryItem {
                    id
                    inventoryLevels(first: 10) {
                      edges { node { available location { name } } }
                    }
                  }
                }
              }
            }
          }
        }
      }
      locations(first: 20) {
        edges { node { name isActive } }
      }
    }`,
  );

  const items: {
    id: string;
    sku: string;
    productTitle: string;
    variantTitle: string;
    locationName: string;
    available: number;
    incoming: number;
  }[] = [];

  for (const pe of data.products.edges) {
    for (const ve of pe.node.variants.edges) {
      const variant = ve.node;
      const levels = variant.inventoryItem.inventoryLevels.edges;
      if (levels.length === 0) {
        // No tracked inventory — emit a single row with 0
        items.push({
          id: variant.inventoryItem.id,
          sku: variant.sku ?? "",
          productTitle: pe.node.title,
          variantTitle: variant.title === "Default Title" ? "" : variant.title,
          locationName: "",
          available: 0,
          incoming: 0,
        });
      } else {
        for (const le of levels) {
          items.push({
            id: variant.inventoryItem.id,
            sku: variant.sku ?? "",
            productTitle: pe.node.title,
            variantTitle: variant.title === "Default Title" ? "" : variant.title,
            locationName: le.node.location.name,
            available: le.node.available,
            incoming: 0, // Shopify GraphQL does not expose incoming stock directly
          });
        }
      }
    }
  }

  const locationNames = data.locations.edges
    .filter((e) => e.node.isActive)
    .map((e) => e.node.name);

  sendJson(res, 200, { items, locations: locationNames });
}

// ── Route: POST /api/shopify/inventory/:itemId/adjust ─────────────────────

async function handleAdjustInventory(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cfg: ShopifyClientConfig,
  inventoryItemId: string,
): Promise<void> {
  const raw = await readBody(req).catch(() => "");
  let body: { delta?: number } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    sendJsonError(res, 400, "Invalid JSON body");
    return;
  }

  const delta = Number(body.delta);
  if (!Number.isInteger(delta) || delta === 0) {
    sendJsonError(res, 400, "delta must be a non-zero integer");
    return;
  }

  // Resolve locationId from the inventory item's tracked levels
  const itemData = await shopifyGql<{
    inventoryItem: {
      id: string;
      inventoryLevels: {
        edges: { node: { id: string; location: { id: string; name: string } } }[];
      };
    } | null;
  }>(
    cfg,
    `query GetInventoryItem($id: ID!) {
      inventoryItem(id: $id) {
        id
        inventoryLevels(first: 5) {
          edges { node { id location { id name } } }
        }
      }
    }`,
    { id: inventoryItemId },
  );

  if (!itemData.inventoryItem) {
    sendJsonError(res, 404, `Inventory item not found: ${inventoryItemId}`);
    return;
  }

  const levels = itemData.inventoryItem.inventoryLevels.edges;
  if (levels.length === 0) {
    sendJsonError(res, 422, "No inventory levels found for this item — item may not be tracked");
    return;
  }

  // Use the first location (primary). Future: accept locationId in body.
  const locationId = levels[0].node.location.id;

  await shopifyGql<{
    inventoryAdjustQuantities: {
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    cfg,
    `mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) {
        inventoryAdjustmentGroup { reason }
        userErrors { field message }
      }
    }`,
    {
      input: {
        reason: "correction",
        name: "available",
        changes: [{ inventoryItemId, locationId, delta }],
      },
    },
  );

  sendJson(res, 200, { ok: true });
}

// ── Route: GET /api/shopify/customers ─────────────────────────────────────

async function handleListCustomers(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cfg: ShopifyClientConfig,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const q = url.searchParams.get("q")?.trim() || null;
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));

  type CustomerNode = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    ordersCount: number;
    totalSpentV2: { amount: string; currencyCode: string };
    createdAt: string;
  };

  const data = await shopifyGql<{
    customers: { edges: { node: CustomerNode }[] };
    customersCount: { count: number };
  }>(
    cfg,
    `query ListCustomers($first: Int!, $query: String) {
      customers(first: $first, query: $query) {
        edges {
          node {
            id firstName lastName email ordersCount createdAt
            totalSpentV2 { amount currencyCode }
          }
        }
      }
      customersCount { count }
    }`,
    { first: limit, query: q },
  );

  const customers = data.customers.edges.map((e) => ({
    id: e.node.id,
    firstName: e.node.firstName ?? "",
    lastName: e.node.lastName ?? "",
    email: e.node.email ?? "",
    ordersCount: e.node.ordersCount,
    totalSpent: e.node.totalSpentV2.amount,
    currencyCode: e.node.totalSpentV2.currencyCode,
    createdAt: e.node.createdAt,
  }));

  sendJson(res, 200, { customers, total: data.customersCount.count });
}

// ── Main dispatcher ────────────────────────────────────────────────────────

/**
 * Handle all /api/shopify/* routes.
 * Returns true if the request was handled, false if no route matched.
 * Auth is enforced by the caller (server.ts) before this is invoked.
 */
export async function handleShopifyRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  try {
    // Status — always available even without creds (returns connected:false)
    if (method === "GET" && pathname === "/api/shopify/status") {
      await handleStatus(req, res);
      return true;
    }

    // All other routes require Shopify credentials
    const cfg = getConfig();
    if (!cfg) {
      // Return 404 so the UI treats it as "not connected" (fetchJson returns null on 404)
      sendJsonError(res, 404, "Shopify not configured (SHOPIFY_STORE_DOMAIN / SHOPIFY_ACCESS_TOKEN not set)");
      return true;
    }

    // Products
    if (pathname === "/api/shopify/products") {
      if (method === "GET") {
        await handleListProducts(req, res, cfg);
        return true;
      }
      if (method === "POST") {
        await handleCreateProduct(req, res, cfg);
        return true;
      }
    }

    // Orders
    if (method === "GET" && pathname === "/api/shopify/orders") {
      await handleListOrders(req, res, cfg);
      return true;
    }

    // Inventory list
    if (method === "GET" && pathname === "/api/shopify/inventory") {
      await handleListInventory(req, res, cfg);
      return true;
    }

    // Inventory adjust: POST /api/shopify/inventory/:itemId/adjust
    const adjustMatch = pathname.match(
      /^\/api\/shopify\/inventory\/(.+)\/adjust$/,
    );
    if (adjustMatch && method === "POST") {
      await handleAdjustInventory(req, res, cfg, adjustMatch[1]);
      return true;
    }

    // Customers
    if (method === "GET" && pathname === "/api/shopify/customers") {
      await handleListCustomers(req, res, cfg);
      return true;
    }

    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[shopify] unhandled error for ${method} ${pathname}: ${msg}`);
    if (!res.headersSent) {
      sendJsonError(res, 500, msg);
    }
    return true;
  }
}
