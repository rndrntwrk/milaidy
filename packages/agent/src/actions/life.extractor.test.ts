import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { extractLifeOperationWithLlm } from "./life.extractor";

function makeRuntime(
  modelResponse?: string | Error,
): IAgentRuntime {
  const useModel =
    modelResponse instanceof Error
      ? vi.fn().mockRejectedValue(modelResponse)
      : vi.fn().mockResolvedValue(modelResponse ?? "");

  return { useModel } as unknown as IAgentRuntime;
}

function makeMessage(text: string): Memory {
  return {
    content: {
      text,
    },
  } as Memory;
}

function makeState(): State {
  return {
    recentMessagesData: [],
    text: "",
    values: {},
  } as unknown as State;
}

describe("extractLifeOperationWithLlm", () => {
  it("keeps seeded Invisalign requests actionable when the model asks for a title", async () => {
    const intent = "Please remind me about my Invisalign on weekdays after lunch.";
    const result = await extractLifeOperationWithLlm({
      runtime: makeRuntime(
        JSON.stringify({
          operation: "create_definition",
          confidence: 0.93,
          shouldAct: false,
          missing: ["title"],
        }),
      ),
      message: makeMessage(intent),
      state: makeState(),
      intent,
    });

    expect(result).toMatchObject({
      operation: "create_definition",
      shouldAct: true,
      missing: [],
    });
  });

  it("keeps defaultable water requests actionable when the model asks for schedule details", async () => {
    const intent = "help me remember to drink water";
    const result = await extractLifeOperationWithLlm({
      runtime: makeRuntime(
        JSON.stringify({
          operation: "create_definition",
          confidence: 0.88,
          shouldAct: false,
          missing: ["schedule"],
        }),
      ),
      message: makeMessage(intent),
      state: makeState(),
      intent,
    });

    expect(result).toMatchObject({
      operation: "create_definition",
      shouldAct: true,
      missing: [],
    });
  });

  it("keeps timed reminder requests actionable even without an explicit task title", async () => {
    const intent = "set a reminder for tomorrow at 9";
    const result = await extractLifeOperationWithLlm({
      runtime: makeRuntime(
        JSON.stringify({
          operation: "create_definition",
          confidence: 0.9,
          shouldAct: false,
          missing: ["title"],
        }),
      ),
      message: makeMessage(intent),
      state: makeState(),
      intent,
    });

    expect(result).toMatchObject({
      operation: "create_definition",
      shouldAct: true,
      missing: [],
    });
  });

  it("still keeps vague todo requests in clarification mode", async () => {
    const intent = "lol yeah. can you help me add a todo for my life?";
    const result = await extractLifeOperationWithLlm({
      runtime: makeRuntime(new Error("model unavailable")),
      message: makeMessage(intent),
      state: makeState(),
      intent,
    });

    expect(result).toMatchObject({
      operation: "create_definition",
      shouldAct: false,
      missing: ["title", "schedule"],
    });
  });
});
