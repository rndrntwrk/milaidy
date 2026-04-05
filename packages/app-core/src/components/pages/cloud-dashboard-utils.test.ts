import { describe, expect, it } from "vitest";
import {
  buildManagedDiscordConnectedNotice,
  consumeManagedDiscordCallbackUrl,
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

  it("drops oversized or control-character query values instead of trusting them", () => {
    const { callback } = consumeManagedDiscordCallbackUrl(
      `http://localhost:4173/dashboard/settings?tab=agents&discord=error&managed=1&agentId=${"a".repeat(201)}&guildId=guild-1&guildName=Milady%20HQ&message=bad%0Avalue`,
    );

    expect(callback).toEqual({
      status: "error",
      managed: true,
      agentId: null,
      guildId: "guild-1",
      guildName: "Milady HQ",
      message: null,
      restarted: false,
    });
  });
});

describe("buildManagedDiscordConnectedNotice", () => {
  const interpolate = (
    template: string,
    vars?: Record<string, string | number | boolean | undefined>,
  ) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
      vars?.[key] == null ? "" : String(vars[key]),
    );

  const translate = (
    key: string,
    vars?: Record<string, string | number | boolean | undefined>,
  ) => {
    const messages: Record<string, string> = {
      "elizaclouddashboard.ManagedDiscordConnectedNotice":
        "Managed Discord connected to {{guild}}.{{statusNote}}",
      "elizaclouddashboard.ManagedDiscordConnectedNoticeFallback":
        "Managed Discord connected.{{statusNote}}",
      "elizaclouddashboard.ManagedDiscordRestartedSuffix":
        " The agent restarted and is ready.",
    };

    return interpolate(messages[key] ?? key, vars);
  };

  it("keeps the restarted notice when the guild name is present", () => {
    expect(
      buildManagedDiscordConnectedNotice(
        {
          status: "connected",
          agentId: "agent-1",
          guildId: "guild-1",
          guildName: "Milady HQ",
          managed: true,
          message: null,
          restarted: true,
        },
        translate,
      ),
    ).toBe(
      "Managed Discord connected to Milady HQ. The agent restarted and is ready.",
    );
  });

  it("omits the restart note when the callback did not restart the agent", () => {
    expect(
      buildManagedDiscordConnectedNotice(
        {
          status: "connected",
          agentId: "agent-1",
          guildId: null,
          guildName: null,
          managed: true,
          message: null,
          restarted: false,
        },
        translate,
      ),
    ).toBe("Managed Discord connected.");
  });
});
