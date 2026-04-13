import { expect, test } from "@playwright/test";
import { installDefaultAppMocks, openAppPath, seedAppStorage } from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
  await installDefaultAppMocks(page);
});

test("apps view can route into internal tool pages and survive a reload", async ({
  page,
}) => {
  await openAppPath(page, "/apps");
  await expect(page.getByTestId("apps-catalog-grid")).toBeVisible();

  await page.getByRole("button", { name: "Plugin Viewer" }).click();
  await expect(page).toHaveURL(/\/plugins$/);
  await expect(page.getByTestId("connectors-settings-sidebar")).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/plugins$/);
  await expect(page.getByTestId("connectors-settings-sidebar")).toBeVisible();
});
