import { test, expect, ensureAgentRunning } from "./fixtures.js";

test.describe("Marketplace — Skills", () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); });

  test("marketplace config endpoint", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/skills/marketplace/config");
    expect(resp.status()).toBe(200);
    expect(typeof ((await resp.json()) as { keySet: boolean }).keySet).toBe("boolean");
  });

  test("installed marketplace skills", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/skills/marketplace/installed");
    // Endpoint may not exist (404) or succeed (200)
    expect([200, 404]).toContain(resp.status());
    if (resp.status() === 200) {
      const data = (await resp.json()) as Record<string, unknown>;
      expect(typeof data).toBe("object");
    }
  });

  test("skill catalog browse", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/skills/catalog?page=1&perPage=10");
    expect([200, 502, 503]).toContain(resp.status());
  });

  test("loaded skills list", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/skills");
    expect(resp.status()).toBe(200);
    expect(Array.isArray(((await resp.json()) as { skills: unknown[] }).skills)).toBe(true);
  });

  test("skill refresh", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/skills/refresh");
    expect(resp.status()).toBe(200);
    expect(((await resp.json()) as { ok: boolean }).ok).toBe(true);
  });
});
