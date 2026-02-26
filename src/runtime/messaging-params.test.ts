import { describe, expect, it } from "vitest";

import { inferMessagingParams } from "./messaging-params";

describe("inferMessagingParams", () => {
  it("infers discord from minor channel typos", () => {
    const inferred = inferMessagingParams(
      "send the hackathon pack to this user on discordd 851080114943033354",
    );

    expect(inferred.channel).toBe("discord");
    expect(inferred.to).toBe("851080114943033354");
  });

  it("keeps telegram handle inference", () => {
    const inferred = inferMessagingParams(
      "message this person on telegram @alicebot saying hi",
    );

    expect(inferred.channel).toBe("telegram");
    expect(inferred.to).toBe("@alicebot");
    expect(inferred.messageText).toBe("this person on telegram @alicebot saying hi");
  });
});
