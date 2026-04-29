import type { AgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createConversation,
  postConversationMessage,
} from "../../../test/helpers/http";
import { createLifeOpsChatTestRuntime } from "./helpers/lifeops-chat-runtime";
import { lifeAction } from "../src/actions/life";
import { startApiServer } from "../src/api/server";
import { LifeOpsService } from "../src/lifeops/service";

const AGENT_ID = "lifeops-life-chat-agent";

function extractPromptFallback(prompt: string): string | null {
  const match = prompt.match(
    /Canonical fallback:\s*("(?:[^"\\]|\\.)*")/m,
  );
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return null;
  }
}

function naturalizeLifeReply(prompt: string): string {
  const fallback = extractPromptFallback(prompt) ?? "";
  if (!fallback) {
    return "Tell me a little more about what you want to set up.";
  }
  const previewDefinition = fallback.match(
    /^I can save this as a \w+ named "([^"]+)" that happens (.+)\. Confirm/i,
  );
  if (previewDefinition) {
    return `I can set up "${previewDefinition[1]}" for ${previewDefinition[2]}. If that looks right, I can save it.`;
  }
  const savedDefinition = fallback.match(/^Saved "([^"]+)" as (.+)\.$/i);
  if (savedDefinition) {
    return `Okay, I saved "${savedDefinition[1]}" for ${savedDefinition[2]}.`;
  }
  const previewGoal = fallback.match(/^I can save this goal as "([^"]+)"/i);
  if (previewGoal) {
    return `I can keep "${previewGoal[1]}" as the goal. If that looks right, I can save it.`;
  }
  const savedGoal = fallback.match(/^Saved goal "([^"]+)"\.$/i);
  if (savedGoal) {
    return `Okay, I saved the goal "${savedGoal[1]}".`;
  }
  if (/^What do you want the todo to be/i.test(fallback)) {
    return "What do you want to add, and when do you want it to happen?";
  }
  return `Sure — ${fallback}`;
}

function createRuntimeForLifeChatTests(): AgentRuntime {
  return createLifeOpsChatTestRuntime({
    agentId: AGENT_ID,
    useModel: async (_modelType: unknown, params?: { prompt?: string }) => {
      const prompt = String(params?.prompt ?? "");
      const isVagueTodoRequest =
        /Current request:\s*"lol yeah\. can you help me add a todo for my life\?"/i.test(
          prompt,
        ) ||
        /User request:\s*"lol yeah\. can you help me add a todo for my life\?"/i.test(
          prompt,
        );
      if (prompt.includes("Plan the LifeOps response for the current user request.")) {
        if (isVagueTodoRequest) {
          return JSON.stringify({
            operation: "create_definition",
            confidence: 0.86,
            shouldAct: false,
            missing: ["title", "schedule"],
          });
        }
        return "<response></response>";
      }
      if (prompt.includes("Plan the next step for a LifeOps create_definition request.")) {
        if (isVagueTodoRequest) {
          return JSON.stringify({
            mode: "respond",
            response: "What do you want to add, and when do you want it to happen?",
            requestKind: null,
            title: null,
            description: null,
            cadenceKind: null,
            windows: null,
            weekdays: null,
            timeOfDay: null,
            everyMinutes: null,
            timesPerDay: null,
            priority: null,
            durationMinutes: null,
          });
        }
        return "<response></response>";
      }
      if (prompt.includes("Write the assistant's user-facing reply for a LifeOps / todo interaction.")) {
        return naturalizeLifeReply(prompt);
      }
      return "<response></response>";
    },
    handleTurn: async ({ runtime, message, state }) => {
      const result = await lifeAction.handler?.(
        runtime,
        message as never,
        state,
        {
          parameters: {},
        } as never,
      );
      return {
        text:
          typeof result?.text === "string" && result.text.trim().length > 0
            ? result.text
            : "I couldn't figure out that LifeOps request.",
        data: result?.data,
      };
    },
  });
}

async function createConversationAndSend(port: number, text: string) {
  const { conversationId } = await createConversation(port, {
    includeGreeting: false,
    title: `LifeOps chat ${text}`,
  });
  const response = await postConversationMessage(port, conversationId, {
    text,
    source: "discord",
  });
  return { conversationId, response };
}

describe("life-ops life chat transcripts", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let runtime: AgentRuntime;
  let service: LifeOpsService;

  beforeAll(async () => {
    runtime = createRuntimeForLifeChatTests();
    service = new LifeOpsService(runtime);
    const server = await startApiServer({
      port: 0,
      runtime,
    });
    port = server.port;
    closeServer = server.close;
  }, 60_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  it("previews then saves a brushing routine through natural chat", async () => {
    const { conversationId, response: preview } = await createConversationAndSend(
      port,
      "Help me remember to brush my teeth in the morning and at night.",
    );

    expect(preview.status).toBe(200);
    const previewText = String(preview.data.text ?? "");
    expect(previewText).toContain("Brush teeth");
    expect(previewText.toLowerCase()).toContain("morning");
    expect(previewText.toLowerCase()).toContain("night");
    expect(previewText).not.toContain("Confirm and I'll save it");

    const confirm = await postConversationMessage(port, conversationId, {
      text: "yes, save that",
      source: "discord",
    });
    expect(confirm.status).toBe(200);
    expect(String(confirm.data.text ?? "")).toContain("Brush teeth");
    expect(String(confirm.data.text ?? "")).not.toContain('Saved "Brush teeth"');

    const definition = (await service.listDefinitions()).find(
      (entry) => entry.definition.title === "Brush teeth",
    );
    expect(definition?.definition.kind).toBe("habit");
    expect(definition?.definition.cadence).toMatchObject({
      kind: "times_per_day",
      slots: expect.arrayContaining([
        expect.objectContaining({ label: "Morning", minuteOfDay: 8 * 60 }),
        expect.objectContaining({ label: "Night", minuteOfDay: 21 * 60 }),
      ]),
    });
    expect(definition?.reminderPlan?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "in_app", offsetMinutes: 0 }),
      ]),
    );
  });

  it("previews then saves a health-adjacent goal through natural chat", async () => {
    const { conversationId, response: preview } = await createConversationAndSend(
      port,
      "I want a goal called Stabilize sleep schedule.",
    );

    expect(preview.status).toBe(200);
    const previewText = String(preview.data.text ?? "");
    expect(previewText).toContain("Stabilize Sleep Schedule");
    expect(previewText).toContain("goal");
    expect(previewText).not.toContain("Confirm and I'll save it");

    const confirm = await postConversationMessage(port, conversationId, {
      text: "yes, save the goal",
      source: "discord",
    });
    expect(confirm.status).toBe(200);
    expect(String(confirm.data.text ?? "")).toContain(
      "Stabilize Sleep Schedule",
    );
    expect(String(confirm.data.text ?? "")).not.toContain(
      'Saved goal "Stabilize Sleep Schedule".',
    );

    const goal = (await service.listGoals()).find(
      (entry) => entry.goal.title === "Stabilize Sleep Schedule",
    );
    expect(goal?.goal.status).toBe("active");
    expect(goal?.goal.reviewState).toBe("idle");
  });

  it("updates reminder intensity for an existing routine through chat follow-up", async () => {
    const { conversationId, response: preview } = await createConversationAndSend(
      port,
      "Please remind me to drink water throughout the day.",
    );

    expect(preview.status).toBe(200);
    expect(String(preview.data.text ?? "")).toContain("Drink water");
    expect(String(preview.data.text ?? "")).not.toContain(
      "Confirm and I'll save it",
    );

    const confirmCreate = await postConversationMessage(port, conversationId, {
      text: "yes, save it",
      source: "discord",
    });
    expect(confirmCreate.status).toBe(200);
    expect(String(confirmCreate.data.text ?? "")).toContain("Drink water");
    expect(String(confirmCreate.data.text ?? "")).not.toContain(
      'Saved "Drink water"',
    );

    const update = await postConversationMessage(port, conversationId, {
      text: "remind me less about drink water",
      source: "discord",
    });
    expect(update.status).toBe(200);
    expect(String(update.data.text ?? "")).toContain("minimal");

    const definition = (await service.listDefinitions()).find(
      (entry) => entry.definition.title === "Drink water",
    );
    expect(definition?.definition.id).toBeTruthy();

    const preference = await service.getReminderPreference(
      definition?.definition.id ?? null,
    );
    expect(preference.effective.intensity).toBe("minimal");
  });

  it("asks a natural clarifying question instead of inventing a vague todo", async () => {
    const definitionsBefore = (await service.listDefinitions()).length;

    const { response } = await createConversationAndSend(
      port,
      "lol yeah. can you help me add a todo for my life?",
    );

    expect(response.status).toBe(200);
    const text = String(response.data.text ?? "");
    expect(text.toLowerCase()).toContain("what");
    expect(text.toLowerCase()).toContain("when");
    expect(text).not.toContain("Lol Yeah");
    expect(text).not.toContain("Confirm and I'll save it");

    const definitionsAfter = (await service.listDefinitions()).length;
    expect(definitionsAfter).toBe(definitionsBefore);
  });
});
