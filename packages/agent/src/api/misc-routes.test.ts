import { describe, expect, it } from "vitest";

/**
 * Source-level regression guards for misc-routes.ts.
 *
 * The LTCG (Lunchtable Card Game) autonomy plugin was removed as part of the
 * retake.tv / Lunchtable decoupling. These tests assert that the handler block
 * stays gone so that a future refactor, merge conflict, or autonomous agent
 * cannot silently reintroduce the dead routes or the plugin dependency.
 *
 * The assertions are deliberately string-level (read misc-routes.ts as text and
 * grep for LTCG markers) rather than runtime-level. Runtime tests would require
 * mocking the full MiscRouteContext (req/res/state/etc.) for handler behavior
 * that no longer exists, which is more machinery than the regression guard
 * needs.
 */
describe("misc-routes LTCG removal regression guard", () => {
  it("does not contain any references to the removed LTCG plugin", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.resolve(testDir, "misc-routes.ts"),
      "utf-8",
    );

    // The plugin package name must not appear anywhere in the handler source.
    expect(source).not.toContain("@lunchtable/plugin-ltcg");

    // The autonomy route prefix must not appear — these 5 endpoints were
    // deleted (GET status, POST start/pause/resume/stop).
    expect(source).not.toContain("/api/ltcg/autonomy");

    // Case-insensitive catch for any straggler references in comments, logs,
    // import paths, or identifiers.
    expect(source.toLowerCase()).not.toContain("ltcg");
    expect(source.toLowerCase()).not.toContain("lunchtable");
  });
});

describe("Companion durable stage route", () => {
  it("uses one injected durable store for authenticated Companion and public broadcast reads", async () => {
    const { handleMiscRoutes } = await import("./misc-routes");
    const durable = {
      camera: { zoom: 0.9, yaw: 0.25, pitch: 0, pan: -1 },
    };
    const reads: string[] = [];
    const responses: unknown[] = [];
    const base = {
      req: {},
      res: {},
      url: new URL("https://alice.rndrntwrk.com/"),
      state: {},
      json: (_res: unknown, value: unknown) => responses.push(value),
      error: () => {
        throw new Error("unexpected route error");
      },
      readJsonBody: async () => null,
      AGENT_EVENT_ALLOWED_STREAMS: new Set<string>(),
      resolveTerminalRunRejection: () => null,
      resolveTerminalRunClientId: () => null,
      isSharedTerminalClientId: () => false,
      activeTerminalRunCount: 0,
      setActiveTerminalRunCount: () => undefined,
      companionStageStore: {
        async read() {
          reads.push("read");
          return durable;
        },
        async write() {
          throw new Error("unexpected write");
        },
      },
    };
    expect(
      await handleMiscRoutes({
        ...base,
        method: "GET",
        pathname: "/api/companion/stage",
      } as never),
    ).toBe(true);
    expect(
      await handleMiscRoutes({
        ...base,
        method: "GET",
        pathname: "/api/broadcast/alice-cam/stage",
      } as never),
    ).toBe(true);
    expect(reads).toEqual(["read", "read"]);
    expect(responses).toEqual([
      { ok: true, state: durable },
      { ok: true, channel: "alice-cam", state: durable },
    ]);
  });

  it("persists a sanitized Companion stage before broadcasting it", async () => {
    const { handleMiscRoutes } = await import("./misc-routes");
    const effects: string[] = [];
    const writes: unknown[] = [];
    const responses: unknown[] = [];
    const handled = await handleMiscRoutes({
      req: {},
      res: {},
      method: "POST",
      pathname: "/api/companion/stage",
      url: new URL("https://alice.rndrntwrk.com/api/companion/stage"),
      state: {
        broadcastWs(value: unknown) {
          effects.push("broadcast");
          expect(value).toMatchObject({ type: "companion-stage-state" });
        },
      },
      json: (_res: unknown, value: unknown) => responses.push(value),
      error: () => {
        throw new Error("unexpected route error");
      },
      readJsonBody: async () => ({
        patch: { camera: { zoom: 2, yaw: -10 } },
      }),
      AGENT_EVENT_ALLOWED_STREAMS: new Set<string>(),
      resolveTerminalRunRejection: () => null,
      resolveTerminalRunClientId: () => null,
      isSharedTerminalClientId: () => false,
      activeTerminalRunCount: 0,
      setActiveTerminalRunCount: () => undefined,
      companionStageStore: {
        async read() {
          return {
            camera: { zoom: 0.25, yaw: 0, pitch: 0, pan: 0 },
          };
        },
        async write(value: unknown) {
          effects.push("write");
          writes.push(value);
        },
      },
    } as never);
    expect(handled).toBe(true);
    expect(effects).toEqual(["write", "broadcast"]);
    expect(writes).toEqual([
      { camera: { zoom: 1, yaw: -Math.PI, pitch: 0, pan: 0 } },
    ]);
    expect(responses).toEqual([{ ok: true, state: writes[0] }]);
  });
});
