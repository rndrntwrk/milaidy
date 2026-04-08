import { describe, expect, it } from "vitest";
import type { CloudCompatAgent } from "../../api";
import {
  buildManagedDiscordSettingsReturnUrl,
  consumeManagedDiscordCallbackUrl,
  consumeManagedGithubCallbackUrl,
  resolveManagedDiscordAgentChoice,
} from "./cloud-dashboard-utils";

function createCloudCompatAgent(
  overrides: Partial<CloudCompatAgent> = {},
): CloudCompatAgent {
  return {
    agent_id: "agent-1",
    agent_name: "Milady",
    node_id: null,
    container_id: null,
    headscale_ip: null,
    bridge_url: null,
    web_ui_url: null,
    status: "running",
    agent_config: {},
    created_at: "2026-04-07T00:00:00.000Z",
    updated_at: "2026-04-07T00:00:00.000Z",
    containerUrl: "",
    webUiUrl: null,
    database_status: "ready",
    error_message: null,
    last_heartbeat_at: null,
    ...overrides,
  };
}

describe("buildManagedDiscordSettingsReturnUrl", () => {
  it("replaces the current tab path with settings while preserving the app base path", () => {
    expect(
      buildManagedDiscordSettingsReturnUrl(
        "http://localhost:4173/dashboard/connectors",
      ),
    ).toBe("http://localhost:4173/dashboard/settings");
  });

  it("uses hash routing for file:// URLs", () => {
    expect(
      buildManagedDiscordSettingsReturnUrl(
        "file:///Users/tester/milady/index.html#/connectors",
      ),
    ).toBe("file:///Users/tester/milady/index.html#/settings");
  });
});

describe("consumeManagedDiscordCallbackUrl", () => {
  it("extracts managed Discord callback state and removes transient params", () => {
    const { callback, cleanedUrl } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/dashboard/settings?tab=agents&discord=connected&managed=1&agentId=agent-1&guildId=guild-1&guildName=Milady%20HQ&restarted=1",
    );

    expect(callback).toEqual({
      status: "connected",
      managed: true,
      agentId: "agent-1",
      guildId: "guild-1",
      guildName: "Milady HQ",
      message: null,
      restarted: true,
    });
    expect(cleanedUrl).toBe(
      "http://localhost:4173/dashboard/settings?tab=agents",
    );
  });

  it("ignores non-managed Discord callback params", () => {
    const { callback, cleanedUrl } = consumeManagedDiscordCallbackUrl(
      "http://localhost:4173/dashboard/settings?tab=agents&discord=connected",
    );

    expect(callback).toBeNull();
    expect(cleanedUrl).toBeNull();
  });
});

describe("resolveManagedDiscordAgentChoice", () => {
  it("returns none when no cloud agents are available", () => {
    expect(resolveManagedDiscordAgentChoice([])).toEqual({
      mode: "none",
      agent: null,
      selectedAgentId: null,
    });
  });

  it("returns direct when exactly one cloud agent is available", () => {
    const agent = createCloudCompatAgent({
      agent_id: "agent-1",
      agent_name: "Milady",
    });

    expect(resolveManagedDiscordAgentChoice([agent])).toEqual({
      mode: "direct",
      agent,
      selectedAgentId: "agent-1",
    });
  });

  it("returns picker when multiple cloud agents are available", () => {
    const agents = [
      createCloudCompatAgent({
        agent_id: "agent-1",
        agent_name: "Milady One",
      }),
      createCloudCompatAgent({
        agent_id: "agent-2",
        agent_name: "Milady Two",
      }),
    ];

    expect(resolveManagedDiscordAgentChoice(agents)).toMatchObject({
      mode: "picker",
      agent: null,
      selectedAgentId: "agent-1",
    });
  });
});

describe("consumeManagedGithubCallbackUrl", () => {
  it("extracts managed GitHub callback state and removes transient params", () => {
    const { callback, cleanedUrl } = consumeManagedGithubCallbackUrl(
      "http://localhost:4173/dashboard/settings?tab=agents&github_connected=true&connection_id=conn-1&platform=github&managed_github_agent=agent-1",
    );

    expect(callback).toEqual({
      status: "connected",
      connectionId: "conn-1",
      agentId: "agent-1",
      message: null,
    });
    expect(cleanedUrl).toBe(
      "http://localhost:4173/dashboard/settings?tab=agents",
    );
  });

  it("extracts GitHub error callback state", () => {
    const { callback, cleanedUrl } = consumeManagedGithubCallbackUrl(
      "http://localhost:4173/dashboard/settings?tab=agents&github_error=access_denied&managed_github_agent=agent-1",
    );

    expect(callback).toEqual({
      status: "error",
      connectionId: null,
      agentId: "agent-1",
      message: "access_denied",
    });
    expect(cleanedUrl).not.toBeNull();
  });

  it("ignores URLs without GitHub callback params", () => {
    const { callback, cleanedUrl } = consumeManagedGithubCallbackUrl(
      "http://localhost:4173/dashboard/settings?tab=agents",
    );

    expect(callback).toBeNull();
    expect(cleanedUrl).toBeNull();
  });
});
