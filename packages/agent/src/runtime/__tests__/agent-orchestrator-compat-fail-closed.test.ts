import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const orchestratorCompatSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "agent-orchestrator-compat.ts"),
  "utf-8",
);

describe("agent orchestrator compat fail-closed regressions", () => {
  it("does not expose a silent no-op orchestrator stub", () => {
    expect(orchestratorCompatSource).not.toContain("agent-orchestrator-stub");
    expect(orchestratorCompatSource).toContain("agent-orchestrator-missing");
    expect(orchestratorCompatSource).toContain(
      "plugin-agent-orchestrator is required but not available in this environment",
    );
  });
});
