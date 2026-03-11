// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";

import { MessageContent } from "../../src/components/MessageContent.js";

function readAllText(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll((node) => typeof node.type === "string")
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === "string")
    .join(" ");
}

describe("MessageContent action pills", () => {
  it("renders operator action blocks as pills instead of raw prompt text", () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(MessageContent, {
          message: {
            id: "message-1",
            role: "user",
            text: "internal prompt text that should not render",
            timestamp: Date.now(),
            blocks: [
              {
                type: "action-pill",
                label: "Go Live",
                kind: "launch",
                detail: "Twitch, X · Camera full",
              },
            ],
          },
        }),
      );
    });

    const text = readAllText(tree);
    expect(text).toContain("Go Live");
    expect(text).toContain("Twitch, X · Camera full");
    expect(text).toContain("Launch");
    expect(text).not.toContain("internal prompt text that should not render");
  });
});
