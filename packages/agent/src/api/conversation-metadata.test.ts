import { describe, expect, it } from "vitest";
import {
  buildConversationRoomMetadata,
  extractConversationMetadataFromRoom,
  isAutomationConversationMetadata,
  isPageScopedConversationMetadata,
  sanitizeConversationMetadata,
} from "./conversation-metadata.js";

describe("conversation metadata", () => {
  it("sanitizes supported metadata and drops unsupported fields", () => {
    expect(
      sanitizeConversationMetadata({
        scope: "page-lifeops",
        automationType: "n8n_workflow",
        taskId: " task-1 ",
        pageId: "page-1",
        ignored: "nope",
      }),
    ).toEqual({
      scope: "page-lifeops",
      automationType: "n8n_workflow",
      taskId: "task-1",
      pageId: "page-1",
    });

    expect(
      sanitizeConversationMetadata({
        scope: "invalid",
        automationType: "invalid",
        taskId: "",
      }),
    ).toBeUndefined();
  });

  it("round-trips sanitized metadata through room metadata", () => {
    const metadata = buildConversationRoomMetadata(
      {
        id: "conv-1",
        metadata: {
          scope: "automation-workflow",
          workflowId: "wf-1",
        },
      },
      "owner-1",
      { existing: true },
    );

    expect(metadata).toEqual({
      existing: true,
      ownership: { ownerId: "owner-1" },
      webConversation: {
        conversationId: "conv-1",
        scope: "automation-workflow",
        workflowId: "wf-1",
      },
    });
    expect(extractConversationMetadataFromRoom({ metadata }, "conv-1")).toEqual({
      scope: "automation-workflow",
      workflowId: "wf-1",
    });
    expect(extractConversationMetadataFromRoom({ metadata }, "other")).toBeUndefined();
  });

  it("classifies automation and page-scoped metadata", () => {
    expect(
      isAutomationConversationMetadata({ scope: "automation-coordinator" }),
    ).toBe(true);
    expect(isPageScopedConversationMetadata({ scope: "page-lifeops" })).toBe(
      true,
    );
    expect(isPageScopedConversationMetadata({ scope: "general" })).toBe(false);
  });
});
