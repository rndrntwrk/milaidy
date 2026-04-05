import { describe, expect, test } from "bun:test";
import {
  buildBridgeMessageMetadata,
  normalizeBridgeMessage,
} from "./cloud-agent-shared";

describe("normalizeBridgeMessage", () => {
  test("preserves managed Discord bridge identity and routing metadata", () => {
    expect(
      normalizeBridgeMessage({
        text: "hello there",
        roomId: "discord-guild:guild-1:channel:channel-1",
        channelType: "GROUP",
        source: "discord",
        sender: {
          id: "discord-user-1",
          username: "owner",
          displayName: "Owner Person",
          metadata: {
            discord: {
              userId: "discord-user-1",
              username: "owner",
            },
          },
        },
        metadata: {
          discord: {
            guildId: "guild-1",
            channelId: "channel-1",
          },
        },
      }),
    ).toEqual({
      text: "hello there",
      roomKey: "discord-guild:guild-1:channel:channel-1",
      mode: "power",
      channelType: "GROUP",
      source: "discord",
      sender: {
        id: "discord-user-1",
        username: "owner",
        displayName: "Owner Person",
        metadata: {
          discord: {
            userId: "discord-user-1",
            username: "owner",
          },
        },
      },
      metadata: {
        discord: {
          guildId: "guild-1",
          channelId: "channel-1",
        },
      },
    });
  });

  test("falls back to safe defaults when bridge params are missing", () => {
    expect(normalizeBridgeMessage({})).toEqual({
      text: "",
      roomKey: "default",
      mode: "power",
      channelType: "DM",
      source: "cloud-bridge",
    });
  });
});

describe("buildBridgeMessageMetadata", () => {
  test("preserves bridge sender metadata on the message without requiring entity persistence", () => {
    const normalized = normalizeBridgeMessage({
      text: "hello there",
      roomId: "discord-guild:guild-1:channel:channel-1",
      channelType: "GROUP",
      source: "discord",
      sender: {
        id: "discord-user-1",
        username: "owner",
        displayName: "Owner Person",
        metadata: {
          discord: {
            userId: "discord-user-1",
            username: "owner",
          },
        },
      },
      metadata: {
        discord: {
          guildId: "guild-1",
          channelId: "channel-1",
        },
      },
    });

    expect(buildBridgeMessageMetadata(normalized)).toEqual({
      discord: {
        guildId: "guild-1",
        channelId: "channel-1",
      },
      bridgeSender: {
        id: "discord-user-1",
        username: "owner",
        displayName: "Owner Person",
        metadata: {
          discord: {
            userId: "discord-user-1",
            username: "owner",
          },
        },
      },
    });
  });

  test("returns undefined when there is no bridge sender or message metadata", () => {
    expect(
      buildBridgeMessageMetadata(
        normalizeBridgeMessage({
          text: "hello there",
        }),
      ),
    ).toBeUndefined();
  });
});
