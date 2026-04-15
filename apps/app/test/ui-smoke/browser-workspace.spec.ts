import { expect, test } from "@playwright/test";
import { openAppPath, seedAppStorage } from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
});

test("browser workspace can create live tabs and switch selection", async ({
  page,
}) => {
  await openAppPath(page, "/browser");
  await expect(page).toHaveURL(/\/browser$/, { timeout: 20_000 });
  await expect(page.getByTestId("browser-workspace-view")).toBeVisible({
    timeout: 30_000,
  });

  const addressInput = page.getByPlaceholder("Enter a URL");
  if (!(await addressInput.isVisible())) {
    const expandToggle = page.getByTestId(
      "browser-workspace-sidebar-expand-toggle",
    );
    if (await expandToggle.isVisible()) {
      await expandToggle.click();
    }
  }

  await expect(addressInput).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("No browser tabs yet")).toBeVisible({
    timeout: 30_000,
  });
  const newTabButton = page.getByRole("button", { name: "New tab" });

  await addressInput.fill("example.com");
  await newTabButton.click();

  const exampleTabButton = page.getByRole("button", {
    name: /example\.com https:\/\/example\.com\//,
  });
  await expect(exampleTabButton).toBeVisible();
  await expect(addressInput).toHaveValue("https://example.com/");

  await addressInput.fill("about:blank");
  await newTabButton.click();

  const blankTabButton = page.getByRole("button", {
    name: /about:blank/i,
  });
  await expect(blankTabButton).toBeVisible();
  await expect(addressInput).toHaveValue("about:blank");

  await exampleTabButton.click();
  await expect(addressInput).toHaveValue("https://example.com/");
});
