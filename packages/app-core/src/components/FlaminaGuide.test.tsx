// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { textOf } from "../../../../test/helpers/react-test";
import { FlaminaGuideCard } from "./FlaminaGuide";

describe("FlaminaGuideCard", () => {
  it("explains provider impact on character behavior", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(FlaminaGuideCard, { topic: "provider" }),
      );
    });

    const renderedText = textOf(tree!.root);

    expect(renderedText).toContain("reasons");
    expect(renderedText).toContain("latency");
    expect(renderedText).toContain("output quality");
  });

  it("explains rpc impact on external capabilities", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(FlaminaGuideCard, { topic: "rpc" }),
      );
    });

    const renderedText = textOf(tree!.root);

    expect(renderedText).toContain("wallets");
    expect(renderedText).toContain("chains");
    expect(renderedText).toContain("external execution");
  });

  it("explains permissions impact on local access", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(FlaminaGuideCard, { topic: "permissions" }),
      );
    });

    const renderedText = textOf(tree!.root);

    expect(renderedText).toContain("see");
    expect(renderedText).toContain("control");
    expect(renderedText).toContain("locally");
  });

  it("explains voice impact on presentation", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(FlaminaGuideCard, { topic: "voice" }),
      );
    });

    const renderedText = textOf(tree!.root);

    expect(renderedText).toContain("sounds");
    expect(renderedText).toContain("spoken interactions");
    expect(renderedText).toContain("saved");
  });
});
