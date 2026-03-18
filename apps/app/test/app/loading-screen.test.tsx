import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";

import { AvatarLoader } from "../../src/components/avatar/AvatarLoader";

function renderedText(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll((node) => typeof node.type === "string")
    .map((node) => node.children.join(""))
    .join("\n");
}

describe("AvatarLoader", () => {
  it("shows default label", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AvatarLoader));
    });
    if (!tree) throw new Error("failed to render");

    expect(renderedText(tree)).toContain("Initializing entity");
  });

  it("shows custom label", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(AvatarLoader, { label: "Starting systems" }),
      );
    });
    if (!tree) throw new Error("failed to render");

    expect(renderedText(tree)).toContain("Starting systems");
  });

  it("shows LOADING text", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AvatarLoader));
    });
    if (!tree) throw new Error("failed to render");

    expect(renderedText(tree)).toContain("LOADING");
  });

  it("renders the milady-os boot shell with agent identity and dither chars", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(LoadingScreen, {
          phase: "starting-backend",
          elapsedSeconds: 0,
          currentTheme: "milady-os",
          agentName: "DJ Alice",
        }),
      );
    });
    if (!tree) throw new Error("failed to render loading screen");

    const ditherChars = tree.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        String(node.props.className ?? "").includes("dither-char"),
    );
    expect(renderedText(tree)).toContain("PRO STREAMER");
    expect(renderedText(tree)).toContain("Boot diagnostics");
    expect(renderedText(tree)).toContain("Agent: DJ Alice");
    expect(renderedText(tree)).toContain("[starting backend (0s)]");
    expect(ditherChars.length).toBeGreaterThan(0);
  });

  it("falls back to standby identity when the agent name is unavailable", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(LoadingScreen, {
          phase: "starting-backend",
          elapsedSeconds: 0,
          currentTheme: "milady-os",
          agentName: "   ",
        }),
      );
    });
    if (!tree) throw new Error("failed to render loading screen");

    expect(renderedText(tree)).toContain("Agent: standby");
  });

  it("keeps non-milady themes on the neutral loading path", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(LoadingScreen, {
          phase: "starting-backend",
          elapsedSeconds: 4,
          currentTheme: "milady",
        }),
      );
    });
    if (!tree) throw new Error("failed to render loading screen");

    expect(renderedText(tree)).toContain("starting backend (4s)");
    expect(renderedText(tree)).not.toContain("PRO STREAMER");
    expect(renderedText(tree)).not.toContain("Boot diagnostics");
    expect(renderedText(tree)).not.toContain("Agent: DJ Alice");
    expect(renderedText(tree)).not.toContain("broadcast conversation HUD");
  });
});
