import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MiladyClient } from "../client-base";
import "../client-cloud";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("managed cloud Discord client helpers", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests managed Discord agent status from the cloud v1 route", async () => {
    const client = new MiladyClient("http://127.0.0.1:31337");

    await client.getCloudCompatAgentManagedDiscord("agent/with spaces");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:31337/api/cloud/v1/milady/agents/agent%2Fwith%20spaces/discord",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Milady-Client-Id": expect.stringMatching(/^ui-/),
        }),
      }),
    );
  });

  it("starts managed Discord OAuth with the expected POST body", async () => {
    const client = new MiladyClient("http://127.0.0.1:31337");

    await client.createCloudCompatAgentManagedDiscordOauth("agent-1", {
      returnUrl: "http://localhost:4173/dashboard/settings?tab=agents",
      botNickname: "Milady Bot",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:31337/api/cloud/v1/milady/agents/agent-1/discord/oauth",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          returnUrl: "http://localhost:4173/dashboard/settings?tab=agents",
          botNickname: "Milady Bot",
        }),
      }),
    );
  });

  it("disconnects managed Discord with DELETE", async () => {
    const client = new MiladyClient("http://127.0.0.1:31337");

    await client.disconnectCloudCompatAgentManagedDiscord("agent-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:31337/api/cloud/v1/milady/agents/agent-1/discord",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });
});
