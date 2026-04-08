import { ChannelType, stringToUuid } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { buildUserMessages } from "../src/api/server";

describe("buildUserMessages", () => {
  it("copies eval metadata onto both the content payload and top-level message metadata", () => {
    const metadata = {
      scenarioId: "B001",
      batchId: "batch-test",
      connectorName: "discord",
      eval: {
        scenarioId: "B001",
        batchId: "batch-test",
      },
    };

    const { userMessage, messageToStore } = buildUserMessages({
      images: undefined,
      prompt: "Build a tiny page for me.",
      userId: stringToUuid("user"),
      agentId: stringToUuid("agent"),
      roomId: stringToUuid("room"),
      channelType: ChannelType.DM,
      messageSource: "discord",
      metadata,
    });

    expect(userMessage.content.source).toBe("discord");
    expect(userMessage.content.metadata).toMatchObject(metadata);
    expect(userMessage.metadata).toMatchObject({
      scenarioId: "B001",
      batchId: "batch-test",
      connectorName: "discord",
    });

    expect(messageToStore.content.metadata).toMatchObject(metadata);
    expect(messageToStore.metadata).toMatchObject({
      scenarioId: "B001",
      batchId: "batch-test",
      connectorName: "discord",
    });
  });
});
