import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { extractLifeOperationWithLlm } from "./life.extractor.js";

function makeRuntime(
  modelResponse?: string | Error | Array<string | Error>,
): IAgentRuntime {
  const responses = Array.isArray(modelResponse)
    ? modelResponse
    : [modelResponse ?? ""];
  const useModel = vi.fn();

  for (const response of responses) {
    if (response instanceof Error) {
      useModel.mockRejectedValueOnce(response);
    } else {
      useModel.mockResolvedValueOnce(response);
    }
  }

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
  it("accepts actionable recurring create requests directly from the model", async () => {
    const intent = "Please remind me about my Invisalign on weekdays after lunch.";
    const result = await extractLifeOperationWithLlm({
      runtime: makeRuntime(
        JSON.stringify({
          operation: "create_definition",
          confidence: 0.93,
          shouldAct: true,
          missing: [],
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

  it("repairs an invalid first model reply instead of heuristically recovering", async () => {
    const intent = "help me remember to drink water";
    const result = await extractLifeOperationWithLlm({
      runtime: makeRuntime([
        "I think this is probably a reminder request.",
        JSON.stringify({
          operation: "create_definition",
          confidence: 0.88,
          shouldAct: true,
          missing: [],
        }),
      ]),
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

  it("returns reply-only when both model attempts fail", async () => {
    const intent = "set a reminder for tomorrow at 9";
    const result = await extractLifeOperationWithLlm({
      runtime: makeRuntime(["definitely create it", "<not-json />"]),
      message: makeMessage(intent),
      state: makeState(),
      intent,
    });

    expect(result).toMatchObject({
      operation: null,
      shouldAct: false,
      missing: [],
      confidence: 0,
    });
  });

  it("keeps vague todo requests in clarification mode when the model says respond", async () => {
    const intent = "lol yeah. can you help me add a todo for my life?";
    const result = await extractLifeOperationWithLlm({
      runtime: makeRuntime(
        JSON.stringify({
          operation: "create_definition",
          confidence: 0.82,
          shouldAct: false,
          missing: ["title", "schedule"],
        }),
      ),
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
