import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers.js";

test.describe("Navigation", () => {
  test("defaults to chat tab", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/");

    // Should show chat content
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  });

  test("navigates to plugins tab", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/");

    await page.locator("nav button").filter({ hasText: "Plugins" }).click();

    await expect(page).toHaveURL(/\/plugins/);
    await expect(page.getByText("Manage plugins and integrations")).toBeVisible();
  });

  test("navigates to skills tab", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/");

    await page.locator("nav button").filter({ hasText: "Skills" }).click();

    await expect(page).toHaveURL(/\/skills/);
  });

  test("navigates to config tab", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/");

    await page.locator("nav button").filter({ hasText: "Config" }).click();

    await expect(page).toHaveURL(/\/config/);
    await expect(page.getByText("Agent settings and configuration")).toBeVisible();
  });

  test("navigates to logs tab", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/");

    await page.locator("nav button").filter({ hasText: "Logs" }).click();

    await expect(page).toHaveURL(/\/logs/);
    await expect(page.getByText("Agent log output")).toBeVisible();
  });

  test("handles direct URL navigation", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/config");

    await expect(page.getByText("Agent settings and configuration")).toBeVisible();
  });

  test("handles browser back button", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");

    await page.locator("nav button").filter({ hasText: "Plugins" }).click();
    await expect(page).toHaveURL(/\/plugins/);

    await page.goBack();
    await expect(page).toHaveURL(/\/chat/);
  });
});
