import { describe, expect, it } from "vitest";
import {
  collectFive55ActionTimeline,
  parseFive55ActionEnvelope,
} from "../../src/components/five55ActionEnvelope.js";

describe("five55ActionEnvelope", () => {
  it("parses direct JSON envelopes", () => {
    const raw = JSON.stringify({
      ok: true,
      code: "OK",
      module: "stream555.control",
      action: "STREAM555_GO_LIVE",
      message: "go-live requested",
      status: 200,
      retryable: false,
      trace: { actionId: "a1" },
    });

    const envelope = parseFive55ActionEnvelope(raw);
    expect(envelope?.action).toBe("STREAM555_GO_LIVE");
    expect(envelope?.trace?.actionId).toBe("a1");
  });

  it("parses fenced JSON envelopes", () => {
    const raw = [
      "tool output:",
      "```json",
      JSON.stringify({
        ok: false,
        code: "E_UPSTREAM_FAILURE",
        module: "stream555.control",
        action: "STREAM555_AD_TRIGGER",
        message: "ad trigger failed",
        status: 502,
        retryable: true,
      }),
      "```",
    ].join("\n");

    const envelope = parseFive55ActionEnvelope(raw);
    expect(envelope?.action).toBe("STREAM555_AD_TRIGGER");
    expect(envelope?.ok).toBe(false);
  });

  it("returns null for malformed payloads", () => {
    expect(parseFive55ActionEnvelope("hello world")).toBeNull();
    expect(parseFive55ActionEnvelope("{not-json}")).toBeNull();
    expect(
      parseFive55ActionEnvelope(
        JSON.stringify({
          action: "STREAM555_GO_LIVE",
          ok: true,
        }),
      ),
    ).toBeNull();
  });

  it("collects timeline entries only for actionable envelopes", () => {
    const messages = [
      {
        id: "m1",
        role: "assistant" as const,
        text: "normal chat",
        timestamp: 1,
      },
      {
        id: "m2",
        role: "assistant" as const,
        text: JSON.stringify({
          ok: true,
          code: "OK",
          module: "stream555.control",
          action: "STREAM555_PIP_ENABLE",
          message: "pip scene requested",
          status: 200,
          retryable: false,
        }),
        timestamp: 2,
      },
    ];

    const timeline = collectFive55ActionTimeline(messages);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.messageId).toBe("m2");
    expect(timeline[0]?.envelope.action).toBe("STREAM555_PIP_ENABLE");
  });
});
