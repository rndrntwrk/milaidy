import { test, expect, WS_URL, ensureAgentRunning } from "./fixtures.js";

test.describe("Server Health", () => {
  test("status returns valid agent state", async ({ page }) => {
    const resp = await page.request.get("/api/status");
    expect(resp.status()).toBe(200);
    const data = (await resp.json()) as { state: string; agentName: string };
    expect(data.agentName.length).toBeGreaterThan(0);
    expect(["running", "not_started", "paused", "stopped"]).toContain(data.state);
  });

  test("status includes uptime when running", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    const data = (await (await page.request.get("/api/status")).json()) as {
      state: string; uptime?: number; startedAt?: number;
    };
    expect(data.state).toBe("running");
    expect(typeof data.uptime).toBe("number");
    expect(data.uptime!).toBeGreaterThanOrEqual(0);
    expect(typeof data.startedAt).toBe("number");
    expect(data.startedAt!).toBeLessThanOrEqual(Date.now());
    expect(data.startedAt!).toBeGreaterThan(Date.now() - 3_600_000);
  });

  test("onboarding is complete", async ({ page }) => {
    expect(((await (await page.request.get("/api/onboarding/status")).json()) as { complete: boolean }).complete).toBe(true);
  });

  test("plugins list is non-empty", async ({ page }) => {
    const { plugins } = (await (await page.request.get("/api/plugins")).json()) as { plugins: Array<{ id: string; category: string }> };
    expect(plugins.length).toBeGreaterThan(0);
    expect(typeof plugins[0].id).toBe("string");
  });

  test("onboarding options", async ({ page }) => {
    const d = (await (await page.request.get("/api/onboarding/options")).json()) as { names: string[]; styles: unknown[]; providers: unknown[] };
    expect(d.names.length).toBeGreaterThan(0);
    expect(d.styles.length).toBeGreaterThan(0);
    expect(d.providers.length).toBeGreaterThan(0);
  });

  test("unknown route → 404", async ({ page }) => {
    expect((await page.request.get("/api/nonexistent")).status()).toBe(404);
  });

  test("CORS preflight", async ({ page }) => {
    const resp = await page.request.fetch("/api/status", {
      method: "OPTIONS", headers: { Origin: "http://localhost:18790", "Access-Control-Request-Method": "GET" },
    });
    expect([200, 204]).toContain(resp.status());
  });

  test("WebSocket connects and broadcasts status", async ({ appPage: page }) => {
    const msg = await page.evaluate(
      (url: string) => new Promise<Record<string, unknown> | null>((resolve) => {
        const ws = new WebSocket(url);
        const t = setTimeout(() => { ws.close(); resolve(null); }, 10_000);
        ws.onmessage = (e: MessageEvent) => {
          const m = JSON.parse(e.data as string) as Record<string, unknown>;
          if (m.type === "status") { clearTimeout(t); ws.close(); resolve(m); }
        };
        ws.onerror = () => { clearTimeout(t); resolve(null); };
      }),
      WS_URL,
    );
    expect(msg).not.toBeNull();
    // Status message may have data nested under msg.data or at top level
    const data = (msg!.data as Record<string, unknown>) ?? msg!;
    const agentState = data.agentState ?? data.state;
    const agentName = data.agentName ?? data.name;
    expect(typeof agentState).toBe("string");
    expect(typeof agentName).toBe("string");
  });
});
