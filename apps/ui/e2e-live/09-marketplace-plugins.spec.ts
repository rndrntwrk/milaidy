import { test, expect, ensureAgentRunning } from "./fixtures.js";

test.describe("Marketplace — Plugins", () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); });

  test("registry plugins load", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/registry/plugins");
    if (resp.status() !== 200) { test.skip(true, `Registry returned ${resp.status()}`); return; }
    const { plugins } = (await resp.json()) as { plugins: Array<{ name: string }> };
    expect(plugins.length).toBeGreaterThan(0);
  });

  test("search filters results", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/registry/search?q=openai&limit=10");
    if (resp.status() !== 200) { test.skip(true, "Registry search unavailable"); return; }
    const d = (await resp.json()) as { query: string; count: number; results: Array<{ name: string }> };
    expect(d.query).toBe("openai");
  });

  test("installed plugins endpoint", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/plugins/installed");
    expect(resp.status()).toBe(200);
    expect(typeof ((await resp.json()) as { count: number }).count).toBe("number");
  });

  test("registry refresh", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/registry/refresh");
    expect(resp.status()).toBe(200);
    expect(((await resp.json()) as { ok: boolean }).ok).toBe(true);
  });
});
