import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";

import { Dialog } from "../../src/components/ui/Dialog";

function readAllText(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll((node) => typeof node.type === "string")
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === "string")
    .join(" ");
}

describe("Dialog", () => {
  it("renders nothing when open=false", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(Dialog, { open: false, onClose: () => {} },
          React.createElement("span", null, "hidden")),
      );
    });

    expect(tree!.toJSON()).toBeNull();
  });

  it("renders children when open=true", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(Dialog, { open: true, onClose: () => {} },
          React.createElement("span", null, "visible")),
      );
    });

    expect(readAllText(tree!)).toContain("visible");
  });

  it("has role=dialog and aria-modal=true", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(Dialog, { open: true, onClose: () => {} },
          React.createElement("span", null, "content")),
      );
    });

    const dialog = tree!.root.findByProps({ role: "dialog" });
    expect(dialog).toBeDefined();
    expect(String(dialog.props["aria-modal"])).toBe("true");
  });

  it("passes aria-label to the dialog element", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(Dialog, { open: true, onClose: () => {}, ariaLabel: "Test dialog" },
          React.createElement("span", null, "content")),
      );
    });

    const dialog = tree!.root.findByProps({ role: "dialog" });
    expect(dialog.props["aria-label"]).toBe("Test dialog");
  });

  it("passes aria-labelledby to the dialog element", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(Dialog, { open: true, onClose: () => {}, ariaLabelledBy: "my-title" },
          React.createElement("span", null, "content")),
      );
    });

    const dialog = tree!.root.findByProps({ role: "dialog" });
    expect(dialog.props["aria-labelledby"]).toBe("my-title");
  });
});
