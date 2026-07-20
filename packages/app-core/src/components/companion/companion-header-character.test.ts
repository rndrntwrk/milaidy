import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract test: CompanionHeader is a self-contained header for the
 * companion overlay. The mode-selector pill (companion / character / desktop)
 * lives here. Voice toggle and new chat controls sit in the center.
 * Clicking the desktop/mobile icon exits the companion overlay.
 */
describe("companion header", () => {
  it("CompanionHeader renders mode pill and voice controls", () => {
    const headerPath = path.resolve(import.meta.dirname, "CompanionHeader.tsx");
    expect(existsSync(headerPath)).toBe(true);
    const source = readFileSync(headerPath, "utf-8");

    expect(source).toContain("onExitToDesktop");
    expect(source).toContain("onExitToCharacter");
    expect(source).toContain("onToggleVoiceMute");
    expect(source).toContain("onNewChat");
    expect(source).toContain("companion-shell-toggle");
  });

  it("moves the center controls onto their own row on mobile", () => {
    const headerPath = path.resolve(import.meta.dirname, "CompanionHeader.tsx");
    const source = readFileSync(headerPath, "utf-8");

    expect(source).toContain('data-testid="companion-header-controls-row"');
    expect(source).toContain(
      'data-testid="companion-header-center-controls-slot"',
    );
    expect(source).toContain('data-testid="companion-header-right-controls"');
    expect(source).toContain("flex w-full flex-wrap items-center gap-2");
    expect(source).toContain("order-3 w-full flex-none");
    expect(source).toContain("order-2 ml-auto");
  });

  it("header stacks above the floating chat dock", () => {
    // The game-modal chat layer extends invisibly above its dock
    // (top: calc(-100% + 1.5rem), masked transparent) with pointer-events
    // enabled. At short viewports (844x390) it reaches the header band, so the
    // header must outrank the dock (z-index 24 in alice-companion.css) or
    // Go Live becomes unclickable.
    const headerPath = path.resolve(import.meta.dirname, "CompanionHeader.tsx");
    const source = readFileSync(headerPath, "utf-8");
    expect(source).toContain("top-0 z-30");
    expect(source).not.toContain("top-0 z-10");

    const cssPath = path.resolve(
      import.meta.dirname,
      "../../styles/alice-companion.css",
    );
    const css = readFileSync(cssPath, "utf-8");
    expect(css).toMatch(/\.companion-chat-dock\s*\{\s*z-index:\s*24;/);
  });

  it("Character tab exists in main navigation", () => {
    const navPath = path.resolve(
      import.meta.dirname,
      "..",
      "..",
      "navigation",
      "index.ts",
    );
    expect(existsSync(navPath)).toBe(true);
    const source = readFileSync(navPath, "utf-8");
    expect(source).toContain('"Character"');
    expect(source).toContain('"character"');
  });
});
