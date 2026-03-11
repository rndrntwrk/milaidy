import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../../src/components/SettingsView";

function renderModal(onClose: () => void) {
  return TestRenderer.create(
    React.createElement(
      Modal,
      {
        open: true,
        onClose,
        title: "Test Modal",
      },
      React.createElement("div", null, "body"),
    ),
  );
}

describe("Settings modal keyboard handling", () => {
  it("closes on Escape", () => {
    const onClose = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = renderModal(onClose);
    });

    const dialog = tree.root.findByProps({ role: "dialog" });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(dialog.props.role).toBe("dialog");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Enter or Space", () => {
    const onClose = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = renderModal(onClose);
    });

    const dialog = tree.root.findByProps({ role: "dialog" });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });

    expect(dialog.props.role).toBe("dialog");
    expect(onClose).not.toHaveBeenCalled();
  });
});
