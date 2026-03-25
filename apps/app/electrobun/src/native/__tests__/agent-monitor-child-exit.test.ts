import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const AGENT_PATH = path.resolve(__dirname, "..", "agent.ts");

describe("monitorChildExit stale-exit guard", () => {
  const source = fs.readFileSync(AGENT_PATH, "utf8");

  it("re-checks childProcess after clearing the exiting process reference", () => {
    const unexpectedExitIdx = source.indexOf(
      "this.childProcess = null;\n          if (this.childProcess !== null) return;",
    );
    expect(unexpectedExitIdx).toBeGreaterThan(-1);
  });
});
