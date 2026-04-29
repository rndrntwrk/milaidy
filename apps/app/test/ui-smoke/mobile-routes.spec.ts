import { expect, test } from "@playwright/test";
import {
  installDefaultAppRoutes,
  openAppPath,
  seedAppStorage,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
  await installDefaultAppRoutes(page);
});

test("mobile shell keeps global navigation available through phone and tablet widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAppPath(page, "/chat");

  await expect(page.getByTestId("header-mobile-bottom-nav")).toBeVisible();
  await expect(
    page.getByTestId("header-mobile-bottom-nav-button-chat"),
  ).toBeVisible();

  await page.getByTestId("header-mobile-bottom-nav-button-settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("settings-shell")).toBeVisible();

  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.getByTestId("header-mobile-bottom-nav")).toBeVisible();
  await expect(
    page.getByTestId("header-mobile-bottom-nav-button-chat"),
  ).toBeVisible();
});
