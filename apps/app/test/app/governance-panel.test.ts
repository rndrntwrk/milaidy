import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    getConfig: vi.fn(),
    getWorkbenchQuarantine: vi.fn(),
    reviewWorkbenchQuarantined: vi.fn(),
  },
}));

vi.mock("../../src/api-client", () => ({
  client: mockClient,
}));

import { GovernancePanel } from "../../src/components/GovernancePanel";

function readAllText(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll((node) => typeof node.type === "string")
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === "string")
    .join(" ");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function findButton(
  tree: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance {
  const button = tree.root.findAll(
    (node) =>
      node.type === "button" &&
      node.children.some(
        (child) => typeof child === "string" && child.includes(label),
      ),
  )[0];
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("GovernancePanel quarantine review", () => {
  beforeEach(() => {
    mockClient.getConfig.mockReset();
    mockClient.getWorkbenchQuarantine.mockReset();
    mockClient.reviewWorkbenchQuarantined.mockReset();

    mockClient.getConfig.mockResolvedValue({
      autonomy: {
        domains: {
          governance: {
            enabled: true,
          },
        },
      },
    });
  });

  it("loads quarantined memories and submits review actions", async () => {
    mockClient.getWorkbenchQuarantine
      .mockResolvedValueOnce({
        ok: true,
        quarantined: [
          {
            id: "mem-1",
            content: { text: "Suspicious memory payload" },
            trustScore: 0.125,
            memoryType: "preference",
            provenance: { source: { type: "api", id: "ops-user" } },
          },
        ],
        stats: {
          allowed: 4,
          quarantined: 1,
          rejected: 2,
          pendingReview: 1,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        quarantined: [],
        stats: {
          allowed: 5,
          quarantined: 1,
          rejected: 2,
          pendingReview: 0,
        },
      });
    mockClient.reviewWorkbenchQuarantined.mockResolvedValue({
      ok: true,
      memoryId: "mem-1",
      decision: "approve",
      memory: null,
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GovernancePanel));
    });
    await flush();

    expect(mockClient.getWorkbenchQuarantine).not.toHaveBeenCalled();

    await act(async () => {
      findButton(tree!, "Quarantine").props.onClick();
    });
    await flush();

    expect(mockClient.getWorkbenchQuarantine).toHaveBeenCalledTimes(1);
    const loadedText = normalizeText(readAllText(tree!));
    expect(loadedText).toContain("Suspicious memory payload");
    expect(loadedText).toContain("trust 0.125");
    expect(loadedText).toContain("source api:ops-user");

    await act(async () => {
      findButton(tree!, "Approve").props.onClick();
    });
    await flush();

    expect(mockClient.reviewWorkbenchQuarantined).toHaveBeenCalledWith(
      "mem-1",
      "approve",
    );
    expect(mockClient.getWorkbenchQuarantine).toHaveBeenCalledTimes(2);
    expect(normalizeText(readAllText(tree!))).toContain(
      "No quarantined memories pending review.",
    );
  });

  it("renders quarantine load errors", async () => {
    mockClient.getWorkbenchQuarantine.mockRejectedValue(
      new Error("quarantine fetch failed"),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GovernancePanel));
    });
    await flush();

    await act(async () => {
      findButton(tree!, "Quarantine").props.onClick();
    });
    await flush();

    expect(normalizeText(readAllText(tree!))).toContain(
      "quarantine fetch failed",
    );
  });
});
