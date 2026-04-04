import { expect, type Locator, type Page, type Route } from "@playwright/test";

export const ROOT_TIMEOUT_MS = 20_000;
export const NAV_TIMEOUT_MS = 12_000;

type AppMockOptions = {
  includeConfig?: boolean;
};

type ReadyCheck =
  | { selector: string; text?: never }
  | { selector?: never; text: string };

const DEFAULT_STORAGE: Record<string, string> = {
  "eliza:onboarding-complete": "1",
  "eliza:onboarding:step": "activate",
  "eliza:ui-shell-mode": "native",
  "milady:active-server": JSON.stringify({
    id: "local:embedded",
    kind: "local",
    label: "This device",
  }),
};

async function fulfillJson(route: Route, payload: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

export async function installDefaultAppMocks(
  page: Page,
  options: AppMockOptions = {},
): Promise<void> {
  await page.route("**/api/onboarding/status", async (route) => {
    await fulfillJson(route, { complete: true });
  });

  await page.route("**/api/agent/status", async (route) => {
    await fulfillJson(route, { onboardingComplete: true, status: "running" });
  });

  if (options.includeConfig) {
    await page.route("**/api/config**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await fulfillJson(route, { media: {} });
    });
  }
}

export async function seedAppStorage(
  page: Page,
  overrides: Record<string, string> = {},
): Promise<void> {
  const storage = { ...DEFAULT_STORAGE, ...overrides };
  await page.addInitScript((entries: Record<string, string>) => {
    for (const [key, value] of Object.entries(entries)) {
      if (localStorage.getItem(key) == null) {
        localStorage.setItem(key, value);
      }
    }
  }, storage);
}

export async function expectRootReady(page: Page): Promise<void> {
  await expect(page.locator("#root")).toBeVisible({ timeout: ROOT_TIMEOUT_MS });
}

export async function expectNoOnboardingRedirect(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/onboarding/, { timeout: NAV_TIMEOUT_MS });
}

export async function openAppPath(
  page: Page,
  targetPath: string,
): Promise<void> {
  await page.goto(targetPath, { waitUntil: "domcontentloaded" });
  await expectRootReady(page);
  await expectNoOnboardingRedirect(page);
}

export async function readLocalStorage(
  page: Page,
  key: string,
): Promise<string | null> {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

async function locatorVisible(locator: Locator): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: "visible", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function runSoftReadyChecks(
  page: Page,
  label: string,
  checks: ReadyCheck[],
  mode: "any" | "all" = "any",
): Promise<void> {
  const results: boolean[] = [];

  for (const check of checks) {
    if ("selector" in check) {
      results.push(await locatorVisible(page.locator(check.selector)));
      continue;
    }
    results.push(await locatorVisible(page.getByText(check.text)));
  }

  const passed =
    mode === "all" ? results.every((result) => result) : results.some(Boolean);

  if (!passed) {
    console.warn(
      `[playwright-ui-smoke] ${label}: ready checks did not pass (${JSON.stringify(results)}).`,
    );
  }
}
