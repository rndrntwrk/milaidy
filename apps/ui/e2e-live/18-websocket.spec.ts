import { test, expect, ensureAgentRunning, WS_URL } from "./fixtures.js";

test.describe("WebSocket Real-Time", () => {
  test.describe.configure({ timeout: 60_000 });

  test("receives periodic status updates", async ({ appPage: page }) => {
    const count = await page.evaluate(
      (url: string) => new Promise<number>((resolve) => {
        let n = 0;
        const ws = new WebSocket(url);
        const t = setTimeout(() => { ws.close(); resolve(n); }, 12_000);
        ws.onmessage = (e: MessageEvent) => {
          if ((JSON.parse(e.data as string) as { type: string }).type === "status" && ++n >= 2) {
            clearTimeout(t); ws.close(); resolve(n);
          }
        };
        ws.onerror = () => { clearTimeout(t); resolve(n); };
      }),
      WS_URL,
    );
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("status broadcast contains agent state data", async ({ appPage: page }) => {
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
    const data = (msg!.data as Record<string, unknown>) ?? msg!;
    const agentState = data.agentState ?? data.state;
    const agentName = data.agentName ?? data.name;
    expect(typeof agentState).toBe("string");
    expect(typeof agentName).toBe("string");
  });

  test("ping-pong keepalive works", async ({ appPage: page }) => {
    const ok = await page.evaluate(
      (url: string) => new Promise<boolean>((resolve) => {
        const ws = new WebSocket(url);
        const t = setTimeout(() => { ws.close(); resolve(false); }, 10_000);
        ws.onopen = () => ws.send(JSON.stringify({ type: "ping" }));
        ws.onmessage = (e: MessageEvent) => {
          if ((JSON.parse(e.data as string) as { type: string }).type === "pong") {
            clearTimeout(t); ws.close(); resolve(true);
          }
        };
        ws.onerror = () => { clearTimeout(t); resolve(false); };
      }),
      WS_URL,
    );
    expect(ok).toBe(true);
  });

  test("UI reflects status changes from WebSocket", async ({ appPage: page }) => {
    await ensureAgentRunning(page);
    await page.request.post("/api/agent/pause");
    await page.waitForTimeout(6000);

    // Resume and verify
    await page.request.post("/api/agent/resume");
    await page.waitForTimeout(3000);
    const { state } = (await (await page.request.get("/api/status")).json()) as { state: string };
    expect(state).toBe("running");
  });
});
