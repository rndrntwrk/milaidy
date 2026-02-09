import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Agent lifecycle", () => {
  // --- Button visibility per state ---

  test("shows Start button when agent is not started", async ({ page }) => {
    await mockApi(page, { agentState: "not_started" });
    await page.goto("/chat");
    // Header has a ▶️ button for start
    await expect(page.locator("header button[title='Start agent']")).toBeVisible();
  });

  test("shows Stop button when agent is running", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");
    await expect(page.locator("header button[title='Stop agent']")).toBeVisible();
  });

  test("shows Resume button when agent is paused", async ({ page }) => {
    await mockApi(page, { agentState: "paused" });
    await page.goto("/chat");
    await expect(page.locator("header button[title='Resume agent']")).toBeVisible();
  });

  test("shows Start button when agent is stopped", async ({ page }) => {
    await mockApi(page, { agentState: "stopped" });
    await page.goto("/chat");
    await expect(page.locator("header button[title='Start agent']")).toBeVisible();
  });

  // --- Status pill ---

  test("status pill shows correct state text", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("running");
  });

  test("status pill shows paused state", async ({ page }) => {
    await mockApi(page, { agentState: "paused" });
    await page.goto("/chat");
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("paused");
  });

  // --- API calls ---

  test("clicking Start sends POST /api/agent/start", async ({ page }) => {
    await mockApi(page, { agentState: "not_started" });
    await page.goto("/chat");

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes("/api/agent/start") && req.method() === "POST",
    );

    await page.locator("header button[title='Start agent']").click();
    await requestPromise;
  });

  test("clicking Stop sends POST /api/agent/stop", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes("/api/agent/stop") && req.method() === "POST",
    );

    await page.locator("header button[title='Stop agent']").click();
    await requestPromise;
  });

  test("clicking Resume sends POST /api/agent/resume", async ({ page }) => {
    await mockApi(page, { agentState: "paused" });
    await page.goto("/chat");

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes("/api/agent/resume") && req.method() === "POST",
    );

    await page.locator("header button[title='Resume agent']").click();
    await requestPromise;
  });

  // --- UI updates after lifecycle actions ---

  test("starting agent updates status pill to running", async ({ page }) => {
    await mockApi(page, { agentState: "not_started" });
    await page.goto("/chat");

    await expect(page.locator("[data-testid='status-pill']")).toHaveText("not_started");
    await page.locator("header button[title='Start agent']").click();
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("running");
  });

  test("starting agent shows chat interface instead of start prompt", async ({ page }) => {
    await mockApi(page, { agentState: "not_started" });
    await page.goto("/chat");

    await expect(page.getByText("Agent is not running")).toBeVisible();
    await page.locator("header button[title='Start agent']").click();
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  });

  test("stopping agent updates status pill to stopped", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    await expect(page.locator("[data-testid='status-pill']")).toHaveText("running");
    await page.locator("header button[title='Stop agent']").click();
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("stopped");
  });

  test("stopping agent shows Start button again", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    await page.locator("header button[title='Stop agent']").click();
    await expect(page.locator("header button[title='Start agent']")).toBeVisible();
  });

  // --- Full lifecycle cycle ---

  test("full lifecycle: start -> stop -> start", async ({ page }) => {
    await mockApi(page, { agentState: "not_started" });
    await page.goto("/chat");

    // Start
    await page.locator("header button[title='Start agent']").click();
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("running");

    // Stop
    await page.locator("header button[title='Stop agent']").click();
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("stopped");

    // Start again
    await page.locator("header button[title='Start agent']").click();
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("running");
  });

  test("header shows agent name", async ({ page }) => {
    await mockApi(page, { agentName: "TestAgent" });
    await page.goto("/chat");
    await expect(page.locator("[data-testid='agent-name']")).toHaveText("TestAgent");
  });
});
