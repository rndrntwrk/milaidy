import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    getIdentityConfig: vi.fn(),
    getIdentityHistory: vi.fn(),
    updateIdentityConfig: vi.fn(),
  },
}));

vi.mock("../../src/api-client", () => ({
  client: mockClient,
}));

import { IdentityPanel } from "../../src/components/IdentityPanel";

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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("IdentityPanel preference source/scope visibility", () => {
  beforeEach(() => {
    mockClient.getIdentityConfig.mockReset();
    mockClient.getIdentityHistory.mockReset();
    mockClient.updateIdentityConfig.mockReset();
  });

  it("renders preference source and scope metadata with defaults", async () => {
    mockClient.getIdentityConfig.mockResolvedValue({
      identity: {
        name: "Milaidy",
        coreValues: ["helpfulness"],
        communicationStyle: {
          tone: "casual",
          verbosity: "balanced",
          personaVoice: "assistant",
        },
        hardBoundaries: [],
        softPreferences: {
          responseLength: {
            value: "concise",
            source: "user-profile",
            scope: "chat-session",
          },
          locale: "en-US",
          toneBias: {
            value: "neutral",
            provenance: {
              source: { type: "api", id: "ops-user" },
              scope: "workspace",
            },
          },
        },
        identityVersion: 4,
        identityHash: "abc123",
      },
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityPanel));
    });
    await flush();

    const panelText = normalizeText(readAllText(tree!));
    expect(panelText).toContain("Soft Preferences");
    expect(panelText).toContain("Preference");
    expect(panelText).toContain("Source");
    expect(panelText).toContain("Scope");
    expect(panelText).toContain("responseLength");
    expect(panelText).toContain("concise");
    expect(panelText).toContain("user-profile");
    expect(panelText).toContain("chat-session");
    expect(panelText).toContain("locale");
    expect(panelText).toContain("en-US");
    expect(panelText).toContain("identity-config");
    expect(panelText).toContain("global");
    expect(panelText).toContain("toneBias");
    expect(panelText).toContain("api:ops-user");
    expect(panelText).toContain("workspace");
  });

  it("renders empty-state when no soft preferences are configured", async () => {
    mockClient.getIdentityConfig.mockResolvedValue({
      identity: {
        name: "Milaidy",
        coreValues: ["helpfulness"],
        communicationStyle: {
          tone: "casual",
          verbosity: "balanced",
          personaVoice: "assistant",
        },
        hardBoundaries: [],
        softPreferences: {},
        identityVersion: 1,
        identityHash: "abc123",
      },
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityPanel));
    });
    await flush();

    expect(normalizeText(readAllText(tree!))).toContain("No preferences set");
  });
});
