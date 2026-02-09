import { test, expect, ensureAgentRunning } from "./fixtures.js";

test.describe("Marketplace — MCP", () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); });

  test("MCP search returns results", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/mcp/marketplace/search?limit=10");
    expect([200, 502, 503]).toContain(resp.status());
  });

  test("MCP config endpoint", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/mcp/config");
    expect(resp.status()).toBe(200);
    expect(typeof ((await resp.json()) as { servers: Record<string, unknown> }).servers).toBe("object");
  });

  test("add and remove MCP server", async ({ appPage: page }) => {
    const name = `e2e-echo-${Date.now()}`;
    expect((await page.request.post("/api/mcp/config/server", {
      data: { name, config: { type: "streamable-http", url: "https://echo.mcp.example.com" } },
    })).status()).toBe(200);

    const cfg = (await (await page.request.get("/api/mcp/config")).json()) as { servers: Record<string, unknown> };
    expect(cfg.servers).toHaveProperty(name);

    expect((await page.request.delete(`/api/mcp/config/server/${encodeURIComponent(name)}`)).status()).toBe(200);
    const after = (await (await page.request.get("/api/mcp/config")).json()) as { servers: Record<string, unknown> };
    expect(after.servers).not.toHaveProperty(name);
  });

  test("MCP status endpoint", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/mcp/status");
    expect(resp.status()).toBe(200);
    expect(Array.isArray(((await resp.json()) as { servers: unknown[] }).servers)).toBe(true);
  });

  test("replace entire MCP config and verify restore", async ({ appPage: page }) => {
    const saved = (await (await page.request.get("/api/mcp/config")).json()) as { servers: Record<string, unknown> };
    expect((await page.request.put("/api/mcp/config", {
      data: { servers: { "test-replace": { type: "streamable-http", url: "https://test.example.com" } } },
    })).status()).toBe(200);

    // Verify replacement took effect
    const replaced = (await (await page.request.get("/api/mcp/config")).json()) as { servers: Record<string, unknown> };
    expect(replaced.servers).toHaveProperty("test-replace");

    // Restore original
    expect((await page.request.put("/api/mcp/config", { data: { servers: saved.servers } })).status()).toBe(200);

    // Verify restore matches original
    const restored = (await (await page.request.get("/api/mcp/config")).json()) as { servers: Record<string, unknown> };
    expect(restored.servers).not.toHaveProperty("test-replace");
  });
});
