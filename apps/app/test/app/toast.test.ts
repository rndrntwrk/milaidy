import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { ToastContainer, type ToastItem } from "../../src/components/ui/Toast";

function readAllText(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll((node) => typeof node.type === "string")
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === "string")
    .join(" ");
}

function makeToast(
  id: string,
  text: string,
  tone: ToastItem["tone"] = "info",
): ToastItem {
  return { id, text, tone };
}

function requireTree(
  tree: TestRenderer.ReactTestRenderer | undefined,
): TestRenderer.ReactTestRenderer {
  if (!tree) {
    throw new Error("Expected rendered tree");
  }
  return tree;
}

describe("ToastContainer", () => {
  it("renders empty container when no toasts", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ToastContainer, {
          toasts: [],
          onDismiss: () => {},
        }),
      );
    });

    const container = tree?.root.findByType("output");
    expect(container).toBeDefined();
    expect(container.props["aria-live"]).toBe("polite");
    // No toast items rendered
    const buttons = tree?.root.findAllByType("button");
    expect(buttons).toHaveLength(0);
  });

  it("renders up to 3 toasts", async () => {
    const toasts = [
      makeToast("1", "First"),
      makeToast("2", "Second"),
      makeToast("3", "Third"),
      makeToast("4", "Fourth"),
    ];

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ToastContainer, { toasts, onDismiss: () => {} }),
      );
    });

    const renderedTree = requireTree(tree);
    const text = readAllText(renderedTree);
    expect(text).toContain("First");
    expect(text).toContain("Second");
    expect(text).toContain("Third");
    expect(text).not.toContain("Fourth");
  });

  it("shows toast text and dismiss button", async () => {
    const toasts = [makeToast("t1", "Hello world", "success")];

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ToastContainer, { toasts, onDismiss: () => {} }),
      );
    });

    const renderedTree = requireTree(tree);
    expect(readAllText(renderedTree)).toContain("Hello world");
    const dismissBtn = renderedTree.root.findByProps({
      "aria-label": "Dismiss",
    });
    expect(dismissBtn).toBeDefined();
  });

  it("calls onDismiss when dismiss button clicked", async () => {
    const onDismiss = vi.fn();
    const toasts = [makeToast("t1", "Dismiss me")];

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ToastContainer, { toasts, onDismiss }),
      );
    });

    const dismissBtn = tree?.root.findByProps({ "aria-label": "Dismiss" });
    await act(async () => {
      dismissBtn.props.onClick();
    });

    expect(onDismiss).toHaveBeenCalledWith("t1");
  });

  it("has aria-live=polite and role=status on container", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ToastContainer, {
          toasts: [],
          onDismiss: () => {},
        }),
      );
    });

    const container = tree?.root.findByType("output");
    expect(container.props["aria-live"]).toBe("polite");
  });
});
