import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "../../src/components/ui/ErrorBoundary";

function readAllText(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll((node) => typeof node.type === "string")
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === "string")
    .join(" ");
}

/** Component that throws on render */
function ThrowingChild({ message }: { message: string }): never {
  throw new Error(message);
}

/** Stable child component */
function GoodChild() {
  return React.createElement("div", null, "all good");
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress expected console.error from ErrorBoundary
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children normally when no error", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(GoodChild)),
      );
    });

    expect(readAllText(tree!)).toContain("all good");
  });

  it("catches error and shows default fallback", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowingChild, { message: "boom" })),
      );
    });

    const text = readAllText(tree!);
    expect(text).toContain("Something went wrong");
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("shows the thrown error message in fallback", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ThrowingChild, { message: "kaboom" })),
      );
    });

    expect(readAllText(tree!)).toContain("kaboom");
  });

  it("renders custom fallback when provided", async () => {
    const customFallback = React.createElement("div", null, "custom error ui");

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ErrorBoundary, { fallback: customFallback },
          React.createElement(ThrowingChild, { message: "oops" })),
      );
    });

    expect(readAllText(tree!)).toContain("custom error ui");
    expect(readAllText(tree!)).not.toContain("Something went wrong");
  });

  it("resets and renders children after Try Again click", async () => {
    let shouldThrow = true;

    function ConditionalChild() {
      if (shouldThrow) throw new Error("initial error");
      return React.createElement("div", null, "recovered");
    }

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ErrorBoundary, null,
          React.createElement(ConditionalChild)),
      );
    });

    expect(readAllText(tree!)).toContain("Something went wrong");

    // Stop throwing, then click Try Again
    shouldThrow = false;
    const tryAgainBtn = tree!.root.findByProps({ type: "button" });
    await act(async () => {
      tryAgainBtn.props.onClick();
    });

    expect(readAllText(tree!)).toContain("recovered");
  });
});
