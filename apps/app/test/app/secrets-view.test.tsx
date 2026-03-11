import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSecrets, mockUpdateSecrets } = vi.hoisted(() => ({
  mockGetSecrets: vi.fn(),
  mockUpdateSecrets: vi.fn(),
}));

vi.mock("../../src/api-client", () => ({
  client: {
    getSecrets: mockGetSecrets,
    updateSecrets: mockUpdateSecrets,
  },
}));

import { SecretsView } from "../../src/components/SecretsView";

describe("SecretsView picker keyboard behavior", () => {
  beforeEach(() => {
    mockGetSecrets.mockReset();
    mockUpdateSecrets.mockReset();
    globalThis.localStorage?.clear();
  });

  it("keeps picker open on Enter/Space and closes on Escape", async () => {
    mockGetSecrets.mockResolvedValue({
      secrets: [
        {
          key: "OPENAI_API_KEY",
          description: "OpenAI key",
          category: "ai-provider",
          sensitive: true,
          required: false,
          isSet: false,
          maskedValue: null,
          usedBy: [
            {
              pluginId: "openai",
              pluginName: "OpenAI",
              enabled: true,
            },
          ],
        },
      ],
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(SecretsView));
    });

    await act(async () => {
      await Promise.resolve();
    });

    const addSecretButton = tree.root.find(
      (node) =>
        node.type === "button" && node.props.children?.includes?.("Add Secret"),
    );

    await act(async () => {
      addSecretButton.props.onClick();
    });

    expect(tree.root.findAllByProps({ role: "dialog" }).length).toBe(1);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(tree.root.findAllByProps({ role: "dialog" }).length).toBe(1);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    expect(tree.root.findAllByProps({ role: "dialog" }).length).toBe(1);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(tree.root.findAllByProps({ role: "dialog" }).length).toBe(0);
  });
});
