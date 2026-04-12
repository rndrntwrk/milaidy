import { describe, expect, it } from "vitest";
import { hasContextSignalSyncForKey } from "./context-signal";

describe("context-signal i18n validation", () => {
  it("matches web search requests from any supported language by default", () => {
    const message = {
      content: {
        text: "busca en la web el precio de bitcoin",
      },
    } as never;

    expect(hasContextSignalSyncForKey(message, undefined, "web_search")).toBe(
      true,
    );
  });

  it("matches channel history requests from any supported language by default", () => {
    const message = {
      content: {
        text: "채팅 기록 읽어줘",
      },
    } as never;

    expect(hasContextSignalSyncForKey(message, undefined, "read_channel")).toBe(
      true,
    );
  });
});
