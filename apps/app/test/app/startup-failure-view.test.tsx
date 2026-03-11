import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { StartupFailureView } from "../../src/components/StartupFailureView";

function renderedText(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll((node) => typeof node.type === "string")
    .map((node) => node.children.join(""))
    .join(" ");
}

describe("StartupFailureView", () => {
  it("renders the milady-os shell with the agent identity and backend recovery actions", async () => {
    const onRetry = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "backend-unreachable",
            phase: "starting-backend",
            message: "Backend unavailable",
            detail: "/api/status - HTTP 404 - Not found",
            status: 404,
            path: "/api/status",
          },
          onRetry,
          currentTheme: "milady-os",
          agentName: "DJ Alice",
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");

    const heading = tree.root.findByType("h1").children.join("");
    const allText = renderedText(tree);
    expect(heading).toContain("Backend Unreachable");
    expect(allText).toContain("Boot diagnostics");
    expect(allText).toContain("Agent: DJ Alice");
    expect(allText).toContain("Backend unavailable");
    expect(allText).toContain("This origin does not host the agent backend.");
    const openAppLink = tree.root.findByType("a");
    expect(openAppLink.props.href).toBe("https://app.milady.ai");
    expect(openAppLink.children.join("")).toContain("OPEN_APP");

    const retryButton = tree.root.findByType("button");
    await act(async () => {
      retryButton.props.onClick();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("falls back to standby identity for milady-os failures when no agent name is available", async () => {
    const onRetry = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "agent-timeout",
            phase: "initializing-agent",
            message: "Agent timed out",
          },
          onRetry,
          currentTheme: "milady-os",
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");
    expect(renderedText(tree)).toContain("Agent: standby");
    const links = tree.root.findAllByType("a");
    expect(links).toHaveLength(0);
  });

  it("keeps non-milady themes on the neutral failure path", async () => {
    const onRetry = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "backend-unreachable",
            phase: "starting-backend",
            message: "Backend unavailable",
          },
          onRetry,
          currentTheme: "milady",
          agentName: "DJ Alice",
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");

    const heading = tree.root.findByType("h1").children.join("");
    const allText = renderedText(tree);
    expect(heading).toContain("Backend Unreachable");
    expect(allText).toContain("Startup sequence interrupted");
    expect(allText).toContain("Backend unavailable");
    expect(allText).not.toContain("Boot diagnostics");
    expect(allText).not.toContain("broadcast conversation HUD");
    expect(allText).not.toContain("Agent: DJ Alice");
    const links = tree.root.findAllByType("a");
    expect(links).toHaveLength(1);
  });
});
