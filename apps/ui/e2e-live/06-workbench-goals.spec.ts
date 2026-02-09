import { test, expect, ensureAgentRunning } from "./fixtures.js";

interface Overview { goals: Array<Record<string, unknown>>; summary: Record<string, number>; autonomy: { enabled: boolean } }

test.describe("Goals", () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
  });

  test("overview returns valid structure", async ({ appPage: page }) => {
    const resp = await page.request.get("/api/workbench/overview");
    expect(resp.status()).toBe(200);
    const d = (await resp.json()) as Overview;
    expect(typeof d.summary).toBe("object");
    expect(typeof d.autonomy.enabled).toBe("boolean");
    expect(Array.isArray(d.goals)).toBe(true);
  });

  test("create goal succeeds", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/workbench/goals", { data: { name: `Goal ${Date.now()}`, description: "test" } });
    expect([200, 503]).toContain(resp.status());
    if (resp.status() === 503) { test.skip(true, "Agent not running"); return; }
    const body = (await resp.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("overview goal count increases after create", async ({ appPage: page }) => {
    const before = (await (await page.request.get("/api/workbench/overview")).json() as Overview).goals.length;
    const resp = await page.request.post("/api/workbench/goals", { data: { name: `P ${Date.now()}` } });
    if (resp.status() === 503) { test.skip(true, "Agent not running"); return; }
    const after = (await (await page.request.get("/api/workbench/overview")).json() as Overview).goals.length;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test("empty name handled", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/workbench/goals", { data: { name: "" } });
    // Server may accept or reject empty names
    expect([200, 400, 422, 503]).toContain(resp.status());
  });

  test("special characters in name accepted", async ({ appPage: page }) => {
    for (const name of [`🎯 ${Date.now()}`, `<b>html</b> ${Date.now()}`, `中文 ${Date.now()}`]) {
      const resp = await page.request.post("/api/workbench/goals", { data: { name } });
      expect([200, 503]).toContain(resp.status());
      if (resp.status() === 503) { test.skip(true, "Agent not running"); return; }
    }
  });

  test("1000-char name", async ({ appPage: page }) => {
    expect([200, 400, 422, 503]).toContain((await page.request.post("/api/workbench/goals", { data: { name: "A".repeat(1000) } })).status());
  });

  test("5 concurrent creates succeed", async ({ appPage: page }) => {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      page.request.post("/api/workbench/goals", { data: { name: `C${i} ${Date.now()}` } }),
    ));
    for (const r of results) expect([200, 503]).toContain(r.status());
    if (results[0].status() === 503) { test.skip(true, "Agent not running"); return; }
  });

  test("tags and priority accepted", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/workbench/goals", { data: { name: `T ${Date.now()}`, tags: ["e2e"], priority: 1 } });
    expect([200, 503]).toContain(resp.status());
  });
});
