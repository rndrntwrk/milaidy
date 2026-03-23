import { describe, expect, it } from "vitest";
import { applyConversationStreamSseDoneOrderPatch } from "./patch-agent-conversation-stream.mjs";

const UPSTREAM_SNIPPET = `
            if (!aborted) {
                await persistAssistantConversationMemory(runtime, conv.roomId, result.text, channelType, turnStartedAt);
                conv.updatedAt = new Date().toISOString();
                writeSseJson(res, {
                    type: "done",
                    fullText: result.text,
                    agentName: result.agentName,
                    ...(result.usage ? { estimatedUsage: result.usage } : {}),
                });
                // title
            }
        catch (err) {
            if (!aborted) {
                const creditReply = getInsufficientCreditsReplyFromError(err);
                if (creditReply) {
                    try {
                        await persistAssistantConversationMemory(runtime, conv.roomId, creditReply, channelType);
                        conv.updatedAt = new Date().toISOString();
                        writeSse(res, {
                            type: "done",
                            fullText: creditReply,
                            agentName: state.agentName,
                        });
                    }
                    catch (persistErr) {
                        writeSse(res, {
                            type: "error",
                            message: getErrorMessage(persistErr),
                        });
                    }
                }
`;

describe("patch-agent-conversation-stream", () => {
  it("reorders done before persist and idempotently skips when marked", () => {
    const { src: once, changed: c1 } =
      applyConversationStreamSseDoneOrderPatch(UPSTREAM_SNIPPET);
    expect(c1).toBe(true);
    expect(once).toContain(
      "[milady-patch] conversation stream: emit done before persist",
    );
    expect(once.indexOf("writeSseJson")).toBeLessThan(
      once.indexOf(
        "persistAssistantConversationMemory(runtime, conv.roomId, result.text",
      ),
    );
    expect(once).toContain("Assistant persist after SSE done failed");

    const { src: twice, changed: c2 } =
      applyConversationStreamSseDoneOrderPatch(once);
    expect(c2).toBe(false);
    expect(twice).toBe(once);
  });
});
