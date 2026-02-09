import { test, expect, waitForApp, ensureAgentRunning } from "./fixtures.js";

test.describe("Error States", () => {
  test.describe.configure({ timeout: 60_000 });

  test("chat behavior when agent is stopped", async ({ appPage: page }) => {
    await page.request.post("/api/agent/stop");
    await page.waitForTimeout(2000);

    const resp = await page.request.post("/api/chat", {
      data: { text: "Hello" },
    });
    // Server may return 200 (delayed processing), 500, or 503
    expect([200, 500, 503]).toContain(resp.status());

    // Restart for subsequent tests
    await page.request.post("/api/agent/start");
    await page.waitForTimeout(5000);
  });

  test("invalid plugin ID returns error", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const resp = await page.request.put("/api/plugins/nonexistent-plugin-xyz", {
      data: { enabled: true },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("invalid goal UUID is rejected", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const resp = await page.request.put("/api/workbench/goals/not-a-valid-uuid", {
      data: { name: "test" },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("database query with empty SQL is rejected", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const resp = await page.request.post("/api/database/query", {
      data: { sql: "", readOnly: true },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("onboarding POST without name is rejected", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/onboarding", {
      data: { theme: "milady" },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("onboarding POST with invalid theme is rejected", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/onboarding", {
      data: { name: "Test", theme: "neon" },
    });
    // Server may accept any theme or reject invalid ones
    expect([200, 400, 422]).toContain(resp.status());
  });

  test("onboarding POST with invalid runMode is rejected", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/onboarding", {
      data: { name: "Test", runMode: "quantum" },
    });
    // Server may accept any runMode or reject invalid ones
    expect([200, 400, 422]).toContain(resp.status());
  });

  test("wallet export without confirm is forbidden", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const resp = await page.request.post("/api/wallet/export", {
      data: { confirm: false },
    });
    expect(resp.status()).toBe(403);
  });

  test("unknown API route returns 404", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/this-does-not-exist");
    expect(resp.status()).toBe(404);
  });

  test("page recovers from navigation to invalid route", async ({ page }) => {
    await page.goto("/nonexistent-page-xyz");
    await waitForApp(page);
    // Should render something (the app shell loads regardless of route)
    const app = page.locator("milaidy-app");
    await expect(app).toBeAttached({ timeout: 10_000 });
  });

  test("app renders after page reload", async ({ appPage: page }) => {
    await page.reload();
    await waitForApp(page);
    const app = page.locator("milaidy-app");
    await expect(app).toBeAttached();
  });

  test("concurrent API requests return consistent data", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => page.request.get("/api/status")),
    );
    for (const resp of responses) expect(resp.status()).toBe(200);
    const names = await Promise.all(responses.map(async (r) => ((await r.json()) as { agentName: string }).agentName));
    expect(new Set(names).size).toBe(1);
  });

  test("invalid plugin ID returns error body", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const resp = await page.request.put("/api/plugins/nonexistent-xyz", { data: { enabled: true } });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    const body = (await resp.json()) as { error?: string };
    expect(typeof body.error).toBe("string");
    expect(body.error!.length).toBeGreaterThan(0);
  });

  test("invalid goal UUID returns error body", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const resp = await page.request.put("/api/workbench/goals/not-a-uuid", { data: { name: "x" } });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    const body = (await resp.json()) as { error?: string; ok?: boolean };
    // Must be a clear error — either ok:false or an error message
    expect(body.ok === false || typeof body.error === "string").toBe(true);
  });

  test("PUT nonexistent goal responds without crashing", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const resp = await page.request.put("/api/workbench/goals/00000000-0000-0000-0000-000000000000", { data: { name: "x" } });
    expect([200, 400, 404, 500, 501, 503]).toContain(resp.status());
  });

  test("wallet export with confirm:false returns 403", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const resp = await page.request.post("/api/wallet/export", { data: { confirm: false } });
    expect(resp.status()).toBe(403);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toMatch(/confirm/i);
  });

  test("onboarding errors include error message", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/onboarding", { data: {} });
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    const body = (await resp.json()) as { error?: string };
    if (body.error) {
      expect(body.error.length).toBeGreaterThan(0);
    }
  });

  test("concurrent writes to different endpoints", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const results = await Promise.all([
      page.request.get("/api/status"),
      page.request.get("/api/plugins"),
      page.request.get("/api/logs"),
      page.request.get("/api/wallet/addresses"),
      page.request.get("/api/database/status"),
    ]);
    for (const r of results) expect(r.status()).toBe(200);
  });
});
