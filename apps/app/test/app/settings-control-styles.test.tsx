// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CloudConnectionStatus,
  CloudSourceModeToggle,
  ConfigSaveFooter,
} from "@milady/app-core/components";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("@milady/app-core/state", () => ({
  useApp: () => ({
    t: (key: string) => key,
  }),
}));

function blockFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] ?? "";
}

describe("settings control styles", () => {
  it("renders the cloud source toggle as a rounded segmented control", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <CloudSourceModeToggle mode="cloud" onChange={() => {}} />,
      );
    });

    const root = tree.root;
    const container = root.findByType("div");
    const buttons = root.findAllByType("button");

    expect(container.props.className).toContain("rounded-lg");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].props.className).toContain("first:rounded-l-lg");
    expect(buttons[0].props.className).toContain("first:rounded-r-none");
    expect(buttons[1].props.className).toContain("last:rounded-r-lg");
    expect(buttons[1].props.className).toContain("last:rounded-l-none");
  });

  it("keeps settings status badges readable instead of yellow text", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <CloudConnectionStatus connected={false} disconnectedText="Offline" />,
      );
    });

    const badge = tree.root
      .findAllByType("span")
      .find((node) => node.props.className?.includes("rounded-full"));

    expect(badge).toBeDefined();
    expect(badge?.props.className).toContain("text-[var(--text)]");
    expect(badge?.props.className).not.toMatch(/yellow/);
  });

  it("uses the shared rounded button in config save footers", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <ConfigSaveFooter
          dirty
          saving={false}
          saveError={null}
          saveSuccess={false}
          onSave={() => {}}
        />,
      );
    });

    const button = tree.root.findByType("button");
    expect(button.props.className).toContain("rounded-lg");
  });

  it("keeps settings accent foreground text mapped to the actual foreground", () => {
    const css = readFileSync(
      join(process.cwd(), "packages/app-core/src/styles/anime.css"),
      "utf8",
    );

    const accentForegroundBlock = blockFor(
      css,
      ".settings-content-area .text-\\[var\\(--accent-foreground\\)\\]",
    );
    const gridButtonBlock = blockFor(
      css,
      '.settings-content-area .grid button[class*="border"][class*="cursor-pointer"]',
    );

    expect(accentForegroundBlock).toContain("color: var(--accent-foreground);");
    expect(gridButtonBlock).toContain("border-radius: var(--radius-lg);");
    expect(gridButtonBlock).not.toContain("clip-path");
  });
});
