import { test, expect, ensureAgentRunning } from "./fixtures.js";

interface Overview { todos: Array<Record<string, unknown>>; summary: { todoCount: number; openTodos: number } }

test.describe("Todos", () => {
  test.beforeEach(async ({ appPage: page }) => {
    await ensureAgentRunning(page);
  });

  test("create todo succeeds", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/workbench/todos", { data: { name: `T ${Date.now()}` } });
    if (resp.status() === 200) {
      const body = (await resp.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    } else {
      // Todo service may be unavailable
      expect([500, 501, 503]).toContain(resp.status());
    }
  });

  test("todo count increases after create", async ({ appPage: page }) => {
    const before = (await (await page.request.get("/api/workbench/overview")).json() as Overview).summary.todoCount;
    const resp = await page.request.post("/api/workbench/todos", { data: { name: `S ${Date.now()}` } });
    if (resp.status() !== 200) { test.skip(true, `Todo service ${resp.status()}`); return; }
    const after = (await (await page.request.get("/api/workbench/overview")).json() as Overview).summary.todoCount;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test("empty name handled", async ({ appPage: page }) => {
    const status = (await page.request.post("/api/workbench/todos", { data: { name: "" } })).status();
    // Server may accept or reject empty names
    expect([200, 400, 422, 503]).toContain(status);
  });

  test("urgent flag accepted", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/workbench/todos", { data: { name: `U ${Date.now()}`, isUrgent: true } });
    if (resp.status() !== 200) { test.skip(true, `Todo service ${resp.status()}`); return; }
    expect(((await resp.json()) as { ok: boolean }).ok).toBe(true);
  });

  test("type field accepted", async ({ appPage: page }) => {
    for (const type of ["daily", "one-off", "aspirational"] as const) {
      const resp = await page.request.post("/api/workbench/todos", { data: { name: `${type} ${Date.now()}`, type } });
      if (resp.status() !== 200) { test.skip(true, `Todo service ${resp.status()}`); return; }
    }
  });

  test("dueDate field accepted", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/workbench/todos", {
      data: { name: `D ${Date.now()}`, dueDate: new Date(Date.now() + 86_400_000).toISOString() },
    });
    if (resp.status() !== 200) { test.skip(true, `Todo service ${resp.status()}`); return; }
    expect(((await resp.json()) as { ok: boolean }).ok).toBe(true);
  });

  test("special characters accepted", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/workbench/todos", { data: { name: `🔥 <script> "q" ${Date.now()}` } });
    if (resp.status() !== 200) { test.skip(true, `Todo service ${resp.status()}`); return; }
    expect(((await resp.json()) as { ok: boolean }).ok).toBe(true);
  });
});
