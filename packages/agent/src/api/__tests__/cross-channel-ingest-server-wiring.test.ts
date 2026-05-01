import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "server.ts"),
  "utf-8",
);

describe("cross-channel ingest server wiring", () => {
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
