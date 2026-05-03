import { describe, expect, it } from "vitest";
import { isLocalAgentAutoProbeDefaultHostname } from "../lib/runtime-config";

describe("runtime config", () => {
  it("auto-probes local agents only on local dev hosts by default", () => {
    expect(isLocalAgentAutoProbeDefaultHostname("localhost")).toBe(true);
    expect(isLocalAgentAutoProbeDefaultHostname("127.0.0.1")).toBe(true);
    expect(isLocalAgentAutoProbeDefaultHostname("milady.ai")).toBe(false);
    expect(isLocalAgentAutoProbeDefaultHostname("www.milady.ai")).toBe(false);
  });
});
