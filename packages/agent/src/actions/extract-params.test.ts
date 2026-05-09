import { describe, expect, it } from "vitest";

import { extractActionParamsViaLlm } from "./extract-params";

describe("extractActionParamsViaLlm", () => {
  it("returns merged message and existing params when required fields are present", async () => {
    let calls = 0;
    const result = await extractActionParamsViaLlm({
      runtime: {
        useModel: async () => {
          calls += 1;
          return "{}";
        },
      } as any,
      message: {
        content: {
          text: "connect google",
          connector: "google",
        },
      } as any,
      actionName: "CONNECTOR",
      existingParams: {
        subaction: "connect",
      },
      requiredFields: ["connector", "subaction"],
    });

    expect(calls).toBe(0);
    expect(result).toMatchObject({
      connector: "google",
      subaction: "connect",
    });
  });

  it("fills missing required fields from parsed model JSON", async () => {
    const result = await extractActionParamsViaLlm({
      runtime: {
        useModel: async () =>
          '```json\n{"connector":"telegram","subaction":"verify","side":"owner"}\n```',
      } as any,
      message: {
        content: {
          text: "verify telegram for owner",
        },
      } as any,
      actionName: "CONNECTOR",
      existingParams: {
        connector: "telegram",
      },
      requiredFields: ["connector", "subaction"],
    });

    expect(result).toMatchObject({
      connector: "telegram",
      subaction: "verify",
      side: "owner",
    });
  });

  it("falls back to existing params when extraction fails", async () => {
    const result = await extractActionParamsViaLlm({
      runtime: {
        useModel: async () => {
          throw new Error("model unavailable");
        },
      } as any,
      message: {
        content: {
          text: "search passwords",
        },
      } as any,
      actionName: "PASSWORD_MANAGER",
      existingParams: {
        subaction: "search",
      },
      requiredFields: ["subaction", "query"],
    });

    expect(result).toMatchObject({
      subaction: "search",
    });
    expect(result).not.toHaveProperty("query");
  });
});
