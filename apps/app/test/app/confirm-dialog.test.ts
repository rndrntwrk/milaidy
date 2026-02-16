import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "../../src/components/ui/ConfirmDialog";

function readAllText(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll((node) => typeof node.type === "string")
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === "string")
    .join(" ");
}

const baseProps = {
  title: "Delete item?",
  message: "This cannot be undone.",
  onConfirm: () => {},
  onCancel: () => {},
};

describe("ConfirmDialog", () => {
  it("renders nothing when open=false", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConfirmDialog, { ...baseProps, open: false }),
      );
    });

    expect(tree!.toJSON()).toBeNull();
  });

  it("renders title and message when open", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConfirmDialog, { ...baseProps, open: true }),
      );
    });

    const text = readAllText(tree!);
    expect(text).toContain("Delete item?");
    expect(text).toContain("This cannot be undone.");
  });

  it("calls onConfirm when confirm button clicked", async () => {
    const onConfirm = vi.fn();
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConfirmDialog, { ...baseProps, open: true, onConfirm }),
      );
    });

    // Find the Confirm button (second button in footer)
    const buttons = tree!.root.findAllByType("button");
    const confirmBtn = buttons.find((b) =>
      (b.children as string[]).some((c) => typeof c === "string" && c === "Confirm"),
    );
    expect(confirmBtn).toBeDefined();

    await act(async () => {
      confirmBtn!.props.onClick();
    });

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button clicked", async () => {
    const onCancel = vi.fn();
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConfirmDialog, { ...baseProps, open: true, onCancel }),
      );
    });

    const buttons = tree!.root.findAllByType("button");
    const cancelBtn = buttons.find((b) =>
      (b.children as string[]).some((c) => typeof c === "string" && c === "Cancel"),
    );
    expect(cancelBtn).toBeDefined();

    await act(async () => {
      cancelBtn!.props.onClick();
    });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("applies danger tone styling on confirm button", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConfirmDialog, { ...baseProps, open: true, tone: "danger" }),
      );
    });

    const buttons = tree!.root.findAllByType("button");
    const confirmBtn = buttons.find((b) =>
      (b.children as string[]).some((c) => typeof c === "string" && c === "Confirm"),
    );
    expect(confirmBtn!.props.className).toContain("bg-danger");
  });

  it("title has unique id from useId (not hardcoded)", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConfirmDialog, { ...baseProps, open: true }),
      );
    });

    const heading = tree!.root.findByType("h2");
    expect(heading.props.id).toBeDefined();
    expect(heading.props.id).not.toBe("confirm-dialog-title");

    // The dialog's aria-labelledby should match the heading id
    const dialog = tree!.root.findByProps({ role: "dialog" });
    expect(dialog.props["aria-labelledby"]).toBe(heading.props.id);
  });
});
