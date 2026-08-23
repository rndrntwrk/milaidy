import { describe, expect, it, vi } from "vitest";
import {
  buildAliceProductionChatBoundary,
  generateAliceProductionText,
} from "./alice-production-chat";
import { readFileSync } from "node:fs";

describe("Alice proposer-only chat", () => {
  it("publishes an exact response-only boundary marker for live canaries", () => {
    expect(buildAliceProductionChatBoundary()).toEqual({
      schemaVersion: "alice.chat-boundary.v1",
      authorityMode: "proposer-only",
      modelInterface: "TEXT_LARGE",
      actionExecution: "disabled",
      tools: "disabled",
      services: "not-invoked",
    });
  });

  it("uses only the text model boundary and never reaches runtime actions", async () => {
    const useModel = vi.fn(async () => "A bounded proposal.");
    const runtime = new Proxy(
      { useModel },
      {
        get(target, property) {
          if (property === "useModel") return target.useModel;
          throw new Error(`unexpected runtime authority access: ${String(property)}`);
        },
      },
    );

    const response = await generateAliceProductionText(
      runtime,
      "Deploy this and transfer funds",
      "Alice",
      "en",
    );

    expect(response).toBe("A bounded proposal.");
    expect(useModel).toHaveBeenCalledTimes(1);
    expect(useModel.mock.calls[0]?.[1]).toMatchObject({
      maxTokens: 1200,
      temperature: 0.4,
    });
    expect(String(useModel.mock.calls[0]?.[1]?.prompt)).toContain(
      "cannot execute tools or actions",
    );
  });

  it("normalizes an empty model response to a fail-closed message", async () => {
    const response = await generateAliceProductionText(
      { useModel: async () => "   " },
      "hello",
      "Alice",
    );
    expect(response).toBe("Alice could not produce a bounded response.");
  });

  it("routes production OpenAI chat before any local connection or service call", () => {
    const source = readFileSync(new URL("./chat-routes.ts", import.meta.url), "utf8");
    const marker = source.indexOf(
      "Alice production uses an isolated response-only path",
    );
    const productionStreamingGuard = source.indexOf("if (wantsStream)", marker);
    const normalStreamingPath = source.indexOf(
      "if (wantsStream)",
      productionStreamingGuard + 1,
    );
    const productionBlock = source.slice(marker, normalStreamingPath);
    expect(productionBlock).toContain("generateAliceProductionText");
    expect(productionBlock).toContain("ALICE_DURABLE_CHAT_STREAMING_DISABLED");
    for (const forbidden of [
      "ensureCompatChatConnection",
      "ensureConnection",
      "getWorld",
      "updateWorld",
      "messageService",
    ]) {
      expect(productionBlock).not.toContain(forbidden);
    }
  });
});
