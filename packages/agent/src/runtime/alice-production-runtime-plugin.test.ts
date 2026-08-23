import { describe, expect, it } from "vitest";

import { createAliceProductionRuntimePlugin } from "./alice-production-runtime-plugin";

describe("Alice proposer-only built-in runtime plugin", () => {
  it("contains no action, evaluator, provider, service, init, or background worker", () => {
    const plugin = createAliceProductionRuntimePlugin();
    expect(plugin.name).toBe("alice-production-response-only");
    expect(plugin.actions ?? []).toEqual([]);
    expect(plugin.evaluators ?? []).toEqual([]);
    expect(plugin.providers ?? []).toEqual([]);
    expect(plugin.services ?? []).toEqual([]);
    expect(plugin.init).toBeUndefined();
  });
});
