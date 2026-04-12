/**
 * Route-level tests for shopify-routes.ts.
 */

import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { handleShopifyRoute } from "./shopify-routes";

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  headersSent: boolean;
}

interface GraphqlRequestPayload {
  query: string;
  variables?: Record<string, unknown>;
}

function fakeReq(
  method: string,
  url: string,
  body?: string,
): http.IncomingMessage {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const req = {
    method,
    url,
    headers: { host: "127.0.0.1:31337" },
    on(event: string, cb: (...args: unknown[]) => void) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(cb);
      return this;
    },
  } as unknown as http.IncomingMessage;

  queueMicrotask(() => {
    if (body !== undefined) {
      for (const cb of listeners.data ?? []) cb(Buffer.from(body));
    }
    for (const cb of listeners.end ?? []) cb();
  });

  return req;
}

function fakeRes(): { res: http.ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = {
    statusCode: 200,
    headers: {},
    body: "",
    headersSent: false,
  };
  const res = {
    get statusCode() {
      return captured.statusCode;
    },
    set statusCode(value: number) {
      captured.statusCode = value;
    },
    get headersSent() {
      return captured.headersSent;
    },
    setHeader(name: string, value: unknown) {
      captured.headers[name.toLowerCase()] = String(value);
    },
    end(data?: string | Buffer) {
      if (data !== undefined) captured.body = String(data);
      captured.headersSent = true;
    },
  } as unknown as http.ServerResponse;
  return { res, captured };
}

function shopifyOk(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function shopifyErr(message: string): Response {
  return new Response(JSON.stringify({ errors: [{ message }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function getGraphqlRequest(callIndex: number): GraphqlRequestPayload {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? "{}")) as GraphqlRequestPayload;
}

beforeEach(() => {
  fetchMock.mockReset();
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ACCESS_TOKEN;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("handleShopifyRoute", () => {
  it("GET /api/shopify/status returns connected:false when creds are missing", async () => {
    const req = fakeReq("GET", "/api/shopify/status");
    const { res, captured } = fakeRes();

    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/status",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    expect(JSON.parse(captured.body)).toMatchObject({
      connected: false,
      shop: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GET /api/shopify/status returns connected:true with shop info", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        shop: {
          name: "Test Store",
          myshopifyDomain: "test.myshopify.com",
          email: "owner@test.com",
          currencyCode: "USD",
          plan: { displayName: "Basic" },
        },
      }),
    );

    const req = fakeReq("GET", "/api/shopify/status");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/status",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    expect(JSON.parse(captured.body)).toMatchObject({
      connected: true,
      shop: {
        name: "Test Store",
        domain: "test.myshopify.com",
        currencyCode: "USD",
      },
    });
  });

  it("GET /api/shopify/products returns 404 when not configured", async () => {
    const req = fakeReq("GET", "/api/shopify/products?page=1&limit=20&q=");
    const { res, captured } = fakeRes();

    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/products",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(404);
  });

  it("GET /api/shopify/products returns paginated product list", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        productsCount: { count: 1 },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        products: {
          edges: [
            {
              cursor: "cursor-1",
              node: {
                id: "gid://shopify/Product/1",
                title: "Widget",
                status: "ACTIVE",
                productType: "Widgets",
                vendor: "Acme",
                totalInventory: 10,
                updatedAt: "2026-01-01T00:00:00Z",
                featuredImage: null,
                priceRangeV2: {
                  minVariantPrice: { amount: "9.99" },
                  maxVariantPrice: { amount: "9.99" },
                },
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: "cursor-1" },
        },
      }),
    );

    const req = fakeReq("GET", "/api/shopify/products?page=1&limit=20&q=");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/products",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    expect(JSON.parse(captured.body)).toMatchObject({
      total: 1,
      products: [{ title: "Widget", imageUrl: null }],
    });
  });

  it("GET /api/shopify/products paginates via cursors for deep pages", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        productsCount: { count: 260 },
      }),
    );

    for (let page = 1; page <= 13; page++) {
      fetchMock.mockResolvedValueOnce(
        shopifyOk({
          products: {
            edges: [
              {
                cursor: `cursor-${page}`,
                node: {
                  id: `gid://shopify/Product/${page}`,
                  title: `Widget ${page}`,
                  status: "ACTIVE",
                  productType: "Widgets",
                  vendor: "Acme",
                  totalInventory: page,
                  updatedAt: "2026-01-01T00:00:00Z",
                  featuredImage: null,
                  priceRangeV2: {
                    minVariantPrice: { amount: "9.99" },
                    maxVariantPrice: { amount: "9.99" },
                  },
                },
              },
            ],
            pageInfo: {
              hasNextPage: page < 13,
              endCursor: `cursor-${page}`,
            },
          },
        }),
      );
    }

    const req = fakeReq("GET", "/api/shopify/products?page=13&limit=20&q=");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/products",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.total).toBe(260);
    expect(body.products[0].title).toBe("Widget 13");
    expect(fetchMock).toHaveBeenCalledTimes(14);
    expect(getGraphqlRequest(1).variables).toMatchObject({
      first: 20,
      after: null,
    });
    expect(getGraphqlRequest(13).variables).toMatchObject({
      first: 20,
      after: "cursor-12",
    });
  });

  it("POST /api/shopify/products returns 400 when title is missing", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    const req = fakeReq(
      "POST",
      "/api/shopify/products",
      JSON.stringify({ vendor: "Acme" }),
    );
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/products",
      "POST",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(400);
    expect(JSON.parse(captured.body).error).toMatch(/title/i);
  });

  it("POST /api/shopify/products creates a product and returns 201", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        productCreate: {
          product: {
            id: "gid://shopify/Product/99",
            title: "New Widget",
            status: "DRAFT",
            productType: "",
            vendor: "Acme",
            totalInventory: 0,
            updatedAt: "2026-01-01T00:00:00Z",
            featuredImage: null,
          },
          userErrors: [],
        },
      }),
    );

    const req = fakeReq(
      "POST",
      "/api/shopify/products",
      JSON.stringify({ title: "New Widget", vendor: "Acme" }),
    );
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/products",
      "POST",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(201);
    expect(JSON.parse(captured.body)).toMatchObject({
      title: "New Widget",
      status: "DRAFT",
    });
  });

  it("GET /api/shopify/orders returns order list", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        orders: {
          edges: [
            {
              node: {
                id: "gid://shopify/Order/1001",
                name: "#1001",
                email: "customer@example.com",
                createdAt: "2026-01-01T00:00:00Z",
                displayFinancialStatus: "PAID",
                displayFulfillmentStatus: "UNFULFILLED",
                totalPriceSet: {
                  shopMoney: { amount: "29.99", currencyCode: "USD" },
                },
                lineItems: { edges: [{ node: { id: "x" } }] },
              },
            },
          ],
        },
        ordersCount: { count: 1 },
      }),
    );

    const req = fakeReq("GET", "/api/shopify/orders?status=any&limit=20");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/orders",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    expect(JSON.parse(captured.body)).toMatchObject({
      total: 1,
      orders: [{ name: "#1001", totalPrice: "29.99", financialStatus: "PAID" }],
    });
  });

  it("GET /api/shopify/orders rejects unsupported status filters", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    const req = fakeReq("GET", "/api/shopify/orders?status=paid OR status:any");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/orders",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GET /api/shopify/inventory returns items and locations", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        products: {
          edges: [
            {
              node: {
                title: "Widget",
                variants: {
                  edges: [
                    {
                      node: {
                        id: "gid://shopify/ProductVariant/1",
                        title: "Default Title",
                        sku: "WGT-001",
                        inventoryItem: {
                          id: "gid://shopify/InventoryItem/1",
                          inventoryLevels: {
                            edges: [
                              {
                                node: {
                                  available: 5,
                                  location: {
                                    id: "gid://shopify/Location/1",
                                    name: "Main Warehouse",
                                  },
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
        locations: {
          edges: [{ node: { name: "Main Warehouse", isActive: true } }],
        },
      }),
    );

    const req = fakeReq("GET", "/api/shopify/inventory");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/inventory",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    expect(JSON.parse(captured.body)).toMatchObject({
      locations: ["Main Warehouse"],
      items: [
        {
          available: 5,
          locationId: "gid://shopify/Location/1",
          variantTitle: "",
        },
      ],
    });
  });

  it("POST /api/shopify/inventory/:id/adjust rejects delta=0", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    const pathname =
      "/api/shopify/inventory/gid://shopify/InventoryItem/1/adjust";
    const req = fakeReq("POST", pathname, JSON.stringify({ delta: 0 }));
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(req, res, pathname, "POST");

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(400);
    expect(JSON.parse(captured.body).error).toMatch(/delta/i);
  });

  it("POST /api/shopify/inventory/:id/adjust uses the requested location", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    const itemId = "gid://shopify/InventoryItem/1";
    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        inventoryItem: {
          id: itemId,
          inventoryLevels: {
            edges: [
              {
                node: {
                  id: "gid://shopify/InventoryLevel/1",
                  location: {
                    id: "gid://shopify/Location/1",
                    name: "Main Warehouse",
                  },
                },
              },
              {
                node: {
                  id: "gid://shopify/InventoryLevel/2",
                  location: {
                    id: "gid://shopify/Location/2",
                    name: "Overflow",
                  },
                },
              },
            ],
          },
        },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        inventoryAdjustQuantities: {
          inventoryAdjustmentGroup: { reason: "correction" },
          userErrors: [],
        },
      }),
    );

    const pathname = `/api/shopify/inventory/${itemId}/adjust`;
    const req = fakeReq(
      "POST",
      pathname,
      JSON.stringify({ delta: 3, locationId: "gid://shopify/Location/2" }),
    );
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(req, res, pathname, "POST");

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    expect(JSON.parse(captured.body)).toMatchObject({
      ok: true,
      locationId: "gid://shopify/Location/2",
    });
    expect(getGraphqlRequest(1).variables).toMatchObject({
      input: {
        changes: [
          {
            inventoryItemId: itemId,
            locationId: "gid://shopify/Location/2",
            delta: 3,
          },
        ],
      },
    });
  });

  it("POST /api/shopify/inventory/:id/adjust surfaces Shopify userErrors", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    const itemId = "gid://shopify/InventoryItem/1";
    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        inventoryItem: {
          id: itemId,
          inventoryLevels: {
            edges: [
              {
                node: {
                  id: "gid://shopify/InventoryLevel/1",
                  location: {
                    id: "gid://shopify/Location/1",
                    name: "Main Warehouse",
                  },
                },
              },
            ],
          },
        },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        inventoryAdjustQuantities: {
          inventoryAdjustmentGroup: null,
          userErrors: [{ field: ["changes"], message: "Permission denied" }],
        },
      }),
    );

    const pathname = `/api/shopify/inventory/${itemId}/adjust`;
    const req = fakeReq(
      "POST",
      pathname,
      JSON.stringify({ delta: 3, locationId: "gid://shopify/Location/1" }),
    );
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(req, res, pathname, "POST");

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(422);
    expect(JSON.parse(captured.body).error).toMatch(/Permission denied/);
  });

  it("GET /api/shopify/customers returns customer list", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        customers: {
          edges: [
            {
              node: {
                id: "gid://shopify/Customer/1",
                firstName: "Jane",
                lastName: "Doe",
                email: "jane@example.com",
                ordersCount: 3,
                totalSpentV2: { amount: "150.00", currencyCode: "USD" },
                createdAt: "2026-01-01T00:00:00Z",
              },
            },
          ],
        },
        customersCount: { count: 1 },
      }),
    );

    const req = fakeReq("GET", "/api/shopify/customers?limit=20");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/customers",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    expect(JSON.parse(captured.body)).toMatchObject({
      total: 1,
      customers: [{ firstName: "Jane", totalSpent: "150.00" }],
    });
  });

  it("returns false for unrecognised pathnames", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    const req = fakeReq("GET", "/api/shopify/unknown");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/unknown",
      "GET",
    );

    expect(handled).toBe(false);
    expect(captured.headersSent).toBe(false);
  });

  it("returns 500 when Shopify returns a GraphQL error on a data route", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(shopifyErr("Access denied"));

    const req = fakeReq("GET", "/api/shopify/orders?status=any&limit=20");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/orders",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(500);
    expect(JSON.parse(captured.body).error).toMatch(/Access denied/);
  });
});
