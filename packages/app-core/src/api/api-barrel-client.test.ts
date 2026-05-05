import { describe, expect, it } from "vitest";

import { client, MiladyClient } from "./index";

describe("@miladyai/app-core/api barrel", () => {
  it("exports the production app client with the dashboard methods used by the shell", () => {
    const freshClient = new MiladyClient("http://127.0.0.1:31337");

    for (const methodName of [
      "getLifeOpsOverview",
      "listAppRuns",
      "listCodingAgentTaskThreads",
      "getPlugins",
      "getCompanionStageState",
    ]) {
      expect(
        typeof (client as unknown as Record<string, unknown>)[methodName],
        methodName,
      ).toBe("function");
      expect(
        typeof (freshClient as unknown as Record<string, unknown>)[methodName],
        methodName,
      ).toBe("function");
    }
  });
});
