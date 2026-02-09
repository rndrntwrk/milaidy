import { test as base, expect, type Page } from "@playwright/test";

const WS_URL = "ws://127.0.0.1:18790/ws";

const TAB_PATHS: Record<string, string> = {
  chat: "/chat", apps: "/apps", game: "/game", inventory: "/inventory",
  plugins: "/plugins", skills: "/skills",
  database: "/database", config: "/config", logs: "/logs",
};

async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector("milaidy-app", { state: "attached", timeout: 60_000 });
  await page.waitForFunction(() => {
    const sr = document.querySelector("milaidy-app")?.shadowRoot;
    return sr?.querySelector("nav") !== null || sr?.querySelector("[class*='onboarding']") !== null;
  }, { timeout: 60_000 });
}

async function navigateToTab(page: Page, tabName: string): Promise<void> {
  const link = page.locator("nav a").filter({ hasText: new RegExp(tabName, "i") });
  if ((await link.count()) > 0) {
    await link.first().click();
  } else {
    await page.goto(TAB_PATHS[tabName.toLowerCase()] ?? `/${tabName.toLowerCase()}`);
    await waitForApp(page);
  }
  await page.waitForTimeout(300);
}

interface AgentStatus { state: string; agentName: string }

async function getAgentStatus(page: Page): Promise<AgentStatus> {
  return (await (await page.request.get("/api/status")).json()) as AgentStatus;
}

async function waitForAgentState(page: Page, target: string, timeout = 60_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await getAgentStatus(page)).state === target) return;
    await page.waitForTimeout(1000);
  }
  throw new Error(`Agent did not reach "${target}" within ${timeout}ms`);
}

async function ensureAgentRunning(page: Page): Promise<void> {
  const { state } = await getAgentStatus(page);
  if (state === "running") return;
  await page.request.post(state === "paused" ? "/api/agent/resume" : "/api/agent/start");
  await waitForAgentState(page, "running", 120_000);
}

async function getAppText(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector("milaidy-app")?.shadowRoot?.textContent ?? "");
}

const test = base.extend<{ appPage: Page }>({
  appPage: async ({ page }, use) => {
    await page.goto("/");
    await waitForApp(page);
    await use(page);
  },
});

export { test, expect, waitForApp, navigateToTab, getAgentStatus, waitForAgentState, ensureAgentRunning, getAppText, WS_URL };
