import { describe, expect, it } from "vitest";
import {
  consumeManagedDiscordCallbackUrl,
  consumeManagedGithubCallbackUrl,
} from "./cloud-dashboard-utils";

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
