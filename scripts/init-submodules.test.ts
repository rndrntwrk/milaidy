import { describe, expect, it } from "vitest";

import {
  parseTrackedSubmodules,
  shouldSkipSubmoduleInit,
} from "./init-submodules.mjs";

describe("parseTrackedSubmodules", () => {
  it("parses submodule names and paths from git config output", () => {
    expect(
      parseTrackedSubmodules(
        [
          "submodule.eliza.path eliza",
          "submodule.plugins/plugin-agent-orchestrator.path plugins/plugin-agent-orchestrator",
        ].join("\n"),
      ),
    ).toEqual([
      { name: "eliza", path: "eliza" },
      {
        name: "plugins/plugin-agent-orchestrator",
        path: "plugins/plugin-agent-orchestrator",
      },
    ]);
  });
});

describe("shouldSkipSubmoduleInit", () => {
  it("skips stale top-level split plugin gitlinks", () => {
    expect(
      shouldSkipSubmoduleInit("plugins/plugin-openrouter", {
        skipLocal: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipSubmoduleInit("plugins/plugin-agent-orchestrator", {
        skipLocal: false,
      }),
    ).toBe(true);
  });

  it("skips stale root upstream repos that are now handled by eliza monorepo source", () => {
    expect(shouldSkipSubmoduleInit("cloud", { skipLocal: false })).toBe(true);
    expect(
      shouldSkipSubmoduleInit("examples/clone-your-crush", {
        skipLocal: false,
      }),
    ).toBe(true);
  });

  it("skips the repo-local eliza checkout when local upstreams are disabled", () => {
    expect(shouldSkipSubmoduleInit("eliza", { skipLocal: true })).toBe(true);
    expect(
      shouldSkipSubmoduleInit("plugins/plugin-agent-orchestrator", {
        skipLocal: true,
      }),
    ).toBe(true);
  });
});
