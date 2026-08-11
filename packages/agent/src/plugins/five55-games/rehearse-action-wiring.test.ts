import { readFile } from "node:fs/promises";
import { describe, expect, it } from "bun:test";

describe("FIVE55_GAMES_DRIVE555_REHEARSE wiring", () => {
  it("is an explicit local rehearsal action and does not start or replace a live composition", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    const actionStart = source.indexOf('name: "FIVE55_GAMES_DRIVE555_REHEARSE"');
    const actionEnd = source.indexOf("const goLivePlayAction", actionStart);
    const action = source.slice(actionStart, actionEnd);
    const plugin = source.slice(source.indexOf("export function createFive55GamesPlugin"));

    expect(actionStart).toBeGreaterThan(-1);
    expect(action).toContain("gameRunId");
    expect(source).toContain('const DRIVE555_REHEARSE_LOCAL_ENV = "FIVE55_GAMES_DRIVE555_REHEARSE_LOCAL"');
    expect(action).toContain("assertLocalDrive555RehearsalEnabled()");
    expect(action).toContain("assertLoopbackRehearsalBase(base)");
    expect(action).toContain("Drive555RehearsalSupervisor");
    expect(action).not.toContain("startAliceGameComposition");
    expect(action).not.toContain("/stream/start");
    expect(action).not.toContain("DRIVE555_BRIDGE_DIGEST_ENV");
    expect(plugin).toContain("drive555RehearseAction");
  });
});
