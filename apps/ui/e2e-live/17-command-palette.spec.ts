import { test, expect, getAppText } from "./fixtures.js";

test.describe("Command Palette", () => {
  test("command palette can be opened via keyboard", async ({ appPage: page }) => {
    // Verify Cmd+K / Ctrl+K opens the palette
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(300);
    const isOpen = await page.evaluate(() => {
      const app = document.querySelector("milaidy-app") as HTMLElement & { commandPaletteOpen?: boolean };
      return app?.commandPaletteOpen === true;
    });
    // Also check if there's a command input visible in shadow DOM
    const hasInput = await page.evaluate(() => {
      const sr = document.querySelector("milaidy-app")?.shadowRoot;
      return sr?.querySelector("[data-command-input]") !== null;
    });
    expect(isOpen || hasInput).toBe(true);
  });

  test("command palette state is initially closed", async ({ appPage: page }) => {
    const paletteOpen = await page.evaluate(() => {
      const app = document.querySelector("milaidy-app") as HTMLElement & {
        commandPaletteOpen?: boolean;
      };
      return app?.commandPaletteOpen ?? false;
    });
    expect(paletteOpen).toBe(false);
  });

  test("header has interactive buttons", async ({ appPage: page }) => {
    const buttonCount = await page.evaluate(() => {
      const app = document.querySelector("milaidy-app");
      if (!app || !app.shadowRoot) return 0;
      return app.shadowRoot.querySelectorAll("button").length;
    });
    expect(buttonCount).toBeGreaterThan(0);
  });
});
