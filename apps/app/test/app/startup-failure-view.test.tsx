import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { StartupFailureView } from "../../src/components/StartupFailureView";

describe("StartupFailureView", () => {
  it("renders backend-unreachable hint and open-app CTA, then triggers retry", async () => {
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
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");

    const heading = tree.root.findByType("h1").children.join("");
    const allText = tree.root
      .findAll((node) => typeof node.type === "string")
      .map((node) => node.children.join(""))
      .join(" ");
    expect(heading).toContain("Backend Unreachable");
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

  it("does not render open-app CTA for non-backend failures", async () => {
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
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");
    const links = tree.root.findAllByType("a");
    expect(links).toHaveLength(0);
  });
});
