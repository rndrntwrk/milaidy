import { describe, expect, it } from "vitest";

import {
  renderGroundedActionReply,
  summarizeRecentActionHistory,
} from "./grounded-action-reply";

describe("grounded action reply", () => {
  it("falls back when the model returns structured output", async () => {
    const runtime = {
      character: {},
      useModel: async () => '{"response":"not plain text"}',
    } as never;

    await expect(
      renderGroundedActionReply({
        runtime,
        message: { content: { text: "show my screen time" } } as never,
        state: undefined,
        intent: "show my screen time",
        domain: "lifeops",
        scenario: "screen_time_summary",
        fallback: "fallback reply",
      }),
    ).resolves.toBe("fallback reply");
  });

  it("summarizes action results from provider state", () => {
    const state = {
      data: {
        providers: {
          ACTION_STATE: {
            data: {
              actionResults: [
                {
                  success: true,
                  text: "saved the sleep goal",
                  data: { actionName: "LIFE" },
                },
              ],
            },
          },
        },
      },
    } as never;

    expect(summarizeRecentActionHistory(state)).toEqual([
      "LIFE ok: saved the sleep goal",
    ]);
  });
});
