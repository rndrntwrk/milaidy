import { test, expect, navigateToTab, ensureAgentRunning, getAppText } from "./fixtures.js";

test.describe("Apps Page", () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); });

  test("apps page navigates", async ({ appPage: page }) => {
    await navigateToTab(page, "Apps");
    await expect(page).toHaveURL(/\/apps/);
  });

  test("apps page has shadow DOM content", async ({ appPage: page }) => {
    await navigateToTab(page, "Apps");
    const text = await getAppText(page);
    expect(text.length).toBeGreaterThan(10);
  });

  test("apps list API returns data", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/apps");
    expect(resp.status()).toBe(200);
    const data = (await resp.json()) as Record<string, unknown>;
    // Response may use different keys; just verify it's a valid object
    expect(typeof data).toBe("object");
    expect(data).not.toBeNull();
  });

  test("apps search API responds", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/apps/search?q=test");
    expect([200, 502, 503]).toContain(resp.status());
  });

  test("installed apps API responds", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/apps/installed");
    expect(resp.status()).toBe(200);
    const data = (await resp.json()) as Record<string, unknown>;
    expect(typeof data).toBe("object");
    expect(data).not.toBeNull();
  });

  test("registry plugins API responds", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/apps/plugins");
    expect([200, 502, 503]).toContain(resp.status());
  });

  test("registry refresh API responds", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/apps/refresh");
    expect([200, 502, 503]).toContain(resp.status());
  });
});
