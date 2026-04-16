import { expect, test } from "@playwright/test";
import { openAppPath, seedAppStorage } from "./helpers";

test("settings exposes computer use capability controls", async ({ page }) => {
  await seedAppStorage(page);
  await openAppPath(page, "/voice");

  await expect(page.getByTestId("settings-shell")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Enable Computer Use" }),
  ).toBeVisible();

  await page.getByRole("switch", { name: "Enable Computer Use" }).click();

  await expect(page.getByText("Approval Mode")).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: "Full Control" }),
  ).toBeVisible();
  await expect(page.getByText("Permissions")).toBeVisible();
});
