import { describe, expect, it, vi } from "vitest";
import { DiscordLocalService } from "../src/runtime/discord-local-plugin";

// The Discord local connector wraps the macOS Discord.app RPC, and
// `DiscordLocalService.requireConfig()` throws
// `Discord local connector currently supports macOS only` on any non-
// darwin platform — which is the correct production behavior. Skip
// this unit test on CI runners that aren't macOS so we don't trip
// that guard when all we want to exercise is the
// subscribe/unsubscribe bookkeeping with mocked RPC calls.
const describeDarwinOnly =
  process.platform === "darwin" ? describe : describe.skip;

function createRuntime() {
  const settings: Record<string, string> = {
    DISCORD_LOCAL_CLIENT_ID: "discord-client-id",
    DISCORD_LOCAL_CLIENT_SECRET: "discord-client-secret",
    DISCORD_LOCAL_ENABLED: "true",
  };

  return {
    agentId: "agent-test",
    getSetting: vi.fn((key: string) => settings[key]),
    registerSendHandler: vi.fn(),
  } as unknown;
}

describeDarwinOnly("DiscordLocalService.subscribeChannelMessages", () => {
  it("unsubscribes channels removed from the selection before subscribing new ones", async () => {
    const service = new DiscordLocalService(createRuntime() as never);
    const sendRpcCommand = vi.fn(async () => ({}));

    (
      service as unknown as {
        ensureAuthenticated: () => Promise<void>;
        sendRpcCommand: typeof sendRpcCommand;
        subscribedChannelIds: Set<string>;
      }
    ).ensureAuthenticated = vi.fn(async () => {});
    (
      service as unknown as {
        ensureAuthenticated: () => Promise<void>;
        sendRpcCommand: typeof sendRpcCommand;
        subscribedChannelIds: Set<string>;
      }
    ).sendRpcCommand = sendRpcCommand;
    (
      service as unknown as {
        subscribedChannelIds: Set<string>;
      }
    ).subscribedChannelIds = new Set(["channel-old", "channel-keep"]);

    const subscribed = await service.subscribeChannelMessages([
      "channel-keep",
      "channel-new",
    ]);

    expect(sendRpcCommand).toHaveBeenNthCalledWith(
      1,
      "UNSUBSCRIBE",
      { channel_id: "channel-old" },
      "MESSAGE_CREATE",
    );
    expect(sendRpcCommand).toHaveBeenNthCalledWith(
      2,
      "SUBSCRIBE",
      { channel_id: "channel-new" },
      "MESSAGE_CREATE",
    );
    expect(subscribed).toEqual(["channel-keep", "channel-new"]);
  });
});
