import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const chatRoutesSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "chat-routes.ts"),
  "utf-8",
);

describe("chat fail-closed regressions", () => {
  it("does not directly dispatch wallet actions from prompt text", () => {
    expect(chatRoutesSource).not.toContain(
      "Direct wallet execution dispatch from prompt intent",
    );
    expect(chatRoutesSource).not.toContain(
      "const directWalletExecutionFallback =",
    );
    expect(chatRoutesSource).toContain("buildWalletActionNotExecutedReply");
  });

  it("does not execute fallback actions after malformed model output", () => {
    expect(chatRoutesSource).not.toContain(
      "await executeFallbackParsedActions(",
    );
    expect(chatRoutesSource).toContain(
      '"[eliza-api] Unexecuted action payload detected; failing closed"',
    );
    expect(chatRoutesSource).toContain("buildUnexecutedActionPayloadReply");
  });
});
