import { AgentEventService } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  AGENT_EVENT_SERVICE_TYPES,
  getAgentEventService,
} from "./agent-event-service";
import { createMiladyPlugin } from "./milady-plugin";

describe("getAgentEventService", () => {
  it("prefers the canonical lowercase service type", () => {
    const lowercaseService = { name: "lowercase" };
    const runtime = {
      getService: vi.fn((serviceType: string) => {
        if (serviceType === "agent_event") return lowercaseService;
        return null;
      }),
    };

    expect(getAgentEventService(runtime)).toBe(lowercaseService);
    expect(runtime.getService).toHaveBeenCalledWith("agent_event");
  });

  it("falls back to the legacy uppercase service type", () => {
    const uppercaseService = { name: "uppercase" };
    const runtime = {
      getService: vi.fn((serviceType: string) => {
        if (serviceType === "AGENT_EVENT") return uppercaseService;
        return null;
      }),
    };

    expect(getAgentEventService(runtime)).toBe(uppercaseService);
    expect(
      runtime.getService.mock.calls.map(([serviceType]) => serviceType),
    ).toEqual([...AGENT_EVENT_SERVICE_TYPES]);
  });

  it("returns null when no agent-event service is registered", () => {
    const runtime = {
      getService: vi.fn(() => null),
    };

    expect(getAgentEventService(runtime)).toBeNull();
  });
});

describe("createMiladyPlugin", () => {
  it("registers the core AgentEventService", () => {
    const plugin = createMiladyPlugin();

    expect(plugin.services).toContain(AgentEventService);
  });

  it("omits idle and locomotion emotes from the agent provider prompt", async () => {
    const plugin = createMiladyPlugin();
    const emoteProvider = plugin.providers?.find(
      (provider) => provider.name === "emotes",
    );

    expect(emoteProvider).toBeDefined();

    const result = await emoteProvider?.get(
      { character: { settings: {} } } as never,
      {} as never,
      {} as never,
    );
    const availableIdsLine = result?.text
      .split("\n")
      .find((line) => line.startsWith("Available emote IDs: "));
    const availableIds =
      availableIdsLine
        ?.replace("Available emote IDs: ", "")
        .split(", ")
        .filter(Boolean) ?? [];

    expect(result?.text).toContain("wave");
    expect(result?.text).toContain("dance-happy");
    expect(result?.text).toContain("Do not use idle, run, or walk");
    expect(result?.text).toContain("one-shot visual side action");
    expect(result?.text).toContain(
      'actions: ["REPLY", "PLAY_EMOTE"] or ["PLAY_EMOTE", "REPLY"]',
    );
    expect(availableIds).not.toContain("idle");
    expect(availableIds).not.toContain("run");
    expect(availableIds).not.toContain("walk");
  });
});
