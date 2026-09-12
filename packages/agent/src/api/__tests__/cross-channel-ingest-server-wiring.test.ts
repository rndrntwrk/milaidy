import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "server.ts"),
  "utf-8",
);

describe("cross-channel ingest server wiring", () => {
  it("serves Alice task reads before the coding execution startup path", () => {
    const polling = serverSource.indexOf("// Alice's polling surfaces");
    const handler = serverSource.indexOf(
      "await handleAliceTaskThreadsRead({",
      polling,
    );
    const startup = serverSource.indexOf(
      'getServiceLoadPromise("PTY_SERVICE")',
      polling,
    );
    expect(serverSource.slice(polling, handler)).toContain(
      "if (isAliceFullRuntimeProfile())",
    );
    expect(handler).toBeGreaterThan(polling);
    expect(startup).toBeGreaterThan(handler);
  });

  it("dispatches the existing Arcade routes with the same live stream context", () => {
    expect(serverSource).toMatch(/import\s*\{\s*handleFive55GamesRoutes\s*\}\s*from\s*["']\.\/five55-games-routes\.js["']/);
    expect(serverSource).toMatch(/state\.connectorRouteHandlers\.push\(\(req, res, pathname, method\)\s*=>\s*handleFive55GamesRoutes\(\{\s*req,\s*res,\s*pathname,\s*method,\s*readJsonBody,\s*json,\s*error,\s*streamState,?\s*\}\)/);
  });

  it("registers Alice corpus and coding policy routes", () => {
    expect(serverSource).toContain("handleAliceCorpusRoutes");
    expect(serverSource).toContain("handleAliceCodingPolicyRoutes");
    expect(serverSource.indexOf("handleAliceCorpusRoutes")).toBeLessThan(
      serverSource.indexOf("handleMiscRoutes"),
    );
    expect(serverSource.indexOf("handleAliceCodingPolicyRoutes")).toBeLessThan(
      serverSource.indexOf("handleMiscRoutes"),
    );
  });

  it("registers dedicated comment ingest routes before misc ingest routes", () => {
    expect(serverSource).toContain("handleCrossChannelIngestRoutes");
    expect(serverSource.indexOf("handleCrossChannelIngestRoutes")).toBeLessThan(
      serverSource.indexOf("handleMiscRoutes"),
    );
  });
});
