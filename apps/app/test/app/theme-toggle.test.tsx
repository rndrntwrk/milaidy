// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../../../../packages/app-core/src/components/ThemeToggle";

describe("ThemeToggle", () => {
  it("keeps the companion toggle readable in light mode", async () => {
    const setUiTheme = vi.fn();

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <ThemeToggle
          uiTheme="light"
          setUiTheme={setUiTheme}
          variant="companion"
        />,
      );
    });

    const button = tree?.root.findByProps({ "data-testid": "theme-toggle" });
    expect(button?.props.className).toContain("text-white/80");
    expect(button?.props.className).not.toContain("var(--text)");
    expect(button?.props.style).toBeUndefined();

    await act(async () => {
      button?.props.onClick();
    });

    expect(setUiTheme).toHaveBeenCalledWith("dark");
  });
});
