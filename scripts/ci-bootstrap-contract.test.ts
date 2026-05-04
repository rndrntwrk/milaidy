import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = (name: string) =>
  fs.readFileSync(`.github/workflows/${name}`, "utf8");

describe("CI bootstrap contract", () => {
  it("declares the local upstream postinstall skip before CI uses it", () => {
    const ci = workflow("ci.yml");
    const setupAction = fs.readFileSync(
      ".github/actions/setup-bun-workspace/action.yml",
      "utf8",
    );

    expect(setupAction).toContain("skip-local-upstreams-postinstall:");
    expect(ci.match(/skip-local-upstreams-postinstall: "true"/g)).toHaveLength(
      3,
    );
  });

  it("builds elizaOS core before bundled skills", () => {
    const ci = workflow("ci.yml");
    const coreBuild = "(cd eliza/packages/core && bun run build)";
    const skillsBuild = "(cd eliza/packages/skills && bun run build)";

    expect(ci).toContain(coreBuild);
    expect(ci).toContain(skillsBuild);
    expect(ci.indexOf(coreBuild)).toBeLessThan(ci.indexOf(skillsBuild));
  });

  it("lets elizaCloud patch version drift skip cleanly", () => {
    const output = execFileSync(process.execPath, [
      "scripts/patch-elizacloud.mjs",
    ]).toString();

    expect(output).toMatch(/\[patch-elizacloud\].*skipping/);
  });
});
