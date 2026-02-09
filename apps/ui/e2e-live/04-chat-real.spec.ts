import { test, expect, navigateToTab, ensureAgentRunning } from "./fixtures.js";

test.describe("Chat", () => {
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ appPage: page }) => { await ensureAgentRunning(page); });

  test("send message and receive response under 15 seconds", async ({ appPage: page }) => {
    const start = Date.now();
    const resp = await page.request.post("/api/chat", {
      data: { text: "Say hello." },
      timeout: 15_000,
    });
    const elapsed = Date.now() - start;
    expect(resp.status()).toBe(200);
    const data = (await resp.json()) as { text: string; agentName: string };
    expect(data.text.length).toBeGreaterThan(0);
    expect(data.text).toMatch(/[a-zA-Z]{2,}/);
    expect(elapsed).toBeLessThan(15_000);
  });

  test("conversation message round-trip under 15 seconds", async ({ appPage: page }) => {
    // Create a conversation, send a message, assert response within 15s
    const convResp = await page.request.post("/api/conversations", {
      data: { title: "E2E 15s Test" },
    });
    expect(convResp.status()).toBe(200);
    const { conversation } = (await convResp.json()) as { conversation: { id: string } };

    const start = Date.now();
    const msgResp = await page.request.post(`/api/conversations/${conversation.id}/messages`, {
      data: { text: "What is 1+1? Reply with just the number." },
      timeout: 15_000,
    });
    const elapsed = Date.now() - start;
    expect(msgResp.status()).toBe(200);
    const msgData = (await msgResp.json()) as { text: string };
    expect(msgData.text.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(15_000);

    // Clean up
    await page.request.delete(`/api/conversations/${conversation.id}`);
  });

  test("responds with real text", async ({ appPage: page }) => {
    const resp = await page.request.post("/api/chat", { data: { text: "Say pineapple." } });
    expect(resp.status()).toBe(200);
    const data = (await resp.json()) as { text: string; agentName: string };
    expect(data.text.length).toBeGreaterThan(2);
    expect(data.text).toMatch(/[a-zA-Z]{3,}/);
    expect(data.agentName.length).toBeGreaterThan(0);
  });

  test("answers 2+2 = 4", async ({ appPage: page }) => {
    const { text } = (await (await page.request.post("/api/chat", { data: { text: "What is 2 + 2? Reply with just the number." } })).json()) as { text: string };
    expect(text.toLowerCase()).toMatch(/\b4\b|\bfour\b/);
    expect(text.toLowerCase()).not.toContain("error");
  });

  test("rejects empty message", async ({ appPage: page }) => {
    expect((await page.request.post("/api/chat", { data: { text: "" } })).status()).toBeGreaterThanOrEqual(400);
  });

  test("stopped agent", async ({ appPage: page }) => {
    await page.request.post("/api/agent/stop");
    await page.waitForTimeout(2000);
    const resp = await page.request.post("/api/chat", { data: { text: "Hello" } });
    const status = resp.status();
    const body = (await resp.json()) as { text?: string; error?: string };
    if (status === 503) expect(body.error).toBeTruthy();
    else if (status === 200) expect(typeof body.text).toBe("string");
    else expect(status).toBe(500);
    await page.request.post("/api/agent/start");
    await page.waitForTimeout(5000);
  });

  test("chat UI has input in shadow DOM", async ({ appPage: page }) => {
    await navigateToTab(page, "Chat");
    const hasInput = await page.evaluate(() => {
      const sr = document.querySelector("milaidy-app")?.shadowRoot;
      return sr?.querySelector("textarea") !== null || [...(sr?.querySelectorAll("button") ?? [])].some((b) => /send/i.test(b.textContent ?? ""));
    });
    expect(hasInput).toBe(true);
  });

  test("response includes agentName", async ({ appPage: page }) => {
    const { agentName } = (await (await page.request.post("/api/chat", { data: { text: "Hello" } })).json()) as { agentName: string };
    expect(agentName.length).toBeGreaterThan(0);
  });

  test("conversation CRUD lifecycle", async ({ appPage: page }) => {
    // Create
    const createResp = await page.request.post("/api/conversations", {
      data: { title: "E2E CRUD Test" },
    });
    expect(createResp.status()).toBe(200);
    const { conversation } = (await createResp.json()) as { conversation: { id: string; title: string } };
    expect(conversation.id.length).toBeGreaterThan(0);

    // List — should contain the new conversation
    const listResp = await page.request.get("/api/conversations");
    expect(listResp.status()).toBe(200);
    const { conversations } = (await listResp.json()) as { conversations: Array<{ id: string }> };
    expect(conversations.some((c) => c.id === conversation.id)).toBe(true);

    // Rename
    const renameResp = await page.request.patch(`/api/conversations/${conversation.id}`, {
      data: { title: "E2E Renamed" },
    });
    expect(renameResp.status()).toBe(200);

    // Get messages (should be empty)
    const msgsResp = await page.request.get(`/api/conversations/${conversation.id}/messages`);
    expect(msgsResp.status()).toBe(200);
    const { messages } = (await msgsResp.json()) as { messages: Array<{ role: string; text: string }> };
    expect(Array.isArray(messages)).toBe(true);

    // Delete
    const deleteResp = await page.request.delete(`/api/conversations/${conversation.id}`);
    expect(deleteResp.status()).toBe(200);

    // Verify deleted
    const afterList = (await (await page.request.get("/api/conversations")).json()) as { conversations: Array<{ id: string }> };
    expect(afterList.conversations.some((c) => c.id === conversation.id)).toBe(false);
  });
});
