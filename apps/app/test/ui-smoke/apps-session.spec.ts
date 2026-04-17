import { expect, test } from "@playwright/test";
import { DIRECT_ROUTE_CASES, escapeRegExp } from "./apps-session-route-cases";
import { assertReadyChecks, openAppPath, seedAppStorage } from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
});

test("apps view can route into internal tool pages and survive a reload", async ({
  page,
}) => {
  await openAppPath(page, "/apps");
  await expect(page.getByTestId("apps-catalog-grid")).toBeVisible({
    timeout: 30_000,
  });
  const pluginViewerButton = page.getByRole("button", { name: "Plugin Viewer" });
  await expect(pluginViewerButton).toBeVisible({ timeout: 30_000 });
  await pluginViewerButton.click();
  await expect(page).toHaveURL(/\/plugins$/);
  await assertReadyChecks(
    page,
    "plugins-viewer",
    [{ text: "AI Providers" }, { text: "Other Features" }],
    "any",
    60_000,
  );

  // Reload from root and re-navigate — Vite preview lacks SPA fallback
  await openAppPath(page, "/");
  await openAppPath(page, "/apps");
  await expect(page.getByTestId("apps-catalog-grid")).toBeVisible({
    timeout: 30_000,
  });
  await expect(pluginViewerButton).toBeVisible({ timeout: 30_000 });
  await pluginViewerButton.click();
  await expect(page).toHaveURL(/\/plugins$/);
  await assertReadyChecks(
    page,
    "plugins-viewer-reload",
    [{ text: "AI Providers" }, { text: "Other Features" }],
    "any",
    60_000,
  );
});

for (const routeCase of DIRECT_ROUTE_CASES) {
  test(`direct ${routeCase.name} route boots the app shell`, async ({
    page,
  }) => {
    await openAppPath(page, routeCase.path);
    await expect(page).toHaveURL(
      new RegExp(`${escapeRegExp(routeCase.path)}$`),
    );
    if ("readyChecks" in routeCase) {
      await assertReadyChecks(
        page,
        routeCase.name,
        routeCase.readyChecks,
        "any",
        routeCase.timeoutMs,
      );
      return;
    }
    await assertReadyChecks(
      page,
      routeCase.name,
      [
        "selector" in routeCase
          ? { selector: routeCase.selector }
          : { text: routeCase.text },
      ],
      "any",
      "timeoutMs" in routeCase ? routeCase.timeoutMs : undefined,
    );
  });
}
