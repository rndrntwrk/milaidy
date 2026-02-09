import { test, expect, waitForApp, navigateToTab } from "./fixtures.js";

const TABS = ["Chat", "Apps", "Inventory", "Plugins", "Skills", "Database", "Config", "Logs"];

test.describe("Navigation", () => {
  test("defaults to chat", async ({ appPage: page }) => {
    expect(page.url().endsWith("/") || page.url().includes("/chat")).toBe(true);
  });

  for (const tab of TABS) {
    test(`→ ${tab}`, async ({ appPage: page }) => {
      await navigateToTab(page, tab);
      await expect(page).toHaveURL(new RegExp(`/${tab.toLowerCase()}`));
    });
  }

  test("active tab highlighted", async ({ appPage: page }) => {
    await navigateToTab(page, "Plugins");
    const link = page.locator("nav a").filter({ hasText: /plugins/i });
    expect(await link.count()).toBeGreaterThan(0);
    expect(await link.first().getAttribute("class")).toBeTruthy();
  });

  test("direct URL", async ({ page }) => {
    await page.goto("/plugins");
    await waitForApp(page);
    await expect(page).toHaveURL(/\/plugins/);
  });

  test("back button", async ({ appPage: page }) => {
    await navigateToTab(page, "Plugins");
    await navigateToTab(page, "Skills");
    await page.goBack();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/plugins/);
  });

  test("forward button", async ({ appPage: page }) => {
    await navigateToTab(page, "Plugins");
    await page.goBack();
    await page.waitForTimeout(300);
    await page.goForward();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/plugins/);
  });
});
