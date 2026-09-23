import { describe, expect, it } from "vitest";
import { redactConfigSecrets } from "./server";

describe("Alice GitHub credential readback", () => {
  it("redacts the agent PAT while preserving nonsecret config", () => {
    expect(
      redactConfigSecrets({
        env: {
          vars: {
            GITHUB_AGENT_PAT: "example-agent-token",
            STREAM555_BASE_URL: "https://stream.rndrntwrk.com",
          },
        },
      }),
    ).toEqual({
      env: {
        vars: {
          GITHUB_AGENT_PAT: "[REDACTED]",
          STREAM555_BASE_URL: "https://stream.rndrntwrk.com",
        },
      },
    });
  });
});
