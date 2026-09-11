import { describe, expect, it } from "vitest";
import { resolveAliceCorpusConfig } from "./config.js";

describe("resolveAliceCorpusConfig", () => {
  it("returns null when ALICE_CORPUS_ROOT is absent", () => {
    expect(resolveAliceCorpusConfig({})).toBeNull();
  });

  it("requires an explicit projection when the corpus root is configured", () => {
    expect(() =>
      resolveAliceCorpusConfig({ ALICE_CORPUS_ROOT: "/corpus" }),
    ).toThrow(/ALICE_CORPUS_PROJECTION/);
  });

  it("blocks owner-private without an explicit gate", () => {
    expect(() =>
      resolveAliceCorpusConfig({
        ALICE_CORPUS_ROOT: "/corpus",
        ALICE_CORPUS_PROJECTION: "owner-private",
      }),
    ).toThrow(/ALICE_CORPUS_ALLOW_OWNER_PRIVATE/);
  });

  it("rejects verification off in strict mode", () => {
    expect(() =>
      resolveAliceCorpusConfig({
        ALICE_CORPUS_ROOT: "/corpus",
        ALICE_CORPUS_PROJECTION: "internal",
        ALICE_CORPUS_STRICT: "1",
        ALICE_CORPUS_VERIFY: "off",
      }),
    ).toThrow(/strict/i);
  });

  it("normalizes the supported environment contract", () => {
    expect(
      resolveAliceCorpusConfig({
        ALICE_CORPUS_ROOT: "./corpus",
        ALICE_CORPUS_PROJECTION: "internal",
        ALICE_CORPUS_VERIFY: "full",
        ALICE_CORPUS_STRICT: "yes",
        ALICE_CORPUS_GRAPH_ENABLED: "0",
      }),
    ).toMatchObject({
      projection: "internal",
      verifyMode: "full",
      strict: true,
      graphEnabled: false,
      allowOwnerPrivate: false,
    });
  });

  it("rejects unsupported projections and verification modes", () => {
    expect(() =>
      resolveAliceCorpusConfig({
        ALICE_CORPUS_ROOT: "/corpus",
        ALICE_CORPUS_PROJECTION: "complete",
      }),
    ).toThrow(/Unsupported Alice corpus projection/);

    expect(() =>
      resolveAliceCorpusConfig({
        ALICE_CORPUS_ROOT: "/corpus",
        ALICE_CORPUS_PROJECTION: "public",
        ALICE_CORPUS_VERIFY: "fast",
      }),
    ).toThrow(/Unsupported Alice corpus verification mode/);
  });
});
