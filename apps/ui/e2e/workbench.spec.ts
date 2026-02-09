import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Workbench sidebar (right panel on chat tab)", () => {
  test("shows goals and tasks when agent is running", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    // The right sidebar should be visible with goals and tasks
    const sidebar = page.locator("widget-sidebar");
    await expect(sidebar).toBeVisible();

    // Goals section with default mock data
    await expect(sidebar.getByText("Ship native integrations")).toBeVisible();
    await expect(sidebar.getByText("Finalize marketplace UX")).toBeVisible();

    // Tasks section with default mock data
    await expect(sidebar.getByText("Add command palette keyboard flow")).toBeVisible();
    await expect(sidebar.getByText("Review plugin trust heuristics")).toBeVisible();
  });

  test("shows agent-not-running message when stopped", async ({ page }) => {
    await mockApi(page, { agentState: "not_started" });
    await page.goto("/chat");

    const sidebar = page.locator("widget-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(
      sidebar.getByText("Agent is not running"),
    ).toBeVisible();
  });

  test("shows goals-plugin-not-loaded warning when goalsAvailable is false", async ({ page }) => {
    await mockApi(page, { agentState: "running", goalsAvailable: false });
    await page.goto("/chat");

    const sidebar = page.locator("widget-sidebar");
    await expect(
      sidebar.getByText("Goals plugin not loaded"),
    ).toBeVisible();
  });

  test("shows tasks-plugin-not-loaded warning when todosAvailable is false", async ({ page }) => {
    await mockApi(page, { agentState: "running", todosAvailable: false });
    await page.goto("/chat");

    const sidebar = page.locator("widget-sidebar");
    await expect(
      sidebar.getByText("Tasks plugin not loaded"),
    ).toBeVisible();
  });

  test("shows both plugin warnings when neither is available", async ({ page }) => {
    await mockApi(page, {
      agentState: "running",
      goalsAvailable: false,
      todosAvailable: false,
    });
    await page.goto("/chat");

    const sidebar = page.locator("widget-sidebar");
    await expect(sidebar.getByText("Goals plugin not loaded")).toBeVisible();
    await expect(sidebar.getByText("Tasks plugin not loaded")).toBeVisible();
  });

  test("sidebar is read-only (no add forms)", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("widget-sidebar");
    await expect(sidebar).toBeVisible();

    // Should NOT have any input fields or add buttons
    await expect(sidebar.locator("input")).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: "Add" })).toHaveCount(0);
  });

  test("urgent tasks show urgency indicator", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("widget-sidebar");
    await expect(sidebar.getByText("Urgent")).toBeVisible();
  });

  test("has a refresh button", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("widget-sidebar");
    const refreshBtn = sidebar.locator("button[title='Refresh']");
    await expect(refreshBtn).toBeVisible();
  });
});
