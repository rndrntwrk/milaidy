import { expect, test } from "@playwright/test";
import {
  assertReadyChecks,
  openAppPath,
  seedAppStorage,
  installDefaultAppMocks,
} from "./helpers";

type ViewSpec = {
  id: string;
  path: string;
  label: string;
  allowRedirectTo?: string;
  appsDisabledExpectChatShell?: boolean;
  readyChecks?: Array<{ selector: string } | { text: string }>;
  readyCheckMode?: "any" | "all";
};

const VIEWS: ViewSpec[] = [
  {
    id: "companion",
    path: "/companion",
    label: "Companion",
    readyChecks: [{ selector: '[data-testid="companion-root"]' }],
  },
  {
    id: "chat",
    path: "/chat",
    label: "Chat",
    allowRedirectTo: "/companion",
    readyChecks: [{ selector: '[aria-label="Chat workspace"]' }],
    readyCheckMode: "any",
  },
  {
    id: "stream",
    path: "/stream",
    label: "Stream",
    readyChecks: [{ text: "Go Live" }, { text: "Stop Stream" }],
    readyCheckMode: "any",
  },
  {
    id: "character-select",
    path: "/character-select",
    label: "Character Select",
    readyChecks: [
      { selector: '[data-testid="character-roster-grid"]' },
      { selector: '[data-testid="character-customize-toggle"]' },
    ],
    readyCheckMode: "any",
  },
  {
    id: "wallets",
    path: "/wallets",
    label: "Wallets",
    readyChecks: [{ selector: '[data-testid="wallets-sidebar"]' }],
  },
  {
    id: "knowledge",
    path: "/knowledge",
    label: "Knowledge",
    readyChecks: [{ selector: '[aria-label="Knowledge upload controls"]' }],
  },
  {
    id: "connectors",
    path: "/connectors",
    label: "Connectors",
    readyChecks: [{ selector: '[data-testid="connectors-settings-sidebar"]' }],
  },
  {
    id: "settings",
    path: "/settings",
    label: "Settings",
    readyChecks: [{ selector: '[data-testid="settings-sidebar"]' }],
  },
  {
    id: "triggers",
    path: "/triggers",
    label: "Heartbeats / Triggers",
    readyChecks: [{ text: "New Heartbeat" }],
  },
  {
    id: "advanced",
    path: "/advanced",
    label: "Advanced",
    readyChecks: [{ text: "Plugins" }, { text: "Streaming" }],
    readyCheckMode: "any",
  },
  { id: "plugins", path: "/plugins", label: "Plugins" },
  { id: "skills", path: "/skills", label: "Skills" },
  { id: "actions", path: "/actions", label: "Actions" },
  { id: "trajectories", path: "/trajectories", label: "Trajectories" },
  { id: "runtime", path: "/runtime", label: "Runtime" },
  { id: "database", path: "/database", label: "Database" },
  { id: "desktop", path: "/desktop", label: "Desktop" },
  { id: "logs", path: "/logs", label: "Logs" },
  { id: "security", path: "/security", label: "Security" },
  { id: "voice", path: "/voice", label: "Voice (Settings > Media)" },
  {
    id: "apps",
    path: "/apps",
    label: "Apps (APPS_ENABLED=false — chat shell)",
    appsDisabledExpectChatShell: true,
  },
  {
    id: "character",
    path: "/character",
    label: "Character editor",
    readyChecks: [
      { selector: '[data-testid="character-roster-grid"]' },
      { selector: '[data-testid="character-customize-toggle"]' },
    ],
    readyCheckMode: "any",
  },
  { id: "fine-tuning", path: "/fine-tuning", label: "Fine tuning" },
];

test.beforeEach(async ({ page }) => {
  await installDefaultAppMocks(page);
  await seedAppStorage(page);
});

for (const view of VIEWS) {
  test(`[${view.id}] ${view.label} view loads`, async ({ page }) => {
    await openAppPath(page, view.path);

    const currentUrl = page.url();
    if (view.allowRedirectTo) {
      expect(
        currentUrl.includes(view.path) ||
          currentUrl.includes(view.allowRedirectTo),
      ).toBe(true);
    }

    if (view.appsDisabledExpectChatShell) {
      expect(
        currentUrl.includes("/chat") ||
          currentUrl.includes("/companion") ||
          currentUrl.includes("/apps"),
      ).toBe(true);
    }

    if (view.readyChecks?.length) {
      await assertReadyChecks(
        page,
        `${view.label} (${view.id})`,
        view.readyChecks,
        view.readyCheckMode,
      );
    }

    await expect
      .poll(async () => page.locator("button").count(), {
        message: `${view.label} should expose interactive buttons`,
      })
      .toBeGreaterThan(0);
  });
}

test("Rapid view traversal without crash", async ({ page }) => {
  for (const view of VIEWS) {
    await openAppPath(page, view.path);
  }
});
