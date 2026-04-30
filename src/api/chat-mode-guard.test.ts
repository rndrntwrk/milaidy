import { describe, expect, it } from "vitest";
import {
  enforceSimpleModeReplyBoundaries,
  hasOperationalActionIntent,
  resolveEffectiveChatMode,
  SIMPLE_MODE_ACTION_GUARD_REPLY,
} from "./chat-mode-guard.js";

describe("chat mode guard", () => {
  it("detects operational action intent in repo/log requests", () => {
    expect(
      hasOperationalActionIntent(
        "show me all the repos that were edited in the last 2 days",
      ),
    ).toBe(true);
    expect(hasOperationalActionIntent("check the logs and summarize")).toBe(
      true,
    );
  });

  it("does not flag plain conversational prompts as action intent", () => {
    expect(hasOperationalActionIntent("how is it going?")).toBe(false);
    expect(hasOperationalActionIntent("tell me about yourself")).toBe(false);
  });

  it("auto-escalates simple mode to power for operational actions", () => {
    const resolved = resolveEffectiveChatMode(
      "simple",
      "show me all repos updated today",
    );
    expect(resolved).toEqual({
      requestedMode: "simple",
      effectiveMode: "power",
      autoEscalated: true,
    });
  });

  it("keeps simple mode for conversational prompts", () => {
    const resolved = resolveEffectiveChatMode("simple", "how is it going?");
    expect(resolved).toEqual({
      requestedMode: "simple",
      effectiveMode: "simple",
      autoEscalated: false,
    });
  });

  it("replaces fake execution claims in simple mode", () => {
    const response = enforceSimpleModeReplyBoundaries(
      "show me repo updates",
      "copy. pulling the repos now and dropping the list next message.",
    );
    expect(response).toBe(SIMPLE_MODE_ACTION_GUARD_REPLY);
  });

  it("does not rewrite non-claim responses", () => {
    const response = enforceSimpleModeReplyBoundaries(
      "show me repo updates",
      "To do that reliably, I need Power mode.",
    );
    expect(response).toBe("To do that reliably, I need Power mode.");
  });
});
